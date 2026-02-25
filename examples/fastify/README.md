# Fastify

Demonstrates integrating Storium with a Fastify HTTP server. Uses `toJsonSchema()` to auto-generate route-level request validation from your store definitions, giving you three-tier validation (JSON Schema at the HTTP edge, Zod at runtime, and the prep pipeline on write).
