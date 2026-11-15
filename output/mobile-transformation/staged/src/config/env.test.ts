import { resolveDevHostForAndroid } from './env'

describe('resolveDevHostForAndroid', () => {
  it('rewrites localhost without port (nginx on :80)', () => {
    expect(resolveDevHostForAndroid('http://localhost')).toBe('http://10.0.2.2')
    expect(resolveDevHostForAndroid('http://localhost/')).toBe('http://10.0.2.2')
  })

  it('rewrites localhost with port', () => {
    expect(resolveDevHostForAndroid('http://localhost:8180')).toBe('http://10.0.2.2:8180')
    expect(resolveDevHostForAndroid('http://127.0.0.1:4000')).toBe('http://10.0.2.2:4000')
  })

  it('leaves other hosts unchanged', () => {
    expect(resolveDevHostForAndroid('https://api.example.com')).toBe('https://api.example.com')
  })
})
