import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { uploadDocument } from '@/server/houses/uploadDocument'
import { StorageNotConfigured } from '@/server/storage/s3'

const fields = z.object({
  documentId: z.uuid().optional(),
  type: z
    .enum([
      'LISTING',
      'INSPECTION',
      'PIPE_INSPECTION',
      'ELECTRICAL_INSPECTION',
      'ENERGY_CERTIFICATE',
      'INVOICE',
      'RECEIPT',
      'MANUAL',
      'WARRANTY',
      'DRAWING',
      'PHOTO',
      'OTHER',
    ])
    .default('OTHER'),
})

// Uploads a document's original file (multipart: file, and documentId or
// type). A file upload is not a tRPC call, so it has its own route.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session)
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  if (!z.uuid().safeParse(id).success)
    return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const form = await request.formData()
  const file = form.get('file')
  const parsed = fields.safeParse({
    documentId: form.get('documentId') || undefined,
    type: form.get('type') || undefined,
  })
  if (!(file instanceof File) || !parsed.success)
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })

  try {
    const result = await uploadDocument(prisma, {
      ownerId: session.user.id,
      houseId: id,
      ...parsed.data,
      file: {
        name: file.name,
        mime: file.type,
        bytes: new Uint8Array(await file.arrayBuffer()),
      },
    })
    if (!result.ok)
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      )
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof StorageNotConfigured)
      return NextResponse.json({ error: 'storage' }, { status: 503 })
    throw error
  }
}
