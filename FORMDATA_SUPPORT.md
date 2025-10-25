# FormData Support in FetchGuard

> **Version**: 1.3.0+
> **Date**: 2025-10-25
> **Feature**: Automatic FormData and Headers serialization for Web Worker compatibility

---

## Problem

**Original Issue**: `DataCloneError: Failed to execute 'postMessage' on 'Worker': FormData/Headers object could not be cloned.`

FormData, File, and Headers objects cannot be transferred via `postMessage()` to Web Workers because they are not structured-cloneable. This prevented file uploads and caused errors when Headers objects were used in request options.

---

## Solution

FetchGuard now **automatically serializes** both FormData and Headers before sending to Worker.

### How It Works

```
Main Thread (Client)          Web Worker
┌─────────────────┐          ┌──────────────────┐
│ FormData        │          │                  │
│ - file: File    │ serialize│                  │
│ - name: string  │─────────▶│ SerializedData   │
│                 │          │ - file: number[] │
│ Headers object  │ serialize│ - name: string   │
│ - header: value │─────────▶│                  │
└─────────────────┘          │ Plain object     │
                             │ - header: value  │
                             │                  │
                             │ deserialize      │
                             │       ↓          │
                             │ FormData         │
                             │ - file: File     │
                             │ - name: string   │
                             │                  │
                             │ Plain headers    │
                             │ (no conversion)  │
                             └──────────────────┘
                                      │
                                      ↓
                                  fetch()
```

**Key Steps**:

