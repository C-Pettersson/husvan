import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { getObject, StorageNotConfigured } from '@/server/storage/s3'

// The original file of one of the owner's documents, streamed from storage.
// Shown inline; the browser decides whether it can display it.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session)
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  if (!z.uuid().safeParse(id).success)
    return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const doc = await prisma.document.findFirst({
    where: {
      id,
      house: { ownerId: session.user.id },
      changeset: { status: 'APPROVED' },
      storagePath: { not: null },
    },
    select: { storagePath: true, mime: true, filename: true },
  })
  if (!doc) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  try {
    const object = await getObject(doc.storagePath!)
    if (!object.ok || !object.body)
      return NextResponse.json({ error: 'storage' }, { status: 502 })
    const name = doc.filename ?? 'document'
    return new Response(object.body, {
      headers: {
        'content-type': doc.mime ?? 'application/octet-stream',
        'content-disposition': `inline; filename="${name.replace(/[^\x20-\x7e]|"/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`,
        'cache-control': 'private, no-store',
        // Only PDFs, images and text are accepted on upload; nosniff keeps
        // the browser from reading a file as anything else.
        'x-content-type-options': 'nosniff',
      },
    })
  } catch (error) {
    if (error instanceof StorageNotConfigured)
      return NextResponse.json({ error: 'storage' }, { status: 503 })
    throw error
  }
}
