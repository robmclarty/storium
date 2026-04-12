import { defineTable } from 'storium'

// defineTable auto-detects the dialect from storium.config.ts
export const usersTable = defineTable('users')
  .columns({
    id: { type: 'uuid', primaryKey: true, default: 'uuid:v4' },
    email: {
      type: 'varchar',
      maxLength: 255,
      required: true,
      transform: (v: string) => v.trim().toLowerCase(),
      validate: (v, test) => {
        test(v, (val) => String(val).length > 0, 'Email cannot be empty')
      },
    },
    password_hash: { type: 'varchar', maxLength: 255, hidden: true },
    name: { type: 'varchar', maxLength: 100 },
    bio: { type: 'text' },
    metadata: { type: 'jsonb' },
  })
  .indexes({
    email: { unique: true },
  })
