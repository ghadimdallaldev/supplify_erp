import type { FutureConfig } from 'react-router-dom'

/**
 * React Router v7 future flags — opt in early to match v7 behavior and silence dev warnings.
 * @see https://reactrouter.com/v6/upgrading/future#v7_starttransition
 */
export const ROUTER_FUTURE: Partial<FutureConfig> = {
  v7_startTransition: true,
}
