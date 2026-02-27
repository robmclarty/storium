import { defineSeed } from 'storium/migrate'

export default defineSeed(async (db) => {
  const { authors, posts, tags } = db.stores

  // Authors
  await authors.create({ name: 'Alice', email: 'alice@example.com' })
  await authors.create({ name: 'Bob', email: 'bob@example.com' })

  // Posts — ref() resolves the author's email to their UUID automatically
  await posts.create({
    title: 'Getting Started',
    body: 'A guide for beginners...',
    status: 'published',
    author_id: authors.ref({ email: 'alice@example.com' }),
  })
  await posts.create({
    title: 'Advanced Patterns',
    body: 'Deep dive into relationships...',
    status: 'published',
    author_id: authors.ref({ email: 'alice@example.com' }),
  })
  await posts.create({
    title: 'Draft Ideas',
    body: 'Work in progress...',
    status: 'draft',
    author_id: authors.ref({ email: 'bob@example.com' }),
  })

  // Tags
  await tags.create({ name: 'javascript' })
  await tags.create({ name: 'databases' })
  await tags.create({ name: 'tutorial' })
})
