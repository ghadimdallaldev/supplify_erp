import bcrypt from 'bcryptjs'
import * as jose from 'jose'
import { config } from '../config/env.js'
import { query, withTransaction } from '../lib/db.js'
import { logger } from '../lib/logger.js'

const COOKIE_NAME = 'consumer_auth_token'
const ALG = 'HS256'
const BCRYPT_ROUNDS = 10
const TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60

function secret() {
  const raw =
    config.CONSUMER_AUTH_SECRET ||
    config.JWT_SECRET ||
    config.SESSION_SECRET ||
    'dev-consumer-auth-secret'
  return new TextEncoder().encode(raw)
}

function authCookieOptions(maxAgeMs) {
  const opts = {
    httpOnly: true,
    secure: config.COOKIE_SECURE,
    sameSite: config.COOKIE_SAME_SITE,
    path: '/',
    maxAge: maxAgeMs,
  }
  if (config.COOKIE_DOMAIN) {
    opts.domain = config.COOKIE_DOMAIN
  }
  return opts
}

function mapMemberRow(row) {
  if (!row) return null
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    username: row.username,
    displayName: row.display_name || row.name || row.username,
    email: row.email,
    phone: row.phone,
    loyaltyPoints: Number(row.loyalty_points ?? 0),
    welcomeBonusAwarded: Boolean(row.welcome_bonus_awarded),
    createdAt: row.created_at,
  }
}

export function getConsumerAuthCookieName() {
  return COOKIE_NAME
}

export async function signConsumerToken({ memberId, restaurantId, username }) {
  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS
  return new jose.SignJWT({ memberId, restaurantId, username })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(secret())
}

export async function verifyConsumerToken(token) {
  if (!token || typeof token !== 'string') return null
  try {
    const { payload } = await jose.jwtVerify(token, secret(), { algorithms: [ALG] })
    return {
      memberId: payload.memberId,
      restaurantId: payload.restaurantId,
      username: payload.username,
    }
  } catch (err) {
    logger.debug('Consumer auth token verify failed', { reason: err.message })
    return null
  }
}

export function setConsumerAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, authCookieOptions(TOKEN_TTL_SECONDS * 1000))
}

export function clearConsumerAuthCookie(res) {
  const opts = {
    path: '/',
    sameSite: config.COOKIE_SAME_SITE,
    secure: config.COOKIE_SECURE,
    ...(config.COOKIE_DOMAIN ? { domain: config.COOKIE_DOMAIN } : {}),
  }
  res.clearCookie(COOKIE_NAME, opts)
}

async function awardWelcomeBonus(client, restaurantId, memberId) {
  const { rows: programRows } = await client.query(
    `SELECT welcome_bonus_points FROM consumer_loyalty_program
     WHERE restaurant_id = $1 AND enabled = TRUE`,
    [restaurantId]
  )
  const bonus = Number(programRows[0]?.welcome_bonus_points ?? 0)
  if (bonus <= 0) return

  const { rows: memberRows } = await client.query(
    `SELECT id, loyalty_points, welcome_bonus_awarded
     FROM consumer_member
     WHERE id = $1 AND restaurant_id = $2
     FOR UPDATE`,
    [memberId, restaurantId]
  )
  const member = memberRows[0]
  if (!member || member.welcome_bonus_awarded) return

  const balanceAfter = Number(member.loyalty_points) + bonus

  await client.query(
    `UPDATE consumer_member
     SET loyalty_points = $1,
         lifetime_earned = lifetime_earned + $2,
         welcome_bonus_awarded = TRUE,
         updated_at = NOW()
     WHERE id = $3`,
    [balanceAfter, bonus, memberId]
  )

  await client.query(
    `INSERT INTO consumer_loyalty_ledger (
       restaurant_id, consumer_member_id, entry_type, points_delta, balance_after, metadata
     )
     VALUES ($1, $2, 'EARN', $3, $4, $5::jsonb)`,
    [restaurantId, memberId, bonus, balanceAfter, JSON.stringify({ source: 'welcome_bonus' })]
  )
}

