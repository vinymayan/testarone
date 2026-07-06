export type Game = {
  domainName: string;
  name: string;
  image: string;
};

export type ModSummary = {
  game: string;
  modId: number;
  name: string;
  author: string;
  summary: string;
  thumbnail: string;
  version: string;
  category: string;
  downloads: number;
  endorsements: number;
  updatedAt: string;
  adult?: boolean;
  available: boolean;
};

export type ModFile = {
  id: number;
  name: string;
  version: string;
  category: 'MAIN' | 'OPTIONAL' | 'OLD_VERSION' | 'MISCELLANEOUS' | string;
  uploadedAt?: string;
  sizeBytes?: number;
  md5?: string;
  description?: string;
  isPrimary?: boolean;
};

export type CollectionItem = {
  localId: string;
  game: string;
  modId: number;
  modName: string;
  author: string;
  thumbnail: string;
  fileId?: number;
  fileName?: string;
  fileVersion?: string;
  fileCategory?: string;
  fileSizeBytes?: number;
  fileMd5?: string;
  required: boolean;
  installOrder: number;
  notes?: string;
  status: 'ok' | 'missing-file' | 'unavailable';
};

export type CollectionDraft = {
  id?: string;
  slug?: string;
  title: string;
  summary?: string;
  description: string;
  preserveDescription?: boolean;
  category: string;
  visibility: 'public' | 'private';
  game: string;
  coverImage?: string;
  items: CollectionItem[];
};

export type PublishResult = {
  ok: boolean;
  collectionId?: string;
  slug?: string;
  collectionUrl?: string;
  revisionId?: string;
  uploadId?: string;
  categoryId?: number | null;
  manifest?: unknown;
  message?: string;
};

export type UserCollection = {
  id: string;
  slug?: string;
  title: string;
  description?: string;
  game: string;
  revisionId?: string;
  revisionNumber?: number;
  status?: string;
  url?: string;
  items?: CollectionItem[];
  editable?: boolean;
};
