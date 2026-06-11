import { SubscriptionInfo } from '../../SubscriptionInfo'
import { SupportContactCard } from '../../support/SupportContactCard'

export function OnboardingSubscriptionTab() {
  return (
    <div className="space-y-4">
      <SubscriptionInfo />
      <SupportContactCard />
    </div>
  )
}
