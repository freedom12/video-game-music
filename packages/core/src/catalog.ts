import type {
  AlbumDetail,
  AlbumListItem,
  CollectionDetail,
  SearchResult,
  SeriesDetail,
  SeriesListItem,
  TrackListItem,
} from '@vgm/shared';

import {
  all,
  get,
  mapAlbum,
  mapAlbumTrack,
  mapCollection,
  mapCollectionTrack,
  mapMediaAsset,
  mapTrack,
  placeholders,
  run,
} from './db.js';
import type { DatabaseContext } from './db.js';

function trackLabel(track: { displayTitle?: string; title: string }): string {
  return track.displayTitle || track.title;
}

function artistLabel(track: { displayArtist?: string; artist: string }): string {
  return track.displayArtist || track.artist;
}

function albumLabel(album: { displayTitle?: string; title: string }): string {
  return album.displayTitle || album.title;
}

function albumArtistLabel(album: { displayArtist?: string; albumArtist: string }): string {
  return album.displayArtist || album.albumArtist;
}

export async function listAlbums(context: DatabaseContext): Promise<AlbumListItem[]> {
  const rows = all<Record<string, unknown>>(context, `
    SELECT
      a.*,
      COUNT(at.trackId) AS trackCount,
      COUNT(DISTINCT at.discNumber) AS discCount
    FROM albums a
    LEFT JOIN albumTracks at ON at.albumId = a.publicId
    WHERE a.isSystemGenerated = 1 AND a.hidden = 0
    GROUP BY a.publicId
    ORDER BY a.sortTitle ASC, a.year ASC
  `);

  return rows.map((row) => {
    const album = mapAlbum(row);
    return {
      publicId: album.publicId,
      title: albumLabel(album),
      albumArtist: albumArtistLabel(album),
      year: album.year,
      coverAssetId: album.coverAssetId,
      trackCount: Number(row.trackCount ?? 0),
      discCount: Number(row.discCount ?? 0),
    };
  });
}

export async function getAlbumDetail(context: DatabaseContext, albumId: string): Promise<AlbumDetail | null> {
  const albumRow = get<Record<string, unknown>>(context, `
    SELECT *
    FROM albums
    WHERE publicId = ? AND hidden = 0
  `, [albumId]);

  if (!albumRow) {
    return null;
  }

  const album = mapAlbum(albumRow);
  const trackRows = all<Record<string, unknown>>(context, `
    SELECT
      at.albumId,
      at.trackId,
      at.discNumber,
      at.discTitle,
      at.trackNumber,
      at.sortOrder,
      at.createdAt AS albumTrackCreatedAt,
      t.*
    FROM albumTracks at
    INNER JOIN tracks t ON t.publicId = at.trackId
    WHERE at.albumId = ? AND t.hidden = 0
    ORDER BY at.sortOrder ASC
  `, [albumId]);

  const tracks: TrackListItem[] = trackRows.map((row) => ({
    publicId: String(row.publicId),
    title: typeof row.displayTitle === 'string' && row.displayTitle ? row.displayTitle : String(row.title),
    artist: typeof row.displayArtist === 'string' && row.displayArtist ? row.displayArtist : String(row.artist),
    durationSeconds: Number(row.durationSeconds ?? 0),
    trackNumber: Number(row.trackNumber ?? 0),
    discNumber: Number(row.discNumber ?? 1),
    discTitle: typeof row.discTitle === 'string' ? row.discTitle : undefined,
    mediaAssetId: String(row.mediaAssetId),
  }));

  return {
    publicId: album.publicId,
    title: albumLabel(album),
    albumArtist: albumArtistLabel(album),
    year: album.year,
    coverAssetId: album.coverAssetId,
    trackCount: tracks.length,
    discCount: new Set(tracks.map((item) => item.discNumber)).size,
    sourceDirectory: album.sourceDirectory,
    tracks,
  };
}

export async function getTrackById(context: DatabaseContext, trackId: string) {
  const row = get<Record<string, unknown>>(context, `
    SELECT *
    FROM tracks
    WHERE publicId = ? AND hidden = 0
  `, [trackId]);

  return row ? mapTrack(row) : null;
}

