import { describe, expect, it } from 'vitest'
import { objectPath, sha256Hex, signRequest } from './s3'

// The examples in AWS's documentation of Signature V4 for S3
// ("Signature Calculations for the Authorization Header").
const aws = {
  endpoint: new URL('https://examplebucket.s3.amazonaws.com'),
  region: 'us-east-1',
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
}
const when = new Date('2013-05-24T00:00:00Z')

describe('signRequest', () => {
  it('signs the GET Object example', () => {
    const r = signRequest(
      aws,
      'GET',
      '/test.txt',
      sha256Hex(''),
      { Range: 'bytes=0-9' },
      when
    )
    expect(r.signature).toBe(
      'f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41'
    )
    expect(r.headers.authorization).toContain(
      'SignedHeaders=host;range;x-amz-content-sha256;x-amz-date'
    )
  })

  it('signs the PUT Object example, encoding the key', () => {
    const body = 'Welcome to Amazon S3.'
    const r = signRequest(
      aws,
      'PUT',
      objectPath({ ...aws, bucket: '', prefix: '' }, 'test$file.text').replace(
        /^\/\//,
        '/'
      ),
      sha256Hex(body),
      {
        Date: 'Fri, 24 May 2013 00:00:00 GMT',
        'x-amz-storage-class': 'REDUCED_REDUNDANCY',
      },
      when
    )
    expect(r.signature).toBe(
      '98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd'
    )
  })
})

describe('objectPath', () => {
  it('puts the bucket first and keeps the key’s slashes', () => {
    expect(
      objectPath(
        {
          ...aws,
          endpoint: new URL('https://account.r2.cloudflarestorage.com'),
          bucket: 'husvan-dev',
          prefix: 'dev/',
        },
        'dev/houses/a b/f.pdf'
      )
    ).toBe('/husvan-dev/dev/houses/a%20b/f.pdf')
  })
})
