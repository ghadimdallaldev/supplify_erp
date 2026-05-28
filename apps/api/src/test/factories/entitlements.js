export function entitlementsPayload(overrides = {}) {
  return {
    limits: { chats_per_day: 10, orders_per_day: 3 },
    features: { chat: 'enabled' },
    overrides: [],
    ...overrides,
  }
}
