import { NextResponse } from 'next/server';
import { inflateRawSync } from 'zlib';
import type { CollectionItem, UserCollection } from '@/lib/types';

function readUInt16(buffer: Buffer, offset: number) {
  return buffer.readUInt16LE(offset);
}

function readUInt32(buffer: Buffer, offset: number) {
  return buffer.readUInt32LE(offset);
}

function findEndOfCentralDirectory(buffer: Buffer) {
  const min = Math.max(0, buffer.length - 0xffff - 22);
  for (let offset = buffer.length - 22; offset >= min; offset -= 1) {
    if (readUInt32(buffer, offset) === 0x06054b50) return offset;
  }
  return -1;
}

function extractCollectionJsonFromZip(buffer: Buffer) {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  if (eocdOffset < 0) throw new Error('Could not read the zip central directory.');

  const entryCount = readUInt16(buffer, eocdOffset + 10);
  const centralOffset = readUInt32(buffer, eocdOffset + 16);
  let offset = centralOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (readUInt32(buffer, offset) !== 0x02014b50) break;

    const method = readUInt16(buffer, offset + 10);
    const compressedSize = readUInt32(buffer, offset + 20);
    const filenameLength = readUInt16(buffer, offset + 28);
    const extraLength = readUInt16(buffer, offset + 30);
    const commentLength = readUInt16(buffer, offset + 32);
    const localHeaderOffset = readUInt32(buffer, offset + 42);
    const filename = buffer.subarray(offset + 46, offset + 46 + filenameLength).toString('utf8').replaceAll('\\', '/');

    if (filename.toLowerCase().endsWith('collection.json')) {
      if (readUInt32(buffer, localHeaderOffset) !== 0x04034b50) throw new Error('Invalid local zip header.');

      const localFilenameLength = readUInt16(buffer, localHeaderOffset + 26);
      const localExtraLength = readUInt16(buffer, localHeaderOffset + 28);
      const dataOffset = localHeaderOffset + 30 + localFilenameLength + localExtraLength;
      const compressed = buffer.subarray(dataOffset, dataOffset + compressedSize);

      if (method === 0) return compressed.toString('utf8');
      if (method === 8) return inflateRawSync(compressed).toString('utf8');
      throw new Error(`Unsupported zip compression method: ${method}.`);
    }

    offset += 46 + filenameLength + extraLength + commentLength;
  }

  throw new Error('collection.json was not found inside the zip.');
}

async function extractCollectionJsonWith7z(buffer: Buffer, requestUrl: string) {
  const [{ default: SevenZip }, wasmResponse] = await Promise.all([
    import('7z-wasm'),
    fetch(new URL('/7zz.wasm', requestUrl))
  ]);

  if (!wasmResponse.ok) throw new Error('Could not load the 7z extractor.');

  const sevenZip = await SevenZip({ wasmBinary: await wasmResponse.arrayBuffer() });
  const archiveName = 'collection.7z';
  const stream = sevenZip.FS.open(archiveName, 'w+');
  sevenZip.FS.write(stream, new Uint8Array(buffer), 0, buffer.length);
  sevenZip.FS.close(stream);

  try {
    sevenZip.FS.mkdir('/out');
  } catch {
    // Directory may already exist if the module reuses its runtime.
  }

  sevenZip.callMain(['x', archiveName, '-o/out', '-y']);

  const findCollectionJson = (dir: string): string | null => {
    for (const entry of sevenZip.FS.readdir(dir)) {
      if (entry === '.' || entry === '..') continue;
      const path = `${dir}/${entry}`;
      const stat = sevenZip.FS.stat(path);
      if (sevenZip.FS.isDir(stat.mode)) {
        const found = findCollectionJson(path);
        if (found) return found;
      } else if (entry.toLowerCase() === 'collection.json') {
        return path;
      }
    }
    return null;
  };

  const collectionPath = findCollectionJson('/out');
  if (!collectionPath) throw new Error('collection.json was not found inside the archive.');

  return sevenZip.FS.readFile(collectionPath, { encoding: 'utf8' });
}

function cleanText(value: unknown) {
  return String(value ?? '').trim();
}

function itemFromManifestMod(raw: any, index: number, fallbackGame: string): CollectionItem | null {
  const source = raw?.source || {};
  const modId = Number(source.modId ?? source.mod_id);
  const fileId = Number(source.fileId ?? source.file_id);
  if (!Number.isFinite(modId) || !Number.isFinite(fileId)) return null;

  const game = cleanText(raw.domainName ?? raw.domain_name) || fallbackGame;
  const fileSizeBytes = Number(source.fileSize ?? source.file_size);

  return {
    localId: `import-${game}-${modId}-${fileId}-${index}-${Date.now()}`,
    game,
    modId,
    modName: cleanText(raw.name) || `Mod ${modId}`,
    author: cleanText(raw.author),
    thumbnail: '/mod-placeholder.svg',
    fileId,
    fileName: cleanText(source.logicalFilename ?? source.logical_filename) || cleanText(raw.name) || `File ${fileId}`,
    fileVersion: cleanText(raw.version),
    fileCategory: cleanText(raw.details?.category),
    fileSizeBytes: Number.isFinite(fileSizeBytes) && fileSizeBytes > 0 ? fileSizeBytes : undefined,
    fileMd5: cleanText(source.md5),
    required: raw.optional !== true,
    installOrder: index + 1,
    status: 'ok'
  };
}

function collectionFromManifest(manifest: any, sourceName: string): UserCollection {
  const info = manifest?.info || {};
  const game = cleanText(info.domainName ?? info.domain_name) || 'skyrimspecialedition';
  const title = cleanText(info.name) || sourceName.replace(/\.(zip|json)$/i, '') || 'Imported collection';
  const description = cleanText(info.description);
  const summary = cleanText(info.summary);
  const items = Array.isArray(manifest?.mods)
    ? manifest.mods.map((mod: any, index: number) => itemFromManifestMod(mod, index, game)).filter(Boolean) as CollectionItem[]
    : [];

  return {
    id: `import:${Date.now()}:${Math.random().toString(16).slice(2)}`,
    title,
    description: summary || description,
    game,
    items,
    editable: true
  };
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ message: 'Upload a collection .json or .zip file.' }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const filename = file.name.toLowerCase();
    const raw = filename.endsWith('.zip')
      ? extractCollectionJsonFromZip(bytes)
      : filename.endsWith('.7z') || filename.endsWith('.7zip')
        ? await extractCollectionJsonWith7z(bytes, request.url)
        : bytes.toString('utf8');
    const manifest = JSON.parse(raw);
    const collection = collectionFromManifest(manifest, file.name);

    return NextResponse.json({ collection });
  } catch (error: any) {
    return NextResponse.json({ message: error?.message || 'Could not import collection.' }, { status: 400 });
  }
}
