import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // pnpm does not hoist vitest into @testing-library/jest-dom's node_modules;
    // inline so the /vitest entry can resolve the peer.
    server: {
      deps: {
        inline: ['@testing-library/jest-dom'],
      },
    },
  },
})