export async function getMediaAssetById(context: DatabaseContext, assetId: string) {
  const row = get<Record<string, unknown>>(context, `
    SELECT *
    FROM mediaAssets
    WHERE publicId = ? AND presenceStatus = 'active'
  `, [assetId]);

  return row ? mapMediaAsset(row) : null;
}

export async function listCollections(context: DatabaseContext): Promise<Array<{
  publicId: string;
  title: string;
  description?: string;
  status: 'draft' | 'published';
  coverAssetId?: string;
  trackCount: number;
}>> {
  const rows = all<Record<string, unknown>>(context, `
    SELECT
      c.*,
      COUNT(ct.trackId) AS trackCount
    FROM collections c
    LEFT JOIN collectionTracks ct ON ct.collectionId = c.publicId
    GROUP BY c.publicId
    ORDER BY c.updatedAt DESC
  `);

  return rows.map((row) => {
    const collection = mapCollection(row);
    return {
      publicId: collection.publicId,
      title: collection.title,
      description: collection.description,
      status: collection.status,
      coverAssetId: collection.coverAssetId,
      trackCount: Number(row.trackCount ?? 0),
    };
  });
}

export async function getCollectionDetail(context: DatabaseContext, collectionId: string): Promise<CollectionDetail | null> {
  const collectionRow = get<Record<string, unknown>>(context, `
    SELECT *
    FROM collections
    WHERE publicId = ?
  `, [collectionId]);

  if (!collectionRow) {
    return null;
  }

  const collection = mapCollection(collectionRow);
  const rows = all<Record<string, unknown>>(context, `
    SELECT
      ct.collectionId,
      ct.trackId AS collectionTrackId,
      ct.sortOrder AS collectionSortOrder,
      t.*,
      a.publicId AS albumPublicId,
      a.title AS albumTitle,
      a.displayTitle AS albumDisplayTitle
    FROM collectionTracks ct
    INNER JOIN tracks t ON t.publicId = ct.trackId
    LEFT JOIN albumTracks at ON at.trackId = t.publicId
    LEFT JOIN albums a ON a.publicId = at.albumId
    WHERE ct.collectionId = ? AND t.hidden = 0
    GROUP BY ct.collectionId, t.publicId
    ORDER BY ct.sortOrder ASC
  `, [collectionId]);

  return {
    publicId: collection.publicId,
    title: collection.title,
    description: collection.description,
    status: collection.status,
    coverAssetId: collection.coverAssetId,
    tracks: rows.map((row) => {
      const track = mapTrack(row);
      return {
        publicId: track.publicId,
        title: trackLabel(track),
        artist: artistLabel(track),
        durationSeconds: track.durationSeconds,
        trackNumber: track.sourceMeta.trackNumber ?? 0,
        discNumber: track.sourceMeta.discNumber ?? 0,
        mediaAssetId: track.mediaAssetId,
        albumId: typeof row.albumPublicId === 'string' ? row.albumPublicId : undefined,
        albumTitle: typeof row.albumDisplayTitle === 'string' && row.albumDisplayTitle
          ? row.albumDisplayTitle
          : typeof row.albumTitle === 'string'
            ? row.albumTitle
            : undefined,
      };
    }),
  };
}

