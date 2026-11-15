export type StaffStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED'
export type StaffWageType = 'HOURLY' | 'SALARY' | 'CONTRACT' | 'OTHER'

export interface StaffMember {
  id: string
  restaurantId: string
  status: StaffStatus
  firstName: string
  lastName: string
  displayName: string
  email?: string | null
  phone?: string | null
  role: string
  wageType: StaffWageType
  wageRate?: number | null
  hireDate?: string | null
  profileColor?: string | null
  createdAt: string
  updatedAt: string
}

export function staffDisplayName(member: StaffMember): string {
  return member.displayName?.trim() || `${member.firstName} ${member.lastName}`.trim() || 'Staff member'
}

export function staffStatusLabel(status: StaffStatus): string {
  switch (status) {
    case 'ACTIVE':
      return 'Active'
    case 'INACTIVE':
      return 'Inactive'
    case 'ARCHIVED':
      return 'Archived'
    default:
      return status
  }
}
