/** Public marketing contracts. These endpoints do not authenticate or create ERP accounts. */
export type DemoCampaignRole = 'restaurant' | 'supplier'
export type DemoCampaignAttribution = {
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_content?: string
  qr_variant?: string
  landing_role?: string
}
export type DemoCampaignLeadInput = DemoCampaignAttribution & {
  name: string
  company: string
  role: DemoCampaignRole
  whatsapp: string
  email?: string
  locations?: '1' | '2-5' | '6-15' | '16+'
  restaurantCustomers?: '1-10' | '11-50' | '51-200' | '200+'
  consent: true
  website?: string
}
export type DemoCampaignResult = {
  ok: boolean
  error?: string | { name?: string; message?: string }
  fields?: Record<string, string>
}
export type DemoCampaignEventInput = Pick<
  DemoCampaignAttribution,
  'utm_source' | 'utm_medium' | 'utm_campaign' | 'qr_variant'
> & {
  name:
    | 'page_visit'
    | 'role_selected'
    | 'video_start'
    | 'video_complete'
    | 'walkthrough_step'
    | 'walkthrough_complete'
    | 'form_open'
    | 'form_submit'
  sessionId: string
  role?: DemoCampaignRole
  detail?: string
}
