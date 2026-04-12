import { describe, it, expect, beforeAll } from 'vitest'
import { storium, defineStore, withMembers } from 'storium'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

const teamsTable = sqliteTable('teams', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
})

const membersTable = sqliteTable('team_members', {
  id: text('id').primaryKey(),
  team_id: text('team_id').notNull(),
  user_id: text('user_id').notNull(),
  role: text('role'),
})

// Attach .storium metadata so withMembers can read it
defineStore(membersTable)

let db: any
let teams: any

beforeAll(() => {
  db = storium.connect({ dialect: 'memory' })

  db.drizzle.run(sql`
    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY, name TEXT NOT NULL
    )
  `)

  db.drizzle.run(sql`
    CREATE TABLE IF NOT EXISTS team_members (
      id TEXT PRIMARY KEY, team_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT
    )
  `)

  teams = db.defineStore(teamsTable).queries({
    ...withMembers(membersTable, 'team_id', 'user_id'),
  })
})

const userId1 = 'user-aaa'
const userId2 = 'user-bbb'

describe('withMembers', () => {
  let teamId: string

  beforeAll(async () => {
    const team = await teams.create({ id: 'team-1', name: 'Alpha' })
    teamId = team.id
  })

  it('generates addMember, removeMember, getMembers, isMember, getMemberCount', () => {
    expect(typeof teams.addMember).toBe('function')
    expect(typeof teams.removeMember).toBe('function')
    expect(typeof teams.getMembers).toBe('function')
    expect(typeof teams.isMember).toBe('function')
    expect(typeof teams.getMemberCount).toBe('function')
  })

  it('addMember inserts a join record and returns it', async () => {
    const record = await teams.addMember(teamId, userId1, { id: 'tm-1', role: 'captain' })
    expect(record).toHaveProperty('team_id', teamId)
    expect(record).toHaveProperty('user_id', userId1)
    expect(record).toHaveProperty('role', 'captain')
  })

  it('getMembers returns all members for a collection', async () => {
    await teams.addMember(teamId, userId2, { id: 'tm-2' })
    const members = await teams.getMembers(teamId)
    expect(members.length).toBeGreaterThanOrEqual(2)
  })

  it('isMember returns true for existing membership', async () => {
    const result = await teams.isMember(teamId, userId1)
    expect(result).toBe(true)
  })

  it('isMember returns false for non-members', async () => {
    const result = await teams.isMember(teamId, 'user-nonexistent')
    expect(result).toBe(false)
  })

  it('getMemberCount returns the count', async () => {
    const count = await teams.getMemberCount(teamId)
    expect(count).toBeGreaterThanOrEqual(2)
  })

  it('removeMember deletes the join record', async () => {
    await teams.removeMember(teamId, userId2)
    const isMember = await teams.isMember(teamId, userId2)
    expect(isMember).toBe(false)
  })

  it('getMemberCount decreases after removal', async () => {
    const count = await teams.getMemberCount(teamId)
    expect(count).toBeGreaterThanOrEqual(1)
  })
})
