export type SyncStatus = 'pending' | 'synced' | 'failed';
export type PresenceStatus = 'active' | 'missing';
export type CoverSource = 'embedded' | 'external' | 'manual' | 'none';
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
  pictureCount?: number;
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
  sourceKey: string;
  relativePath: string;
  extension: string;
  mimeType: string;
  fileSize: number;
  modifiedAt: string;
  contentHash?: string;
  cosKey?: string;
  coverPath?: string;
  coverMimeType?: string;
  coverCosKey?: string;
  coverSource: CoverSource;
  syncStatus: SyncStatus;
  presenceStatus: PresenceStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AlbumRecord {
  publicId: string;
  albumKey: string;
  title: string;
  albumArtist: string;
  year?: number;
  sourceDirectory?: string;
  coverAssetId?: string;
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
  coverAssetId?: string;
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

export interface AlbumListItem {
  publicId: string;
  title: string;
  albumArtist: string;
  year?: number;
  trackCount: number;
  discCount: number;
  coverAssetId?: string;
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
  coverAssetId?: string;
  tracks: Array<TrackListItem & { albumId?: string; albumTitle?: string }>;
}

export interface SearchResult {
  albums: AlbumListItem[];
  tracks: Array<TrackListItem & { albumId?: string; albumTitle?: string }>;
}

export interface LibraryScanChange {
  sourceKey: string;
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

export interface ImportOptions {
  libraryRoot: string;
  cacheDir: string;
  includeHashes?: boolean;
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
