# Relations

Demonstrates relationship mixins: `belongsTo`, `withMembers`, and custom JOIN queries.

## What it demonstrates

- **belongsTo** — LEFT JOIN with inlined fields (`findWithAuthor`)
- **withMembers** — many-to-many via join table (`addMember`, `getMembers`, `isMember`, `getMemberCount`, `removeMember`)
- **Composite primary keys** on join tables
- **`ref()`** for FK resolution by filter (no manual ID tracking)
- Custom JOIN queries across multiple tables (`findPostsByTag`)
- Full migration lifecycle with multi-entity structure

## Project structure

```
relations/
  entities/authors/    author.table.ts, author.store.ts
  entities/posts/      post.table.ts, post.store.ts
  entities/tags/       tag.table.ts, tag.store.ts
  entities/post-tags/  post-tag.table.ts, post-tag.store.ts (composite PK)
  seeds/001_seed.ts
  storium.config.ts
  app.ts
```

## Install and run

```bash
npm install
npm start
```

Uses a file-based SQLite database (created and cleaned up automatically).
