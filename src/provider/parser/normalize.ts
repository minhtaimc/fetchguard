/**
 * Normalize expiresAt to milliseconds timestamp
 * Supports: milliseconds, seconds, ISO string, null/undefined
 */
export function normalizeExpiresAt(value: unknown): number | undefined {
  if (value == null) return undefined

  if (typeof value === 'number') {
    // Detect seconds vs milliseconds:
    // - Milliseconds: 13+ digits (e.g., 1767860146000)
    // - Seconds: 10 digits (e.g., 1767860146)
    // Threshold: 10^12 (Sep 2001 in ms, year 33658 in seconds)
    return value < 1e12 ? value * 1000 : value
  }

  if (typeof value === 'string') {
    const ts = Date.parse(value)
    return isNaN(ts) ? undefined : ts
  }

  return undefined
}
