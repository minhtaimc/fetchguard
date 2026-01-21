import type { SerializedFormData, SerializedFormDataEntry, SerializedFile, SerializedFormDataResult } from '../types'

/**
 * Serialize FormData for transfer over postMessage
 *
 * FormData cannot be cloned via postMessage, so we need to serialize it first.
 * Files are converted to ArrayBuffer and returned as transferables for zero-copy transfer.
 *
 * IMPORTANT: Preserves original field order by using single-pass iteration.
 *
 * @returns SerializedFormDataResult with data and transferables array
 */
export async function serializeFormData(formData: FormData): Promise<SerializedFormDataResult> {
  const entries: Array<[string, SerializedFormDataEntry]> = []
  const transferables: ArrayBuffer[] = []

  // Single-pass iteration to preserve original field order
  // Collect all entries with their index for order preservation
  const orderedEntries: Array<{ index: number; key: string; value: FormDataEntryValue }> = []
  let index = 0
  formData.forEach((value, key) => {
    orderedEntries.push({ index, key, value })
    index++
  })

  // Process all entries in order, handling files async
  await Promise.all(
    orderedEntries.map(async ({ index: idx, key, value }) => {
      if (value instanceof File) {
        const buffer = await value.arrayBuffer()
        const serializedFile: SerializedFile = {
          name: value.name,
          type: value.type,
          buffer
        }
        // Store with index for sorting later
        entries[idx] = [key, serializedFile]
        transferables.push(buffer)
      } else {
        entries[idx] = [key, String(value)]
      }
    })
  )

  return {
    data: {
      _type: 'FormData',
      entries
    },
    transferables
  }
}

/**
 * Deserialize SerializedFormData back to FormData in worker
 * Reconstructs File objects from transferred ArrayBuffers
 */
export function deserializeFormData(serialized: SerializedFormData): FormData {
  const formData = new FormData()

  for (const [key, value] of serialized.entries) {
    if (typeof value === 'string') {
      formData.append(key, value)
    } else {
      // Reconstruct File from SerializedFile (ArrayBuffer already transferred)
      const file = new File([value.buffer], value.name, { type: value.type })
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
