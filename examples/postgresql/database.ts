/**
 * Composition root — connects to the database and registers all stores.
 *
 * This is the single place where stores are wired to a live connection.
 * In a real app you'd call this once at startup. The config is passed in
 * rather than imported directly so the connection URL can be set at runtime
 * (e.g.from environment variables, secrets manager, or Testcontainers).
 */

import { storium } from 'storium'
import type { StoriumConfig } from 'storium'
import { userStore } from './entities/users/user.store.js'
import { postStore } from './entities/posts/post.store.js'

export const createDatabase = (config: StoriumConfig) => {
  const db = storium.connect(config)
  const stores = db.register({ users: userStore, posts: postStore })
  return { db, ...stores }
}
