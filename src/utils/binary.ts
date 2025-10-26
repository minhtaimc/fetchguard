/**
 * Binary data utilities for Worker
 * Handles ArrayBuffer <-> Base64 conversion for binary responses
 */

/**
 * Convert ArrayBuffer to base64 string
 * Used in worker to encode binary responses for postMessage transfer
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/**
 * Convert base64 string to ArrayBuffer
 * Used in client to decode binary responses
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

/**
 * Check if content type is binary (should be base64 encoded)
 * Returns true for images, PDFs, videos, etc.
 */
export function isBinaryContentType(contentType: string): boolean {
  const normalized = contentType.toLowerCase()

  // Text types - NOT binary
  if (normalized.includes('text/')) return false
  if (normalized.includes('json')) return false
  if (normalized.includes('xml')) return false
  if (normalized.includes('javascript')) return false
  if (normalized.includes('ecmascript')) return false
  if (normalized.includes('html')) return false

  // Everything else is considered binary
  return true
}
