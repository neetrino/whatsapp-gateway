module.exports = {
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: "./tsconfig.json",
    tsconfigRootDir: __dirname,
    sourceType: "module",
  },
  plugins: ["@typescript-eslint", "prettier"],
  extends: [
    "plugin:@typescript-eslint/recommended",
    "plugin:prettier/recommended",
  ],
  root: true,
  env: { node: true, jest: true },
  ignorePatterns: [".eslintrc.cjs", "dist", "node_modules", "coverage"],
  rules: {
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-unused-vars": [
      "error",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
    ],
    "@typescript-eslint/explicit-module-boundary-types": "off",
    "@typescript-eslint/interface-name-prefix": "off",
    "import/no-default-export": "off",
    "no-restricted-syntax": [
      "error",
      {
        selector: "ExportDefaultDeclaration",
        message: "Default exports are not allowed. Use named exports.",
      },
    ],
  },
};
