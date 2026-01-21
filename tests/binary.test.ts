/**
 * Binary utilities tests
 *
 * Tests ArrayBuffer <-> Base64 conversion and content type detection
 */

import { describe, it, expect } from 'vitest'
import {
  arrayBufferToBase64,
  base64ToArrayBuffer,
  isBinaryContentType
} from '../src/utils/binary'

describe('Binary Utilities', () => {
  describe('arrayBufferToBase64', () => {
    it('should convert ArrayBuffer to base64 string', () => {
      const text = 'Hello, World!'
      const buffer = new TextEncoder().encode(text).buffer

      const base64 = arrayBufferToBase64(buffer)

      expect(typeof base64).toBe('string')
      expect(base64).toBe(btoa(text))
    })

    it('should handle empty ArrayBuffer', () => {
      const buffer = new ArrayBuffer(0)

      const base64 = arrayBufferToBase64(buffer)

      expect(base64).toBe('')
    })

    it('should handle binary data', () => {
      const bytes = new Uint8Array([0, 1, 127, 128, 255])
      const buffer = bytes.buffer

      const base64 = arrayBufferToBase64(buffer)

      expect(typeof base64).toBe('string')
      expect(base64.length).toBeGreaterThan(0)
    })
  })

  describe('base64ToArrayBuffer', () => {
    it('should convert base64 string to ArrayBuffer', () => {
      const text = 'Hello, World!'
      const base64 = btoa(text)

      const buffer = base64ToArrayBuffer(base64)
      const decoded = new TextDecoder().decode(buffer)

      expect(decoded).toBe(text)
    })

    it('should handle empty base64', () => {
      const buffer = base64ToArrayBuffer('')

      expect(buffer.byteLength).toBe(0)
    })

    it('should round-trip correctly', () => {
      const original = new Uint8Array([0, 1, 127, 128, 255])
      const buffer = original.buffer

      const base64 = arrayBufferToBase64(buffer)
      const restored = new Uint8Array(base64ToArrayBuffer(base64))

      expect(Array.from(restored)).toEqual(Array.from(original))
    })
  })

  describe('isBinaryContentType', () => {
    describe('should return false for text types', () => {
      it('text/plain', () => {
        expect(isBinaryContentType('text/plain')).toBe(false)
      })

      it('text/html', () => {
        expect(isBinaryContentType('text/html')).toBe(false)
      })

      it('text/css', () => {
        expect(isBinaryContentType('text/css')).toBe(false)
      })

      it('text/csv', () => {
        expect(isBinaryContentType('text/csv')).toBe(false)
      })
    })

    describe('should return false for JSON types', () => {
      it('application/json', () => {
        expect(isBinaryContentType('application/json')).toBe(false)
      })

      it('application/json; charset=utf-8', () => {
        expect(isBinaryContentType('application/json; charset=utf-8')).toBe(false)
      })

      it('application/ld+json (JSON-LD)', () => {
        expect(isBinaryContentType('application/ld+json')).toBe(false)
      })

      it('application/vnd.api+json (JSON API)', () => {
        expect(isBinaryContentType('application/vnd.api+json')).toBe(false)
      })

      it('application/problem+json (RFC 7807)', () => {
        expect(isBinaryContentType('application/problem+json')).toBe(false)
      })
    })

    describe('should return false for XML types', () => {
      it('application/xml', () => {
        expect(isBinaryContentType('application/xml')).toBe(false)
      })

      it('text/xml', () => {
        expect(isBinaryContentType('text/xml')).toBe(false)
      })

      it('application/xhtml+xml', () => {
        expect(isBinaryContentType('application/xhtml+xml')).toBe(false)
      })
    })

    describe('should return false for JavaScript types', () => {
      it('application/javascript', () => {
        expect(isBinaryContentType('application/javascript')).toBe(false)
      })

      it('text/javascript', () => {
        expect(isBinaryContentType('text/javascript')).toBe(false)
      })

      it('application/ecmascript', () => {
        expect(isBinaryContentType('application/ecmascript')).toBe(false)
      })
    })

    describe('should return true for binary types', () => {
      it('image/png', () => {
        expect(isBinaryContentType('image/png')).toBe(true)
      })

      it('image/jpeg', () => {
        expect(isBinaryContentType('image/jpeg')).toBe(true)
      })

      it('image/gif', () => {
        expect(isBinaryContentType('image/gif')).toBe(true)
      })

      it('image/webp', () => {
        expect(isBinaryContentType('image/webp')).toBe(true)
      })

      it('application/pdf', () => {
        expect(isBinaryContentType('application/pdf')).toBe(true)
      })

      it('application/zip', () => {
        expect(isBinaryContentType('application/zip')).toBe(true)
      })

      it('application/octet-stream', () => {
        expect(isBinaryContentType('application/octet-stream')).toBe(true)
      })

      it('video/mp4', () => {
        expect(isBinaryContentType('video/mp4')).toBe(true)
      })

      it('audio/mpeg', () => {
        expect(isBinaryContentType('audio/mpeg')).toBe(true)
      })
    })

    describe('case insensitivity', () => {
      it('should handle uppercase', () => {
        expect(isBinaryContentType('APPLICATION/JSON')).toBe(false)
        expect(isBinaryContentType('IMAGE/PNG')).toBe(true)
      })

      it('should handle mixed case', () => {
        expect(isBinaryContentType('Application/Json')).toBe(false)
        expect(isBinaryContentType('Image/Png')).toBe(true)
      })
    })
  })
})
