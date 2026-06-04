export type AdminTenantType = 'RESTAURANT' | 'SUPPLIER'

export type AdminTenantRow = {
  id: string
  name: string
  slug?: string | null
  contact_email?: string | null
  sales_contact_email?: string | null
  subscription_status?: string | null
  plan_code?: string | null
  plan_name?: string | null
  is_main_branch?: boolean | null
  organization_id?: string | null
}

export type AdminTenantOption = {
  id: string
  name: string
  tenantType: AdminTenantType
  slug: string
  email: string
  planCode: string | null
  planName: string | null
  status: string
  isMainBranch: boolean
  organizationId: string | null
}

export function mapAdminTenantRow(
  row: AdminTenantRow,
  tenantType: AdminTenantType
): AdminTenantOption {
  return {
    id: row.id,
    name: row.name || 'Unnamed',
    tenantType,
    slug: row.slug || '',
    email: row.contact_email || row.sales_contact_email || '',
    planCode: row.plan_code ?? null,
    planName: row.plan_name ?? null,
    status: row.subscription_status || 'none',
    isMainBranch: row.is_main_branch !== false,
    organizationId: row.organization_id ?? null,
  }
}

export function filterAdminTenants(
  tenants: AdminTenantOption[],
  query: string,
  opts?: { orgMainOnly?: boolean; tenantType?: AdminTenantType }
): AdminTenantOption[] {
  let list = tenants
  if (opts?.tenantType) {
    list = list.filter((t) => t.tenantType === opts.tenantType)
  }
  if (opts?.orgMainOnly) {
    list = list.filter((t) => t.isMainBranch)
  }
  const q = query.trim().toLowerCase()
  if (!q) return list
  return list.filter((t) => {
    const haystack = [
      t.name,
      t.slug,
      t.email,
      t.tenantType,
      t.planCode || '',
      t.planName || '',
      t.status,
      t.id,
    ]
      .join(' ')
      .toLowerCase()
    return haystack.includes(q)
  })
}
