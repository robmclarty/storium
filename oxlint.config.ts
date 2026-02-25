import { defineConfig } from 'oxlint'

export default defineConfig({
  "$schema": "./node_modules/oxlint/configuration_schema.json",

  "env": {
    "node": true,
    "es2022": true
  },

  "plugins": ["typescript", "import", "unicorn", "oxc", "node"],

  "categories": {
    "correctness": "error",
    "suspicious": "warn",
    "perf": "warn"
  },

  "rules": {
    // ── Core eslint ──────────────────────────────────
    "no-unused-vars": "error",
    "no-console": "warn",
    "eqeqeq": "error",
    "no-eval": "error",
    "no-var": "error",
    "prefer-const": "error",
    "no-throw-literal": "error",
    "no-return-await": "warn",

    // ── TypeScript ───────────────────────────────────
    "typescript/no-explicit-any": "warn",
    "typescript/no-non-null-assertion": "warn",
    "typescript/consistent-type-imports": "error",

    // ── Import hygiene ───────────────────────────────
    "import/no-cycle": "error",
    "import/no-self-import": "error",
    "import/no-duplicates": "error",

    // ── Unicorn (modern JS) ──────────────────────────
    "unicorn/prefer-node-protocol": "error",
    "unicorn/no-array-for-each": "warn",
    "unicorn/prefer-optional-catch-binding": "warn",

    // ── Oxc extras ───────────────────────────────────
    // Disabled because Storium intentionally uses barrels.
    //"oxc/no-barrel-file": "warn"
  },

  "overrides": [
    {
      "files": ["test/**/*.ts", "**/*.test.ts", "**/*.spec.ts"],
      "rules": {
        "no-console": "off",
        "typescript/no-explicit-any": "off",
        "no-unused-vars": "off"
      }
    },
    {
      "files": ["bin/**/*"],
      "rules": {
        "no-console": "off"
      }
    }
  ],

  "ignorePatterns": ["dist", "node_modules", "*.config.ts"]
})
