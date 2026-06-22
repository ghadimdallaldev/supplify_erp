import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

// https://vitejs.dev/config/
export default defineConfig({
  publicDir: path.resolve(rootDir, 'static'),
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Group vendor libs into shared chunks to reduce per-route request count.
        // Heavy, route-specific libs get their OWN chunks so they load lazily with
        // their routes (Dashboard/Reports/Reservations) instead of bloating the
        // eagerly-loaded `vendor` chunk shared by every page.
        manualChunks: (id) => {
          if (!id.includes('node_modules')) return
          // React core only (not react-router, lucide-react, @tanstack/react-query, etc.).
          // Isolating it breaks the vendor ↔ ui-vendor circular chunk dependency that
          // caused "Cannot read properties of undefined (reading 'forwardRef')".
          if (
            id.includes('/node_modules/react-dom/') ||
            id.includes('/node_modules/react/') ||
            id.includes('/node_modules/scheduler/')
          ) {
            return 'react-vendor'
          }
          if (id.includes('recharts') || id.includes('/d3-') || id.includes('victory-vendor'))
            return 'charts'
          if (id.includes('@fullcalendar') || id.includes('/preact')) return 'calendar'
          // Leaflet is only used by delivery-tracking maps, which are all loaded
          // via React.lazy (dynamic import). Returning undefined here keeps it OUT
          // of the eager `vendor` catch-all and lets Rollup co-locate it with its
          // dynamic importers, so it only downloads when a map actually renders.
          // (Forcing it into a named chunk made Rollup hoist a side-effect import
          // into the entry, defeating the lazy split.)
          if (id.includes('node_modules/leaflet')) return
          if (
            id.includes('framer-motion') ||
            id.includes('motion-dom') ||
            id.includes('motion-utils')
          )
            return 'motion'
          if (id.includes('@radix-ui') || id.includes('lucide-react')) return 'ui-vendor'
          if (id.includes('react-router') || id.includes('@remix-run')) return 'router-vendor'
          if (id.includes('@reduxjs') || id.includes('react-redux')) return 'redux-vendor'
          if (id.includes('@tanstack')) return 'query-vendor'
          return 'vendor'
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(rootDir, 'src'),
      react: path.resolve(rootDir, 'node_modules/react'),
      'react-dom': path.resolve(rootDir, 'node_modules/react-dom'),
    },
    dedupe: ['react', 'react-dom', 'react-redux', 'react-router-dom'],
  },
  optimizeDeps: {
    // Pre-bundle dependencies up front so Vite never triggers a mid-navigation
    // re-optimization (which forces a full-page reload during dev). lucide-react
    // is the big one: it ships ~1.5k individual icon modules and is imported by
    // 240+ files — without pre-bundling, the dev server crawls and serves them
    // one request at a time. The rest are utilities/UI primitives shared across
    // most lazy routes. esbuild caches the result in node_modules/.vite, so this
    // only costs time on the first start or a lockfile change.
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react-redux',
      'react-router-dom',
      '@reduxjs/toolkit',
      '@reduxjs/toolkit/query/react',
      '@tanstack/react-query',
      'lucide-react',
      'clsx',
      'tailwind-merge',
      'class-variance-authority',
      'sonner',
      'cmdk',
      'date-fns',
      'i18next',
      'react-i18next',
      'socket.io-client',
      '@radix-ui/react-dialog',
      '@radix-ui/react-popover',
      '@radix-ui/react-tooltip',
      '@radix-ui/react-tabs',
      '@radix-ui/react-slot',
      '@radix-ui/react-progress',
      // Heavy, route-specific libs: pre-bundle them too so the first visit to
      // their route doesn't pay a re-optimization reload mid-session.
      'recharts',
      'leaflet',
    ],
  },
  server: {
    port: 5173,
    // Warm up the hot entry path so the very first request doesn't pay the
    // transform cost for the shell on the critical render path.
    warmup: {
      clientFiles: [
        './src/main.tsx',
        './src/App.tsx',
        './src/components/Layout.tsx',
        './src/components/Sidebar.tsx',
        './src/components/Header.tsx',
        './src/pages/LoginPage.tsx',
        './src/pages/SupplierHome.tsx',
      ],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/auth': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
