import { storium } from 'storium'
import type { ConnectConfig } from 'storium'
import { userStore } from './entities/users/user.store.js'
import { postStore } from './entities/posts/post.store.js'

export const createDatabase = (config: ConnectConfig) => {
  const db = storium.connect(config)
  const stores = db.register({ users: userStore, posts: postStore })
  return { db, ...stores }
}
