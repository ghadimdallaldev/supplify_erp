import { lazy } from 'react'

export const LazyOnboardingProfileTab = lazy(() =>
  import('./OnboardingProfileTab').then((m) => ({ default: m.OnboardingProfileTab }))
)
export const LazyOnboardingTeamTab = lazy(() =>
  import('./OnboardingTeamTab').then((m) => ({ default: m.OnboardingTeamTab }))
)
export const LazyOnboardingBranchesTab = lazy(() =>
  import('./OnboardingBranchesTab').then((m) => ({ default: m.OnboardingBranchesTab }))
)
export const LazyOnboardingSubscriptionTab = lazy(() =>
  import('./OnboardingSubscriptionTab').then((m) => ({ default: m.OnboardingSubscriptionTab }))
)
export const LazyOnboardingNotificationsTab = lazy(() =>
  import('./OnboardingNotificationsTab').then((m) => ({ default: m.OnboardingNotificationsTab }))
)
export const LazyOnboardingActivityTab = lazy(() =>
  import('./OnboardingActivityTab').then((m) => ({ default: m.OnboardingActivityTab }))
)
export const LazyOnboardingReviewsTab = lazy(() =>
  import('./OnboardingReviewsTab').then((m) => ({ default: m.OnboardingReviewsTab }))
)
