# Vite Setup Guide

FetchGuard uses Web Workers, which require special configuration in Vite projects.

## Quick Setup

### 1. Install Dependencies

```bash
npm install fetchguard ts-micro-result
```

### 2. Vite Config (Recommended)

Add to your `vite.config.ts`:

```typescript
import { defineConfig } from 'vite'

export default defineConfig({
  optimizeDeps: {
    // Include peer dependency for pre-bundling
    include: ['ts-micro-result'],

    // Exclude fetchguard from pre-bundling (it uses workers)
    exclude: ['fetchguard']
  },

  worker: {
    format: 'es', // Use ES modules for workers
    plugins: () => [] // Use default plugins
  }
})
```

### 3. TypeScript Config

Add to `tsconfig.json` if using TypeScript:

```json
{
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "WebWorker"]
  }
}
```

---

## Why This Configuration?

### `exclude: ['fetchguard']`

**Problem**: Vite's pre-bundling can break Web Worker imports.

**Solution**: Exclude fetchguard from Vite's dependency pre-bundling. This ensures:
- Worker script loads correctly
- No bundling conflicts with Web Worker API
- Faster dev server startup

### `include: ['ts-micro-result']`

**Reason**: `ts-micro-result` is a peer dependency and should be pre-bundled for optimal performance.

---

## Alternative: Manual Configuration

If you prefer not to configure Vite, you can use the no-build approach:

```typescript
import { createClient } from 'fetchguard'

// This works without Vite config changes
const api = createClient({
  provider: {
    type: 'body-auth',
    refreshUrl: 'https://api.example.com/auth/refresh',
    loginUrl: 'https://api.example.com/auth/login',
    logoutUrl: 'https://api.example.com/auth/logout'
  }
})
```

**Note**: You may see a warning in console, but it will still work.

---

## Troubleshooting

### Error: "Worker script failed to load"

**Solution**: Make sure you have `exclude: ['fetchguard']` in `vite.config.ts`.

### Error: "Cannot find module 'ts-micro-result'"

**Solution**: Install peer dependency:
```bash
npm install ts-micro-result
```

### Worker not initializing

**Solution**: Check worker ready state:
```typescript
const api = createClient({ /* ... */ })

// Wait for worker to be ready
await api.whenReady()
console.log('Worker is ready!')
```

---

## Example React + Vite Project

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['ts-micro-result'],
    exclude: ['fetchguard']
  }
})
```

```typescript
// src/api.ts
import { createClient } from 'fetchguard'

export const api = createClient({
  provider: {
    type: 'body-auth',
    refreshUrl: 'https://api.example.com/auth/refresh',
    loginUrl: 'https://api.example.com/auth/login',
    logoutUrl: 'https://api.example.com/auth/logout'
  },
  allowedDomains: ['api.example.com']
})
```

```typescript
// src/App.tsx
import { useEffect, useState } from 'react'
import { api } from './api'

export function App() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const unsubscribe = api.onReady(() => {
      setReady(true)
    })
    return unsubscribe
  }, [])

  if (!ready) return <div>Loading...</div>

  return <div>Worker is ready!</div>
}
```

---

## Next.js Setup

For Next.js projects, add to `next.config.js`:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    config.externals = config.externals || []
    config.externals.push('fetchguard')
    return config
  }
}

module.exports = nextConfig
```

---

## More Information

- [Main README](./README.md)
- [Web Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API)
- [Vite Worker Documentation](https://vitejs.dev/guide/features.html#web-workers)
