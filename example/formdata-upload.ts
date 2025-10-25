/**
 * Example: File Upload with FormData
 *
 * Demonstrates how FetchGuard handles FormData serialization/deserialization
 * for file uploads through Web Worker
 */

import { createClient } from '../src/index'

async function exampleFileUpload() {
  // Create FetchGuard client
  const api = createClient({
    provider: {
      type: 'body-auth',
      refreshUrl: 'https://api.example.com/auth/refresh',
      loginUrl: 'https://api.example.com/auth/login',
      logoutUrl: 'https://api.example.com/auth/logout'
    },
    allowedDomains: ['api.example.com']
  })

  // Wait for worker to be ready
  await api.whenReady()

  // Example 1: Upload single file
  const file = new File(['Hello World'], 'example.txt', { type: 'text/plain' })
  const formData1 = new FormData()
  formData1.append('file', file)
  formData1.append('filename', 'example.txt')
  formData1.append('description', 'Example file upload')

  const result1 = await api.fetch('https://api.example.com/upload', {
    method: 'POST',
    body: formData1 // FormData will be automatically serialized
  })

  if (result1.isOk()) {
    console.log('Upload successful:', result1.data)
  } else {
    console.error('Upload failed:', result1.errors)
  }

  // Example 2: Upload multiple files
  const file1 = new File(['Content 1'], 'file1.txt', { type: 'text/plain' })
  const file2 = new File(['Content 2'], 'file2.txt', { type: 'text/plain' })
  const formData2 = new FormData()
  formData2.append('files', file1)
  formData2.append('files', file2)
  formData2.append('userId', '123')

  const result2 = await api.fetch('https://api.example.com/upload-multiple', {
    method: 'POST',
    body: formData2
  })

  if (result2.isOk()) {
    console.log('Multiple uploads successful:', result2.data)
  }

  // Example 3: Upload with Unicode filename (Vietnamese example)
  const vietnameseFile = new File(['Nội dung'], 'tài_liệu_tiếng_việt.txt', { type: 'text/plain' })
  const formData3 = new FormData()
  formData3.append('file', vietnameseFile)

  const result3 = await api.fetch('https://api.example.com/upload', {
    method: 'POST',
    body: formData3
  })

  if (result3.isOk()) {
    console.log('Vietnamese file upload successful:', result3.data)
  }

  // Cleanup
  api.destroy()
}

/**
 * How it works internally:
 *
 * 1. Client side (main thread):
 *    - User creates FormData with files
 *    - FetchGuard detects FormData in body
 *    - Serializes FormData:
 *      - Files → ArrayBuffer → number[] (for postMessage)
 *      - Strings → kept as strings
 *    - Sends serialized data to Worker via postMessage
 *
 * 2. Worker side:
 *    - Receives serialized FormData
 *    - Deserializes back to FormData:
 *      - number[] → ArrayBuffer → File objects
 *      - Strings → kept as strings
 *    - Makes fetch request with reconstructed FormData
 *    - Browser sets correct Content-Type with boundary
 *
 * 3. Benefits:
 *    - Token security: File upload still protected by Worker isolation
 *    - Unicode support: Filenames properly normalized
 *    - Multiple files: Fully supported
 *    - No manual serialization: Automatic handling
 */

// Run example if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  exampleFileUpload().catch(console.error)
}

export { exampleFileUpload }
