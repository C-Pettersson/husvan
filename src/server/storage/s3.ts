// Document files on Cloudflare R2 through its S3 API (CLAUDE.md,
// "Dokumentfiler"), signed with AWS Signature V4 by hand like brfjamforelse,
// so that two calls do not need the AWS SDK.
import { createHash, createHmac } from 'node:crypto'

const REQUIRED = [
  'STORAGE_ENDPOINT',
  'STORAGE_REGION',
  'STORAGE_ACCESS_KEY_ID',
  'STORAGE_SECRET_ACCESS_KEY',
  'STORAGE_BUCKET',
] as const

type Config = {
  endpoint: URL
  region: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
  prefix: string
}

export class StorageNotConfigured extends Error {
  constructor(missing: string[]) {
    super(`Storage is not configured: ${missing.join(', ')}`)
  }
}

export function storageConfig(): Config {
  const missing = REQUIRED.filter((k) => !process.env[k]?.trim())
  if (missing.length) throw new StorageNotConfigured(missing)
  const raw = process.env.STORAGE_ENDPOINT!.trim()
  const prefix = process.env.STORAGE_PREFIX?.trim().replace(/^\/+|\/+$/g, '')
  return {
    endpoint: new URL(raw.startsWith('http') ? raw : `https://${raw}`),
    region: process.env.STORAGE_REGION!.trim(),
    accessKeyId: process.env.STORAGE_ACCESS_KEY_ID!.trim(),
    secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY!.trim(),
    bucket: process.env.STORAGE_BUCKET!.trim(),
    prefix: prefix ? `${prefix}/` : '',
  }
}

export const sha256Hex = (data: string | Uint8Array) =>
  createHash('sha256').update(data).digest('hex')

const hmac = (key: Buffer | string, value: string) =>
  createHmac('sha256', key).update(value, 'utf8').digest()

const encode = (value: string) =>
  encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  )

// An object's path in path-style addressing, which R2 takes.
export const objectPath = (config: Config, key: string) =>
  `${config.endpoint.pathname.replace(/\/$/, '')}/${encode(
    config.bucket
  )}/${key.split('/').map(encode).join('/')}`

// Signs a request for the path with AWS Signature V4, header style.
export function signRequest(
  config: Pick<
    Config,
    'endpoint' | 'region' | 'accessKeyId' | 'secretAccessKey'
  >,
  method: 'GET' | 'PUT',
  path: string,
  payloadHash: string,
  extraHeaders: Record<string, string> = {},
  now = new Date()
) {
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)
  const headers: Record<string, string> = {
    host: config.endpoint.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    ...Object.fromEntries(
      Object.entries(extraHeaders).map(([k, v]) => [k.toLowerCase(), v])
    ),
  }
  const names = Object.keys(headers).sort()
  const signedHeaders = names.join(';')
  const canonicalRequest = [
    method,
    path,
    '',
    names.map((n) => `${n}:${headers[n].trim()}\n`).join(''),
    signedHeaders,
    payloadHash,
  ].join('\n')
  const scope = `${dateStamp}/${config.region}/s3/aws4_request`
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join('\n')
  const kDate = hmac(`AWS4${config.secretAccessKey}`, dateStamp)
  const kSigning = hmac(hmac(hmac(kDate, config.region), 's3'), 'aws4_request')
  const signature = createHmac('sha256', kSigning)
    .update(stringToSign, 'utf8')
    .digest('hex')
  const url = new URL(config.endpoint.toString())
  url.pathname = path
  // fetch sets host itself.
  const sent = Object.fromEntries(
    Object.entries(headers).filter(([name]) => name !== 'host')
  )
  return {
    url,
    signature,
    headers: {
      ...sent,
      authorization: `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  }
}

// The object key for a document's file: the house, then the file's hash,
// so the same file is stored once.
export function objectKey(houseId: string, sha256: string, filename: string) {
  const extension = filename.match(/\.[A-Za-z0-9]{1,8}$/)?.[0] ?? ''
  return `${storageConfig().prefix}houses/${houseId}/${sha256}${extension.toLowerCase()}`
}

export async function putObject(
  key: string,
  body: Uint8Array,
  contentType: string,
  sha256: string
) {
  const config = storageConfig()
  const request = signRequest(config, 'PUT', objectPath(config, key), sha256, {
    'content-type': contentType,
  })
  const response = await fetch(request.url, {
    method: 'PUT',
    headers: request.headers,
    body: Buffer.from(body),
  })
  if (!response.ok)
    throw new Error(
      `Storage upload failed with ${response.status}: ${(await response.text()).slice(0, 200)}`
    )
}

export async function getObject(key: string) {
  const config = storageConfig()
  const request = signRequest(
    config,
    'GET',
    objectPath(config, key),
    sha256Hex('')
  )
  return fetch(request.url, { headers: request.headers, cache: 'no-store' })
}
