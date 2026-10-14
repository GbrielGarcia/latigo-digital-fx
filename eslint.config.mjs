import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'release/**', 'coverage/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    // The physics core must stay headless: no DOM, audio or Electron access.
    files: ['src/core/**/*.ts', 'src/config/**/*.ts'],
    languageOptions: { globals: { ...globals.es2022 } },
    rules: {
      'no-restricted-globals': ['error', 'window', 'document', 'AudioContext', 'navigator', 'localStorage'],
      'no-restricted-imports': [
        'error',
        { patterns: ['electron', '**/render/**', '**/audio/**', '**/ui/**'] },
      ],
    },
  },
  {
    files: ['scripts/**/*.mjs', 'bench/**/*.ts'],
    languageOptions: { globals: globals.node },
    rules: { 'no-console': 'off' },
  },
);
