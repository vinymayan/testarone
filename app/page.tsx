'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  X,
  Copy,
  Eye,
  FileJson,
  GripVertical,
  Loader2,
  LogOut,
  Pause,
  Play,
  Plus,
  RefreshCw,
  ShieldCheck,
  Star,
  Trash2,
  UploadCloud
} from 'lucide-react';
import { FEATURED_MODS, type FeaturedMod } from '@/lib/featured-mods';
import type { CollectionDraft, CollectionItem, Game, ModFile, ModSummary, PublishResult, UserCollection } from '@/lib/types';

type ApiState<T> = {
  loading: boolean;
  error: string;
  data?: T;
};

type View = 'login' | 'dashboard' | 'my-collections' | 'game' | 'builder' | 'publish' | 'success' | 'terms' | 'privacy';

type OpenedModDetails = {
  key: string;
  input: string;
  mod: ModSummary;
  files: ModFile[];
  selectedFileIds: number[];
  collapsed?: boolean;
  error?: string;
};

type AuthSessionPayload = {
  authenticated: boolean;
  user?: unknown;
  expiresAt?: number | null;
  message?: string;
};

const DEFAULT_GAME = 'skyrimspecialedition';
const SAVED_COLLECTIONS_KEY = 'ncb_saved_collections';
const HIDDEN_COLLECTIONS_KEY = 'ncb_hidden_collections';
const COLLECTION_CATEGORIES = ['Total Overhaul', 'Themed', 'Vanilla Plus', 'Essentials', 'Miscellaneous'];

