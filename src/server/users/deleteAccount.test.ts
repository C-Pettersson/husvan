// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { deleteAccount, isLastAdmin } from './deleteAccount'

const ME = 'user-1'

// Records which tables are emptied and what happened when, so that the tests
// can state the order. The real foreign keys are checked against a database by
// hand; see CLAUDE.md, "Radering och export".
function fakePrisma({
  admins = [{ id: 'someone-else' }],
  files = ['houses/h1/a.pdf', 'houses/h1/b.jpg'],
}: { admins?: { id: string }[]; files?: string[] } = {}) {
  const log: string[] = []
  const table = (name: string) => ({
    deleteMany: vi.fn((args: unknown) => ({ name, args })),
  })
  const prisma = {
    user: {
      findUnique: vi.fn(async () => ({ email: 'Anna@Example.se' })),
      findMany: vi.fn(async () => admins),
      delete: vi.fn((args: unknown) => ({ name: 'user', args })),
    },
    house: {
      findMany: vi.fn(async () => [{ id: 'h1' }]),
      ...table('house'),
    },
    changeset: {
      findMany: vi.fn(async () => [{ id: 'c1' }, { id: 'default-c' }]),
      ...table('changeset'),
    },
    document: {
      findMany: vi.fn(async () =>
        files.map((storagePath) => ({ storagePath }))
      ),
      ...table('document'),
    },
    retraction: table('retraction'),
    observation: table('observation'),
    workItem: table('workItem'),
    forecast: table('forecast'),
    assumption: table('assumption'),
    component: table('component'),
    verification: table('verification'),
    allowedEmail: table('allowedEmail'),
    $transaction: vi.fn(async (steps: { name: string; args: unknown }[]) => {
      log.push('transaction')
      return steps
    }),
  }
  return { prisma: prisma as unknown as PrismaClient, raw: prisma, log }
}

describe('deleteAccount', () => {
  it('removes the files before any row', async () => {
    const { prisma, log } = fakePrisma()
    const removeFile = vi.fn(async (key: string) => {
      log.push(key)
    })
    await expect(
      deleteAccount(prisma, { userId: ME, removeFile })
    ).resolves.toBe('deleted')
    expect(log).toEqual(['houses/h1/a.pdf', 'houses/h1/b.jpg', 'transaction'])
  })

  it('removes children before parents and the user last', async () => {
    const { prisma, raw } = fakePrisma()
    await deleteAccount(prisma, { userId: ME, removeFile: async () => {} })
    const steps = raw.$transaction.mock.calls[0][0]
    expect(steps.map((s) => s.name)).toEqual([
      'retraction',
      'observation',
      'workItem',
      'forecast',
      'assumption',
      'component',
      'document',
      'changeset',
      'house',
      'verification',
      'allowedEmail',
      'user',
    ])
  })

  it('includes the default assumptions, which have no house', async () => {
    const { prisma, raw } = fakePrisma()
    await deleteAccount(prisma, { userId: ME, removeFile: async () => {} })
    expect(raw.assumption.deleteMany).toHaveBeenCalledWith({
      where: { OR: [{ houseId: { in: ['h1'] } }, { ownerId: ME }] },
    })
    expect(raw.changeset.findMany.mock.calls[0]).toEqual([
      {
        where: {
          OR: [
            { houseId: { in: ['h1'] } },
            { assumptions: { some: { ownerId: ME } } },
          ],
        },
        select: { id: true },
      },
    ])
  })

  it('removes the address from the allowlist in normalised form', async () => {
    const { prisma, raw } = fakePrisma()
    await deleteAccount(prisma, { userId: ME, removeFile: async () => {} })
    expect(raw.allowedEmail.deleteMany).toHaveBeenCalledWith({
      where: { email: 'anna@example.se' },
    })
  })

  it('keeps every row when a file cannot be removed', async () => {
    const { prisma, raw } = fakePrisma()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await deleteAccount(prisma, {
      userId: ME,
      removeFile: async () => {
        throw new Error('storage is down')
      },
    })
    error.mockRestore()
    expect(result).toBe('storage_failed')
    expect(raw.$transaction).not.toHaveBeenCalled()
  })

  it('refuses the last administrator before anything is removed', async () => {
    const { prisma, raw } = fakePrisma({ admins: [{ id: ME }] })
    const removeFile = vi.fn(async () => {})
    await expect(
      deleteAccount(prisma, { userId: ME, removeFile })
    ).resolves.toBe('last_admin')
    expect(removeFile).not.toHaveBeenCalled()
    expect(raw.$transaction).not.toHaveBeenCalled()
  })
})

describe('isLastAdmin', () => {
  const check = (admins: { id: string }[]) =>
    isLastAdmin(
      { user: { findMany: async () => admins } } as unknown as PrismaClient,
      ME
    )

  it('is true only for the one administrator there is', async () => {
    await expect(check([{ id: ME }])).resolves.toBe(true)
    await expect(check([{ id: ME }, { id: 'b' }])).resolves.toBe(false)
    await expect(check([{ id: 'b' }])).resolves.toBe(false)
    await expect(check([])).resolves.toBe(false)
  })
})
