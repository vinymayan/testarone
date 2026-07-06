import type { CollectionDraft, CollectionItem } from './types';

function cleanText(value?: string | null) {
  return String(value || '').trim();
}

function fileSizeBytes(sizeBytes?: number) {
  return sizeBytes && Number.isFinite(sizeBytes) && sizeBytes > 0
    ? Math.round(sizeBytes)
    : null;
}

function fileSizeKb(sizeBytes?: number) {
  return sizeBytes && Number.isFinite(sizeBytes) && sizeBytes > 0
    ? Math.max(1, Math.ceil(sizeBytes / 1024))
    : null;
}

function sourceTag(item: CollectionItem, index: number) {
  const input = `${item.game}:${item.modId}:${item.fileId}:${index}`;
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0).toString(36).padStart(8, '0').slice(0, 10);
}

function manifestMods(draft: CollectionDraft) {
  return draft.items
    .filter((item) => item.fileId)
    .map((item, index) => ({
      name: item.modName,
      version: cleanText(item.fileVersion) || '1.0.0',
      optional: !item.required,
      domainName: item.game,
      source: {
        type: 'nexus',
        modId: item.modId,
        fileId: item.fileId,
        md5: cleanText(item.fileMd5) || null,
        fileSize: fileSizeBytes(item.fileSizeBytes),
        logicalFilename: cleanText(item.fileName) || item.modName,
        updatePolicy: cleanText(item.fileMd5) ? 'exact' : 'prefer',
        tag: sourceTag(item, index)
      },
      author: cleanText(item.author) || null,
      details: {
        category: cleanText(item.fileCategory),
        type: ''
      },
      phase: 0
    }));
}

export function buildCollectionManifest(draft: CollectionDraft, author = 'Create List') {
  const description = cleanText(draft.description);
  const summary = cleanText(draft.summary);

  return {
    info: {
      author,
      authorUrl: '',
      name: cleanText(draft.title),
      description,
      summary: summary || null,
      installInstructions: '',
      domainName: draft.game,
      gameVersions: []
    },
    mods: manifestMods(draft),
    modRules: [],
    tools: [],
    plugins: [],
    pluginRules: {
      plugins: [],
      groups: []
    },
    collectionConfig: {
      recommendNewProfile: false
    }
  };
}

function nexusManifest(draft: CollectionDraft, author = 'Create List') {
  return {
    info: {
      author,
      author_url: null,
      name: cleanText(draft.title),
      description: cleanText(draft.description) || null,
      summary: cleanText(draft.summary) || null,
      domain_name: draft.game,
      game_versions: null
    },
    mods: draft.items
      .filter((item) => item.fileId)
      .map((item) => ({
        name: item.modName,
        version: cleanText(item.fileVersion) || '1.0.0',
        optional: !item.required,
        domain_name: item.game,
        author: cleanText(item.author) || null,
        source: {
          type: 'nexus',
          mod_id: String(item.modId),
          file_id: String(item.fileId),
          update_policy: cleanText(item.fileMd5) ? 'exact' : 'prefer',
          logical_filename: cleanText(item.fileName) || null,
          file_expression: null,
          md5: cleanText(item.fileMd5) || null,
          file_size: fileSizeKb(item.fileSizeBytes),
          url: null,
          adult_content: false
        }
      }))
  };
}

export function buildNexusCollectionPayload(draft: CollectionDraft, author = 'Create List') {
  return {
    adult_content: false,
    collection_schema_id: Number(process.env.NEXUS_COLLECTION_SCHEMA_ID || '1'),
    collection_manifest: nexusManifest(draft, author)
  };
}

export function validateDraftForPublish(draft: CollectionDraft): string[] {
  const errors: string[] = [];

  if (!cleanText(draft.title)) errors.push('Collection title is required.');
  if (!cleanText(draft.game)) errors.push('Game is required.');
  if (!draft.items.length) errors.push('Add at least one mod.');

  draft.items.forEach((item, index) => {
    if (!item.modId) errors.push(`Item ${index + 1}: mod_id is missing.`);
    if (!item.fileId) errors.push(`${item.modName}: choose a file before publishing.`);
    if (!item.fileSizeBytes || !Number.isFinite(item.fileSizeBytes) || item.fileSizeBytes <= 0) {
      errors.push(`${item.modName} / ${item.fileName || item.fileId}: file size is missing from Nexus API response.`);
    }
    if (item.status === 'unavailable') errors.push(`${item.modName}: mod is unavailable.`);
  });

  return errors;
}