function HydrationSafeIcon({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return <span className="icon-slot" suppressHydrationWarning>{mounted ? children : null}</span>;
}

function formatBytes(bytes?: number) {
  if (!bytes) return '-';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(size >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function groupFiles(files: ModFile[]) {
  const groups: Record<string, ModFile[]> = {
    MAIN: [],
    OPTIONAL: [],
    OLD_VERSION: [],
    MISCELLANEOUS: []
  };

  for (const file of files) {
    const key = String(file.category || 'MISCELLANEOUS').toUpperCase();
    if (key.includes('MAIN')) groups.MAIN.push(file);
    else if (key.includes('OPTIONAL')) groups.OPTIONAL.push(file);
    else if (key.includes('OLD')) groups.OLD_VERSION.push(file);
    else groups.MISCELLANEOUS.push(file);
  }

  return groups;
}

function groupTitle(group: string) {
  if (group === 'MAIN') return 'Main files';
  if (group === 'OPTIONAL') return 'Optional files';
  if (group === 'OLD_VERSION') return 'Old files';
  return 'Other files';
}

function createCollectionItem(mod: ModSummary, file: ModFile, installOrder = 1): CollectionItem {
  return {
    localId: `${mod.game}-${mod.modId}-${file.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    game: mod.game,
    modId: mod.modId,
    modName: mod.name,
    author: mod.author,
    thumbnail: mod.thumbnail,
    fileId: file.id,
    fileName: file.name,
    fileVersion: file.version || mod.version,
    fileCategory: file.category,
    fileSizeBytes: file.sizeBytes,
    fileMd5: file.md5,
    required: true,
    installOrder,
    status: mod.available ? 'ok' : 'unavailable'
  };
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || payload.error || `Request failed: ${response.status}`);
  }
  return payload as T;
}

function parseModId(value: string) {
  const urlMatch = value.match(/nexusmods\.com\/([^/]+)\/mods\/(\d+)/i);
  if (urlMatch) return { game: urlMatch[1].toLowerCase(), modId: Number(urlMatch[2]), isUrl: true };
  const idMatch = value.trim().match(/^\d+$/);
  if (idMatch) return { game: '', modId: Number(idMatch[0]), isUrl: false };
  return null;
}

function parseModInputs(value: string) {
  return value
    .split(',')
    .map((input) => input.trim())
    .filter(Boolean)
    .map((input) => ({ input, parsed: parseModId(input) }));
}

function parseCollectionUrl(value: string) {
  const match = value.trim().match(/(?:next\.nexusmods\.com\/([^/]+)|(?:www\.)?nexusmods\.com\/games\/([^/]+))\/collections\/([^/?#]+)(?:\/revisions\/(\d+))?/i);
  if (!match) return null;
  const game = (match[1] || match[2]).toLowerCase();
  const slug = decodeURIComponent(match[3]);
  const revisionNumber = match[4] ? Number(match[4]) : undefined;
  return {
    game,
    slug,
    revisionNumber,
    url: `https://next.nexusmods.com/${game}/collections/${slug}`
  };
}

function normalizeLinkedCollection(collection: UserCollection): UserCollection {
  if (!collection.id.startsWith('link:')) return collection;
  const slug = collection.slug || collection.id.split(':').pop() || '';
  if (!slug) return collection;
  return {
    ...collection,
    id: slug,
    slug,
    url: collection.url || `https://next.nexusmods.com/${collection.game}/collections/${slug}`,
    editable: true
  };
}

function managerCollectionKey(collection: UserCollection) {
  return collection.id || collection.slug || collection.url || collection.title;
}

export default function Home() {
  const [view, setView] = useState<View>('login');
  const [featuredMods, setFeaturedMods] = useState<FeaturedMod[]>(FEATURED_MODS);
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [featuredAutoplay, setFeaturedAutoplay] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [auth, setAuth] = useState<ApiState<AuthSessionPayload>>({ loading: true, error: '' });
  const [games, setGames] = useState<Game[]>([]);
  const [selectedGame, setSelectedGame] = useState(DEFAULT_GAME);
  const [editingCollection, setEditingCollection] = useState<UserCollection | null>(null);
  const [savedCollections, setSavedCollections] = useState<UserCollection[]>([]);
  const [hiddenCollectionKeys, setHiddenCollectionKeys] = useState<string[]>([]);
  const [myCollections, setMyCollections] = useState<ApiState<{ collections: UserCollection[]; source: string; message?: string }>>({ loading: false, error: '' });
  const [collectionLinkInput, setCollectionLinkInput] = useState('');
  const [collectionLinkError, setCollectionLinkError] = useState('');
  const [collectionImportState, setCollectionImportState] = useState<ApiState<UserCollection>>({ loading: false, error: '' });
  const [myCollectionTextFilter, setMyCollectionTextFilter] = useState('');
  const [myCollectionGameFilter, setMyCollectionGameFilter] = useState('all');
  const [modInput, setModInput] = useState('');
  const [modState, setModState] = useState<ApiState<{ mod: ModSummary }>>({ loading: false, error: '' });
  const [filesState, setFilesState] = useState<ApiState<{ files: ModFile[] }>>({ loading: false, error: '' });
  const [openedMods, setOpenedMods] = useState<OpenedModDetails[]>([]);
  const [collection, setCollection] = useState<CollectionItem[]>([]);
  const [collectionTextFilter, setCollectionTextFilter] = useState('');
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [draftMeta, setDraftMeta] = useState({
    title: 'My Collection',
    summary: '',
    description: '',
    preserveDescription: false,
    category: COLLECTION_CATEGORIES[0],
    visibility: 'public' as 'public' | 'private'
  });
  const [publishState, setPublishState] = useState<ApiState<PublishResult>>({ loading: false, error: '' });

  useEffect(() => {
    api<{ games: Game[] }>('/api/games').then((res) => setGames(res.games)).catch(() => undefined);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authError = params.get('auth_error');
    if (authError) {
      setAuth({ loading: false, error: `Nexus OAuth failed: ${authError}` });
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }

    api<AuthSessionPayload>('/api/auth/session')
      .then((session) => {
        if (session.authenticated) {
          setAuthed(true);
          setAuth({ loading: false, error: '', data: session });
          setView('dashboard');
          return;
        }

        setAuthed(false);
        setAuth({ loading: false, error: '' });
      })
      .catch((error: any) => {
        setAuthed(false);
        setAuth({ loading: false, error: error.message || 'Could not load OAuth session.' });
      });
  }, []);

  useEffect(() => {
    api<{ featuredMods: FeaturedMod[] }>('/api/featured-mods')
      .then((res) => {
        if (res.featuredMods.length) {
          setFeaturedMods(res.featuredMods);
          setFeaturedIndex(0);
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const seen = new Set<string>();
    for (const mod of featuredMods) {
      if (!mod.cover || seen.has(mod.cover)) continue;
      seen.add(mod.cover);
      const image = new Image();
      image.src = mod.cover;
    }
  }, [featuredMods]);

  useEffect(() => {
    if (!featuredAutoplay || view !== 'login' || featuredMods.length < 2) return;
    const timer = window.setInterval(() => {
      setFeaturedIndex((index) => (index + 1) % featuredMods.length);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [featuredAutoplay, featuredMods.length, view]);

  useEffect(() => {
    const saved = localStorage.getItem('ncb_collection');
    if (!saved) return;
    try {
      setCollection(JSON.parse(saved) as CollectionItem[]);
    } catch {
      localStorage.removeItem('ncb_collection');
    }
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(SAVED_COLLECTIONS_KEY);
    if (!saved) return;
    try {
      const normalized = (JSON.parse(saved) as UserCollection[]).map(normalizeLinkedCollection);
      setSavedCollections(normalized);
      localStorage.setItem(SAVED_COLLECTIONS_KEY, JSON.stringify(normalized));
    } catch {
      localStorage.removeItem(SAVED_COLLECTIONS_KEY);
    }
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(HIDDEN_COLLECTIONS_KEY);
    if (!saved) return;
    try {
      setHiddenCollectionKeys(JSON.parse(saved) as string[]);
    } catch {
      localStorage.removeItem(HIDDEN_COLLECTIONS_KEY);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('ncb_collection', JSON.stringify(collection));
  }, [collection]);

  const currentGame = useMemo(() => games.find((game) => game.domainName === selectedGame), [games, selectedGame]);
  const featuredMod = featuredMods[featuredIndex] || FEATURED_MODS[0];
  const lookupLoading = modState.loading || filesState.loading;
  const collectionOk = collection.length > 0 && collection.every((item) => item.status === 'ok' && item.fileId);
  const filteredCollection = collection.filter((item) => {
    const needle = collectionTextFilter.trim().toLowerCase();
    if (!needle) return true;
    return `${item.modName} ${item.fileName} ${item.author || ''} ${item.fileCategory || ''}`.toLowerCase().includes(needle);
  });

  const draft: CollectionDraft = useMemo(() => ({
    id: editingCollection?.editable === false ? undefined : editingCollection?.id,
    slug: editingCollection?.slug,
    title: draftMeta.title,
    summary: draftMeta.summary,
    description: draftMeta.description,
    preserveDescription: editingCollection ? draftMeta.preserveDescription : false,
    category: draftMeta.category,
    visibility: draftMeta.visibility,
    game: selectedGame,
    coverImage: collection[0]?.thumbnail,
    items: collection.map((item, index) => ({ ...item, installOrder: index + 1 }))
  }), [draftMeta, selectedGame, collection, editingCollection]);

  function startOAuthLogin() {
    setAuth({ loading: true, error: '' });
    window.location.assign('/api/auth/nexus/start?returnTo=/');
  }

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    setAuthed(false);
    setAuth({ loading: false, error: '' });
    setView('login');
  }

  function startCreate() {
    setEditingCollection(null);
    setCollection([]);
    setModInput('');
    setModState({ loading: false, error: '' });
    setFilesState({ loading: false, error: '' });
    setOpenedMods([]);
    setDraftMeta({
      title: 'My Collection',
      summary: '',
      description: '',
      preserveDescription: false,
      category: COLLECTION_CATEGORIES[0],
      visibility: 'public'
    });
    setView('game');
  }

  function saveKnownCollection(next: UserCollection) {
    const normalized: UserCollection = {
      ...next,
      editable: next.editable ?? !String(next.id).startsWith('link:')
    };
    const normalizedKey = managerCollectionKey(normalized);
    setHiddenCollectionKeys((items) => {
      const nextHidden = items.filter((key) => key !== normalizedKey);
      localStorage.setItem(HIDDEN_COLLECTIONS_KEY, JSON.stringify(nextHidden));
      return nextHidden;
    });
    setSavedCollections((items) => {
      const merged = [
        normalized,
        ...items.filter((item) => {
          const candidate = normalizeLinkedCollection(item);
          const candidateKey = candidate.id || candidate.slug || candidate.url || candidate.title;
          return candidateKey !== normalizedKey && candidate.slug !== normalized.slug && candidate.url !== normalized.url;
        })
      ];
      localStorage.setItem(SAVED_COLLECTIONS_KEY, JSON.stringify(merged));
      return merged;
    });
  }

  function addCollectionLink() {
    const parsed = parseCollectionUrl(collectionLinkInput);
    if (!parsed) {
      setCollectionLinkError('Enter a collection link in the format nexusmods.com/games/{game}/collections/{slug}.');
      return;
    }

    saveKnownCollection({
      id: parsed.slug,
      slug: parsed.slug,
      title: parsed.slug.replace(/[-_]+/g, ' '),
      description: '',
      game: parsed.game,
      revisionNumber: parsed.revisionNumber,
      url: parsed.url,
      editable: true
    });
    setCollectionLinkInput('');
    setCollectionLinkError('');
  }

  async function loadMyCollections() {
    setView('my-collections');
    setMyCollections({ loading: true, error: '' });
    try {
      const result = await api<{ collections: UserCollection[]; source: string; message?: string }>('/api/collections/list');
      setMyCollections({ loading: false, error: '', data: result });
    } catch (error: any) {
      setMyCollections({ loading: false, error: error.message || 'Could not load your collections.' });
    }
  }

  async function importCollectionFile(file?: File | null) {
    if (!file) return;
    setCollectionImportState({ loading: true, error: '' });
    try {
      const form = new FormData();
      form.append('file', file);
      const response = await fetch('/api/collections/import', {
        method: 'POST',
        body: form
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || 'Could not import collection.');

      let imported = await enrichImportedCollection(payload.collection as UserCollection);
      const parsedLink = parseCollectionUrl(collectionLinkInput);
      if (parsedLink) {
        imported = {
          ...imported,
          id: parsedLink.slug,
          slug: parsedLink.slug,
          game: parsedLink.game || imported.game,
          revisionNumber: parsedLink.revisionNumber,
          url: parsedLink.url,
          editable: true
        };
        setCollectionLinkInput('');
      }

      saveKnownCollection(imported);
      setCollectionImportState({ loading: false, error: '', data: imported });
      setCollectionLinkError('');
    } catch (error: any) {
      setCollectionImportState({ loading: false, error: error.message || 'Could not import collection.' });
    }
  }

  async function enrichImportedCollection(imported: UserCollection): Promise<UserCollection> {
    const items = imported.items || [];
    if (!items.length) return imported;

    const uniqueMods = [...new Map(items.map((item) => [`${item.game}:${item.modId}`, item])).values()];
    const modMap = new Map<string, ModSummary>();

    for (let index = 0; index < uniqueMods.length; index += 6) {
      const batch = uniqueMods.slice(index, index + 6);
      await Promise.all(batch.map(async (item) => {
        try {
          const result = await api<{ mod: ModSummary }>(`/api/mods/${encodeURIComponent(item.game)}/${item.modId}`);
          modMap.set(`${item.game}:${item.modId}`, result.mod);
        } catch {
          // Keep imported manifest data when Nexus metadata cannot be fetched.
        }
      }));
    }

    return {
      ...imported,
      items: items.map((item) => {
        const mod = modMap.get(`${item.game}:${item.modId}`);
        if (!mod) return item;
        return {
          ...item,
          modName: item.modName || mod.name,
          author: item.author || mod.author,
          thumbnail: mod.thumbnail || item.thumbnail,
          fileCategory: item.fileCategory || mod.category
        };
      })
    };
  }

  function removeCollectionFromManager(collectionInfo: UserCollection) {
    const key = managerCollectionKey(collectionInfo);
    if (!key) return;
    const confirmed = window.confirm(`Remove "${collectionInfo.title}" from My Collections? This does not delete it from Nexus Mods.`);
    if (!confirmed) return;

    setSavedCollections((items) => {
      const next = items.filter((item) => managerCollectionKey(item) !== key);
      localStorage.setItem(SAVED_COLLECTIONS_KEY, JSON.stringify(next));
      return next;
    });

    setHiddenCollectionKeys((items) => {
      const next = Array.from(new Set([...items, key]));
      localStorage.setItem(HIDDEN_COLLECTIONS_KEY, JSON.stringify(next));
      return next;
    });
  }

  function editExisting(collectionInfo: UserCollection) {
    setEditingCollection(collectionInfo);
    setSelectedGame(collectionInfo.game || DEFAULT_GAME);
    setDraftMeta({
      title: collectionInfo.title || 'My Collection',
      summary: collectionInfo.description || '',
      description: collectionInfo.description || '',
      preserveDescription: true,
      category: COLLECTION_CATEGORIES[0],
      visibility: 'public'
    });
    setCollection(collectionInfo.items || []);
    setModInput('');
    setModState({ loading: false, error: '' });
    setFilesState({ loading: false, error: '' });
    setOpenedMods([]);
    setView('builder');
  }

  async function openModDetails() {
    const entries = parseModInputs(modInput);
    if (!entries.length) {
      setModState({ loading: false, error: 'Enter one or more numeric IDs or Nexus Mods URLs.' });
      return;
    }

    const invalid = entries.find((entry) => !entry.parsed);
    if (invalid) {
      setModState({ loading: false, error: `Could not read "${invalid.input}". Separate IDs or URLs with commas.` });
      return;
    }

    const requests = entries.map((entry) => {
      const parsed = entry.parsed!;
      return {
        input: entry.input,
        game: parsed.game || selectedGame,
        modId: parsed.modId
      };
    });

    setSelectedGame(requests[0].game);
    setModState({ loading: true, error: '' });
    setFilesState({ loading: true, error: '' });

    const results: OpenedModDetails[] = await Promise.all(requests.map(async (request): Promise<OpenedModDetails> => {
      const modResult = await api<{ mod: ModSummary }>(`/api/mods/${encodeURIComponent(request.game)}/${request.modId}`);
      const fileResult = await api<{ files: ModFile[] }>(`/api/mods/${encodeURIComponent(request.game)}/${request.modId}/files`);
      const mainFiles = fileResult.files.filter((file) => String(file.category).toUpperCase().includes('MAIN'));
      return {
        key: `${modResult.mod.game}-${modResult.mod.modId}`,
        input: request.input,
        mod: modResult.mod,
        files: fileResult.files,
        selectedFileIds: (mainFiles.length ? mainFiles : fileResult.files.slice(0, 1)).map((file) => file.id)
      };
    }).map((promise): Promise<OpenedModDetails> => promise.catch((error: any) => ({
      key: `error-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      input: '',
      mod: {
        game: selectedGame,
        modId: 0,
        name: 'Unavailable mod',
        author: '',
        summary: '',
        thumbnail: '',
        version: '',
        category: '',
        downloads: 0,
        endorsements: 0,
        updatedAt: '',
        available: false
      },
      files: [],
      selectedFileIds: [],
      error: error.message || 'Could not open mod details.'
    }))));

    const errors = results.filter((result) => result.error).map((result) => result.error);
    const loaded = results.filter((result) => !result.error);
    setOpenedMods((items) => [
      ...items.filter((item) => !loaded.some((result) => result.key === item.key)),
      ...loaded
    ]);
    setModInput('');
    setModState({ loading: false, error: errors.join(' ') });
    setFilesState({ loading: false, error: '' });
  }

  function toggleFile(modKey: string, fileId: number) {
    setOpenedMods((items) => items.map((item) => item.key === modKey ? {
      ...item,
      selectedFileIds: item.selectedFileIds.includes(fileId)
        ? item.selectedFileIds.filter((id) => id !== fileId)
        : [...item.selectedFileIds, fileId]
    } : item));
  }

  function addSelectedFiles(modKey: string) {
    const openedMod = openedMods.find((item) => item.key === modKey);
    if (!openedMod || !openedMod.files.length) return;
    const selectedFiles = openedMod.files.filter((file) => openedMod.selectedFileIds.includes(file.id));
    if (!selectedFiles.length) return;
    setCollection((items) => [
      ...items,
      ...selectedFiles.map((file, index) => createCollectionItem(openedMod.mod, file, items.length + index + 1))
    ]);
    setOpenedMods((items) => items.map((item) => item.key === modKey ? { ...item, selectedFileIds: [] } : item));
  }

  function toggleOpenedMod(modKey: string) {
    setOpenedMods((items) => items.map((item) => item.key === modKey ? { ...item, collapsed: !item.collapsed } : item));
  }

  function closeOpenedMod(modKey: string) {
    setOpenedMods((items) => items.filter((item) => item.key !== modKey));
  }

  function removeItem(localId: string) {
    setCollection((items) => items.filter((item) => item.localId !== localId));
  }

  function moveItem(localId: string, direction: -1 | 1) {
    setCollection((items) => {
      const index = items.findIndex((item) => item.localId === localId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= items.length) return items;
      const copy = [...items];
      const [item] = copy.splice(index, 1);
      copy.splice(nextIndex, 0, item);
      return copy;
    });
  }

  function moveItemToPosition(localId: string, position: number) {
    setCollection((items) => {
      const index = items.findIndex((item) => item.localId === localId);
      if (index < 0) return items;
      const targetIndex = Math.max(0, Math.min(items.length - 1, Math.floor(position) - 1));
      const copy = [...items];
      const [item] = copy.splice(index, 1);
      copy.splice(targetIndex, 0, item);
      return copy;
    });
  }

  function dropItemOn(targetLocalId: string) {
    if (!draggedItemId || draggedItemId === targetLocalId) return;
    setCollection((items) => {
      const fromIndex = items.findIndex((item) => item.localId === draggedItemId);
      const toIndex = items.findIndex((item) => item.localId === targetLocalId);
      if (fromIndex < 0 || toIndex < 0) return items;
      const copy = [...items];
      const [item] = copy.splice(fromIndex, 1);
      copy.splice(toIndex, 0, item);
      return copy;
    });
    setDraggedItemId(null);
  }

  async function publishCollection() {
    setPublishState({ loading: true, error: '' });
    try {
      const result = await api<PublishResult>('/api/collections/publish', {
        method: 'POST',
        body: JSON.stringify(draft)
      });
      setPublishState({ loading: false, error: '', data: result });
      if (result.ok) {
        const collectionId = result.collectionId || editingCollection?.id;
        const slug = result.slug || editingCollection?.slug;
        if (collectionId) {
          saveKnownCollection({
            id: collectionId,
            slug,
            title: draft.title,
            description: draft.preserveDescription ? editingCollection?.description : draft.description,
            game: draft.game,
            revisionId: result.revisionId,
            url: result.collectionUrl || editingCollection?.url,
            items: draft.items,
            editable: true
          });
          setEditingCollection((current) => current ? { ...current, id: collectionId, slug, url: result.collectionUrl || current.url, editable: true } : current);
        }
        setView('success');
      }
    } catch (error: any) {
      setPublishState({ loading: false, error: error.message || 'Could not publish collection.' });
    }
  }

  function moveFeaturedMod(direction: -1 | 1) {
    setFeaturedIndex((index) => (index + direction + featuredMods.length) % featuredMods.length);
  }

  function renderLogin() {
    return (
      <main className="login-shell">
        <section className="stage-card narrow-stage login-only api-login-stage">
          <article
            className="featured-mod-panel"
          >
            <a
              className="featured-mod-art"
              href={featuredMod.url}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open ${featuredMod.name} on Nexus Mods`}
              style={{ backgroundImage: `url(${featuredMod.cover})` }}
            />
            <div className="featured-mod-copy">
              <div className="featured-kicker"><Star size={16} /> {featuredMod.badgeLabel || 'Featured mod'}</div>
              <h2>{featuredMod.name}</h2>
              <p>{featuredMod.details}</p>
              <div className="featured-tags">
                <span>{featuredMod.game}</span>
                <span>{featuredMod.category}</span>
              </div>
              <div className="featured-author">By {featuredMod.author}</div>
              <div className="featured-count">{String(featuredIndex + 1).padStart(2, '0')} <span>/ {String(featuredMods.length).padStart(2, '0')}</span></div>
            </div>
            <div className="featured-nav" onClick={(event) => event.stopPropagation()}>
              <button type="button" aria-label="Previous featured mod" onClick={() => moveFeaturedMod(-1)}>←</button>
              <button
                type="button"
                className="featured-autoplay-toggle"
                aria-label={featuredAutoplay ? 'Pause featured mods autoplay' : 'Play featured mods autoplay'}
                aria-pressed={featuredAutoplay}
                onClick={() => setFeaturedAutoplay((current) => !current)}
              >
                {featuredAutoplay ? <Pause size={22} /> : <Play size={22} />}
              </button>
              <button type="button" aria-label="Next featured mod" onClick={() => moveFeaturedMod(1)}>→</button>
            </div>
          </article>

          <aside className="api-auth-panel">
            <div className="api-brand">
              <div className="api-logo-mark">
                <img src="/logo.svg" alt="" />
                <span className="api-accent" />
              </div>
              <div>
                <h1>Simple Collection Manager</h1>
              </div>
            </div>

            <div className="api-form-copy">
              <h2>Connect your Nexus Mods account</h2>
              <p>Use your Nexus account to browse files, create/edit and publish collections.</p>
            </div>

            <button className="btn btn-primary full api-submit" disabled={auth.loading} onClick={startOAuthLogin}>
              {auth.loading ? <Loader2 size={16} className="spin" /> : <HydrationSafeIcon><ShieldCheck size={16} /></HydrationSafeIcon>}
              Continue with Nexus Mods
            </button>
            {auth.error ? <div className="error">{auth.error}</div> : null}

            <div className="external-links">
              <a href="https://www.patreon.com/c/xyzeroyx" target="_blank" rel="noreferrer">
                <img src="/patreon.svg" alt="" />
                Support the project
              </a>
              <a href="https://www.youtube.com/@vinyts3" target="_blank" rel="noreferrer" aria-label="YouTube">
                <img src="/youtube.svg" alt="" />
              </a>
              <a href="https://www.nexusmods.com/profile/xYZeroYx" target="_blank" rel="noreferrer" aria-label="Nexus Mods">
                <img src="/nexus.svg" alt="" />
              </a>
            </div>
            <div className="api-legal-links">
              <a href="/terms">Terms of Service</a>
              <a href="/privacy">Privacy Policy</a>
            </div>
          </aside>
        </section>
      </main>
    );
  }

  function renderPageHeading(title: ReactNode, subtitle?: ReactNode, actions?: ReactNode, showBack = view !== 'dashboard') {
    const showGameContext = showBack && view !== 'my-collections';

    return (
      <div className="page-heading">
        <div className="page-controls">
          {showBack ? (
            <button className="back-link" onClick={goBack}>
              <ArrowLeft size={15} /> Back
            </button>
          ) : (
            <span />
          )}
          <div className="page-session">
            {showGameContext ? <span className="badge">{currentGame?.name || selectedGame}</span> : null}
            <button className="back-link signout-link" onClick={logout}><LogOut size={15} /> Sign out</button>
          </div>
        </div>
        <div className="stage-head">
          <div>
            <h2>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          {actions ? <div className="page-actions">{actions}</div> : null}
        </div>
      </div>
    );
  }

  function goBack() {
    if (view === 'my-collections') setView('dashboard');
    else if (view === 'game') setView('dashboard');
    else if (view === 'builder') setView(editingCollection ? 'my-collections' : 'game');
    else if (view === 'publish') setView('builder');
    else if (view === 'success') setView('publish');
    else setView('dashboard');
  }

  function renderDashboard() {
    return (
      <section className="stage-card dashboard-stage">
        {renderPageHeading(
          'What do you want to do?',
          'Choose whether to edit an existing collection or create a new one.',
          undefined,
          false
        )}
        <div className="stage-scroll">
          <div className="choice-grid">
            <button className="flow-card" onClick={loadMyCollections}>
              <FileJson size={28} />
              <strong>Open my collections</strong>
              <span>Lists collections available to the validated API key and opens editing.</span>
              <ChevronRight size={18} />
            </button>
            <button className="flow-card" onClick={startCreate}>
              <Plus size={28} />
              <strong>Create collection</strong>
              <span>Choose the game and add mods by ID or URL.</span>
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </section>
    );
  }

  function renderMyCollections() {
    const apiCollections = myCollections.data?.collections || [];
    const collections = [...savedCollections, ...apiCollections].filter((item, index, list) => {
      const key = managerCollectionKey(item);
      if (hiddenCollectionKeys.includes(key)) return false;
      return list.findIndex((candidate) => managerCollectionKey(candidate) === key) === index;
    });
    const collectionGames = [...new Set(collections.map((item) => item.game).filter(Boolean))].sort();
    const filteredCollections = collections.filter((item) => {
      const text = myCollectionTextFilter.trim().toLowerCase();
      const matchesText = !text || `${item.title} ${item.description || ''} ${item.game || ''} ${item.slug || ''} ${item.url || ''}`.toLowerCase().includes(text);
      const matchesGame = myCollectionGameFilter === 'all' || item.game === myCollectionGameFilter;
      return matchesText && matchesGame;
    });

    return (
      <section className="stage-card collection-stage">
        {renderPageHeading(
          'My collections',
          'Collections returned for the current API key.',
          <button className="btn" onClick={loadMyCollections} disabled={myCollections.loading}>
            {myCollections.loading ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
            Refresh
          </button>
        )}
        <div className="stage-scroll">
          {myCollections.error ? <div className="error">{myCollections.error}</div> : null}
          <div className="tip collection-import-disclaimer">
            <strong>Collections added only by link may not load all collection data.</strong> For the best result, import the
            <strong><code>collection.json</code>, <code>.zip</code>, or <code>.7z</code></strong> file from
            <strong><code>AppData\Roaming\Vortex\downloads\gamename</code></strong>.
          </div>
          <div className="link-collection-panel">
            <div className="field">
              <label className="label">Add collection by link</label>
              <input
                className="input"
                value={collectionLinkInput}
                onChange={(event) => setCollectionLinkInput(event.target.value)}
                placeholder="https://www.nexusmods.com/games/skyrimspecialedition/collections/ebe5q6/revisions/1"
              />
            </div>
            <button className="btn btn-primary" onClick={addCollectionLink} disabled={!collectionLinkInput.trim()}>
              <Plus size={16} /> Add collection
            </button>
            <label className={`btn file-import-btn ${collectionImportState.loading ? 'disabled' : ''}`}>
              {collectionImportState.loading ? <Loader2 size={16} className="spin" /> : <UploadCloud size={16} />}
              Import JSON/ZIP
              <input
                type="file"
                accept=".json,.zip,.7z,.7zip,application/json,application/zip,application/x-7z-compressed"
                disabled={collectionImportState.loading}
                onChange={(event) => {
                  void importCollectionFile(event.target.files?.[0]);
                  event.currentTarget.value = '';
                }}
              />
            </label>
          </div>
          {collectionLinkError ? <div className="error">{collectionLinkError}</div> : null}
          {collectionImportState.error ? <div className="error">{collectionImportState.error}</div> : null}
          {collectionImportState.data ? <div className="success">Imported {collectionImportState.data.title}.</div> : null}
          <div className="collections-filter-panel">
            <div className="field">
              <label className="label">Filter collections</label>
              <input
                className="input"
                value={myCollectionTextFilter}
                onChange={(event) => setMyCollectionTextFilter(event.target.value)}
                placeholder="Title, description, slug, or URL"
              />
            </div>
            <div className="field">
              <label className="label">Game</label>
              <select className="select" value={myCollectionGameFilter} onChange={(event) => setMyCollectionGameFilter(event.target.value)}>
                <option value="all">All games</option>
                {collectionGames.map((game) => (
                  <option key={game} value={game}>{games.find((item) => item.domainName === game)?.name || game}</option>
                ))}
              </select>
            </div>
          </div>
          {myCollections.loading ? <div className="empty"><Loader2 size={18} className="spin" /> Loading collections...</div> : null}
          {!myCollections.loading && filteredCollections.length ? (
            <div className="collection-list">
              {filteredCollections.map((item) => (
                <article key={item.id} className="saved-collection">
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.description || 'No description available.'}</p>
                    <div className="mod-meta">
                      <span>{item.game}</span>
                      {item.revisionNumber ? <span>Revision {item.revisionNumber}</span> : null}
                      {item.status ? <span>{item.status}</span> : null}
                      {item.editable === false ? <span>saved link without id</span> : null}
                    </div>
                  </div>
                  <div className="saved-collection-actions">
                    <button className="btn btn-primary" disabled={item.editable === false} onClick={() => editExisting(item)}><Eye size={16} /> Edit</button>
                    <button className="btn btn-danger" onClick={() => removeCollectionFromManager(item)}><Trash2 size={16} /> Remove</button>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
          {!myCollections.loading && !filteredCollections.length && !myCollections.error ? (
            <div className="empty">{collections.length ? 'No collections match the current filters.' : 'No collections were returned for this API key.'}</div>
          ) : null}
        </div>
      </section>
    );
  }

  function renderGame() {
    return (
      <section className="stage-card">
        {renderPageHeading(
          'Choose the game',
          'After that, add mods by ID or URL.',
          <button className="btn btn-primary" onClick={() => setView('builder')} disabled={!selectedGame}>
            Continue <ChevronRight size={16} />
          </button>
        )}
        <div className="stage-scroll">
          <input className="input" value={selectedGame} onChange={(event) => setSelectedGame(event.target.value)} placeholder="Game domain" />
          <div className="game-grid large">
            {games.map((game) => (
              <button key={game.domainName} className={`game-card ${selectedGame === game.domainName ? 'active' : ''}`} onClick={() => setSelectedGame(game.domainName)}>
                <span>{game.name}</span>
              </button>
            ))}
          </div>
        </div>
      </section>
    );
  }

  function renderBuilder() {
    return (
      <section className="stage-card builder-stage">
        {renderPageHeading(
          editingCollection ? `Editing ${editingCollection.title}` : 'Create collection',
          'Add mods by ID or URL, open details, and select one or more files.',
          <button className="btn btn-primary" onClick={() => setView('publish')} disabled={!collection.length}>
            Collection details <ChevronRight size={16} />
          </button>
        )}

        <div className="stage-scroll builder-scroll">
          <div className="builder-layout">
            <div className="form-stack">
              <div className="lookup-panel">
                <div className="field">
                  <label className="label">Mod ID or URL</label>
                  <div className="inline-lookup">
                    <input
                      className="input"
                      value={modInput}
                      onChange={(event) => setModInput(event.target.value)}
                      placeholder="123, 456 or https://www.nexusmods.com/skyrimspecialedition/mods/123"
                      onKeyDown={(event) => event.key === 'Enter' && openModDetails()}
                    />
                    <button className="btn btn-primary" onClick={openModDetails} disabled={lookupLoading || !modInput.trim()}>
                      {lookupLoading ? <Loader2 size={16} className="spin" /> : <Eye size={16} />}
                      Open details
                    </button>
                  </div>
                </div>
                {modState.error ? <div className="error">{modState.error}</div> : null}
              </div>

              {lookupLoading ? <div className="empty"><Loader2 size={18} className="spin" /> Loading mod details...</div> : null}
              {openedMods.map((openedMod) => {
                const groupedOpenedFiles = groupFiles(openedMod.files);
                return (
                  <article className="opened-mod-panel" key={openedMod.key}>
                    <div className="mod-detail-panel">
                      <img src={openedMod.mod.thumbnail || '/mod-placeholder.svg'} alt={openedMod.mod.name} />
                      <div className="mod-detail-copy">
                        <div>
                          <h3>{openedMod.mod.name}</h3>
                          <div className="mod-meta">
                            <span>by {openedMod.mod.author}</span>
                            <span>{openedMod.mod.category}</span>
                          </div>
                          <p>{openedMod.mod.summary || 'No summary available.'}</p>
                        </div>
                        <div className="mod-detail-actions">
                          <button
                            className="icon-btn add-file-btn"
                            title="Add selected files"
                            onClick={() => addSelectedFiles(openedMod.key)}
                            disabled={!openedMod.selectedFileIds.length}
                          >
                            <Plus size={18} />
                          </button>
                          <button
                            className="icon-btn"
                            title={openedMod.collapsed ? 'Show files' : 'Hide files'}
                            onClick={() => toggleOpenedMod(openedMod.key)}
                          >
                            {openedMod.collapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
                          </button>
                          <button
                            className="icon-btn"
                            title="Close mod"
                            onClick={() => closeOpenedMod(openedMod.key)}
                          >
                            <X size={18} />
                          </button>
                        </div>
                      </div>
                    </div>

                    {!openedMod.collapsed ? <div className="file-groups">
                      {Object.entries(groupedOpenedFiles).map(([group, files]) => files.length ? (
                        <details className="file-group" key={group} open={group !== 'OLD_VERSION'}>
                          <summary>
                            <span>{groupTitle(group)}</span>
                            <small>{files.length}</small>
                          </summary>
                          {files.map((file) => (
                            <button
                              key={file.id}
                              className={`file-option ${openedMod.selectedFileIds.includes(file.id) ? 'active' : ''}`}
                              onClick={() => toggleFile(openedMod.key, file.id)}
                            >
                              <span className="checkbox-mark">{openedMod.selectedFileIds.includes(file.id) ? <Check size={13} /> : null}</span>
                              <div>
                                <strong>{file.name}</strong>
                                <div className="helper">Version {file.version || '-'} - {file.uploadedAt || '-'} - {formatBytes(file.sizeBytes)}</div>
                                {file.description ? <div className="helper">{file.description}</div> : null}
                              </div>
                            </button>
                          ))}
                        </details>
                      ) : null)}
                    </div> : null}
                  </article>
                );
              })}
            </div>

            <aside className="side-panel">
              <div className="side-head">
                <strong>Mods in collection</strong>
                <span>{collection.length}</span>
              </div>
              <div className="field">
                <label className="label">Filter mods</label>
                <input
                  className="input compact-input"
                  value={collectionTextFilter}
                  onChange={(event) => setCollectionTextFilter(event.target.value)}
                  placeholder="Mod or file name"
                />
              </div>
              <div className="mini-list">
                {filteredCollection.length ? filteredCollection.map((item) => {
                  const order = collection.findIndex((candidate) => candidate.localId === item.localId) + 1;
                  return (
                  <article
                    key={item.localId}
                    className={`mini-item ${draggedItemId === item.localId ? 'dragging' : ''}`}
                    draggable
                    onDragStart={() => setDraggedItemId(item.localId)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => dropItemOn(item.localId)}
                    onDragEnd={() => setDraggedItemId(null)}
                  >
                    <GripVertical className="drag-handle" size={16} />
                    <input
                      key={order}
                      className="order-input"
                      aria-label={`Order for ${item.modName}`}
                      defaultValue={order}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter') return;
                        const value = Number((event.currentTarget as HTMLInputElement).value);
                        if (Number.isFinite(value)) moveItemToPosition(item.localId, value);
                        (event.currentTarget as HTMLInputElement).blur();
                      }}
                      onBlur={(event) => {
                        event.currentTarget.value = String(collection.findIndex((candidate) => candidate.localId === item.localId) + 1);
                      }}
                    />
                    <img src={item.thumbnail || '/mod-placeholder.svg'} alt={item.modName} />
                    <div>
                      <strong>{item.modName}</strong>
                      <span>{item.fileName}</span>
                      <small>Version {item.fileVersion || '-'} - {formatBytes(item.fileSizeBytes)}</small>
                    </div>
                    <div className="mini-actions">
                      <button className="icon-btn" title="Remove" onClick={() => removeItem(item.localId)}><Trash2 size={15} /></button>
                    </div>
                  </article>
                  );
                }) : <div className="empty compact-empty">{collection.length ? 'No mods matched the filter.' : 'No files added.'}</div>}
              </div>
            </aside>
          </div>
        </div>
      </section>
    );
  }

  function renderPublish() {
    return (
      <section className="stage-card publish-stage">
        {renderPageHeading(
          'Collection details',
          'These fields go into the manifest sent to Nexus.'
        )}
        <div className="stage-scroll publish-scroll">
          <div className="publish-layout">
            <div className="form-stack">
              <div className="field">
                <label className="label">Title</label>
                <input className="input" value={draftMeta.title} onChange={(e) => setDraftMeta({ ...draftMeta, title: e.target.value })} />
              </div>
              <div className="field">
                <label className="label">Summary</label>
                <input
                  className="input"
                  value={draftMeta.summary}
                  maxLength={255}
                  onChange={(e) => setDraftMeta({ ...draftMeta, summary: e.target.value })}
                  placeholder="Short collection summary"
                />
                <span className="helper">{draftMeta.summary.length}/255</span>
              </div>
              <div className="field">
                <label className="label">Description</label>
                <textarea className="textarea" value={draftMeta.description} maxLength={1000} onChange={(e) => setDraftMeta({ ...draftMeta, description: e.target.value })} />
                <span className="helper">{draftMeta.description.length}/1000</span>
              </div>
              {editingCollection ? (
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={draftMeta.preserveDescription}
                    onChange={(e) => setDraftMeta({ ...draftMeta, preserveDescription: e.target.checked })}
                  />
                  <span>Do not change the current collection description when creating a revision</span>
                </label>
              ) : null}
              <div className="field">
                <label className="label">Category</label>
                <select className="select" value={draftMeta.category} onChange={(e) => setDraftMeta({ ...draftMeta, category: e.target.value })}>
                  {COLLECTION_CATEGORIES.map((category) => <option key={category}>{category}</option>)}
                </select>
              </div>
              <div className="visibility-grid">
                <button className={`choice ${draftMeta.visibility === 'public' ? 'active' : ''}`} onClick={() => setDraftMeta({ ...draftMeta, visibility: 'public' })}>
                  <span className="radio" /> Public <small>Anyone can see it</small>
                </button>
                <button className={`choice ${draftMeta.visibility === 'private' ? 'active' : ''}`} onClick={() => setDraftMeta({ ...draftMeta, visibility: 'private' })}>
                  <span className="radio" /> Private <small>Only you can see it</small>
                </button>
              </div>
              <div className={collectionOk ? 'success' : 'error'}>
                {collectionOk ? 'The collection is ready to publish.' : 'Add at least one valid file before publishing.'}
              </div>
              <div className="stage-actions">
                <button className="btn btn-primary" onClick={publishCollection} disabled={publishState.loading || !collectionOk}>
                  {publishState.loading ? <Loader2 size={16} className="spin" /> : <UploadCloud size={16} />}
                  {editingCollection ? 'Create revision' : 'Publish collection'}
                </button>
              </div>
              {publishState.error ? <div className="error">{publishState.error}</div> : null}
            </div>
            <aside className="publish-summary">
              <div className="side-head">
                <strong>Mods in collection</strong>
                <span>{collection.length}</span>
              </div>
              <div className="publish-mod-list">
                {collection.length ? collection.map((item, index) => (
                  <article className="publish-mod-item" key={item.localId}>
                    <span className="order-pill">{index + 1}</span>
                    <img src={item.thumbnail || '/mod-placeholder.svg'} alt={item.modName} />
                    <div>
                      <strong>{item.modName}</strong>
                      <span>{item.fileName}</span>
                      <small>Version {item.fileVersion || '-'} - {formatBytes(item.fileSizeBytes)}</small>
                    </div>
                  </article>
                )) : (
                  <div className="empty compact-empty">No files added.</div>
                )}
              </div>
            </aside>
          </div>
        </div>
      </section>
    );
  }

  function renderSuccess() {
    const result = publishState.data;
    const url = result?.collectionUrl || (editingCollection?.url ?? 'https://next.nexusmods.com/collections');

    return (
      <section className="stage-card success-stage">
        {renderPageHeading(
          editingCollection ? 'Revision created' : 'Collection published',
          'Publishing is complete and ready for review.'
        )}
        <div className="stage-scroll">
          <div className="success-content">
            <div className="big-check"><Check size={58} /></div>
            <h2>{editingCollection ? 'Revision created successfully!' : 'Collection published successfully!'}</h2>
            <p>The data was sent with the selected description and files in the manifest.</p>
            <article className="published-card">
              <img src={draft.coverImage || '/mod-placeholder.svg'} alt={draft.title} />
              <div>
                <h3>{draft.title}</h3>
                <p>{draft.description || 'No description.'}</p>
                <div className="mod-meta">
                  <span>{collection.length} files</span>
                  {result?.revisionId ? <span>Revision {result.revisionId}</span> : null}
                </div>
              </div>
            </article>
            <div className="copy-url">
              <span>{url}</span>
              <button className="icon-btn" title="Copy" onClick={() => navigator.clipboard?.writeText(url)}><Copy size={16} /></button>
            </div>
            <div className="stage-actions center">
              <button className="btn" onClick={() => setView('builder')}>Keep editing</button>
              <button className="btn btn-primary" onClick={startCreate}>New collection</button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  function renderLegal(kind: 'terms' | 'privacy') {
    const isTerms = kind === 'terms';

    return (
      <section className="stage-card legal-stage">
        {renderPageHeading(
          isTerms ? 'Terms of Service' : 'Privacy Policy',
          isTerms ? 'Usage terms for Simple Collection Manager.' : 'How the app handles your session and Nexus API key.'
        )}
        <div className="stage-scroll">
          <article className="legal-card in-app">
            {isTerms ? (
              <>
                <p>
                  Viny Mods provides Simple Collection Manager as an independent tool for organizing collections and
                  supporting workflows that use the Nexus Mods API.
                </p>
                <p>
                  You are responsible for how you use your API key, the data you submit, and your compliance with the
                  terms of any external services accessed through the app.
                </p>
                <p>This project is not affiliated with, endorsed by, or operated by Nexus Mods.</p>
              </>
            ) : (
              <>
                <p>
                  The API key you provide is used only to validate your session and perform the actions you request inside
                  the app.
                </p>
                <p>
                  The key is not stored in browser localStorage. It is kept in an encrypted HttpOnly cookie for the
                  session configured by the application.
                </p>
                <p>Viny Mods does not sell personal data and does not represent Nexus Mods.</p>
              </>
            )}
          </article>
        </div>
      </section>
    );
  }

  function renderSidebar() {
    const createActive = view === 'dashboard' || view === 'game' || view === 'builder' || view === 'publish' || view === 'success';
    const manageActive = view === 'my-collections';

    return (
      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <img src="/logo.svg" alt="" />
          <div>
            <strong>Simple</strong>
            <span>Collection Manager</span>
          </div>
        </div>
        <section className="sidebar-nexus-card">
          <img src="/nexus-mods-logo.svg" alt="Nexus Mods" />
          <nav className="sidebar-nav" aria-label="Nexus Mods collection navigation">
            <button className={`sidebar-link ${createActive ? 'active' : ''}`} onClick={startCreate}>
              <Plus size={20} />
              Create Collection
            </button>
            <button className={`sidebar-link ${manageActive ? 'active' : ''}`} onClick={loadMyCollections}>
              <FileJson size={20} />
              Manage Collections
            </button>
          </nav>
        </section>
        <div className="sidebar-footer">
          <span>Viny Mods</span>
          <div className="sidebar-social-links">
            <a href="https://www.patreon.com/c/xyzeroyx" target="_blank" rel="noreferrer" aria-label="Support the project on Patreon">
              <img src="/patreon.svg" alt="" />
            </a>
            <a href="https://www.youtube.com/@vinyts3" target="_blank" rel="noreferrer" aria-label="YouTube">
              <img src="/youtube.svg" alt="" />
            </a>
            <a href="https://www.nexusmods.com/profile/xYZeroYx" target="_blank" rel="noreferrer" aria-label="Nexus Mods">
              <img src="/nexus.svg" alt="" />
            </a>
          </div>
          <a href="https://www.patreon.com/c/xyzeroyx" target="_blank" rel="noreferrer">Support the project</a>
          <button type="button" onClick={() => setView('terms')}>Terms of Service</button>
          <button type="button" onClick={() => setView('privacy')}>Privacy Policy</button>
        </div>
      </aside>
    );
  }

  function renderView() {
    if (view === 'dashboard') return renderDashboard();
    if (view === 'my-collections') return renderMyCollections();
    if (view === 'game') return renderGame();
    if (view === 'builder') return renderBuilder();
    if (view === 'publish') return renderPublish();
    if (view === 'success') return renderSuccess();
    if (view === 'terms') return renderLegal('terms');
    if (view === 'privacy') return renderLegal('privacy');
    return null;
  }

  if (!authed) return renderLogin();

  return (
    <main className="app-workspace">
      {renderSidebar()}
      <div className="app-content">
        {renderView()}
      </div>
    </main>
  );
}
