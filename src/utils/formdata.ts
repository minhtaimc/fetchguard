import type { SerializedFormData, SerializedFormDataEntry, SerializedFile } from '../types'

/**
 * Serialize FormData for transfer over postMessage
 * Inspired by api-worker.js:484-518
 *
 * FormData cannot be cloned via postMessage, so we need to serialize it first
 * Files are converted to ArrayBuffer -> number[] for transfer
 */
export async function serializeFormData(formData: FormData): Promise<SerializedFormData> {
  const entries: Array<[string, SerializedFormDataEntry]> = []

  // Use forEach instead of entries() for better TS compatibility
  formData.forEach((value, key) => {
    // Push async operations to promises array for parallel processing
    if (value instanceof File) {
      // We need to handle this synchronously in forEach, so we'll collect promises
      // and await them all at once
    } else {
      entries.push([key, String(value)])
    }
  })

  // Handle File entries separately with Promise.all
  const filePromises: Promise<void>[] = []
  formData.forEach((value, key) => {
    if (value instanceof File) {
      const promise = (async () => {
        const arrayBuffer = await value.arrayBuffer()
        const uint8Array = new Uint8Array(arrayBuffer)
        const serializedFile: SerializedFile = {
          name: value.name,
          type: value.type,
          data: Array.from(uint8Array) // Convert to number array
        }
        entries.push([key, serializedFile])
      })()
      filePromises.push(promise)
    }
  })

  await Promise.all(filePromises)

  return {
    _type: 'FormData',
    entries
  }
}

/**
 * Deserialize SerializedFormData back to FormData in worker
 * Reconstructs File objects from serialized data
 */
export function deserializeFormData(serialized: SerializedFormData): FormData {
  const formData = new FormData()

  for (const [key, value] of serialized.entries) {
    if (typeof value === 'string') {
      formData.append(key, value)
    } else {
      // Reconstruct File from SerializedFile
      const uint8Array = new Uint8Array(value.data)
      const file = new File([uint8Array], value.name, { type: value.type })
      formData.append(key, file)
    }
  }

  return formData
}

/**
 * Check if body is FormData
 */
export function isFormData(body: unknown): body is FormData {
  return body instanceof FormData
}

/**
 * Check if serialized body is SerializedFormData
 */
export function isSerializedFormData(body: unknown): body is SerializedFormData {
  return body !== null && typeof body === 'object' && (body as SerializedFormData)._type === 'FormData'
}
