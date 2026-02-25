import { describe, it, expect } from 'vitest'
import { createPrepFn } from '../prep'
import type { ColumnsConfig, TableAccess } from '../types'

const columns: ColumnsConfig = {
  id: { type: 'uuid', primaryKey: true, default: 'random_uuid' },
  email: {
    type: 'varchar',
    maxLength: 255,
    mutable: true,
    required: true,
    transform: (v: string) => v.trim().toLowerCase(),
    validate: (v, test) => {
      test(v, 'not_empty', 'Email cannot be empty')
    },
  },
  name: { type: 'varchar', maxLength: 255, mutable: true },
}

const access: TableAccess = {
  selectable: ['id', 'email', 'name'],
  mutable: ['email', 'name'],
  insertable: ['email', 'name'],
  hidden: [],
}

describe('prep pipeline', () => {
  const prep = createPrepFn(columns, access)

  it('filters unknown keys from input', async () => {
    const result = await prep(
      { email: 'alice@example.com', unknown: 'ignored' },
      { validateRequired: false }
    )

    expect(result).not.toHaveProperty('unknown')
  })

  it('transforms values through column transform functions', async () => {
    const result = await prep(
      { email: '  ALICE@Example.COM  ' },
      { validateRequired: false }
    )

    expect(result.email).toBe('alice@example.com')
  })

  it('rejects invalid types', async () => {
    await expect(
      prep({ email: 123 }, { validateRequired: false })
    ).rejects.toThrow()
  })

  it('enforces required fields when validateRequired is true', async () => {
    await expect(
      prep({ name: 'Alice' }, { validateRequired: true })
    ).rejects.toThrow()
  })

  it('skips required check when validateRequired is false', async () => {
    const result = await prep(
      { name: 'Alice' },
      { validateRequired: false }
    )

    expect(result).toEqual({ name: 'Alice' })
  })

  it('passes input through raw when force is true', async () => {
    const raw = { anything: 'goes', foo: 42 }
    const result = await prep(raw, { force: true })

    expect(result).toBe(raw)
  })
})
