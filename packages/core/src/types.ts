// --- Internal types: persistence models, import/sync infrastructure ---
// These types are internal to the core package and should NOT be re-exported to consumers.

export type SyncStatus = 'pending' | 'synced' | 'failed';
export type PresenceStatus = 'active' | 'missing';

export interface SourceMeta {
  title: string;
  album: string;
  artist: string;
  albumArtist: string;
  year?: number;
  genre?: string;
  trackNumber?: number;
  discNumber?: number;
  discTitle?: string;
  durationSeconds?: number;
}

export interface TrackRecord {
  publicId: string;
  mediaAssetId: string;
  title: string;
  artist: string;
  durationSeconds: number;
  format: string;
  year?: number;
  genre?: string;
  sourceMeta: SourceMeta;
  displayTitle?: string;
  displayArtist?: string;
  hidden?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MediaAssetRecord {
  publicId: string;
  relativePath: string;
  extension: string;
  mimeType: string;
  fileSize: number;
  modifiedAt: string;
  contentHash: string;
  syncStatus: SyncStatus;
  presenceStatus: PresenceStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AlbumRecord {
  publicId: string;
  title: string;
  albumArtist: string;
  year?: number;
  sourceDirectory?: string;
  sourceMeta: Pick<SourceMeta, 'album' | 'albumArtist' | 'year'>;
  displayTitle?: string;
  displayArtist?: string;
  hidden?: boolean;
  isSystemGenerated: boolean;
  sortTitle: string;
  createdAt: string;
  updatedAt: string;
}

export interface AlbumTrackRecord {
  albumId: string;
  trackId: string;
  discNumber: number;
  discTitle?: string;
  trackNumber: number;
  sortOrder: number;
  createdAt: string;
}

export interface CollectionRecord {
  publicId: string;
  title: string;
  description?: string;
  status: 'draft' | 'published';
  createdAt: string;
  updatedAt: string;
}

export interface CollectionTrackRecord {
  collectionId: string;
  trackId: string;
  sortOrder: number;
  createdAt: string;
}

export interface SeriesRecord {
  publicId: string;
  name: string;
  sortTitle: string;
  createdAt: string;
  updatedAt: string;
}

export interface SeriesAlbumRecord {
  seriesId: string;
  albumId: string;
  sortOrder?: number;
  createdAt: string;
}

// --- Import / Sync infrastructure ---

export interface LibraryScanChange {
  relativePath: string;
  kind: 'new' | 'updated' | 'missing' | 'unchanged';
}

export interface LibraryScanSummary {
  root: string;
  scannedAt: string;
  totals: {
    files: number;
    newFiles: number;
    updatedFiles: number;
    missingFiles: number;
    unchangedFiles: number;
    albums: number;
  };
  changes: LibraryScanChange[];
}

export interface ImportProgressEvent {
  phase: 'discover' | 'metadata' | 'write' | 'features' | 'rebuild' | 'done';
  message: string;
  processed?: number;
  total?: number;
  elapsedMs?: number;
}

export interface ImportOptions {
  libraryRoot: string;
  cacheDir: string;
  includeHashes?: boolean;
  onProgress?: (event: ImportProgressEvent) => void;
}

export interface SyncOptions {
  libraryRoot: string;
  cacheDir: string;
  cosBucket?: string;
  cosRegion?: string;
  cosSecretId?: string;
  cosSecretKey?: string;
  cosBasePrefix?: string;
}
