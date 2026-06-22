module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
    'prettier',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs'],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'react-refresh'],
  rules: {
    'react-refresh/only-export-components': 'off',
    '@typescript-eslint/no-unused-vars': [
      'warn',
      {
        args: 'none',
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        ignoreRestSiblings: true,
      },
    ],
    '@typescript-eslint/no-explicit-any': 'off',
  },
  overrides: [
    {
      files: ['**/*.{test,spec}.{ts,tsx}'],
      rules: {
        '@typescript-eslint/no-unused-vars': 'off',
      },
    },
  ],
}
