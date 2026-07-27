/**
 * Create Keycloak login accounts for all restaurants and suppliers from the prodlike seed.
 * After running, you can log in as any restaurant or supplier using their contact_email and the
 * password below (default: Supplify1!).
 *
 * Requires: Keycloak running, admin credentials (default admin/admin for local).
 * Env: KEYCLOAK_BASE_URL, KEYCLOAK_REALM, KEYCLOAK_ADMIN_USERNAME, KEYCLOAK_ADMIN_PASSWORD,
 *      SEED_ACCOUNTS_PASSWORD (optional, default Supplify1!)
 *
 * Run: node scripts/seed-accounts-for-prodlike.js
 */
import 'dotenv/config';
import pg from 'pg';

const KEYCLOAK_BASE_URL = process.env.KEYCLOAK_BASE_URL || 'http://localhost:8080';
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM || 'Supplify';
const ADMIN_USERNAME = process.env.KEYCLOAK_ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.KEYCLOAK_ADMIN_PASSWORD || 'admin';
const SEED_PASSWORD = process.env.SEED_ACCOUNTS_PASSWORD || 'Supplify1!';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/supplify',
});

async function getAdminToken() {
  const url = `${KEYCLOAK_BASE_URL.replace(/\/$/, '')}/realms/master/protocol/openid-connect/token`;
  const body = new URLSearchParams({
    grant_type: 'password',
    client_id: 'admin-cli',
    username: ADMIN_USERNAME,
    password: ADMIN_PASSWORD,
  });
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Keycloak admin token failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  return data.access_token;
}

async function getRealmRoleId(token, roleName) {
  const url = `${KEYCLOAK_BASE_URL.replace(/\/$/, '')}/admin/realms/${KEYCLOAK_REALM}/roles/${roleName}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Get role ${roleName} failed: ${res.status}`);
  const role = await res.json();
  return { id: role.id, name: role.name };
}

async function findUserByEmail(token, email) {
  const q = encodeURIComponent(email);
  const url = `${KEYCLOAK_BASE_URL.replace(/\/$/, '')}/admin/realms/${KEYCLOAK_REALM}/users?email=${q}&exact=true`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Find user failed: ${res.status}`);
  const users = await res.json();
  return users[0] || null;
}

async function createUser(token, { username, email, firstName, lastName, realmRoleName, roleId }) {
  const url = `${KEYCLOAK_BASE_URL.replace(/\/$/, '')}/admin/realms/${KEYCLOAK_REALM}/users`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      username,
      email,
      firstName: firstName || '',
      lastName: lastName || '',
      enabled: true,
      emailVerified: true,
      credentials: [{ type: 'password', value: SEED_PASSWORD, temporary: false }],
    }),
  });
  if (res.status === 409) return null; // already exists (e.g. username conflict)
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Create user ${email} failed: ${res.status} ${text}`);
  }
  const location = res.headers.get('Location');
  const id = location ? location.split('/').pop() : null;
  if (!id) throw new Error('No user id in response');
  // Assign realm role
  const roleUrl = `${KEYCLOAK_BASE_URL.replace(/\/$/, '')}/admin/realms/${KEYCLOAK_REALM}/users/${id}/role-mappings/realm`;
  const roleRes = await fetch(roleUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([{ id: roleId.id, name: roleId.name }]),
  });
  if (!roleRes.ok) {
    const text = await roleRes.text();
    throw new Error(`Assign role to ${email} failed: ${roleRes.status} ${text}`);
  }
  return id;
}

async function main() {
  console.log('🔐 Seed accounts for prodlike (Keycloak)\n');
  console.log('Keycloak:', KEYCLOAK_BASE_URL, '| Realm:', KEYCLOAK_REALM);
  console.log('Password for all seed accounts:', SEED_PASSWORD, '\n');

  const client = await pool.connect();
  try {
    const { rows: restaurants } = await client.query(
      'SELECT id, name, contact_email FROM restaurant ORDER BY name'
    );
    const { rows: suppliers } = await client.query(
      'SELECT id, name, contact_email FROM supplier ORDER BY name'
    );
    client.release();

    if (restaurants.length === 0 && suppliers.length === 0) {
      console.log('No restaurants or suppliers in DB. Run seed:prodlike first.');
      process.exit(1);
    }

    console.log('Getting Keycloak admin token...');
    const token = await getAdminToken();
    const restaurantRole = await getRealmRoleId(token, 'restaurant');
    const supplierRole = await getRealmRoleId(token, 'supplier');

    let created = 0;
    let skipped = 0;

    for (let i = 0; i < restaurants.length; i++) {
      const r = restaurants[i];
      const email = r.contact_email;
      if (!email) continue;
      const existing = await findUserByEmail(token, email);
      if (existing) {
        console.log('  Skip (exists):', email);
        skipped++;
        continue;
      }
      const username = `restaurant${i + 1}`;
      await createUser(token, {
        username,
        email,
        firstName: r.name,
        lastName: 'Restaurant',
        realmRoleName: 'restaurant',
        roleId: restaurantRole,
      });
      console.log('  Created:', email, '(restaurant)');
      created++;
    }

    for (let i = 0; i < suppliers.length; i++) {
      const s = suppliers[i];
      const email = s.contact_email;
      if (!email) continue;
      const existing = await findUserByEmail(token, email);
      if (existing) {
        console.log('  Skip (exists):', email);
        skipped++;
        continue;
      }
      const username = `supplier${i + 1}`;
      await createUser(token, {
        username,
        email,
        firstName: s.name,
        lastName: 'Supplier',
        realmRoleName: 'supplier',
        roleId: supplierRole,
      });
      console.log('  Created:', email, '(supplier)');
      created++;
    }

    console.log('\n✅ Done. Created:', created, '| Skipped (already exist):', skipped);
    console.log('\nLogin with any of the above emails and password:', SEED_PASSWORD);
    console.log('(On first login, the API will create the app_user row from Keycloak.)');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
