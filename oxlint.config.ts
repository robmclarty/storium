import { defineConfig } from 'oxlint'

export default defineConfig({
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
    "no-console": "off",
    "no-await-in-loop": "off",
    "eqeqeq": "error",
    "no-eval": "error",
    "no-var": "error",
    "prefer-const": "error",
    "no-throw-literal": "error",
    "no-return-await": "warn",

    // ── TypeScript ───────────────────────────────────
    "typescript/no-explicit-any": "off",
    "typescript/no-non-null-assertion": "off",
    "typescript/consistent-type-imports": "error",

    // ── Import hygiene ───────────────────────────────
    "import/no-cycle": "error",
    "import/no-self-import": "error",
    "import/no-duplicates": "error",

    // ── Unicorn (modern JS) ──────────────────────────
    "unicorn/prefer-node-protocol": "error",
    "unicorn/no-array-for-each": "off",
    "unicorn/prefer-optional-catch-binding": "warn",

    // ── Oxc extras ───────────────────────────────────
    // Disabled because Storium intentionally uses barrels.
    //"oxc/no-barrel-file": "warn"
  },

  "overrides": [
    {
      "files": ["test/**/*.ts", "**/*.test.ts", "**/*.spec.ts"],
      "rules": {
        "no-unused-vars": "off"
      }
    }
  ],

  "ignorePatterns": ["dist", "node_modules", "*.config.ts"]
})
