// ESLint 10 只认 flat config（原 .eslintrc.cjs 已删除）
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  {
    ignores: [
      ".next/",
      "out/",
      "public/",
      "next-env.d.ts",
      // gifsicle-wasm-browser 的构建产物，不归我们管
      "src/engines/GifWasmModule.js",
    ],
  },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      "no-empty": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    // React 规则只作用于组件代码，engines / tests 里没有 hooks
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    files: ["tests/**/*.ts"],
    languageOptions: {
      globals: globals.node,
    },
  },
);