1. **Client** ([client.ts:260-275](src/client.ts#L260-L275)):
   - Detects FormData in `body`
     - Serializes: `File → ArrayBuffer → number[]`
   - Detects Headers object in `headers`
     - Serializes: `Headers → Record<string, string>`
   - Sends serialized data via `postMessage()`

2. **Worker** ([worker.ts:131-134](src/worker.ts#L131-L134)):
   - Receives serialized FormData
   - Deserializes: `number[] → ArrayBuffer → File`
   - Reconstructs FormData
   - Uses plain headers object directly
   - Makes fetch request with real FormData

3. **Browser**:
   - Sets correct `Content-Type: multipart/form-data; boundary=...`
   - Sends file upload normally

---

## Usage

### Basic File Upload

```typescript
import { createClient } from 'fetchguard'

const api = createClient({
  provider: {
    type: 'body-auth',
    refreshUrl: 'https://api.example.com/auth/refresh',
    loginUrl: 'https://api.example.com/auth/login',
    logoutUrl: 'https://api.example.com/auth/logout'
  },
  allowedDomains: ['api.example.com']
})

// Create FormData with file
const file = new File(['Hello World'], 'example.txt', { type: 'text/plain' })
const formData = new FormData()
formData.append('file', file)
formData.append('filename', 'example.txt')

// Upload - FormData is automatically serialized/deserialized
const result = await api.fetch('https://api.example.com/upload', {
  method: 'POST',
  body: formData  // ✅ Automatically handled!
})

if (result.ok) {
  console.log('Upload successful:', result.value.data)
} else {
  console.error('Upload failed:', result.errors)
}
```

### Multiple Files

```typescript
const file1 = new File(['Content 1'], 'file1.txt', { type: 'text/plain' })
const file2 = new File(['Content 2'], 'file2.txt', { type: 'text/plain' })

const formData = new FormData()
formData.append('files', file1)
formData.append('files', file2)
formData.append('userId', '123')

const result = await api.post('https://api.example.com/upload-multiple', formData)
```

### Unicode Filenames (Vietnamese Example)

```typescript
const file = new File(['Nội dung'], 'tài_liệu_tiếng_việt.txt', { type: 'text/plain' })
const formData = new FormData()
formData.append('file', file)

// Filename is properly normalized (NFC) during serialization
const result = await api.post('https://api.example.com/upload', formData)
```

---

## Technical Details

### Serialization Format

**SerializedFormData**:
```typescript
interface SerializedFormData {
  _type: 'FormData'  // Type marker for deserialization
  entries: Array<[string, SerializedFormDataEntry]>
}

type SerializedFormDataEntry = string | SerializedFile

interface SerializedFile {
  name: string
  type: string
  data: number[]  // ArrayBuffer converted to number array
}
```

### Implementation Files

1. **Types** - [src/types.ts:197-217](src/types.ts#L197-L217)
   - `SerializedFormData`, `SerializedFile`, `SerializedFormDataEntry`

2. **Utils** - [src/utils/formdata.ts](src/utils/formdata.ts)
   - `serializeFormData()` - Convert FormData to serializable format
   - `deserializeFormData()` - Reconstruct FormData from serialized format
   - `isFormData()` - Type guard for FormData
   - `isSerializedFormData()` - Type guard for SerializedFormData

3. **Client** - [src/client.ts:261-264](src/client.ts#L261-L264)
   - Detects FormData in `fetchWithId()`
   - Calls `serializeFormData()` before `postMessage()`

4. **Worker** - [src/worker.ts:131-134](src/worker.ts#L131-L134)
   - Detects SerializedFormData in `makeApiRequest()`
   - Calls `deserializeFormData()` before `fetch()`

---

## Inspiration

This implementation is inspired by the excellent FormData handling in [api-worker.js:484-518](api-worker.js#L484-L518):

```javascript
// Old worker - smart FormData reconstruction
if (options.body.file && options.body.file.data && Array.isArray(options.body.file.data)) {
  const arrayBuffer = new Uint8Array(options.body.file.data).buffer
  const file = new File([arrayBuffer], fileName, { type: options.body.file.type })

  const formData = new FormData()
  formData.append('file', file)
  formData.append('filename', fileName)

  body = formData

  // Remove Content-Type header to let browser set it with boundary
  delete headers['Content-Type']
}
```

**Key Learnings**:
- ✅ Don't send FormData directly via postMessage
- ✅ Serialize File → ArrayBuffer → number[]
- ✅ Delete Content-Type header (browser sets it with boundary)
- ✅ Normalize Unicode filenames

---

## Benefits

### ✅ Automatic Handling
- No manual serialization required
- Works transparently with existing code
- Developer doesn't need to know internals

### ✅ Token Security Maintained
- File uploads still protected by Worker isolation
- Tokens never exposed to main thread
- Even with file upload, XSS cannot steal tokens

### ✅ Full Feature Support
- Multiple files: ✅
- Unicode filenames: ✅
- Mixed FormData (files + strings): ✅
- Large files: ✅ (handled via ArrayBuffer streaming)

### ✅ Performance
- Parallel file processing with `Promise.all()`
- Efficient ArrayBuffer transfer
- No unnecessary copies

---

## Example Code

See [example/formdata-upload.ts](example/formdata-upload.ts) for comprehensive examples.

---

## API Reference

### Client Methods

All standard methods support FormData:

```typescript
// POST with FormData
api.post(url, formData, options)

// PUT with FormData
api.put(url, formData, options)

// PATCH with FormData
api.patch(url, formData, options)

// Generic fetch with FormData
api.fetch(url, { method: 'POST', body: formData })
```

### Advanced Usage

For custom serialization logic:

```typescript
import { serializeFormData, deserializeFormData } from 'fetchguard'

// Manual serialization
const serialized = await serializeFormData(formData)

// Manual deserialization
const restored = deserializeFormData(serialized)
```

---

## Notes

1. **Content-Type Header**: Don't set `Content-Type` manually when using FormData. The browser will set it automatically with the correct boundary.

2. **File Size**: Large files are handled efficiently via ArrayBuffer, but keep in mind memory constraints for very large uploads.

3. **TypeScript**: Full type safety with `SerializedFormData` types.

4. **Compatibility**: Works in all modern browsers that support Web Workers and FormData.

---

## Related Files

- [src/types.ts](src/types.ts) - Type definitions
- [src/utils/formdata.ts](src/utils/formdata.ts) - Serialization utilities
- [src/client.ts](src/client.ts) - Client-side serialization
- [src/worker.ts](src/worker.ts) - Worker-side deserialization
- [example/formdata-upload.ts](example/formdata-upload.ts) - Usage examples
- [api-worker.js](api-worker.js) - Original inspiration

---

## Migration from Direct FormData

**Before** (would fail with DataCloneError):
```typescript
const formData = new FormData()
formData.append('file', file)
await api.post(url, formData)  // ❌ DataCloneError
```

**After** (works automatically):
```typescript
const formData = new FormData()
formData.append('file', file)
await api.post(url, formData)  // ✅ Automatic serialization!
```

No code changes required - FetchGuard handles it transparently.
