import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const users = await c.query(`
  SELECT u.id, u.email, u.role, u.display_name, u.is_active,
    (SELECT json_agg(json_build_object('workspace_type', m.workspace_type, 'home_tenant_id', m.home_tenant_id, 'org_id', m.organization_id, 'status', m.status))
     FROM user_workspace_membership m WHERE m.user_id = u.id) AS memberships
  FROM app_user u
  WHERE u.email IN ('ghadimdallaldev@outlook.com', 'ghadi.mdallal@kaseya.com', 'admin@supplify.com')
  ORDER BY u.email
`);
console.log(JSON.stringify(users.rows, null, 2));
const suppliers = await c.query(`
  SELECT s.id, s.name, s.slug, s.contact_email,
    (SELECT COUNT(*)::int FROM product p WHERE p.supplier_id = s.id) AS products
  FROM supplier s ORDER BY products
`);
console.log("SUPPLIERS", JSON.stringify(suppliers.rows, null, 2));
await c.end();
