/**
 * FormData serialization tests
 *
 * Tests the FormData serialize/deserialize logic for Worker transfer
 */

import { describe, it, expect } from 'vitest'
import {
  serializeFormData,
  deserializeFormData,
  isFormData,
  isSerializedFormData
} from '../src/utils/formdata'

describe('FormData Serialization', () => {
  describe('serializeFormData', () => {
    it('should serialize simple string fields', async () => {
      const formData = new FormData()
      formData.append('name', 'John')
      formData.append('email', 'john@example.com')

      const result = await serializeFormData(formData)

      expect(result.data._type).toBe('FormData')
      expect(result.data.entries).toHaveLength(2)
      expect(result.data.entries[0]).toEqual(['name', 'John'])
      expect(result.data.entries[1]).toEqual(['email', 'john@example.com'])
      expect(result.transferables).toHaveLength(0)
    })

    it('should serialize File objects with ArrayBuffer', async () => {
      const formData = new FormData()
      const file = new File(['test content'], 'test.txt', { type: 'text/plain' })
      formData.append('file', file)

      const result = await serializeFormData(formData)

      expect(result.data._type).toBe('FormData')
      expect(result.data.entries).toHaveLength(1)

      const [key, value] = result.data.entries[0]
      expect(key).toBe('file')
      expect(typeof value).toBe('object')
      expect((value as any).name).toBe('test.txt')
      expect((value as any).type).toBe('text/plain')
      expect((value as any).buffer).toBeInstanceOf(ArrayBuffer)

      // Should have transferable ArrayBuffer
      expect(result.transferables).toHaveLength(1)
      expect(result.transferables[0]).toBeInstanceOf(ArrayBuffer)
    })

    it('should preserve field order with mixed content', async () => {
      const formData = new FormData()
      formData.append('field1', 'value1')
      formData.append('file1', new File(['content1'], 'a.txt', { type: 'text/plain' }))
      formData.append('field2', 'value2')
      formData.append('file2', new File(['content2'], 'b.txt', { type: 'text/plain' }))
      formData.append('field3', 'value3')

      const result = await serializeFormData(formData)

      expect(result.data.entries).toHaveLength(5)
      expect(result.data.entries[0][0]).toBe('field1')
      expect(result.data.entries[1][0]).toBe('file1')
      expect(result.data.entries[2][0]).toBe('field2')
      expect(result.data.entries[3][0]).toBe('file2')
      expect(result.data.entries[4][0]).toBe('field3')

      // Files should have ArrayBuffers
      expect(typeof result.data.entries[1][1]).toBe('object')
      expect(typeof result.data.entries[3][1]).toBe('object')

      // Two transferables for two files
      expect(result.transferables).toHaveLength(2)
    })

    it('should handle empty FormData', async () => {
      const formData = new FormData()

      const result = await serializeFormData(formData)

      expect(result.data._type).toBe('FormData')
      expect(result.data.entries).toHaveLength(0)
      expect(result.transferables).toHaveLength(0)
    })

    it('should handle multiple values with same key', async () => {
      const formData = new FormData()
      formData.append('tags', 'tag1')
      formData.append('tags', 'tag2')
      formData.append('tags', 'tag3')

      const result = await serializeFormData(formData)

      expect(result.data.entries).toHaveLength(3)
      expect(result.data.entries[0]).toEqual(['tags', 'tag1'])
      expect(result.data.entries[1]).toEqual(['tags', 'tag2'])
      expect(result.data.entries[2]).toEqual(['tags', 'tag3'])
    })
  })

  describe('deserializeFormData', () => {
    it('should deserialize string fields', () => {
      const serialized = {
        _type: 'FormData' as const,
        entries: [
          ['name', 'John'] as [string, string],
          ['email', 'john@example.com'] as [string, string]
        ]
      }

      const formData = deserializeFormData(serialized)

      expect(formData.get('name')).toBe('John')
      expect(formData.get('email')).toBe('john@example.com')
    })

    it('should deserialize File objects from ArrayBuffer', () => {
      const buffer = new TextEncoder().encode('test content').buffer
      const serialized = {
        _type: 'FormData' as const,
        entries: [
          ['file', { name: 'test.txt', type: 'text/plain', buffer }] as [string, any]
        ]
      }

      const formData = deserializeFormData(serialized)
      const file = formData.get('file') as File

      expect(file).toBeInstanceOf(File)
      expect(file.name).toBe('test.txt')
      expect(file.type).toBe('text/plain')
    })

    it('should preserve order on round-trip', async () => {
      const original = new FormData()
      original.append('a', '1')
      original.append('b', '2')
      original.append('c', '3')

      const serialized = await serializeFormData(original)
      const restored = deserializeFormData(serialized.data)

      const entries = Array.from(restored.entries())
      expect(entries[0]).toEqual(['a', '1'])
      expect(entries[1]).toEqual(['b', '2'])
      expect(entries[2]).toEqual(['c', '3'])
    })
  })

  describe('isFormData', () => {
    it('should return true for FormData instances', () => {
      expect(isFormData(new FormData())).toBe(true)
    })

    it('should return false for other types', () => {
      expect(isFormData(null)).toBe(false)
      expect(isFormData(undefined)).toBe(false)
      expect(isFormData({})).toBe(false)
      expect(isFormData('string')).toBe(false)
      expect(isFormData(123)).toBe(false)
      expect(isFormData([])).toBe(false)
    })
  })

  describe('isSerializedFormData', () => {
    it('should return true for serialized FormData objects', () => {
      const serialized = { _type: 'FormData', entries: [] }
      expect(isSerializedFormData(serialized)).toBe(true)
    })

    it('should return false for other types', () => {
      expect(isSerializedFormData(null)).toBe(false)
      expect(isSerializedFormData(undefined)).toBe(false)
      expect(isSerializedFormData({})).toBe(false)
      expect(isSerializedFormData({ _type: 'Other' })).toBe(false)
      expect(isSerializedFormData('string')).toBe(false)
    })
  })
})
