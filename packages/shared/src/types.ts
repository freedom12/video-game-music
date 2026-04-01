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

// --- Generic Pagination ---

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

// --- List / Detail DTOs ---

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

export interface CollectionListItem {
  publicId: string;
  title: string;
  description?: string;
  status: CollectionStatus;
  trackCount: number;
}

export interface CollectionDetail extends CollectionListItem {
  tracks: Array<TrackListItem & { albumId?: string; albumTitle?: string }>;
}

export interface SeriesListItem {
  publicId: string;
  name: string;
  sortTitle: string;
  albumCount: number;
}

export interface SeriesDetail extends Omit<SeriesListItem, 'albumCount'> {
  albums: AlbumListItem[];
}

// --- Search DTOs ---

export interface LibrarySearchResult {
  albums: AlbumListItem[];
  tracks: Array<TrackListItem & { albumId?: string; albumTitle?: string }>;
}

export interface AlbumSearchItem extends AlbumListItem {
  seriesId?: string;
  seriesName?: string;
}

export type AlbumSearchResult = PaginatedResult<AlbumSearchItem>;

export interface TrackSearchItem extends TrackListItem {
  albumId?: string;
  albumTitle?: string;
  albumArtist?: string;
  year?: number;
  genre?: string;
}

export type TrackSearchResult = PaginatedResult<TrackSearchItem>;

// --- Library / Import ---

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

export interface TrackResponseItem extends TrackSearchItem {
  streamUrl: string;
  coverUrl?: string;
}

export type TrackSearchResponse = PaginatedResult<TrackResponseItem>;

export interface AlbumResponseItem extends AlbumSearchItem {
  coverUrl?: string;
}

export type AlbumSearchResponse = PaginatedResult<AlbumResponseItem>;

export interface ApiErrorResponse {
  code: string;
  message: string;
  details?: unknown;
}

export interface SimilarTrack {
  publicId: string;
  title: string;
  artist: string;
  durationSeconds: number;
  mediaAssetId: string;
  albumId?: string;
  albumTitle?: string;
  albumArtist?: string;
  similarityScore: number;
  melodySimilarity: number;
  overallSimilarity: number;
}

// --- Backward-compatible aliases (deprecated) ---
/** @deprecated Use CollectionListItem */
export type CollectionSummary = CollectionListItem;
/** @deprecated Use AlbumSearchResult */
export type AlbumsSearchResult = AlbumSearchResult;
/** @deprecated Use TrackSearchResult */
export type TracksSearchResult = TrackSearchResult;
/** @deprecated Use LibrarySearchResult */
export type SearchResult = LibrarySearchResult;
/** @deprecated Use TrackResponseItem */
export type TrackSearchItemResponse = TrackResponseItem;
/** @deprecated Use AlbumResponseItem */
export type AlbumSearchItemResponse = AlbumResponseItem;
/** @deprecated Use AlbumSearchResponse */
export type AlbumsSearchResponse = AlbumSearchResponse;
/** @deprecated Use TrackSearchResponse */
export type TracksSearchResponse = TrackSearchResponse;
/** @deprecated Use SimilarTrack */
export type SimilarTrackItem = SimilarTrack;
