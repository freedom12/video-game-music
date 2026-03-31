export type SyncStatus = 'pending' | 'synced' | 'failed';
export type PresenceStatus = 'active' | 'missing';
export type CollectionStatus = 'draft' | 'published';

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
  status: CollectionStatus;
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

export interface AlbumListItem {
  publicId: string;
  title: string;
  albumArtist: string;
  year?: number;
  trackCount: number;
  discCount: number;
}

export interface TrackListItem {
  publicId: string;
  title: string;
  artist: string;
  durationSeconds: number;
  trackNumber: number;
  discNumber: number;
  discTitle?: string;
  mediaAssetId: string;
}

export interface AlbumDetail extends AlbumListItem {
  sourceDirectory?: string;
  tracks: TrackListItem[];
}

export interface CollectionDetail {
  publicId: string;
  title: string;
  description?: string;
  status: CollectionStatus;
  tracks: Array<TrackListItem & { albumId?: string; albumTitle?: string }>;
}

export interface SeriesListItem {
  publicId: string;
  name: string;
  sortTitle: string;
  albumCount: number;
}

export interface SeriesDetail {
  publicId: string;
  name: string;
  sortTitle: string;
  albums: AlbumListItem[];
}

export interface SearchResult {
  albums: AlbumListItem[];
  tracks: Array<TrackListItem & { albumId?: string; albumTitle?: string }>;
}

export interface AlbumSearchItem {
  publicId: string;
  title: string;
  albumArtist: string;
  year?: number;
  trackCount: number;
  discCount: number;
  seriesId?: string;
  seriesName?: string;
  coverUrl?: string;
}

export interface AlbumsSearchResult {
  items: AlbumSearchItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface TrackSearchItem {
  publicId: string;
  title: string;
  artist: string;
  durationSeconds: number;
  trackNumber: number;
  discNumber: number;
  discTitle?: string;
  mediaAssetId: string;
  albumId?: string;
  albumTitle?: string;
  albumArtist?: string;
  year?: number;
  genre?: string;
}

export interface TracksSearchResult {
  items: TrackSearchItem[];
  total: number;
  limit: number;
  offset: number;
}

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

// --- API Response DTOs ---
// These types represent the shapes returned by API endpoints, including computed URL fields.

export interface CollectionSummary {
  publicId: string;
  title: string;
  description?: string;
  status: CollectionStatus;
  trackCount: number;
}

export interface TrackSearchItemResponse extends TrackSearchItem {
  streamUrl: string;
  coverUrl?: string;
}

export interface TracksSearchResponse {
  items: TrackSearchItemResponse[];
  total: number;
  limit: number;
  offset: number;
}

export interface AlbumSearchItemResponse extends AlbumSearchItem {
  coverUrl?: string;
}

export interface AlbumsSearchResponse {
  items: AlbumSearchItemResponse[];
  total: number;
  limit: number;
  offset: number;
}

export interface ApiErrorResponse {
  code: string;
  message: string;
  details?: unknown;
}

export interface SimilarTrackItem {
  publicId: string;
  title: string;
  artist: string;
  durationSeconds: number;
  mediaAssetId: string;
  albumId?: string;
  albumTitle?: string;
  albumArtist?: string;
  similarityScore: number;
}