export async function searchCatalog(context: DatabaseContext, query: string): Promise<SearchResult> {
  const keyword = `%${query.trim()}%`;
  const albumRows = query.trim()
    ? all<Record<string, unknown>>(context, `
      SELECT *
      FROM albums
      WHERE hidden = 0 AND (
        title LIKE ? OR
        COALESCE(displayTitle, '') LIKE ? OR
        albumArtist LIKE ? OR
        COALESCE(displayArtist, '') LIKE ?
      )
      ORDER BY sortTitle ASC, year ASC
      LIMIT 20
    `, [keyword, keyword, keyword, keyword])
    : [];

  const trackRows = query.trim()
    ? all<Record<string, unknown>>(context, `
      SELECT *
      FROM tracks
      WHERE hidden = 0 AND (
        title LIKE ? OR
        COALESCE(displayTitle, '') LIKE ? OR
        artist LIKE ? OR
        COALESCE(displayArtist, '') LIKE ? OR
        sourceMeta LIKE ?
      )
      ORDER BY title ASC
      LIMIT 30
    `, [keyword, keyword, keyword, keyword, keyword])
    : [];

  const tracks = trackRows.map(mapTrack);
  const links = tracks.length > 0
    ? all<Record<string, unknown>>(context, `
      SELECT *
      FROM albumTracks
      WHERE trackId IN (${placeholders(tracks.length)})
      ORDER BY sortOrder ASC
    `, tracks.map((track) => track.publicId)).map(mapAlbumTrack)
    : [];

  const firstAlbumMap = new Map<string, string>();
  for (const link of links) {
    if (!firstAlbumMap.has(link.trackId)) {
      firstAlbumMap.set(link.trackId, link.albumId);
    }
  }

  const albumIds = [...new Set(firstAlbumMap.values())];
  const relatedAlbums = albumIds.length > 0
    ? all<Record<string, unknown>>(context, `
      SELECT *
      FROM albums
      WHERE publicId IN (${placeholders(albumIds.length)})
    `, albumIds).map(mapAlbum)
    : [];
  const albumMap = new Map(relatedAlbums.map((album) => [album.publicId, album]));

  return {
    albums: albumRows.map((row) => {
      const album = mapAlbum(row);
      return {
        publicId: album.publicId,
        title: albumLabel(album),
        albumArtist: albumArtistLabel(album),
        year: album.year,
        coverAssetId: album.coverAssetId,
        trackCount: 0,
        discCount: 0,
      };
    }),
    tracks: tracks.map((track) => {
      const album = albumMap.get(firstAlbumMap.get(track.publicId) ?? '');
      return {
        publicId: track.publicId,
        title: trackLabel(track),
        artist: artistLabel(track),
        durationSeconds: track.durationSeconds,
        trackNumber: track.sourceMeta.trackNumber ?? 0,
        discNumber: track.sourceMeta.discNumber ?? 0,
        mediaAssetId: track.mediaAssetId,
        albumId: album?.publicId,
        albumTitle: album ? albumLabel(album) : undefined,
      };
    }),
  };
}

export async function patchTrack(context: DatabaseContext, trackId: string, input: Record<string, unknown>) {
  const entries = Object.entries(input).filter(([, value]) => value !== undefined);
  if (entries.length === 0) {
    return getTrackById(context, trackId);
  }

  const setClause = entries.map(([key]) => `${key} = ?`).join(', ');
  run(context, `
    UPDATE tracks
    SET ${setClause}, updatedAt = ?
    WHERE publicId = ?
  `, [...entries.map(([, value]) => value), new Date().toISOString(), trackId]);

  return getTrackById(context, trackId);
}

export async function patchAlbum(context: DatabaseContext, albumId: string, input: Record<string, unknown>) {
  const entries = Object.entries(input).filter(([, value]) => value !== undefined);
  if (entries.length === 0) {
    const row = get<Record<string, unknown>>(context, `SELECT * FROM albums WHERE publicId = ?`, [albumId]);
    return row ? mapAlbum(row) : null;
  }

  const setClause = entries.map(([key]) => `${key} = ?`).join(', ');
  run(context, `
    UPDATE albums
    SET ${setClause}, updatedAt = ?
    WHERE publicId = ?
  `, [...entries.map(([, value]) => value), new Date().toISOString(), albumId]);

  const row = get<Record<string, unknown>>(context, `SELECT * FROM albums WHERE publicId = ?`, [albumId]);
  return row ? mapAlbum(row) : null;
}

