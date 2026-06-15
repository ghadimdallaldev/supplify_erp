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
    include: [
      'react',
      'react-dom',
      'react-redux',
      'react-router-dom',
      '@reduxjs/toolkit/query/react',
      '@tanstack/react-query',
    ],
  },
  server: {
    port: 5173,
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
