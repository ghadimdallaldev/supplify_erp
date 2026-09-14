import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { errorHandler } from '../middlewares/errorHandler.js'
import { setupMocks, mockUser, clearAllMocks } from '../test/helpers.js'

vi.mock('../lib/rbac.js', async (importOriginal) => {
  const { loadRbacRouteMock } = await import('../test/rbac-route-mock.js')
  return loadRbacRouteMock(importOriginal)
})

vi.mock('../lib/tenant-resolve.js', () => ({
  requireRestaurantId: vi.fn(async () => 'rest-1'),
}))

vi.mock('../lib/subscription.js', () => ({
  requireFeature: () => (_req, _res, next) => next(),
}))

const listRecipesMock = vi.fn()
vi.mock('../services/recipe.service.js', () => ({
  listRecipes: (...args) => listRecipesMock(...args),
  getRecipeById: vi.fn(),
  createRecipe: vi.fn(),
  updateRecipe: vi.fn(),
  deactivateRecipe: vi.fn(),
  duplicateRecipe: vi.fn(),
  getRecipeCostBreakdown: vi.fn(),
  getRecipeCostingDashboard: vi.fn(),
  listRecipeAlerts: vi.fn(),
  listPriceImpacts: vi.fn(),
  getIngredientImpact: vi.fn(),
  recipesToCsvRows: vi.fn(),
}))

import { recipesRoutes } from './recipes.routes.js'

function buildApp(permissions = ['RECIPES_VIEW', 'RECIPES_VIEW_COSTS']) {
  const app = express()
  app.use(express.json())
  app.use((req, res, next) => {
    req.requestId = 'test-req'
    req.userData = { ...mockUser, role: 'RESTAURANT' }
    req.tenantContext = {
      tenantId: 'rest-1',
      tenantType: 'RESTAURANT',
      permissions,
    }
    next()
  })
  app.use('/api/recipes', recipesRoutes)
  app.use(errorHandler)
  return app
}

describe('recipes.routes', () => {
  beforeEach(() => {
    clearAllMocks()
    setupMocks()
    listRecipesMock.mockReset()
  })

  it('lists recipes for restaurant', async () => {
    listRecipesMock.mockResolvedValue({
      recipes: [{ id: 'r1', name: 'Burger', calcStatus: 'HEALTHY' }],
      total: 1,
      limit: 50,
      offset: 0,
    })
    const app = buildApp()
    const res = await request(app).get('/api/recipes').expect(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.data.recipes).toHaveLength(1)
    expect(listRecipesMock).toHaveBeenCalledWith(
      'rest-1',
      expect.any(Object),
      expect.objectContaining({ includeCosts: true })
    )
  })

  it('strips costs without RECIPES_VIEW_COSTS', async () => {
    listRecipesMock.mockResolvedValue({
      recipes: [
        {
          id: 'r1',
          name: 'Burger',
          calcStatus: 'HEALTHY',
          costPerPortion: 5,
          foodCostPct: 25,
        },
      ],
      total: 1,
      limit: 50,
      offset: 0,
    })
    const app = buildApp(['RECIPES_VIEW'])
    const res = await request(app).get('/api/recipes').expect(200)
    expect(res.body.data.recipes[0].costPerPortion).toBeUndefined()
    expect(listRecipesMock).toHaveBeenCalledWith(
      'rest-1',
      expect.any(Object),
      expect.objectContaining({ includeCosts: false })
    )
  })
})
