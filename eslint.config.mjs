import tseslint from 'typescript-eslint';
export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/.local/**', '**/.next/**', '**/.next-ui/**', '**/dist/**', '**/.output/**', '**/.wxt/**', '**/next-env.d.ts'] },
  ...tseslint.configs.recommended,
  { rules: { '@typescript-eslint/no-explicit-any': 'off', '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }], 'no-empty': ['error', {allowEmptyCatch: true}] } }
);
