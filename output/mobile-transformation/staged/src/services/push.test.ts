import { Platform } from 'react-native'
import { getPushPlatform, isExpoGo, isPushAvailable } from './push'

describe('push service', () => {
  it('maps ios platform', () => {
    Platform.OS = 'ios'
    expect(getPushPlatform()).toBe('ios')
  })

  it('maps android platform', () => {
    Platform.OS = 'android'
    expect(getPushPlatform()).toBe('android')
  })

  it('detects Expo Go runtime', () => {
    expect(typeof isExpoGo()).toBe('boolean')
  })

  it('skips push on web', () => {
    Platform.OS = 'web'
    expect(isPushAvailable()).toBe(false)
  })
})
