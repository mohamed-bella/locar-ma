import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { serverEnv } from './env.server'

// Cloudflare R2 is S3-compatible. Files: damage photos, scanned IDs, contract PDFs.
let client: S3Client | null = null

function r2() {
  if (client) return client
  const env = serverEnv()
  client = new S3Client({
    region: 'auto',
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  })
  return client
}

// Presigned PUT — browser uploads directly to R2, no bytes through our server.
// When contentLength is supplied it becomes part of the signature, so the
// upload must send exactly that many bytes — this caps abuse via a leaked or
// tampered presigned URL (browsers set Content-Length from the Blob body).
export function presignUpload(
  key: string,
  contentType: string,
  expiresIn = 300,
  contentLength?: number,
) {
  const env = serverEnv()
  return getSignedUrl(
    r2(),
    new PutObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: key,
      ContentType: contentType,
      ...(contentLength != null ? { ContentLength: contentLength } : {}),
    }),
    { expiresIn },
  )
}

// The private bucket for sensitive documents (contract PDFs, ID scans).
// Never served publicly — access only through short-lived presigned URLs.
export function docsBucket() {
  const env = serverEnv()
  return env.R2_DOCS_BUCKET || env.R2_BUCKET
}

// Presigned GET — for private objects (contract PDFs, scanned IDs). Public
// assets use publicUrl(). Pass a bucket to read from the private docs bucket.
export function presignDownload(key: string, expiresIn = 300, bucket?: string) {
  const env = serverEnv()
  return getSignedUrl(
    r2(),
    new GetObjectCommand({ Bucket: bucket ?? env.R2_BUCKET, Key: key }),
    { expiresIn },
  )
}

// Upload bytes directly from the server (e.g. generated PDFs).
export async function putObject(
  key: string,
  body: Uint8Array | Buffer,
  contentType: string,
  bucket?: string,
) {
  const env = serverEnv()
  await r2().send(
    new PutObjectCommand({ Bucket: bucket ?? env.R2_BUCKET, Key: key, Body: body, ContentType: contentType }),
  )
  return key
}

export async function deleteObject(key: string, bucket?: string) {
  const env = serverEnv()
  await r2().send(new DeleteObjectCommand({ Bucket: bucket ?? env.R2_BUCKET, Key: key }))
}

// Public URL via bucket's custom domain / r2.dev. Store the KEY in the DB,
// build the URL at render time so the domain can change without a migration.
export function publicUrl(key: string) {
  return `${serverEnv().R2_PUBLIC_URL}/${key}`
}
