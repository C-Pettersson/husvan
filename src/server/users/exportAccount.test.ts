// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { strFromU8, unzipSync } from 'fflate'
import type { PrismaClient } from '@prisma/client'
import {
  accountArchive,
  collectAccountData,
  exportArchiveName,
  exportFilePath,
  type AccountData,
} from './exportAccount'

const data = {
  user: { id: 'u1', email: 'anna@example.se' },
  houses: [{ id: 'h1', address: 'Mjärdgatan 1' }],
} as unknown as AccountData

const stream = (text: string) =>
  new Response(new TextEncoder().encode(text)).body!

async function unzip(archive: ReadableStream<Uint8Array>) {
  return unzipSync(new Uint8Array(await new Response(archive).arrayBuffer()))
}

describe('accountArchive', () => {
  it('holds data.json and the files, and says where each file is', async () => {
    const files = await unzip(
      accountArchive(
        data,
        [
          {
            documentId: 'd1',
            path: 'documents/d1-besiktning.pdf',
            storagePath: 'houses/h1/abc.pdf',
          },
        ],
        {
          readFile: async () => stream('%PDF'),
          now: new Date('2026-11-06T10:00:00Z'),
        }
      )
    )
    expect(strFromU8(files['documents/d1-besiktning.pdf'])).toBe('%PDF')
    const json = JSON.parse(strFromU8(files['data.json']))
    expect(json).toMatchObject({
      format: 1,
      exportedAt: '2026-11-06T10:00:00.000Z',
      user: { email: 'anna@example.se' },
      houses: [{ address: 'Mjärdgatan 1' }],
      files: [{ documentId: 'd1', path: 'documents/d1-besiktning.pdf' }],
      filesThatCouldNotBeRead: [],
    })
  })

  it('still exports, and says so, when a file cannot be read', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const files = await unzip(
      accountArchive(
        data,
        [
          { documentId: 'gone', path: 'documents/gone', storagePath: 'x' },
          { documentId: 'here', path: 'documents/here', storagePath: 'y' },
        ],
        {
          readFile: async (key) => {
            if (key === 'x') throw new Error('404')
            return stream('kept')
          },
        }
      )
    )
    error.mockRestore()
    expect(Object.keys(files).sort()).toEqual(['data.json', 'documents/here'])
    const json = JSON.parse(strFromU8(files['data.json']))
    expect(json.filesThatCouldNotBeRead).toEqual([
      { documentId: 'gone', path: 'documents/gone' },
    ])
  })

  it('fails the download when a file breaks halfway', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const broken = new ReadableStream<Uint8Array>({
      pull: (controller) => controller.error(new Error('connection lost')),
    })
    await expect(
      unzip(
        accountArchive(
          data,
          [{ documentId: 'd', path: 'documents/d', storagePath: 'x' }],
          { readFile: async () => broken }
        )
      )
    ).rejects.toThrow()
    error.mockRestore()
  })
})

describe('exportFilePath', () => {
  it('keeps a readable name', () => {
    expect(exportFilePath('d1', 'Besiktning Åre 2024.pdf')).toBe(
      'documents/d1-Besiktning Åre 2024.pdf'
    )
  })

  it('cannot climb out of the folder', () => {
    for (const name of ['../../etc/passwd', '..\\..\\boot.ini', '/abs/path']) {
      const path = exportFilePath('d1', name)
      expect(path.startsWith('documents/d1-')).toBe(true)
      expect(path.split('/')).toHaveLength(2)
      expect(path).not.toContain('\\')
    }
  })

  it('works without a name', () => {
    expect(exportFilePath('d1', null)).toBe('documents/d1')
  })
})

describe('exportArchiveName', () => {
  it('carries the date', () => {
    expect(exportArchiveName(new Date('2026-11-06T10:00:00Z'))).toBe(
      'husvan-export-2026-11-06.zip'
    )
  })
})

describe('collectAccountData', () => {
  it('never asks for a secret', async () => {
    const args: unknown[] = []
    const table = (rows: unknown) =>
      new Proxy(
        {},
        {
          get: () => async (a: unknown) => {
            args.push(a)
            return rows
          },
        }
      )
    const prisma = {
      user: table({ email: 'anna@example.se' }),
      allowedEmail: table(null),
      session: table([]),
      account: table([]),
      oauthConsent: table([]),
      oauthRefreshToken: table([]),
      assumption: table([]),
      house: table([]),
    } as unknown as PrismaClient

    await collectAccountData(prisma, 'u1')

    const asked = JSON.stringify(args)
    for (const secret of [
      'token',
      'password',
      'accessToken',
      'refreshToken',
      'idToken',
      'rotationReplayResponse',
      'confirmation',
    ])
      expect(asked).not.toContain(`"${secret}"`)
  })
})
