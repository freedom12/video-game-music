export type CollectionStatus = 'draft' | 'published';

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
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

export interface TrackDetail {
  publicId: string;
  title: string;
  artist: string;
  durationSeconds: number;
  format: string;
  year?: number;
  genre?: string;
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
