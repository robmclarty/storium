import { storium } from 'storium'
import type { StoriumConfig } from 'storium'
import { userStore } from './entities/users/user.store.js'
import { postStore } from './entities/posts/post.store.js'

// Connect and register all stores. The config is passed in rather than
// imported directly because DATABASE_URL is set at runtime (by the
// Testcontainers setup in app.ts, or by the environment in production).

export const createDatabase = (config: StoriumConfig) => {
  const db = storium.connect(config)
  const stores = db.register({ users: userStore, posts: postStore })
  return { db, ...stores }
}
