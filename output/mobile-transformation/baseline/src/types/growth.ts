export type CreateSupplierSponsorshipOfferRequest = {
  prospectId: string
  planCode?: 'silver' | 'gold' | 'platinum'
  restaurantId?: string | null
  invitationId?: string | null
  suggestedPlanId?: string | null
  idempotencyKey?: string
}
export type SupplierProspect = {
  id: string
  restaurant_name: string
  contact_person?: string | null
  phone?: string | null
  email?: string | null
  area_region?: string | null
  match_status: string
  matched_restaurant_id?: string | null
  matched_restaurant_name?: string | null
  lifecycle_status: string
  created_at: string
}

export type SupplierGrowthMetrics = {
  importedCustomers: number
  existingSupplifyCustomers: number
  invitedCustomers: number
  sponsoredCustomers: number
  registeredCustomers: number
  convertedCustomers: number
  revenueGenerated: number
  rewardsEarned: { freeMonths: number; accountCredit: number }
  sponsorshipLimit?: number | null
  sponsorshipUsage?: {
    used: number
    remaining: number | null
    limit: number | null
    resetDate: string
    unlimited: boolean
  }
  eligibleSponsorPlans?: string[]
  sponsorship?: {
    offersCreated: number
    offersOpen: number
    offersAccepted: number
    offersDeclined: number
    offersExpired: number
    paymentsPending: number
    paymentsFailed: number
    monthsActivated: number
    monthsCompleted: number
    totalSpend: number
    averageValue: number
  }
}
