# Validation

A comprehensive walkthrough of Storium's validation pipeline, showing every stage and how errors are accumulated.

## What it demonstrates

- **Filter stage** — strips unknown keys and readonly columns
- **Transform stage** — runs before validation (trim, lowercase, hashing)
- **Validate stage** — type checks + custom validators, collects all errors at once
- **Required stage** — ensures required fields are present on create
- Built-in assertions: `not_empty`, `is_email`
- Custom assertions: `is_slug`, `is_hex_color` (registered at connect time)
- `ValidationError` with `.errors[]` array for all field-level failures
- Runtime schemas: `tryValidate()`, `toJsonSchema()`, `.zod` escape hatch
- `skipPrep` option to bypass the entire pipeline

## Install and run

```bash
npm install
npm start
```

Uses an in-memory SQLite database — no external database required.
