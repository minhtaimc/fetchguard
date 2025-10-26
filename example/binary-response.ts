/**
 * Example: Handling binary responses (images, PDFs, files)
 *
 * FetchGuard automatically detects binary content types and encodes them as base64.
 * Use the provided helper functions to decode binary data on the client side.
 */

import { createClient, base64ToArrayBuffer, isBinaryContentType } from '../src/index'

const api = createClient({
  provider: {
    type: 'body-auth',
    refreshUrl: 'https://api.example.com/auth/refresh',
    loginUrl: 'https://api.example.com/auth/login',
    logoutUrl: 'https://api.example.com/auth/logout'
  }
})

async function downloadImage() {
  const result = await api.get('https://api.example.com/images/profile.png')

  if (result.ok) {
    const { body, contentType } = result.value

    // Check if response is binary
    if (isBinaryContentType(contentType)) {
      console.log('Binary response detected:', contentType)

      // Decode base64 to ArrayBuffer
      const arrayBuffer = base64ToArrayBuffer(body)

      // Create Blob for display/download
      const blob = new Blob([arrayBuffer], { type: contentType })
      const url = URL.createObjectURL(blob)

      // Option 1: Display in <img> tag
      const img = document.createElement('img')
      img.src = url
      document.body.appendChild(img)

      // Option 2: Download file
      const a = document.createElement('a')
      a.href = url
      a.download = 'profile.png'
      a.click()

      // Clean up
      URL.revokeObjectURL(url)
    } else {
      // Text response (JSON, HTML, etc.)
      console.log('Text response:', body)
    }
  } else {
    console.error('Error:', result.error)
  }
}

async function downloadPDF() {
  const result = await api.get('https://api.example.com/reports/2024.pdf')

  if (result.ok) {
    const { body, contentType } = result.value

    if (contentType === 'application/pdf') {
      const arrayBuffer = base64ToArrayBuffer(body)
      const blob = new Blob([arrayBuffer], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)

      // Open PDF in new tab
      window.open(url, '_blank')

      // Or embed in iframe
      const iframe = document.createElement('iframe')
      iframe.src = url
      iframe.style.width = '100%'
      iframe.style.height = '600px'
      document.body.appendChild(iframe)
    }
  }
}

async function handleAnyResponse() {
  const result = await api.get('https://api.example.com/data')

  if (result.ok) {
    const { body, contentType, status, headers } = result.value

    console.log('Status:', status)
    console.log('Content-Type:', contentType)
    console.log('Headers:', headers)

    // Auto-detect and handle based on content type
    if (isBinaryContentType(contentType)) {
      // Binary - decode base64
      const arrayBuffer = base64ToArrayBuffer(body)
      console.log('Binary data size:', arrayBuffer.byteLength, 'bytes')

      // Handle based on specific type
      if (contentType.startsWith('image/')) {
        console.log('Image detected')
        // Display image
      } else if (contentType === 'application/pdf') {
        console.log('PDF detected')
        // Open PDF
      } else if (contentType.startsWith('video/')) {
        console.log('Video detected')
        // Play video
      } else {
        console.log('Other binary type:', contentType)
        // Download file
      }
    } else if (contentType.includes('json')) {
      // JSON - parse
      const data = JSON.parse(body)
      console.log('JSON data:', data)
    } else {
      // Plain text/HTML/XML
      console.log('Text data:', body)
    }
  }
}

// Run examples
downloadImage()
downloadPDF()
handleAnyResponse()
