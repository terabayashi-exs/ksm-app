// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from "eslint-plugin-storybook";

import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [...compat.extends("next/core-web-vitals", "next/typescript"), {
  rules: {
    // 開発効率のため一部警告を抑制（エラーは残す）
    "react-hooks/exhaustive-deps": "warn", // 警告レベルに変更
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }], // _プレフィックスは許可
  }
}, ...storybook.configs["flat/recommended"]];

export default eslintConfig;
