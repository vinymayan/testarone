import { nexusFetch, isMockMode, NexusApiError, getModFiles } from './nexus';
import { buildCollectionManifest, buildNexusCollectionPayload, validateDraftForPublish } from './manifest';
import type { CollectionDraft, PublishResult, UserCollection } from './types';

const V3_BASE = process.env.NEXUS_API_V3_BASE || 'https://api.nexusmods.com/v3';

function dataOf<T>(payload: any): T {
  return (payload?.data ?? payload) as T;
}

function renderTemplate(template: string, values: Record<string, string>) {
  return Object.entries(values).reduce((url, [key, value]) => (
    url.replaceAll(`{${key}}`, encodeURIComponent(value))
  ), template);
}

function normalizeCollection(raw: any): UserCollection {
  const manifest = raw.collection_manifest ?? raw.latest_revision?.collection_manifest ?? raw.revision?.collection_manifest;
  const info = manifest?.info ?? raw.info ?? {};
  const id = String(raw.id ?? raw.collection_id ?? raw.uuid ?? raw.slug ?? '');
  const game = String(raw.domain_name ?? info.domain_name ?? info.domainName ?? raw.game ?? raw.game_domain_name ?? '');
  const slug = raw.slug ? String(raw.slug) : undefined;

  return {
    id,
    slug,
    title: String(raw.name ?? raw.title ?? info.name ?? slug ?? id),
    description: String(raw.description ?? info.description ?? info.summary ?? ''),
    game,
    revisionId: raw.revision_id ? String(raw.revision_id) : raw.latest_revision?.id ? String(raw.latest_revision.id) : undefined,
    revisionNumber: Number(raw.revision_number ?? raw.latest_revision?.revision_number ?? 0) || undefined,
    status: raw.revision_status ?? raw.status,
    url: raw.url ?? raw.collection_url ?? (slug && game ? `https://next.nexusmods.com/${game}/collections/${slug}` : undefined)
  };
}

function normalizeCollectionList(raw: any): UserCollection[] {
  const list: any[] = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.data)
      ? raw.data
      : Array.isArray(raw?.collections)
        ? raw.collections
        : Array.isArray(raw?.data?.collections)
          ? raw.data.collections
          : [];

  return list.map(normalizeCollection).filter((collection) => collection.id);
}

function collectionSummary(draft: CollectionDraft) {
  return (draft.summary || '').trim().slice(0, 255) || draft.title.trim().slice(0, 255);
}

function collectionCategoryId() {
  const value = Number(process.env.NEXUS_COLLECTION_CATEGORY_ID || '');
  return Number.isFinite(value) && value > 0 ? value : null;
}

const DEFAULT_COLLECTION_CATEGORY_IDS: Record<string, number> = {
  'total overhaul': 1,
  themed: 2,
  'vanilla plus': 3,
  essentials: 4,
  miscellaneous: 5
};

function configuredCollectionCategoryIds() {
  const raw = process.env.NEXUS_COLLECTION_CATEGORY_IDS;
  if (!raw) return DEFAULT_COLLECTION_CATEGORY_IDS;

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const normalized = Object.entries(parsed).reduce<Record<string, number>>((map, [key, value]) => {
      const id = Number(value);
      if (Number.isFinite(id) && id > 0) map[key.trim().toLowerCase()] = id;
      return map;
    }, {});
    return Object.keys(normalized).length ? normalized : DEFAULT_COLLECTION_CATEGORY_IDS;
  } catch {
    return DEFAULT_COLLECTION_CATEGORY_IDS;
  }
}

function collectionCategoryIdFor(category: string) {
  const override = collectionCategoryId();
  if (override) return override;

  const key = category.trim().toLowerCase();
  return configuredCollectionCategoryIds()[key] ?? null;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let crc = i;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
    }
    table[i] = crc >>> 0;
  }
  return table;
})();

