import { defineConfig } from '../../apps/api/node_modules/vitest/dist/config.js'
import { fileURLToPath } from 'node:url'
export default defineConfig({
  root: fileURLToPath(new URL('../../', import.meta.url)),
  resolve: {
    alias: {
      vitest: fileURLToPath(
        new URL('../../apps/api/node_modules/vitest/dist/index.js', import.meta.url)
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/integrity/**/*.pg.test.js'],
    testTimeout: 15000,
    hookTimeout: 30000,
    poolOptions: { forks: { singleFork: true } },
  },
})
