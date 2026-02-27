import { defineSeed } from 'storium/migrate'
import { sql } from 'drizzle-orm'

export default defineSeed(async ({ drizzle }) => {
  // Seeds receive the raw Drizzle instance, so we use SQL directly.
  // In a real app you might import and use your registered stores instead.

  await drizzle.execute(sql`
    INSERT INTO users (id, email, password_hash, name, bio, metadata) VALUES
      ('a0000000-0000-0000-0000-000000000001', 'alice@example.com', 'hashed_alice_pw', 'Alice', 'Writes about databases.', '{"role": "admin"}'),
      ('a0000000-0000-0000-0000-000000000002', 'bob@example.com', 'hashed_bob_pw', 'Bob', 'Likes building APIs.', '{"role": "editor"}'),
      ('a0000000-0000-0000-0000-000000000003', 'carol@example.com', 'hashed_carol_pw', 'Carol', null, '{"role": "viewer"}')
  `)

  await drizzle.execute(sql`
    INSERT INTO posts (id, title, body, status, author_id, tags, metadata) VALUES
      ('b0000000-0000-0000-0000-000000000001', 'Getting Started with Storium', 'A quick intro...', 'published', 'a0000000-0000-0000-0000-000000000001', ARRAY['tutorial', 'storium'], '{"featured": true}'),
      ('b0000000-0000-0000-0000-000000000002', 'Advanced Queries', 'Deep dive into custom queries...', 'published', 'a0000000-0000-0000-0000-000000000001', ARRAY['advanced', 'queries'], '{"featured": false}'),
      ('b0000000-0000-0000-0000-000000000003', 'Draft Post', 'Work in progress...', 'draft', 'a0000000-0000-0000-0000-000000000002', ARRAY['draft'], '{}'),
      ('b0000000-0000-0000-0000-000000000004', 'PostgreSQL Tips', 'JSONB, arrays, and more...', 'published', 'a0000000-0000-0000-0000-000000000002', ARRAY['tutorial', 'postgresql'], '{"featured": true}')
  `)
})
