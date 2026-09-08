import { randomUUID } from 'node:crypto';
import { createHash, type Hash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Transform, type TransformCallback } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { createGunzip } from 'node:zlib';

export const JMDICT_SOURCE_NAME = 'jmdict';
export const JMDICT_DEFAULT_URL = 'https://ftp.edrdg.org/pub/Nihongo/JMdict.gz';
export const JMDICT_DEFAULT_CACHE = join(tmpdir(), 'kotoba', 'jmdict');

export interface DownloadedJmdict {
  xmlPath: string;
  checksum: string;
  bytes: number;
}

class ChecksumTransform extends Transform {
  private readonly hash: Hash;

  constructor() {
    super();
    this.hash = createHash('sha256');
  }

  override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
    this.hash.update(chunk);
    callback(null, chunk);
  }

  digest(): string {
    return this.hash.digest('hex');
  }
}

async function sha256File(path: string): Promise<string> {
  const checksum = new ChecksumTransform();
  await pipeline(createReadStream(path), checksum);
  return checksum.digest();
}

async function fetchToFile(url: string, dest: string): Promise<DownloadedJmdict> {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Falha ao baixar ${url}: ${response.status} ${response.statusText}`);
  }
  const checksum = new ChecksumTransform();
  await pipeline(
    Readable.fromWeb(response.body as unknown as WebReadableStream<Uint8Array>),
    checksum,
    createWriteStream(dest),
  );
  const info = await stat(dest);
  return { xmlPath: dest, checksum: checksum.digest(), bytes: info.size };
}

export async function downloadJmdict(
  destDir = JMDICT_DEFAULT_CACHE,
  url = process.env.JMDICT_URL ?? JMDICT_DEFAULT_URL,
): Promise<DownloadedJmdict> {
  await mkdir(destDir, { recursive: true });
  const base = join(destDir, `jmdict-${Date.now()}-${randomUUID()}`);
  const xmlPath = `${base}.xml`;

  try {
    return await gunzipToFile(url, xmlPath);
  } catch (gunzipError) {
    await rm(xmlPath, { force: true });
    try {
      return await fetchToFile(url, xmlPath);
    } catch {
      throw gunzipError instanceof Error
        ? new Error(`Falha ao baixar JMdict de ${url}: ${gunzipError.message}`)
        : gunzipError;
    }
  }
}

async function gunzipToFile(url: string, xmlPath: string): Promise<DownloadedJmdict> {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Falha ao baixar ${url}: ${response.status} ${response.statusText}`);
  }
  const checksum = new ChecksumTransform();
  await pipeline(
    Readable.fromWeb(response.body as unknown as WebReadableStream<Uint8Array>),
    createGunzip(),
    checksum,
    createWriteStream(xmlPath),
  );
  const info = await stat(xmlPath);
  return { xmlPath, checksum: checksum.digest(), bytes: info.size };
}

export { sha256File };