function crc32(bytes: Buffer) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipEntry(name: string, data = Buffer.alloc(0)) {
  const nameBytes = Buffer.from(name, 'utf8');
  const crc = crc32(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 6);
  local.writeUInt16LE(0, 8);
  local.writeUInt16LE(0, 10);
  local.writeUInt16LE(0, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBytes.length, 26);
  local.writeUInt16LE(0, 28);

  return {
    nameBytes,
    data,
    crc,
    local: Buffer.concat([local, nameBytes, data])
  };
}

function buildCollectionArchive(manifest: unknown) {
  const entries = [
    zipEntry('collection.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf8')),
    zipEntry('bundled/'),
    zipEntry('patches/')
  ];

  let offset = 0;
  const central = entries.map((entry) => {
    const dir = entry.nameBytes.toString('utf8').endsWith('/');
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(0, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(0, 12);
    header.writeUInt16LE(0, 14);
    header.writeUInt32LE(entry.crc, 16);
    header.writeUInt32LE(entry.data.length, 20);
    header.writeUInt32LE(entry.data.length, 24);
    header.writeUInt16LE(entry.nameBytes.length, 28);
    header.writeUInt16LE(0, 30);
    header.writeUInt16LE(0, 32);
    header.writeUInt16LE(0, 34);
    header.writeUInt16LE(0, 36);
    header.writeUInt32LE(dir ? 0x10 : 0, 38);
    header.writeUInt32LE(offset, 42);
    offset += entry.local.length;
    return Buffer.concat([header, entry.nameBytes]);
  });

  const local = Buffer.concat(entries.map((entry) => entry.local));
  const centralDir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDir.length, 12);
  end.writeUInt32LE(local.length, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([local, centralDir, end]);
}

async function uploadCollectionArchive(accessToken: string, filename: string, manifest: unknown) {
  const bytes = buildCollectionArchive(manifest);
  const upload = dataOf<{ id: string; presigned_url: string }>(await nexusFetch(`${V3_BASE}/uploads`, {
    accessToken,
    method: 'POST',
    body: {
      filename,
      size_bytes: bytes.byteLength
    }
  }));

  if (!upload.id || !upload.presigned_url) {
    throw new NexusApiError('Nexus upload response did not include upload id or presigned URL.', 502, upload);
  }

  const putResponse = await fetch(upload.presigned_url, {
    method: 'PUT',
    headers: {
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Type': 'application/octet-stream'
    },
    body: bytes
  });

  if (!putResponse.ok) {
    const text = await putResponse.text().catch(() => '');
    throw new NexusApiError(
      `Nexus upload PUT failed with ${putResponse.status}: ${text || putResponse.statusText}`,
      putResponse.status,
      {
        uploadId: upload.id,
        status: putResponse.status,
        statusText: putResponse.statusText,
        response: text,
        signedHeaders: new URL(upload.presigned_url).searchParams.get('X-Amz-SignedHeaders')
      }
    );
  }

  await nexusFetch(`${V3_BASE}/uploads/${encodeURIComponent(upload.id)}/finalise`, {
    accessToken,
    method: 'POST'
  });

  return upload.id;
}

async function updateCollectionDetails(accessToken: string, collectionId: string, draft: CollectionDraft, categoryId: number | null) {
  const body: Record<string, unknown> = {
    name: draft.title.trim().slice(0, 36),
    category_id: categoryId
  };

  if (!draft.preserveDescription) {
    body.summary = collectionSummary(draft);
    body.description = draft.description.trim();
  }

  await nexusFetch(`${V3_BASE}/collections/${encodeURIComponent(collectionId)}`, {
    accessToken,
    method: 'PATCH',
    body
  });
}