export async function signupConsumer(restaurantId, payload) {
  const username = String(payload.username || '')
    .trim()
    .toLowerCase()
  const password = String(payload.password || '')
  const displayName = String(payload.displayName || payload.display_name || username).trim()
  const email = payload.email ? String(payload.email).trim().toLowerCase() : null
  const phone = payload.phone ? String(payload.phone).trim() : null

  if (!username || username.length < 3 || username.length > 32) {
    throw Object.assign(new Error('Username must be 3–32 characters'), {
      name: 'INVALID_USERNAME',
    })
  }
  if (!/^[a-z0-9_]+$/.test(username)) {
    throw Object.assign(new Error('Username must be alphanumeric'), {
      name: 'INVALID_USERNAME',
    })
  }
  if (password.length < 6) {
    throw Object.assign(new Error('Password must be at least 6 characters'), {
      name: 'INVALID_PASSWORD',
    })
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)

  return withTransaction(async (client) => {
    const { rows: existing } = await client.query(
      `SELECT id FROM consumer_member
       WHERE restaurant_id = $1 AND lower(username) = $2`,
      [restaurantId, username]
    )
    if (existing.length) {
      throw Object.assign(new Error('Username already taken'), { name: 'USERNAME_TAKEN' })
    }

    if (email) {
      const { rows: emailRows } = await client.query(
        `SELECT id FROM consumer_member
         WHERE restaurant_id = $1 AND lower(email) = $2`,
        [restaurantId, email]
      )
      if (emailRows.length) {
        throw Object.assign(new Error('Email already registered'), { name: 'EMAIL_TAKEN' })
      }
    }

    const { rows } = await client.query(
      `INSERT INTO consumer_member (
         restaurant_id, username, password_hash, display_name, name, email, phone
       )
       VALUES ($1, $2, $3, $4, $4, $5, $6)
       RETURNING *`,
      [restaurantId, username, passwordHash, displayName, email, phone]
    )

    const member = rows[0]
    await awardWelcomeBonus(client, restaurantId, member.id)

    const { rows: refreshed } = await client.query(`SELECT * FROM consumer_member WHERE id = $1`, [
      member.id,
    ])

    const token = await signConsumerToken({
      memberId: member.id,
      restaurantId,
      username,
    })

    return { member: mapMemberRow(refreshed[0]), token }
  })
}

export async function loginConsumer(restaurantId, payload) {
  const username = String(payload.username || '')
    .trim()
    .toLowerCase()
  const password = String(payload.password || '')

  if (!username || !password) {
    throw Object.assign(new Error('Username and password required'), {
      name: 'INVALID_CREDENTIALS',
    })
  }

  const { rows } = await query(
    `SELECT * FROM consumer_member
     WHERE restaurant_id = $1 AND lower(username) = $2`,
    [restaurantId, username]
  )

  const member = rows[0]
  if (!member?.password_hash) {
    throw Object.assign(new Error('Invalid username or password'), { name: 'INVALID_CREDENTIALS' })
  }

  const valid = await bcrypt.compare(password, member.password_hash)
  if (!valid) {
    throw Object.assign(new Error('Invalid username or password'), { name: 'INVALID_CREDENTIALS' })
  }

  const token = await signConsumerToken({
    memberId: member.id,
    restaurantId,
    username: member.username,
  })

  return { member: mapMemberRow(member), token }
}

export async function getConsumerMemberById(restaurantId, memberId) {
  const { rows } = await query(
    `SELECT * FROM consumer_member WHERE id = $1 AND restaurant_id = $2`,
    [memberId, restaurantId]
  )
  return mapMemberRow(rows[0])
}

export async function verifyConsumerFromCookie(token, restaurantId) {
  const claims = await verifyConsumerToken(token)
  if (!claims || claims.restaurantId !== restaurantId) return null
  return getConsumerMemberById(restaurantId, claims.memberId)
}
