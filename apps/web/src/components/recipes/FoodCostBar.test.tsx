import { describe, expect, it, vi, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import { FoodCostBar } from './FoodCostBar'
import { getFoodCostFillPercent, isAboveTargetFoodCost } from './recipeShared'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts && 'pct' in opts ? `${key}:${String(opts.pct)}` : key,
  }),
}))

afterEach(cleanup)

describe('FoodCostBar target handling', () => {
  it('shows the recipe own target when one is set', () => {
    render(<FoodCostBar foodCostPct={38} targetFoodCostPct={30} calcStatus="WARNING" />)
    expect(screen.getByText('foodCostBar.target:30')).toBeInTheDocument()
  })

  it('does not invent a 30% target when the recipe has none', () => {
    // Regression: the bar defaulted to 30 and rendered "Target: 30%" for
    // restaurants that had never set a target.
    render(<FoodCostBar foodCostPct={38} targetFoodCostPct={null} calcStatus="HEALTHY" />)

    expect(screen.queryByText('foodCostBar.target:30')).not.toBeInTheDocument()
    expect(screen.getByText('foodCostBar.noTarget')).toBeInTheDocument()
  })

  it('still renders the measured food cost without a target', () => {
    render(<FoodCostBar foodCostPct={38} targetFoodCostPct={undefined} />)
    expect(screen.getByText('38.0%')).toBeInTheDocument()
  })
})

describe('recipeShared target helpers', () => {
  it('never reports "above target" without a target', () => {
    expect(isAboveTargetFoodCost(90, null)).toBe(false)
    expect(isAboveTargetFoodCost(90, undefined)).toBe(false)
    expect(isAboveTargetFoodCost(31, 30)).toBe(true)
  })

  it('scales the fill against 0-100 when no target exists', () => {
    // Previously scaled against a notional 30% target, so a 40% food cost
    // rendered as a near-full bar implying a breach.
    expect(getFoodCostFillPercent(40, null)).toBe(40)
    expect(getFoodCostFillPercent(40, 0)).toBe(40)
  })

  it('scales against the target when one exists', () => {
    // cap = max(30 * 1.5, 30, 1) = 45; 30/45 -> 67%
    expect(getFoodCostFillPercent(30, 30)).toBe(67)
  })

  it('returns zero fill for an uncomputed food cost', () => {
    expect(getFoodCostFillPercent(null, 30)).toBe(0)
  })
})
