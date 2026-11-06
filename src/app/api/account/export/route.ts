import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import {
  accountArchive,
  collectAccountData,
  exportArchiveName,
  listStoredFiles,
} from '@/server/users/exportAccount'

// The signed-in user's own data as a ZIP. A route handler for the same reason
// as the document files: the reader is a browser saving a file, not the app.
export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session)
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const userId = session.user.id
  const [data, files] = await Promise.all([
    collectAccountData(prisma, userId),
    listStoredFiles(prisma, userId),
  ])
  return new Response(accountArchive(data, files), {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="${exportArchiveName()}"`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  })
}
