# Bundler Setup Guide

FetchGuard uses Web Workers, which require special configuration in modern bundlers.

**Quick Jump:**
- [Vite](#vite-recommended) ⭐ Most popular
- [Webpack](#webpack)
- [Next.js](#nextjs)
- [Create React App](#create-react-app)
- [Parcel](#parcel)
- [esbuild](#esbuild)

---

## Vite (Recommended)

### Quick Setup

```typescript
// vite.config.ts
import { defineConfig } from 'vite'

export default defineConfig({
  optimizeDeps: {
    exclude: ['fetchguard']  // Required: Don't pre-bundle (uses workers)
  },
  worker: {
    format: 'es'  // Required: Use ES modules for workers
  }
})
```

### Why This Config?

**`optimizeDeps.exclude: ['fetchguard']`** (Required)
- Prevents Vite from pre-bundling the library during development
- FetchGuard uses Web Workers which need special handling
- Without this, you'll get "Worker setup timeout" errors

**`worker.format: 'es'`** (Required)
- Ensures workers use ES modules format
- Required for proper import resolution inside the worker
- Without this, worker imports may fail silently

### Example: React + Vite

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['fetchguard']
  },
  worker: {
    format: 'es'
  }
})
```

```typescript
// src/lib/api.ts
import { createClient } from 'fetchguard'

export const api = createClient({
  provider: {
    type: 'body-auth',
    refreshUrl: 'https://api.example.com/auth/refresh',
    loginUrl: 'https://api.example.com/auth/login',
    logoutUrl: 'https://api.example.com/auth/logout'
  }
})
```

---

## Webpack

### Configuration

```javascript
// webpack.config.js
module.exports = {
  // ... other config

  // Don't bundle fetchguard on server-side
  externals: {
    'fetchguard': 'fetchguard'
  },

  // Worker loader configuration
  module: {
    rules: [
      {
        test: /\.worker\.js$/,
        use: { loader: 'worker-loader' }
      }
    ]
  }
}
```

### Example: React + Webpack

```javascript
// webpack.config.js
const path = require('path')

module.exports = {
  entry: './src/index.tsx',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js'
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx']
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/
      }
    ]
  }
}
```

---

## Next.js

### App Router (Next.js 13+)

```javascript
// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Client-side only
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
      }
    }

    return config
  }
}

module.exports = nextConfig
```

### Pages Router (Next.js 12 and below)

```javascript
// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    config.externals = config.externals || []
    config.externals.push({
      'fetchguard': 'fetchguard'
    })
    return config
  }
}

module.exports = nextConfig
```

### Usage in Next.js

```typescript
// lib/api.ts
import { createClient } from 'fetchguard'

// Only create client on client-side
export const api = typeof window !== 'undefined'
  ? createClient({
      provider: {
        type: 'body-auth',
        refreshUrl: '/api/auth/refresh',
        loginUrl: '/api/auth/login',
        logoutUrl: '/api/auth/logout'
      }
    })
  : null
```

```typescript
// app/page.tsx (App Router)
'use client'

import { api } from '@/lib/api'
import { useEffect, useState } from 'react'

export default function HomePage() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!api) return

    const unsubscribe = api.onReady(() => {
      setReady(true)
    })

    return unsubscribe
  }, [])

  if (!ready) return <div>Loading...</div>

  return <div>Ready!</div>
}
```

---

## Create React App

### No Configuration Needed! ✨

CRA handles Web Workers automatically via the `worker-loader` pattern.

```typescript
// src/lib/api.ts
import { createClient } from 'fetchguard'

export const api = createClient({
  provider: {
    type: 'body-auth',
    refreshUrl: 'https://api.example.com/auth/refresh',
    loginUrl: 'https://api.example.com/auth/login',
    logoutUrl: 'https://api.example.com/auth/logout'
  }
})
```

**Just works!** No webpack configuration required.

---

## Parcel

### Configuration

Parcel 2 supports Web Workers out of the box, but you may need to specify the target:

```json
// package.json
{
  "targets": {
    "main": {
      "context": "browser",
      "includeNodeModules": true
    }
  }
}
```

### Usage

```typescript
// src/api.ts
import { createClient } from 'fetchguard'

export const api = createClient({
  provider: {
    type: 'body-auth',
    refreshUrl: 'https://api.example.com/auth/refresh',
    loginUrl: 'https://api.example.com/auth/login',
    logoutUrl: 'https://api.example.com/auth/logout'
  }
})
```

---

## esbuild

### Configuration

```javascript
// build.js
const esbuild = require('esbuild')

esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  outfile: 'dist/bundle.js',
  platform: 'browser',
  target: ['es2020'],

  // Don't bundle fetchguard
  external: ['fetchguard']
})
```

---

## Common Issues & Solutions

### Issue 1: "Worker setup timeout" or "Worker script failed to load"

**Cause**: Vite is pre-bundling fetchguard or worker format is incorrect.

**Solution**: Add BOTH config options to `vite.config.ts`:
```typescript
export default defineConfig({
  optimizeDeps: {
    exclude: ['fetchguard']  // Required
  },
  worker: {
    format: 'es'  // Required
  }
})
```

---


---

### Issue 2: Worker not initializing

**Cause**: Worker may take time to initialize.

**Solution**: Wait for ready state:
```typescript
const api = createClient({ /* ... */ })

await api.whenReady()
console.log('Worker is ready!')
```

---

### Issue 3: SSR/Server-side errors

**Cause**: Web Workers don't exist on the server.

**Solution**: Only create client on client-side:
```typescript
// Conditional creation
export const api = typeof window !== 'undefined'
  ? createClient({ /* ... */ })
  : null

// Or use in useEffect (React)
useEffect(() => {
  const api = createClient({ /* ... */ })
  return () => api.destroy()
}, [])
```

---

## TypeScript Configuration

### Recommended tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler", // or "node"
    "lib": ["ES2020", "DOM", "WebWorker"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  }
}
```

---

## Testing Your Setup

Create a test file to verify everything works:

```typescript
// test-setup.ts
import { createClient } from 'fetchguard'

const api = createClient({
  provider: {
    type: 'body-auth',
    refreshUrl: 'https://httpbin.org/post',
    loginUrl: 'https://httpbin.org/post',
    logoutUrl: 'https://httpbin.org/post'
  }
})

api.onReady(() => {
  console.log('✅ Worker is ready!')
  console.log('✅ Setup successful!')
  api.destroy()
})
```

Run it:
```bash
npm run dev
# Check console for "✅ Worker is ready!"
```

---

## Need Help?

- 📖 [Main README](./README.md)
- 🐛 [Report Issue](https://github.com/minhtaimc/fetchguard/issues)
- 💬 [Discussions](https://github.com/minhtaimc/fetchguard/discussions)

---

## Summary Table

| Bundler | Config Required? | Complexity | Notes |
|---------|-----------------|------------|-------|
| **Vite** | ✅ Yes (4 lines) | ⭐ Easy | optimizeDeps + worker.format |
| **Create React App** | ❌ No | ⭐ Easy | Works out of the box |
| **Next.js** | ✅ Yes | ⭐⭐ Medium | webpack config + client-only |
| **Webpack** | ✅ Yes | ⭐⭐⭐ Hard | Need worker-loader |
| **Parcel** | ⚠️ Optional | ⭐ Easy | Mostly works OOB |
| **esbuild** | ✅ Yes | ⭐⭐ Medium | External config |

---

**Recommended**: Use **Vite** or **Create React App** for the smoothest experience!
