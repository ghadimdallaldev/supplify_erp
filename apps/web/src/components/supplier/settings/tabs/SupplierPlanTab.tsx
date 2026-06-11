import { SubscriptionInfo } from '../../../SubscriptionInfo'
import { FeaturedPlacementPanel } from '../../FeaturedPlacementPanel'
import { SupportContactCard } from '../../../support/SupportContactCard'

export function SupplierPlanTab() {
  return (
    <div className="space-y-4">
      <SubscriptionInfo />
      <FeaturedPlacementPanel />
      <SupportContactCard />
    </div>
  )
}
