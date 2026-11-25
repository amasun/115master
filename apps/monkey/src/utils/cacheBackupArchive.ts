export const ARCHIVE_MAGIC = new Uint8Array([
  0x31,
  0x31,
  0x35,
  0x4D,
  0x42,
  0x41,
  0x4B,
  0x02, // "115MBAK\x02"
])

export /** 13 bytes */
const ARCHIVE_HEADER_SIZE = ARCHIVE_MAGIC.length + 1 + 4
const FLAG_GZIP = 0x01

export type ArchiveBlobKind
  = | 'customCoverThumb'
    | 'customCoverFull'
    | 'customAvatar'
    | 'posterThumb'

export interface ArchiveBlobDescriptor {
  kind: ArchiveBlobKind
  key: string
  mime: string
  offset: number
  length: number
  sourceLabel?: string
  updatedAt?: number
}

export interface ArchiveBlobInput {
  kind: ArchiveBlobKind
  key: string
  blob: Blob
  sourceLabel?: string
  updatedAt?: number
}

export interface CacheBackupArchiveManifest<TData> {
  schemaVersion: 2
  exportedAt: number
  appVersion?: string
  data: TData
  blobs: ArchiveBlobDescriptor[]
}

/** 检查字节头是否匹配 .115bak v2 归档魔数 */
export function isBackupArchiveBuffer(bytes: Uint8Array): boolean {
  if (bytes.length < ARCHIVE_MAGIC.length)
    return false
  for (let i = 0; i < ARCHIVE_MAGIC.length; i += 1) {
    if (bytes[i] !== ARCHIVE_MAGIC[i])
      return false
  }
  return true
}

async function gzipCompress(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === 'undefined')
    return null
  try {
    const stream = new Blob([bytes.buffer as ArrayBuffer])
      .stream()
      .pipeThrough(new CompressionStream('gzip'))
    const buffer = await new Response(stream).arrayBuffer()
    return new Uint8Array(buffer)
  }
  catch {
    return null
  }
}

async function gzipDecompress(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined')
    throw new Error('当前浏览器不支持 gzip 解压，无法读取压缩归档')
  const stream = new Blob([bytes.buffer as ArrayBuffer])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'))
  const buffer = await new Response(stream).arrayBuffer()
  return new Uint8Array(buffer)
}

/** 将文本数据与二进制 Blob 列表零拷贝打包为单个 .115bak 归档 */
export async function encodeBackupArchive<TData>(
  meta: {
    exportedAt: number
    appVersion?: string
    data: TData
  },
  blobInputs: readonly ArchiveBlobInput[],
  options: { compress?: boolean } = {},
): Promise<Blob> {
  let offset = 0
  const descriptors: ArchiveBlobDescriptor[] = []
  const blobParts: Blob[] = []

  for (const input of blobInputs) {
    const length = input.blob.size
    descriptors.push({
      kind: input.kind,
      key: input.key,
      mime: input.blob.type || 'application/octet-stream',
      offset,
      length,
      ...(input.sourceLabel ? { sourceLabel: input.sourceLabel } : {}),
      ...(typeof input.updatedAt === 'number' ? { updatedAt: input.updatedAt } : {}),
    })
    blobParts.push(input.blob)
    offset += length
  }

  const manifest: CacheBackupArchiveManifest<TData> = {
    schemaVersion: 2,
    exportedAt: meta.exportedAt,
    ...(meta.appVersion ? { appVersion: meta.appVersion } : {}),
    data: meta.data,
    blobs: descriptors,
  }

  const rawManifestBytes = new TextEncoder().encode(JSON.stringify(manifest))
  const compressedBytes = options.compress !== false
    ? await gzipCompress(rawManifestBytes)
    : null

  const manifestBytes = compressedBytes ?? rawManifestBytes
  const flags = compressedBytes ? FLAG_GZIP : 0

  const header = new Uint8Array(ARCHIVE_HEADER_SIZE)
  header.set(ARCHIVE_MAGIC, 0)
  header[ARCHIVE_MAGIC.length] = flags
  new DataView(header.buffer).setUint32(ARCHIVE_MAGIC.length + 1, manifestBytes.byteLength, true)

  return new Blob([header, manifestBytes.buffer as ArrayBuffer, ...blobParts], {
    type: 'application/octet-stream',
  })
}

/** 仅读取 .115bak 头部与 Manifest，不将图片段整体读入内存 */
export async function peekBackupArchive<TData>(
  file: Blob,
): Promise<{ manifest: CacheBackupArchiveManifest<TData>, blobSectionOffset: number }> {
  if (file.size < ARCHIVE_HEADER_SIZE)
    throw new Error('归档文件头不完整')

  const headerBuf = await file.slice(0, ARCHIVE_HEADER_SIZE).arrayBuffer()
  const headerBytes = new Uint8Array(headerBuf)
  if (!isBackupArchiveBuffer(headerBytes))
    throw new Error('不是有效的 115Master 归档备份文件')

  const flags = headerBytes[ARCHIVE_MAGIC.length]
  const manifestLen = new DataView(headerBuf).getUint32(ARCHIVE_MAGIC.length + 1, true)
  const blobSectionOffset = ARCHIVE_HEADER_SIZE + manifestLen

  if (manifestLen <= 0 || blobSectionOffset > file.size)
    throw new Error('归档文件头长度异常，文件可能已损坏')

  const rawManifestBuf = await file.slice(ARCHIVE_HEADER_SIZE, blobSectionOffset).arrayBuffer()
  const rawBytes = new Uint8Array(rawManifestBuf)
  const plainBytes = (flags & FLAG_GZIP) !== 0
    ? await gzipDecompress(rawBytes)
    : rawBytes

  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder().decode(plainBytes))
  }
  catch {
    throw new Error('归档 Manifest JSON 解析失败')
  }

  if (!parsed || typeof parsed !== 'object')
    throw new Error('归档 Manifest 结构无效')

  const manifest = parsed as Partial<CacheBackupArchiveManifest<TData>>
  if (manifest.schemaVersion !== 2 || !manifest.data || !Array.isArray(manifest.blobs))
    throw new Error('不支持的归档备份版本或结构')

  return {
    manifest: manifest as CacheBackupArchiveManifest<TData>,
    blobSectionOffset,
  }
}

/** 按偏移量零拷贝切片读取单个 Blob */
export function readArchiveBlob(
  file: Blob,
  blobSectionOffset: number,
  descriptor: ArchiveBlobDescriptor,
): Blob {
  const start = blobSectionOffset + descriptor.offset
  const end = start + descriptor.length
  return file.slice(start, end, descriptor.mime || 'application/octet-stream')
}
