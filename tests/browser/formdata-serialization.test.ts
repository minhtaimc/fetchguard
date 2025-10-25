import { describe, it, expect } from 'vitest'
import { serializeFormData, deserializeFormData, isFormData, isSerializedFormData } from '../../dist/index.js'

describe('FormData Serialization (Browser)', () => {
  it('serializes FormData with single file', async () => {
    // Create file
    const file = new File(['Hello World'], 'test.txt', { type: 'text/plain' })

    // Create FormData
    const formData = new FormData()
    formData.append('file', file)
    formData.append('description', 'Test file')

    // Serialize
    const serialized = await serializeFormData(formData)

    // Verify structure
    expect(serialized._type).toBe('FormData')
    expect(serialized.entries).toHaveLength(2)

    // Check file entry
    const fileEntry = serialized.entries.find(([key]) => key === 'file')
    expect(fileEntry).toBeDefined()
    if (fileEntry) {
      const [, value] = fileEntry
      expect(value).toHaveProperty('name', 'test.txt')
      expect(value).toHaveProperty('type', 'text/plain')
      expect(value).toHaveProperty('data')
      expect(Array.isArray((value as any).data)).toBe(true)
    }

    // Check string entry
    const descEntry = serialized.entries.find(([key]) => key === 'description')
    expect(descEntry).toBeDefined()
    if (descEntry) {
      const [, value] = descEntry
      expect(value).toBe('Test file')
    }
  })

  it('deserializes SerializedFormData back to FormData', async () => {
    // Create original file
    const originalFile = new File(['Test content'], 'test.txt', { type: 'text/plain' })
    const originalFormData = new FormData()
    originalFormData.append('file', originalFile)
    originalFormData.append('name', 'Test')

    // Serialize
    const serialized = await serializeFormData(originalFormData)

    // Deserialize
    const deserialized = deserializeFormData(serialized)

    // Verify it's FormData
    expect(deserialized instanceof FormData).toBe(true)

    // Verify contents
    const deserializedFile = deserialized.get('file')
    expect(deserializedFile).toBeInstanceOf(File)
    if (deserializedFile instanceof File) {
      expect(deserializedFile.name).toBe('test.txt')
      expect(deserializedFile.type).toBe('text/plain')
      expect(deserializedFile.size).toBe(12) // "Test content".length
    }

    const deserializedName = deserialized.get('name')
    expect(deserializedName).toBe('Test')
  })

  it('handles multiple files in FormData', async () => {
    const file1 = new File(['Content 1'], 'file1.txt', { type: 'text/plain' })
    const file2 = new File(['Content 2'], 'file2.txt', { type: 'text/plain' })

    const formData = new FormData()
    formData.append('files', file1)
    formData.append('files', file2)

    // Serialize
    const serialized = await serializeFormData(formData)
    expect(serialized.entries).toHaveLength(2)

    // Deserialize
    const deserialized = deserializeFormData(serialized)

    // Verify both files
    const files = deserialized.getAll('files')
    expect(files).toHaveLength(2)
    expect(files[0]).toBeInstanceOf(File)
    expect(files[1]).toBeInstanceOf(File)
  })

  it('preserves file content after serialize/deserialize', async () => {
    const content = 'This is test content that should be preserved'
    const file = new File([content], 'content.txt', { type: 'text/plain' })

    const formData = new FormData()
    formData.append('file', file)

    // Serialize and deserialize
    const serialized = await serializeFormData(formData)
    const deserialized = deserializeFormData(serialized)

    // Read file content
    const deserializedFile = deserialized.get('file')
    expect(deserializedFile).toBeInstanceOf(File)

    if (deserializedFile instanceof File) {
      const text = await deserializedFile.text()
      expect(text).toBe(content)
    }
  })

  it('handles Unicode filenames correctly', async () => {
    const file = new File(
      ['Nội dung tiếng Việt'],
      'tài_liệu_tiếng_việt.txt',
      { type: 'text/plain' }
    )

    const formData = new FormData()
    formData.append('file', file)

    // Serialize and deserialize
    const serialized = await serializeFormData(formData)
    const deserialized = deserializeFormData(serialized)

    const deserializedFile = deserialized.get('file')
    expect(deserializedFile).toBeInstanceOf(File)

    if (deserializedFile instanceof File) {
      expect(deserializedFile.name).toBe('tài_liệu_tiếng_việt.txt')
      const text = await deserializedFile.text()
      expect(text).toBe('Nội dung tiếng Việt')
    }
  })

  it('handles binary files correctly', async () => {
    // Create binary content
    const binaryData = new Uint8Array(256)
    for (let i = 0; i < 256; i++) {
      binaryData[i] = i
    }

    const file = new File([binaryData], 'binary.bin', {
      type: 'application/octet-stream'
    })

    const formData = new FormData()
    formData.append('file', file)

    // Serialize and deserialize
    const serialized = await serializeFormData(formData)
    const deserialized = deserializeFormData(serialized)

    const deserializedFile = deserialized.get('file')
    expect(deserializedFile).toBeInstanceOf(File)

    if (deserializedFile instanceof File) {
      // Verify binary content
      const buffer = await deserializedFile.arrayBuffer()
      const restored = new Uint8Array(buffer)

      expect(restored.length).toBe(256)
      for (let i = 0; i < 256; i++) {
        expect(restored[i]).toBe(i)
      }
    }
  })

  it('handles large files efficiently', async () => {
    // Create 1MB file
    const largeData = new Uint8Array(1024 * 1024)
    for (let i = 0; i < largeData.length; i++) {
      largeData[i] = i % 256
    }

    const file = new File([largeData], 'large.bin', {
      type: 'application/octet-stream'
    })

    const formData = new FormData()
    formData.append('file', file)

    // Measure serialization time
    const startSerialize = performance.now()
    const serialized = await serializeFormData(formData)
    const serializeTime = performance.now() - startSerialize

    console.log(`Serialization time for 1MB: ${serializeTime.toFixed(2)}ms`)
    expect(serializeTime).toBeLessThan(1000) // Should be < 1 second

    // Measure deserialization time
    const startDeserialize = performance.now()
    const deserialized = deserializeFormData(serialized)
    const deserializeTime = performance.now() - startDeserialize

    console.log(`Deserialization time for 1MB: ${deserializeTime.toFixed(2)}ms`)
    expect(deserializeTime).toBeLessThan(100) // Should be very fast

    // Verify file
    const deserializedFile = deserialized.get('file')
    expect(deserializedFile).toBeInstanceOf(File)
    if (deserializedFile instanceof File) {
      expect(deserializedFile.size).toBe(1024 * 1024)
    }
  }, 15000)

  it('type guard isFormData works correctly', () => {
    const formData = new FormData()
    expect(isFormData(formData)).toBe(true)
    expect(isFormData({})).toBe(false)
    expect(isFormData(null)).toBe(false)
    expect(isFormData('string')).toBe(false)
  })

  it('type guard isSerializedFormData works correctly', async () => {
    const formData = new FormData()
    formData.append('test', 'value')

    const serialized = await serializeFormData(formData)

    expect(isSerializedFormData(serialized)).toBe(true)
    expect(isSerializedFormData(formData)).toBe(false)
    expect(isSerializedFormData({})).toBe(false)
    expect(isSerializedFormData({ _type: 'NotFormData' })).toBe(false)
  })

  it('handles empty FormData', async () => {
    const formData = new FormData()

    const serialized = await serializeFormData(formData)
    expect(serialized.entries).toHaveLength(0)

    const deserialized = deserializeFormData(serialized)
    expect(deserialized instanceof FormData).toBe(true)

    // Verify empty
    let count = 0
    deserialized.forEach(() => count++)
    expect(count).toBe(0)
  })

  it('handles mixed FormData (files + strings)', async () => {
    const file1 = new File(['File 1'], 'file1.txt', { type: 'text/plain' })
    const file2 = new File(['File 2'], 'file2.txt', { type: 'text/plain' })

    const formData = new FormData()
    formData.append('file1', file1)
    formData.append('name', 'John Doe')
    formData.append('file2', file2)
    formData.append('email', 'john@example.com')
    formData.append('age', '30')

    // Serialize
    const serialized = await serializeFormData(formData)
    expect(serialized.entries).toHaveLength(5)

    // Deserialize
    const deserialized = deserializeFormData(serialized)

    // Verify files
    expect(deserialized.get('file1')).toBeInstanceOf(File)
    expect(deserialized.get('file2')).toBeInstanceOf(File)

    // Verify strings
    expect(deserialized.get('name')).toBe('John Doe')
    expect(deserialized.get('email')).toBe('john@example.com')
    expect(deserialized.get('age')).toBe('30')
  })
})
