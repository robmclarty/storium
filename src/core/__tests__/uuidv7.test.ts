import { describe, it, expect } from 'vitest'
import { uuidv7 } from '../uuidv7'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('uuidv7', () => {
  it('returns a valid UUID string', () => {
    const id = uuidv7()
    expect(id).toMatch(UUID_RE)
  })

  it('sets version nibble to 7', () => {
    const id = uuidv7()
    expect(id[14]).toBe('7')
  })

  it('sets variant bits to 10xx', () => {
    const id = uuidv7()
    expect('89ab').toContain(id[19])
  })

  it('generates unique values', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => uuidv7()))
    expect(ids.size).toBe(1000)
  })

  it('produces temporally sortable IDs across milliseconds', async () => {
    const a = uuidv7()
    await new Promise((r) => setTimeout(r, 2))
    const b = uuidv7()
    expect(a < b).toBe(true)
  })

  it('monotonic counter guarantees ordering within the same millisecond', () => {
    // Generate many IDs without any delay — some will share a timestamp
    const ids = Array.from({ length: 100 }, () => uuidv7())
    for (let i = 1; i < ids.length; i++) {
      expect(ids[i - 1] < ids[i]).toBe(true)
    }
  })

  it('embeds a recoverable timestamp', () => {
    const before = Date.now()
    const id = uuidv7()
    const after = Date.now()

    const hex = id.replace(/-/g, '').slice(0, 12)
    const ts = parseInt(hex, 16)

    expect(ts).toBeGreaterThanOrEqual(before)
    expect(ts).toBeLessThanOrEqual(after)
  })
})
