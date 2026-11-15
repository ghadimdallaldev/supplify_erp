import { useQuery } from '@tanstack/react-query'
import type { StaffMember, StaffStatus, StaffWageType } from '../../../types/staff'
import { api } from '../client'
import { queryKeys } from './keys'

function normalizeStaffMember(raw: Record<string, unknown>): StaffMember {
  return {
    id: String(raw.id),
    restaurantId: String(raw.restaurantId ?? raw.restaurant_id ?? ''),
    status: String(raw.status ?? 'ACTIVE') as StaffStatus,
    firstName: String(raw.firstName ?? raw.first_name ?? ''),
    lastName: String(raw.lastName ?? raw.last_name ?? ''),
    displayName: String(
      raw.displayName ??
        raw.display_name ??
        `${raw.firstName ?? raw.first_name ?? ''} ${raw.lastName ?? raw.last_name ?? ''}`.trim()
    ),
    email: raw.email != null ? String(raw.email) : null,
    phone: raw.phone != null ? String(raw.phone) : null,
    role: String(raw.role ?? ''),
    wageType: String(raw.wageType ?? raw.wage_type ?? 'HOURLY') as StaffWageType,
    wageRate:
      raw.wageRate != null
        ? Number(raw.wageRate)
        : raw.wage_rate != null
          ? Number(raw.wage_rate)
          : null,
    hireDate:
      raw.hireDate != null
        ? String(raw.hireDate)
        : raw.hire_date != null
          ? String(raw.hire_date)
          : null,
    profileColor:
      raw.profileColor != null
        ? String(raw.profileColor)
        : raw.profile_color != null
          ? String(raw.profile_color)
          : null,
    createdAt: String(raw.createdAt ?? raw.created_at ?? ''),
    updatedAt: String(raw.updatedAt ?? raw.updated_at ?? ''),
  }
}

export function useStaffMembers() {
  return useQuery({
    queryKey: queryKeys.staffMembers,
    queryFn: async () => {
      const data = await api.get<unknown>('/api/staff/members')
      const rows = (Array.isArray(data) ? data : []) as Record<string, unknown>[]
      return rows.map(normalizeStaffMember)
    },
  })
}
