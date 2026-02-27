import { defineSeed } from 'storium/migrate'

export default defineSeed(async (db) => {
  const { users, posts } = db.stores

  // Create users with plain objects — no raw SQL needed
  await users.create({ email: 'alice@example.com', password_hash: 'hashed_alice_pw', name: 'Alice', bio: 'Writes about databases.', metadata: { role: 'admin' } })
  await users.create({ email: 'bob@example.com', password_hash: 'hashed_bob_pw', name: 'Bob', bio: 'Likes building APIs.', metadata: { role: 'editor' } })
  await users.create({ email: 'carol@example.com', password_hash: 'hashed_carol_pw', name: 'Carol', metadata: { role: 'viewer' } })

  // Create posts — ref() resolves the author's email to their UUID automatically.
  // No need to track IDs from the create calls above.
  await posts.create({ title: 'Getting Started with Storium', body: 'A quick intro...', status: 'published', author_id: users.ref({ email: 'alice@example.com' }), tags: ['tutorial', 'storium'], metadata: { featured: true } })
  await posts.create({ title: 'Advanced Queries', body: 'Deep dive into custom queries...', status: 'published', author_id: users.ref({ email: 'alice@example.com' }), tags: ['advanced', 'queries'], metadata: { featured: false } })
  await posts.create({ title: 'Draft Post', body: 'Work in progress...', status: 'draft', author_id: users.ref({ email: 'bob@example.com' }), tags: ['draft'] })
  await posts.create({ title: 'PostgreSQL Tips', body: 'JSONB, arrays, and more...', status: 'published', author_id: users.ref({ email: 'bob@example.com' }), tags: ['tutorial', 'postgresql'], metadata: { featured: true } })
})
