/**
 * Domain validation tests
 *
 * Tests the domain allow-list logic that prevents tokens
 * from being sent to unauthorized domains.
 *
 * Note: validateDomain is internal to worker IIFE, so we test
 * the logic by reimplementing it here for unit testing.
 */

import { describe, it, expect } from 'vitest'

/**
 * Reimplementation of validateDomain for testing
 * Must match src/worker.ts:99-133
 */
function validateDomain(url: string, allowedDomains: string[]): boolean {
  if (!allowedDomains?.length) {
    return true
  }

  try {
    const urlObj = new URL(url)
    const hostname = urlObj.hostname
    const port = urlObj.port

    for (const entry of allowedDomains) {
      const idx = entry.lastIndexOf(':')
      const hasPort = idx > -1 && entry.indexOf(':') === idx
      const pattern = hasPort ? entry.slice(0, idx) : entry
      const entryPort = hasPort ? entry.slice(idx + 1) : ''
      const isWildcard = pattern.startsWith('*.')
      const base = isWildcard ? pattern.slice(2) : pattern

      const hostnameMatch = isWildcard
        ? (hostname === base || hostname.endsWith('.' + base))
        : (hostname === base)

      if (!hostnameMatch) continue

      if (hasPort) {
        if (port === entryPort) return true
        continue
      }
      return true
    }
    return false
  } catch {
    return false
  }
}

describe('Domain Validation', () => {
  describe('Empty/No allowlist', () => {
    it('should allow all domains when allowedDomains is empty', () => {
      expect(validateDomain('https://any.com/api', [])).toBe(true)
      expect(validateDomain('https://evil.com/steal', [])).toBe(true)
    })
  })

  describe('Exact domain matching', () => {
    const allowedDomains = ['api.example.com', 'auth.example.com']

    it('should allow exact domain match', () => {
      expect(validateDomain('https://api.example.com/users', allowedDomains)).toBe(true)
      expect(validateDomain('https://auth.example.com/login', allowedDomains)).toBe(true)
    })

    it('should reject non-matching domains', () => {
      expect(validateDomain('https://evil.com/api', allowedDomains)).toBe(false)
      expect(validateDomain('https://example.com/api', allowedDomains)).toBe(false)
    })

    it('should reject subdomains when not using wildcard', () => {
      expect(validateDomain('https://sub.api.example.com/users', allowedDomains)).toBe(false)
    })
  })

  describe('Wildcard domain matching', () => {
    const allowedDomains = ['*.example.com']

    it('should allow subdomains with wildcard', () => {
      expect(validateDomain('https://api.example.com/users', allowedDomains)).toBe(true)
      expect(validateDomain('https://auth.example.com/login', allowedDomains)).toBe(true)
      expect(validateDomain('https://deep.sub.example.com/api', allowedDomains)).toBe(true)
    })

    it('should allow base domain with wildcard (*.example.com matches example.com)', () => {
      expect(validateDomain('https://example.com/api', allowedDomains)).toBe(true)
    })

    it('should reject unrelated domains', () => {
      expect(validateDomain('https://example.org/api', allowedDomains)).toBe(false)
      expect(validateDomain('https://notexample.com/api', allowedDomains)).toBe(false)
    })

    it('should reject domains that end with but are not subdomain', () => {
      // fakeexample.com should NOT match *.example.com
      expect(validateDomain('https://fakeexample.com/api', allowedDomains)).toBe(false)
    })
  })

  describe('Port matching', () => {
    const allowedDomains = ['localhost:3000', 'api.example.com:8080']

    it('should allow exact port match', () => {
      expect(validateDomain('http://localhost:3000/api', allowedDomains)).toBe(true)
      expect(validateDomain('https://api.example.com:8080/users', allowedDomains)).toBe(true)
    })

    it('should reject different ports', () => {
      expect(validateDomain('http://localhost:4000/api', allowedDomains)).toBe(false)
      expect(validateDomain('http://localhost/api', allowedDomains)).toBe(false)
      expect(validateDomain('https://api.example.com:443/users', allowedDomains)).toBe(false)
    })
  })

  describe('Wildcard with port', () => {
    const allowedDomains = ['*.example.com:8080']

    it('should allow subdomain with matching port', () => {
      expect(validateDomain('https://api.example.com:8080/users', allowedDomains)).toBe(true)
    })

    it('should reject subdomain with different port', () => {
      expect(validateDomain('https://api.example.com:443/users', allowedDomains)).toBe(false)
      expect(validateDomain('https://api.example.com/users', allowedDomains)).toBe(false)
    })
  })

  describe('Mixed allowlist', () => {
    const allowedDomains = [
      'api.example.com',
      '*.cdn.example.com',
      'localhost:3000'
    ]

    it('should allow all valid combinations', () => {
      expect(validateDomain('https://api.example.com/users', allowedDomains)).toBe(true)
      expect(validateDomain('https://img.cdn.example.com/photo.jpg', allowedDomains)).toBe(true)
      expect(validateDomain('http://localhost:3000/api', allowedDomains)).toBe(true)
    })

    it('should reject invalid combinations', () => {
      expect(validateDomain('https://evil.com/steal', allowedDomains)).toBe(false)
      expect(validateDomain('http://localhost:4000/api', allowedDomains)).toBe(false)
      expect(validateDomain('https://cdn.example.com/file', allowedDomains)).toBe(true) // base matches wildcard
    })
  })

  describe('Edge cases', () => {
    it('should handle invalid URLs gracefully', () => {
      expect(validateDomain('not-a-url', ['api.example.com'])).toBe(false)
      expect(validateDomain('', ['api.example.com'])).toBe(false)
    })

    it('should handle URLs with paths and query strings', () => {
      const allowedDomains = ['api.example.com']
      expect(validateDomain('https://api.example.com/users?page=1&limit=10', allowedDomains)).toBe(true)
      expect(validateDomain('https://api.example.com/users/123/profile', allowedDomains)).toBe(true)
    })

    it('should handle URLs with authentication', () => {
      const allowedDomains = ['api.example.com']
      expect(validateDomain('https://user:pass@api.example.com/users', allowedDomains)).toBe(true)
    })

    it('should handle IPv4 addresses', () => {
      const allowedDomains = ['192.168.1.1', '10.0.0.1:8080']
      expect(validateDomain('http://192.168.1.1/api', allowedDomains)).toBe(true)
      expect(validateDomain('http://10.0.0.1:8080/api', allowedDomains)).toBe(true)
      expect(validateDomain('http://10.0.0.1/api', allowedDomains)).toBe(false)
    })
  })

  describe('Security: Prevent token leakage', () => {
    const allowedDomains = ['api.example.com']

    it('should block attacker-controlled domains', () => {
      // Common attack patterns
      expect(validateDomain('https://api.example.com.evil.com/steal', allowedDomains)).toBe(false)
      expect(validateDomain('https://evil.com/api.example.com', allowedDomains)).toBe(false)
      expect(validateDomain('https://api-example.com/users', allowedDomains)).toBe(false)
    })

    it('should block homograph attacks (similar looking domains)', () => {
      // Note: These would need IDN handling in production
      expect(validateDomain('https://api.examp1e.com/users', allowedDomains)).toBe(false)
      expect(validateDomain('https://api.exampl3.com/users', allowedDomains)).toBe(false)
    })
  })
})
