import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'coverage', 'voice-worker/coverage']),
  {
    name: 'novelverse/javascript',
    files: ['**/*.{js,mjs,cjs}'],
    extends: [js.configs.recommended],
  },
  {
    name: 'novelverse/tooling',
    files: ['*.config.js', 'tests/**/*.mjs'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    name: 'novelverse/voice-worker',
    files: ['voice-worker/**/*.{js,mjs,cjs}'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    name: 'novelverse/application',
    files: ['src/**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
    ],
    plugins: {
      'react-refresh': reactRefresh,
    },
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      'react-hooks/immutability': 'off',
      'react-refresh/only-export-components': ['error', { allowConstantExport: true }],
    },
  },
])
