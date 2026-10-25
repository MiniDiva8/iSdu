import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: ['node_modules/**', '**/miniprogram_npm/**', 'dist/**', 'coverage/**'],
  },
  {
    files: ['miniprogram/**/*.ts'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      tseslint.configs.recommendedTypeChecked,
    ],
    languageOptions: {
      globals: {
        App: 'readonly',
        Page: 'readonly',
        wx: 'readonly',
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
        },
      ],
      'no-console': 'error',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: String.raw`(?:^|/)services/repository$`,
              message:
                '微信小程序真机不会把目录导入解析到 index.ts，请显式导入 services/repository/index。',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['cloudfunctions/**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        exports: 'readonly',
        module: 'readonly',
        require: 'readonly',
      },
      sourceType: 'commonjs',
    },
    rules: {
      'no-console': 'error',
    },
  },
);
