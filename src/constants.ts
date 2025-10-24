/**
 * FetchGuard Default Configuration Values
 */

/**
 * Default time (in milliseconds) to refresh token before expiry
 * @default 60000 (60 seconds)
 */
export const DEFAULT_REFRESH_EARLY_MS = 60_000

/**
 * Default timeout for API requests (in milliseconds)
 * @default 30000 (30 seconds)
 */
export const DEFAULT_TIMEOUT_MS = 30_000

/**
 * Default number of retry attempts for failed requests
 * @default 3
 */
export const DEFAULT_RETRY_COUNT = 3

/**
 * Default delay between retry attempts (in milliseconds)
 * @default 1000 (1 second)
 */
export const DEFAULT_RETRY_DELAY_MS = 1_000
