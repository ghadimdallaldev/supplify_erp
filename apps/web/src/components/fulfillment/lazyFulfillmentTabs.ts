import { lazy } from 'react'

export const LazyFulfillmentDispatchPanel = lazy(() =>
  import('../fulfillment/FulfillmentDispatchPanel').then((m) => ({
    default: m.FulfillmentDispatchPanel,
  }))
)
export const LazyFulfillmentPickListsTab = lazy(() =>
  import('../fulfillment/FulfillmentPickListsTab').then((m) => ({
    default: m.FulfillmentPickListsTab,
  }))
)
export const LazyFulfillmentRoutesTab = lazy(() =>
  import('../fulfillment/FulfillmentRoutesTab').then((m) => ({
    default: m.FulfillmentRoutesTab,
  }))
)
export const LazyFulfillmentTrackingTab = lazy(() =>
  import('../fulfillment/FulfillmentTrackingTab').then((m) => ({
    default: m.FulfillmentTrackingTab,
  }))
)
export const LazyFulfillmentExceptionsTab = lazy(() =>
  import('../fulfillment/FulfillmentExceptionsTab').then((m) => ({
    default: m.FulfillmentExceptionsTab,
  }))
)