async function refreshFileMetadata(accessToken: string, draft: CollectionDraft): Promise<CollectionDraft> {
  const cache = new Map<string, Awaited<ReturnType<typeof getModFiles>>>();
  const items = await Promise.all(draft.items.map(async (item) => {
    if (!item.fileId) return item;

    const key = `${item.game}:${item.modId}`;
    if (!cache.has(key)) {
      cache.set(key, await getModFiles(accessToken, item.game, item.modId));
    }

    const files = cache.get(key) || [];
    const file = files.find((candidate) => String(candidate.id) === String(item.fileId))
      || files.find((candidate) => candidate.name === item.fileName && (!item.fileVersion || candidate.version === item.fileVersion));

    return file ? {
      ...item,
      fileId: file.id || item.fileId,
      fileName: file.name || item.fileName,
      fileVersion: file.version || item.fileVersion,
      fileCategory: file.category || item.fileCategory,
      fileSizeBytes: file.sizeBytes || item.fileSizeBytes
    } : item;
  }));

  return { ...draft, items };
}

export async function publishCollection(accessToken: string, draft: CollectionDraft): Promise<PublishResult> {
  const enrichedDraft = await refreshFileMetadata(accessToken, draft);
  const errors = validateDraftForPublish(enrichedDraft);
  if (errors.length) {
    return { ok: false, message: errors.join(' ') };
  }

  const manifest = buildCollectionManifest(enrichedDraft);
  const nexusPayload = buildNexusCollectionPayload(enrichedDraft);
  const categoryId = collectionCategoryIdFor(enrichedDraft.category);

  if (isMockMode()) {
    return {
      ok: true,
      collectionId: enrichedDraft.id || `mock-collection-${Date.now()}`,
      slug: `mock-${Date.now()}`,
      revisionId: `mock-rev-${Date.now()}`,
      uploadId: `mock-upload-${Date.now()}`,
      collectionUrl: `https://next.nexusmods.com/${enrichedDraft.game}/collections/mock-${Date.now()}`,
      categoryId,
      manifest
    };
  }

  const filename = `${enrichedDraft.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'collection'}.zip`;
  const uploadId = await uploadCollectionArchive(accessToken, filename, manifest);
  const collectionId = enrichedDraft.id?.trim();
  const endpoint = collectionId
    ? `${V3_BASE}/collections/${encodeURIComponent(collectionId)}/revisions`
    : `${V3_BASE}/collections`;
  const created = dataOf<any>(await nexusFetch<any>(endpoint, {
    accessToken,
    method: 'POST',
    body: {
      upload_id: uploadId,
      collection_data: nexusPayload
    }
  }));

  const slug = created.slug ? String(created.slug) : '';
  const createdCollectionId = String(created.collection_id ?? created.collectionId ?? created.id ?? collectionId ?? '');
  const collectionUrl = slug ? `https://next.nexusmods.com/${enrichedDraft.game}/collections/${slug}` : undefined;
  if (createdCollectionId) {
    await updateCollectionDetails(accessToken, createdCollectionId, enrichedDraft, categoryId);
  }

  return {
    ok: true,
    collectionId: createdCollectionId,
    slug: slug || enrichedDraft.slug,
    collectionUrl: created.url ?? created.collection_url ?? created.collectionUrl ?? collectionUrl,
    revisionId: String(created.revision_id ?? created.revisionId ?? created.id ?? ''),
    uploadId,
    categoryId,
    manifest
  };
}

export async function listUserCollections(accessToken: string): Promise<{ collections: UserCollection[]; source: string; message?: string }> {
  if (isMockMode()) {
    return {
      source: 'mock',
      collections: [
        {
          id: 'mock-collection-1',
          slug: 'mock-combat-pack',
          title: 'Mock Combat Pack',
          description: 'Example collection for testing the edit flow.',
          game: 'skyrimspecialedition',
          revisionId: 'mock-rev-1',
          revisionNumber: 1,
          status: 'draft',
          url: 'https://next.nexusmods.com/skyrimspecialedition/collections/mock-combat-pack'
        }
      ]
    };
  }

  const template = process.env.NEXUS_COLLECTIONS_LIST_URL_TEMPLATE;
  if (!template) {
    return {
      source: 'not-configured',
      collections: []
    };
  }

  const url = renderTemplate(template, { base: V3_BASE });
  const raw = await nexusFetch<any>(url, { accessToken });
  return { source: 'api', collections: normalizeCollectionList(raw) };
}
