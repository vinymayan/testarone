import type { ModFile, ModSummary } from './types';

const BASE = process.env.NEXUS_API_BASE || 'https://api.nexusmods.com/v1';
const V3_BASE = process.env.NEXUS_API_V3_BASE || 'https://api.nexusmods.com/v3';

export class NexusApiError extends Error {
  status: number;
  payload?: unknown;

  constructor(message: string, status: number, payload?: unknown) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

type FetchOptions = {
  accessToken: string;
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
};

export function isMockMode(): boolean {
  return process.env.NEXUS_MOCK_MODE === 'true';
}

export async function nexusFetch<T>(urlOrPath: string, options: FetchOptions): Promise<T> {
  const url = urlOrPath.startsWith('http') ? urlOrPath : `${BASE}${urlOrPath}`;
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bearer ${options.accessToken}`,
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: 'no-store'
  });

  const text = await response.text();
  let payload: unknown = text;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  if (!response.ok) {
    throw new NexusApiError(`Nexus API returned ${response.status}`, response.status, payload);
  }

  return payload as T;
}

export function extractNexusModUrl(value: string): { game: string; modId: number } | null {
  const match = value.match(/nexusmods\.com\/([^/]+)\/mods\/(\d+)/i);
  if (!match) return null;
  return { game: match[1].toLowerCase(), modId: Number(match[2]) };
}

export function normalizeMod(game: string, raw: any): ModSummary {
  const pageUrl = String(raw.mod_page_url ?? raw.modPageUrl ?? raw.url ?? '');
  const urlModId = extractNexusModUrl(pageUrl)?.modId;
  const modId = Number(raw.mod_id ?? raw.modId ?? raw.game_scoped_id ?? raw.gameScopedId ?? raw.id ?? raw.uid ?? urlModId);
  const picture = raw.picture_url ?? raw.pictureUrl ?? raw.thumbnail_url ?? raw.image ?? raw.mod_picture_url ?? '';
  return {
    game,
    modId,
    name: String(raw.name ?? raw.title ?? `Mod ${modId}`),
    author: String(raw.author ?? raw.uploaded_by ?? raw.user?.name ?? 'Unknown'),
    summary: String(raw.summary ?? raw.description ?? raw.short_description ?? ''),
    thumbnail: String(picture || '/mod-placeholder.svg'),
    version: String(raw.version ?? raw.latest_version ?? ''),
    category: String(raw.category_name ?? raw.category ?? 'Uncategorized'),
    downloads: Number(raw.downloads ?? raw.total_downloads ?? 0),
    endorsements: Number(raw.endorsements ?? raw.total_endorsements ?? 0),
    updatedAt: String(raw.updated_time ?? raw.updated_at ?? raw.date_updated ?? ''),
    adult: Boolean(raw.contains_adult_content ?? raw.adult ?? false),
    available: raw.available !== false && raw.status !== 'removed' && raw.status !== 'hidden'
  };
}

function normalizeModListPayload(raw: any): any[] {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.results)) return raw.results;
  if (Array.isArray(raw?.mods)) return raw.mods;
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw?.data?.mods)) return raw.data.mods;
  if (Array.isArray(raw?.data?.results)) return raw.data.results;
  return [];
}

function filterAndSortMods(mods: ModSummary[], params: {
  q: string;
  category?: string;
  sort?: string;
}) {
  const needle = params.q.trim().toLowerCase();
  const filtered = mods.filter((mod) =>
    (!needle || `${mod.name} ${mod.summary} ${mod.author}`.toLowerCase().includes(needle)) &&
    (!params.category || params.category === 'all' || mod.category.toLowerCase() === params.category.toLowerCase())
  );

  return [...filtered].sort((a, b) => {
    if (params.sort === 'downloads') return b.downloads - a.downloads;
    if (params.sort === 'updated') return String(b.updatedAt).localeCompare(String(a.updatedAt));
    return b.endorsements - a.endorsements;
  });
}

function normalizeFileListPayload(raw: any): any[] {
  if (Array.isArray(raw)) return raw;

  const root = raw?.data ?? raw;
  if (Array.isArray(root?.files)) return root.files;
  if (Array.isArray(root?.versions)) return root.versions;
  if (Array.isArray(root?.mod_file_versions)) return root.mod_file_versions;
  if (Array.isArray(root?.modFiles)) return root.modFiles;

  if (Array.isArray(root?.mod_files)) {
    return root.mod_files.flatMap((modFile: any) => {
      const versions = modFile.versions ?? modFile.file_versions ?? modFile.latest_versions;
      if (Array.isArray(versions) && versions.length) {
        return versions.map((version: any) => ({ ...version, mod_file: modFile }));
      }

      const latestVersion = modFile.latest_version ?? modFile.current_version ?? modFile.primary_version;
      return latestVersion ? [{ ...latestVersion, mod_file: modFile }] : [modFile];
    });
  }

  return [];
}

export function normalizeFiles(raw: any): ModFile[] {
  const files = normalizeFileListPayload(raw);
  return files.map((file: any): ModFile => {
    const nestedFile = file.file ?? file.physical_file ?? file.archive ?? {};
    const modFile = file.mod_file ?? file.modFile ?? {};
    const category = String(file.category_name ?? file.category ?? file.file_category ?? modFile.category ?? '').toUpperCase();
    const sizeBytes = parseFileSizeBytes(file);
    const md5 = String(file.md5 ?? file.file_md5 ?? file.hash ?? file.md5_hash ?? nestedFile.md5 ?? nestedFile.file_md5 ?? modFile.md5 ?? '').trim();
    return {
      id: Number(file.file_id ?? file.game_scoped_id ?? file.fileId ?? file.uid ?? file.id),
      name: String(file.name ?? file.file_name ?? nestedFile.name ?? modFile.name ?? `File ${file.file_id ?? file.game_scoped_id ?? file.id}`),
      version: String(file.version ?? file.file_version ?? file.version_string ?? ''),
      category: category || 'MISCELLANEOUS',
      uploadedAt: String(file.uploaded_timestamp ?? file.uploaded_time ?? file.date_uploaded ?? file.uploaded_at ?? ''),
      sizeBytes,
      md5: md5 || undefined,
      description: String(file.description ?? ''),
      isPrimary: Boolean(file.is_primary ?? file.primary ?? category === 'MAIN')
    };
  });
}

function numericValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return undefined;
  const normalized = value.replace(',', '.').replace(/[^\d.]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseSizeString(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return undefined;

  const match = value.trim().replace(',', '.').match(/([\d.]+)\s*(b|bytes?|kb|kib|mb|mib|gb|gib)?/i);
  if (!match) return undefined;

  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return undefined;

  const unit = (match[2] || 'b').toLowerCase();
  if (unit === 'gb' || unit === 'gib') return amount * 1024 * 1024 * 1024;
  if (unit === 'mb' || unit === 'mib') return amount * 1024 * 1024;
  if (unit === 'kb' || unit === 'kib') return amount * 1024;
  return amount;
}

function parseFileSizeBytes(file: any): number | undefined {
  const nestedFile = file.file ?? file.physical_file ?? file.archive ?? {};
  const modFile = file.mod_file ?? file.modFile ?? {};
  const byteFields = [
    file.size_bytes,
    file.file_size_bytes,
    file.size_in_bytes,
    file.file_size_in_bytes,
    file.bytes,
    nestedFile.size_bytes,
    nestedFile.file_size_bytes,
    nestedFile.size_in_bytes,
    nestedFile.file_size_in_bytes,
    nestedFile.bytes,
    modFile.size_bytes,
    modFile.file_size_bytes
  ];
  for (const value of byteFields) {
    const parsed = numericValue(value);
    if (parsed && parsed > 0) return Math.round(parsed);
  }

  const kbFields = [
    file.size_kb,
    file.file_size_kb,
    file.size_in_kb,
    file.file_size,
    nestedFile.size_kb,
    nestedFile.file_size_kb,
    nestedFile.size_in_kb,
    nestedFile.file_size,
    modFile.size_kb,
    modFile.file_size_kb
  ];
  for (const value of kbFields) {
    if (typeof value === 'string' && /[a-z]/i.test(value)) {
      const parsed = parseSizeString(value);
      if (parsed && parsed > 0) return Math.round(parsed);
      continue;
    }

    const parsed = numericValue(value);
    if (parsed && parsed > 0) return Math.round(parsed * 1024);
  }

  const formattedFields = [
    file.size_label,
    file.file_size_label,
    file.size_readable,
    file.filesize,
    file.file_size_text,
    nestedFile.size,
    nestedFile.size_label,
    nestedFile.file_size_label,
    nestedFile.size_readable,
    nestedFile.filesize,
    modFile.size,
    modFile.size_label
  ];
  for (const value of formattedFields) {
    const parsed = parseSizeString(value);
    if (parsed && parsed > 0) return Math.round(parsed);
  }

  const genericSize = numericValue(file.size);
  if (genericSize && genericSize > 0) return Math.round(genericSize * 1024);

  return undefined;
}

export async function getMod(accessToken: string, game: string, modId: number): Promise<ModSummary> {
  if (isMockMode()) {
    const item = MOCK_MODS.find((mod) => mod.game === game && mod.modId === modId) || MOCK_MODS[0];
    return { ...item, game, modId };
  }

  const raw = await nexusFetch<any>(`/games/${encodeURIComponent(game)}/mods/${modId}.json`, { accessToken });
  return normalizeMod(game, raw);
}

export async function getModFiles(accessToken: string, game: string, modId: number): Promise<ModFile[]> {
  if (isMockMode()) {
    return MOCK_FILES[modId] || MOCK_DEFAULT_FILES;
  }

  const raw = await nexusFetch<any>(`/games/${encodeURIComponent(game)}/mods/${modId}/files.json`, { accessToken });
  return normalizeFiles(raw);
}

async function searchTrendingMods(accessToken: string, params: {
  game: string;
  q: string;
  page: number;
  sort?: string;
  category?: string;
}): Promise<{ results: ModSummary[]; page: number; total?: number; source: 'trending-fallback' }> {
  const raw = await nexusFetch<any>(`${V3_BASE}/games/${encodeURIComponent(params.game)}/trending-mods`, { accessToken });
  const mods = normalizeModListPayload(raw)
    .map((item: any) => normalizeMod(params.game, item))
    .filter((mod) => Number.isFinite(mod.modId) && mod.modId > 0);
  const sorted = filterAndSortMods(mods, params);

  return {
    results: sorted.slice((params.page - 1) * 20, params.page * 20),
    page: params.page,
    total: sorted.length,
    source: 'trending-fallback'
  };
}

export async function searchMods(accessToken: string, params: {
  game: string;
  q: string;
  page: number;
  sort?: string;
  category?: string;
}): Promise<{ results: ModSummary[]; page: number; total?: number }> {
  const { game, q, page, sort, category } = params;
  const exact = extractNexusModUrl(q) || (/^\d+$/.test(q.trim()) ? { game, modId: Number(q.trim()) } : null);

  if (exact) {
    const mod = await getMod(accessToken, exact.game || game, exact.modId);
    return { results: [mod], page: 1, total: 1 };
  }

  if (isMockMode()) {
    const sorted = filterAndSortMods(MOCK_MODS.filter((mod) => mod.game === game), { q, category, sort });

    return { results: sorted.slice((page - 1) * 20, page * 20), page, total: sorted.length };
  }

  const template = process.env.NEXUS_SEARCH_URL_TEMPLATE;
  if (!template) {
    return searchTrendingMods(accessToken, { game, q, page, sort, category });
  }

  const url = template
    .replaceAll('{base}', BASE)
    .replaceAll('{game}', encodeURIComponent(game))
    .replaceAll('{q}', encodeURIComponent(q))
    .replaceAll('{page}', encodeURIComponent(String(page)))
    .replaceAll('{sort}', encodeURIComponent(sort || 'endorsements'))
    .replaceAll('{category}', encodeURIComponent(category || ''));

  const raw = await nexusFetch<any>(url, { accessToken });
  const list = normalizeModListPayload(raw);
  return {
    results: list.map((item: any) => normalizeMod(game, item)),
    page,
    total: Number(raw.total ?? raw.total_results ?? list.length)
  };
}

export const MOCK_MODS: ModSummary[] = [
  {
    game: 'skyrimspecialedition',
    modId: 1740,
    name: 'Modern Combat Overhaul',
    author: 'Oarinius',
    summary: 'A complete animation overhaul with modern combat behavior, fluid movement and attack chains.',
    thumbnail: 'https://images.unsplash.com/photo-1615412704911-55d589229864?q=80&w=800&auto=format&fit=crop',
    version: '1.3.2',
    category: 'Animation',
    downloads: 1200000,
    endorsements: 18600,
    updatedAt: '2026-05-20',
    available: true
  },
  {
    game: 'skyrimspecialedition',
    modId: 2580,
    name: 'True Directional Movement',
    author: 'Ersh',
    summary: 'Modernizes third-person movement and target lock systems.',
    thumbnail: 'https://images.unsplash.com/photo-1518709268805-4e9042af2176?q=80&w=800&auto=format&fit=crop',
    version: '2.2.4',
    category: 'Gameplay',
    downloads: 2500000,
    endorsements: 42800,
    updatedAt: '2026-04-10',
    available: true
  },
  {
    game: 'skyrimspecialedition',
    modId: 9910,
    name: 'Precision Combat Collisions',
    author: 'DServant',
    summary: 'Adds accurate hit collision for melee combat, spells and projectiles.',
    thumbnail: 'https://images.unsplash.com/photo-1604079628040-94301bb21b91?q=80&w=800&auto=format&fit=crop',
    version: '2.0.7',
    category: 'Combat',
    downloads: 980000,
    endorsements: 25000,
    updatedAt: '2026-02-28',
    available: true
  },
  {
    game: 'skyrimspecialedition',
    modId: 3301,
    name: 'Eclipse Combat Animations',
    author: 'VinyZero',
    summary: 'Fast-paced Nordic combat animations for sword, axe, mace and dual wield.',
    thumbnail: 'https://images.unsplash.com/photo-1533929736458-ca588d08c8be?q=80&w=800&auto=format&fit=crop',
    version: '2.1.0',
    category: 'Animation',
    downloads: 740000,
    endorsements: 12200,
    updatedAt: '2026-06-12',
    available: true
  },
  {
    game: 'skyrimspecialedition',
    modId: 4024,
    name: 'Ultimate Combat SE',
    author: 'tktk',
    summary: 'Expanded enemy AI, combat behavior and timed blocks.',
    thumbnail: 'https://images.unsplash.com/photo-1518709779341-56cf4535e94b?q=80&w=800&auto=format&fit=crop',
    version: '3.0.0',
    category: 'Combat',
    downloads: 3000000,
    endorsements: 50000,
    updatedAt: '2025-12-01',
    available: false
  }
];

const MOCK_DEFAULT_FILES: ModFile[] = [
  { id: 10001, name: 'Main File', version: '1.0.0', category: 'MAIN', uploadedAt: '2026-05-20', sizeBytes: 88_400_000, isPrimary: true },
  { id: 10002, name: 'Optional Patch', version: '1.0.0', category: 'OPTIONAL', uploadedAt: '2026-05-20', sizeBytes: 12_100_000 },
  { id: 10003, name: 'Old Version', version: '0.9.0', category: 'OLD_VERSION', uploadedAt: '2025-10-01', sizeBytes: 75_200_000 }
];

const MOCK_FILES: Record<number, ModFile[]> = {
  1740: [
    { id: 84321, name: 'MCO 1.3.2 - Main File', version: '1.3.2', category: 'MAIN', uploadedAt: '2026-05-20', sizeBytes: 88_400_000, isPrimary: true },
    { id: 84322, name: 'MCO - Precision Patch', version: '1.3.2', category: 'OPTIONAL', uploadedAt: '2026-05-20', sizeBytes: 12_100_000 },
    { id: 84323, name: 'MCO - Movement Patch', version: '1.3.2', category: 'OPTIONAL', uploadedAt: '2026-05-20', sizeBytes: 15_300_000 },
    { id: 80120, name: 'MCO 1.2.0', version: '1.2.0', category: 'OLD_VERSION', uploadedAt: '2025-10-01', sizeBytes: 75_200_000 }
  ],
  2580: [
    { id: 97101, name: 'True Directional Movement - Main', version: '2.2.4', category: 'MAIN', uploadedAt: '2026-04-10', sizeBytes: 23_700_000, isPrimary: true },
    { id: 97102, name: 'Controller Optional Preset', version: '2.2.4', category: 'OPTIONAL', uploadedAt: '2026-04-10', sizeBytes: 2_100_000 }
  ],
  9910: [
    { id: 50140, name: 'Precision Main File', version: '2.0.7', category: 'MAIN', uploadedAt: '2026-02-28', sizeBytes: 12_100_000, isPrimary: true }
  ],
  3301: [
    { id: 11112, name: 'Eclipse Combat Animations', version: '2.1.0', category: 'MAIN', uploadedAt: '2026-06-12', sizeBytes: 45_800_000, isPrimary: true },
    { id: 11113, name: 'Dual Wield Addon', version: '2.1.0', category: 'OPTIONAL', uploadedAt: '2026-06-12', sizeBytes: 18_000_000 }
  ]
};
