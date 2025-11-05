export default {
  'apps/api/**/*.{js,jsx}': [() => 'pnpm --filter @supplify/api lint:fix', 'prettier --write'],
  'apps/web/**/*.{ts,tsx}': [() => 'pnpm --filter @supplify/web lint:fix', 'prettier --write'],
  '*.{js,jsx,ts,tsx}': ['prettier --write'],
  '*.{json,css,md}': ['prettier --write'],
}