export async function createCollection(context: DatabaseContext, collection: {
  publicId: string;
  title: string;
  description?: string;
  coverAssetId?: string;
  status: 'draft' | 'published';
}) {
  const now = new Date().toISOString();
  run(context, `
    INSERT INTO collections (publicId, title, description, coverAssetId, status, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    collection.publicId,
    collection.title,
    collection.description ?? null,
    collection.coverAssetId ?? null,
    collection.status,
    now,
    now,
  ]);

  const row = get<Record<string, unknown>>(context, `SELECT * FROM collections WHERE publicId = ?`, [collection.publicId]);
  return row ? mapCollection(row) : null;
}

export async function patchCollection(context: DatabaseContext, collectionId: string, input: Record<string, unknown>) {
  const entries = Object.entries(input).filter(([, value]) => value !== undefined);
  if (entries.length === 0) {
    const row = get<Record<string, unknown>>(context, `SELECT * FROM collections WHERE publicId = ?`, [collectionId]);
    return row ? mapCollection(row) : null;
  }

  const setClause = entries.map(([key]) => `${key} = ?`).join(', ');
  run(context, `
    UPDATE collections
    SET ${setClause}, updatedAt = ?
    WHERE publicId = ?
  `, [...entries.map(([, value]) => value), new Date().toISOString(), collectionId]);

  const row = get<Record<string, unknown>>(context, `SELECT * FROM collections WHERE publicId = ?`, [collectionId]);
  return row ? mapCollection(row) : null;
}

export async function addTracksToCollection(context: DatabaseContext, collectionId: string, trackIds: string[]) {
  const lastRow = get<Record<string, unknown>>(context, `
    SELECT sortOrder
    FROM collectionTracks
    WHERE collectionId = ?
    ORDER BY sortOrder DESC
    LIMIT 1
  `, [collectionId]);

  let sortOrder = Number(lastRow?.sortOrder ?? 0);
  const now = new Date().toISOString();

  for (const trackId of trackIds) {
    sortOrder += 1;
    run(context, `
      INSERT OR IGNORE INTO collectionTracks (collectionId, trackId, sortOrder, createdAt)
      VALUES (?, ?, ?, ?)
    `, [collectionId, trackId, sortOrder, now]);
  }

  return getCollectionDetail(context, collectionId);
}

export async function listSeries(context: DatabaseContext): Promise<SeriesListItem[]> {
  const rows = all<Record<string, unknown>>(context, `
    SELECT
      s.*,
      COUNT(sa.albumId) AS albumCount
    FROM series s
    LEFT JOIN seriesAlbums sa ON sa.seriesId = s.publicId
    GROUP BY s.publicId
    ORDER BY s.sortTitle ASC
  `);

  return rows.map((row) => ({
    publicId: String(row.publicId),
    name: String(row.name),
    sortTitle: String(row.sortTitle),
    albumCount: Number(row.albumCount ?? 0),
  }));
}

export async function getSeriesDetail(context: DatabaseContext, seriesId: string): Promise<SeriesDetail | null> {
  const seriesRow = get<Record<string, unknown>>(context, `
    SELECT * FROM series WHERE publicId = ?
  `, [seriesId]);

  if (!seriesRow) {
    return null;
  }

  const albumRows = all<Record<string, unknown>>(context, `
    SELECT
      a.*,
      COUNT(at.trackId) AS trackCount,
      COUNT(DISTINCT at.discNumber) AS discCount
    FROM seriesAlbums sa
    INNER JOIN albums a ON a.publicId = sa.albumId
    LEFT JOIN albumTracks at ON at.albumId = a.publicId
    WHERE sa.seriesId = ? AND a.hidden = 0
    GROUP BY a.publicId
    ORDER BY (sa.sortOrder IS NULL) ASC, sa.sortOrder ASC, a.sortTitle ASC, a.year ASC
  `, [seriesId]);

  const albums: AlbumListItem[] = albumRows.map((row) => {
    const album = mapAlbum(row);
    return {
      publicId: album.publicId,
      title: albumLabel(album),
      albumArtist: albumArtistLabel(album),
      year: album.year,
      coverAssetId: album.coverAssetId,
      trackCount: Number(row.trackCount ?? 0),
      discCount: Number(row.discCount ?? 0),
    };
  });

  return {
    publicId: String(seriesRow.publicId),
    name: String(seriesRow.name),
    sortTitle: String(seriesRow.sortTitle),
    albums,
  };
}
