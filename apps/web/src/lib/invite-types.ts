export function normalizeInviteTypeParam(type: string | null): string | null {
  if (!type) return null
  const t = type.trim().toLowerCase()
  if (t === 'sb' || t === 'supplier_branch') return 'sb'
  if (t === 'rm' || t === 'restaurant_member') return 'rm'
  if (t === 'rb' || t === 'restaurant_branch') return 'rb'
  if (t === 'bal' || t === 'branch_account_link') return 'bal'
  return null
}
