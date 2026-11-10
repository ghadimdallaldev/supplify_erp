/** Use pnpm-run so hooks work when `pnpm` is not on PATH (Windows / IDE shells). */
export default {
  'apps/api/**/*.{js,jsx}': [
    () => 'node scripts/pnpm-run.mjs --filter @supplify/api lint:fix',
    'prettier --write',
  ],
  'apps/web/**/*.{ts,tsx}': [
    () => 'node scripts/pnpm-run.mjs --filter @supplify/web lint:fix',
    'prettier --write',
  ],
  '*.{js,jsx,ts,tsx}': ['prettier --write'],
  '*.{json,css,md}': ['prettier --write'],
}
