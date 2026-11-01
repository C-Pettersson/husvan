// A document's original file, handed to Claude as it was uploaded, so that
// Claude reads the inspection report or looks at the photo of the roof
// itself. The server passes the bytes on; it does not read them.
import type { PrismaClient } from '@prisma/client'
import { getObject } from '@/server/storage/s3'

// Images the model can look at. HEIC is accepted on upload but not by the
// model, and an image over 5 MB is refused by the API.
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const MAX_FILE_BYTES = 25 * 1024 * 1024

export type FileBlock =
  | { type: 'image'; data: string; mimeType: string }
  | {
      type: 'resource'
      resource:
        | { uri: string; mimeType: string; blob: string }
        | { uri: string; mimeType: string; text: string }
    }

export const documentUri = (documentId: string) =>
  `husvan://documents/${documentId}`

// The content block for a file, or why it cannot be given to the model.
export function fileBlock(
  documentId: string,
  mime: string,
  bytes: Uint8Array
): { ok: true; block: FileBlock } | { ok: false; error: string } {
  const data = Buffer.from(bytes)
  if (IMAGE_TYPES.includes(mime)) {
    if (data.length > MAX_IMAGE_BYTES)
      return {
        ok: false,
        error: `The image is ${mb(data.length)} MB, over the ${mb(MAX_IMAGE_BYTES)} MB a model can look at. Ask the user to attach a smaller copy in the chat.`,
      }
    return {
      ok: true,
      block: { type: 'image', data: data.toString('base64'), mimeType: mime },
    }
  }
  if (data.length > MAX_FILE_BYTES)
    return {
      ok: false,
      error: `The file is ${mb(data.length)} MB, over ${mb(MAX_FILE_BYTES)} MB. Ask the user to attach it in the chat.`,
    }
  if (mime === 'application/pdf')
    return {
      ok: true,
      block: {
        type: 'resource',
        resource: {
          uri: documentUri(documentId),
          mimeType: mime,
          blob: data.toString('base64'),
        },
      },
    }
  if (mime === 'text/plain')
    return {
      ok: true,
      block: {
        type: 'resource',
        resource: {
          uri: documentUri(documentId),
          mimeType: mime,
          text: data.toString('utf8'),
        },
      },
    }
  return {
    ok: false,
    error: `Files of type ${mime} cannot be given to the model. Ask the user to attach the file in the chat, as JPEG or PNG for a photo.`,
  }
}

const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1)

export type DocumentFile =
  | {
      ok: true
      document: { id: string; filename: string | null; mime: string }
      bytes: Uint8Array
    }
  | { ok: false; error: string }

// The stored file of one of the owner's approved documents.
export async function loadDocumentFile(
  prisma: PrismaClient,
  { ownerId, documentId }: { ownerId: string; documentId: string }
): Promise<DocumentFile> {
  const doc = await prisma.document.findFirst({
    where: {
      id: documentId,
      house: { ownerId },
      changeset: { status: 'APPROVED' },
    },
    select: { id: true, filename: true, mime: true, storagePath: true },
  })
  if (!doc) return { ok: false, error: `No document with id ${documentId}.` }
  if (!doc.storagePath)
    return {
      ok: false,
      error:
        'No original file is uploaded for this document; get_document returns its saved text.',
    }

  const object = await getObject(doc.storagePath)
  if (!object.ok)
    return {
      ok: false,
      error: `The file could not be read from storage (${object.status}).`,
    }
  return {
    ok: true,
    document: {
      id: doc.id,
      filename: doc.filename,
      mime: doc.mime ?? object.headers.get('content-type') ?? '',
    },
    bytes: new Uint8Array(await object.arrayBuffer()),
  }
}
