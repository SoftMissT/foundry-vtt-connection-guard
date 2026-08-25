import js from '@eslint/js'
import prettierConfig from 'eslint-config-prettier'

export default [
  js.configs.recommended,
  prettierConfig,
  {
    files: ['scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        game: 'readonly',
        Hooks: 'readonly',
        ui: 'readonly',
        foundry: 'readonly',
        FormApplication: 'readonly',
        JournalEntry: 'readonly',
        RTCPeerConnection: 'readonly',
        HTMLElement: 'readonly',
        performance: 'readonly',
        console: 'readonly',
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
]
