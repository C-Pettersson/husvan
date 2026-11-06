// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { resolveAssumptions } from './run'

describe('resolveAssumptions', () => {
  it('reads the defaults of the house’s owner, not of every user', async () => {
    const findMany = vi.fn(async () => [])
    await resolveAssumptions(
      { assumption: { findMany } } as unknown as PrismaClient,
      { ownerId: 'u1', houseId: 'h1' }
    )
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ houseId: 'h1' }, { houseId: null, ownerId: 'u1' }],
        }),
      })
    )
  })
})
