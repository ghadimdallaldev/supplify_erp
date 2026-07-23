import crypto from 'crypto'
import { config } from '../config/env.js'

export const INVITE_TTL_DAYS = 7

/** @typedef {'supplier_branch' | 'restaurant_member' | 'restaurant_branch' | 'restaurant_referral' | 'branch_account_link'} InviteType */

const INVITE_TYPE_ALIASES = {
  sb: 'supplier_branch',
  supplier_branch: 'supplier_branch',
  rm: 'restaurant_member',
  restaurant_member: 'restaurant_member',
  rb: 'restaurant_branch',
  restaurant_branch: 'restaurant_branch',
  rr: 'restaurant_referral',
  restaurant_referral: 'restaurant_referral',
  bal: 'branch_account_link',
  branch_account_link: 'branch_account_link',
}

export function normalizeInviteType(type) {
  if (!type || typeof type !== 'string') return null
  return INVITE_TYPE_ALIASES[type.trim().toLowerCase()] || null
}

export function generateInviteToken() {
  return crypto.randomBytes(48).toString('hex')
}

export function inviteExpiresAt() {
  return new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000)
}

/**
 * @param {string} token
 * @param {InviteType} type
 */
export function buildInviteUrl(token, type) {
  const base = (config.WEB_ORIGIN || 'http://localhost:5173').replace(/\/$/, '')
  const normalized = normalizeInviteType(type) || type
  if (normalized === 'restaurant_referral') {
    return `${base}/register?ref=${encodeURIComponent(token)}`
  }
  const typeParam =
    normalized === 'restaurant_member'
      ? 'rm'
      : normalized === 'restaurant_branch'
        ? 'rb'
        : normalized === 'branch_account_link'
          ? 'bal'
          : 'sb'
  return `${base}/invite?token=${encodeURIComponent(token)}&type=${typeParam}`
}

export function evaluateInvitationState(invitation) {
  if (!invitation) {
    return { valid: false, reason: 'invalid' }
  }
  if (invitation.status === 'accepted') {
    return { valid: false, reason: 'invalid' }
  }
  if (
    invitation.status === 'revoked' ||
    invitation.status === 'cancelled' ||
    invitation.status === 'rejected'
  ) {
    return { valid: false, reason: 'invalid' }
  }
  if (invitation.status === 'expired' || new Date(invitation.expires_at) < new Date()) {
    return { valid: false, reason: 'expired' }
  }
  if (invitation.status !== 'pending') {
    return { valid: false, reason: 'invalid' }
  }
  return {
    valid: true,
    branch_name: invitation.branch_name ?? invitation.restaurant_name,
    restaurant_name: invitation.restaurant_name ?? invitation.branch_name,
    org_name: invitation.organization_name,
    invited_name: invitation.invited_name,
    role_name: invitation.role_name,
    invited_email: invitation.invited_email,
    expires_at: invitation.expires_at,
    invitation_type: invitation.invitation_type,
  }
}
