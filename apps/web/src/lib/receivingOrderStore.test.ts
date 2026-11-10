import { beforeEach, describe, expect, it } from 'vitest'
import {
  RECEIVING_ENTRY_TTL_MS,
  loadReceivingEntries,
  pruneReceivingEntries,
  receivingStorageKey,
  saveReceivingEntries,
} from './receivingOrderStore'

describe('receivingOrderStore', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('scopes the key by user', () => {
    expect(receivingStorageKey('u1')).not.toBe(receivingStorageKey('u2'))
  })

  it('expires entries older than the TTL', () => {
    const now = 1_000_000
    const result = pruneReceivingEntries(
      { fresh: now - 1000, stale: now - RECEIVING_ENTRY_TTL_MS - 1 },
      now
    )
    expect(Object.keys(result)).toEqual(['fresh'])
  })

  it('round-trips through localStorage and drops stale ids on load', () => {
    const key = receivingStorageKey('u1')
    const now = Date.now()
    saveReceivingEntries(key, { a: now, b: now - RECEIVING_ENTRY_TTL_MS - 5 })
    expect(Object.keys(loadReceivingEntries(key, now))).toEqual(['a'])
  })

  it('survives corrupt JSON and legacy array values', () => {
    const key = receivingStorageKey('u1')
    localStorage.setItem(key, '{not json')
    expect(loadReceivingEntries(key)).toEqual({})
    localStorage.setItem(key, JSON.stringify(['legacy-id']))
    expect(loadReceivingEntries(key)).toEqual({})
  })

  it('removes the legacy unscoped key', () => {
    localStorage.setItem('receivingOrderIds', JSON.stringify(['x']))
    loadReceivingEntries(receivingStorageKey('u1'))
    expect(localStorage.getItem('receivingOrderIds')).toBeNull()
  })
})
