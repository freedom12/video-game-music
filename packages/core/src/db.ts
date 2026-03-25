import fs from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import type {
  AlbumRecord,
  AlbumTrackRecord,
  CollectionRecord,
  CollectionTrackRecord,
  MediaAssetRecord,
  SourceMeta,
  TrackRecord,
} from '@vgm/shared';

import type { AppConfig } from './config.js';

export interface DatabaseContext {
  db: DatabaseSync;
}

type Row = Record<string, unknown>;
type SqlValue = unknown;

let cachedContext: Promise<DatabaseContext> | undefined;

export async function getDatabase(config: AppConfig): Promise<DatabaseContext> {
  if (!cachedContext) {
    cachedContext = connectDatabase(config);
  }

  return cachedContext;
}

async function connectDatabase(config: AppConfig): Promise<DatabaseContext> {
  await fs.mkdir(path.dirname(config.databasePath), { recursive: true });
  const db = new DatabaseSync(config.databasePath);

  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = OFF;

    CREATE TABLE IF NOT EXISTS tracks (
      publicId TEXT PRIMARY KEY,
      mediaAssetId TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      artist TEXT NOT NULL,
      durationSeconds INTEGER NOT NULL,
      format TEXT NOT NULL,
      year INTEGER,
      genre TEXT,
      sourceMeta TEXT NOT NULL,
      displayTitle TEXT,
      displayArtist TEXT,
      hidden INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mediaAssets (
      publicId TEXT PRIMARY KEY,
      sourceKey TEXT NOT NULL UNIQUE,
      relativePath TEXT NOT NULL,
      extension TEXT NOT NULL,
      mimeType TEXT NOT NULL,
      fileSize INTEGER NOT NULL,
      modifiedAt TEXT NOT NULL,
      contentHash TEXT,
      cosKey TEXT,
      coverPath TEXT,
      coverMimeType TEXT,
      coverCosKey TEXT,
      coverSource TEXT NOT NULL,
      syncStatus TEXT NOT NULL,
      presenceStatus TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS albums (
      publicId TEXT PRIMARY KEY,
      albumKey TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      albumArtist TEXT NOT NULL,
      year INTEGER,
      sourceDirectory TEXT,
      coverAssetId TEXT,
      sourceMeta TEXT NOT NULL,
      displayTitle TEXT,
      displayArtist TEXT,
      hidden INTEGER NOT NULL DEFAULT 0,
      isSystemGenerated INTEGER NOT NULL DEFAULT 1,
      sortTitle TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS albumTracks (
      albumId TEXT NOT NULL,
      trackId TEXT NOT NULL,
      discNumber INTEGER NOT NULL,
      discTitle TEXT,
      trackNumber INTEGER NOT NULL,
      sortOrder INTEGER NOT NULL,
      createdAt TEXT NOT NULL,
      PRIMARY KEY (albumId, trackId)
    );

    CREATE TABLE IF NOT EXISTS collections (
      publicId TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      coverAssetId TEXT,
      status TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS collectionTracks (
      collectionId TEXT NOT NULL,
      trackId TEXT NOT NULL,
      sortOrder INTEGER NOT NULL,
      createdAt TEXT NOT NULL,
      PRIMARY KEY (collectionId, trackId)
    );

    CREATE INDEX IF NOT EXISTS idx_albums_sort ON albums(sortTitle, year);
    CREATE INDEX IF NOT EXISTS idx_album_tracks_album ON albumTracks(albumId, sortOrder);
    CREATE INDEX IF NOT EXISTS idx_collection_tracks_collection ON collectionTracks(collectionId, sortOrder);
    CREATE INDEX IF NOT EXISTS idx_media_assets_status ON mediaAssets(presenceStatus, syncStatus);
  `);

  return { db };
}

export async function closeDatabase(): Promise<void> {
  if (!cachedContext) {
    return;
  }

  const context = await cachedContext;
  context.db.close();
  cachedContext = undefined;
}

export function all<T extends Row>(context: DatabaseContext, sql: string, params: SqlValue[] = []): T[] {
  return context.db.prepare(sql).all(...(params as any[])) as T[];
}

export function get<T extends Row>(context: DatabaseContext, sql: string, params: SqlValue[] = []): T | undefined {
  return context.db.prepare(sql).get(...(params as any[])) as T | undefined;
}

export function run(context: DatabaseContext, sql: string, params: SqlValue[] = []) {
  return context.db.prepare(sql).run(...(params as any[]));
}

export function transaction<T>(context: DatabaseContext, work: () => T): T {
  context.db.exec('BEGIN');
  try {
    const result = work();
    context.db.exec('COMMIT');
    return result;
  } catch (error) {
    context.db.exec('ROLLBACK');
    throw error;
  }
}

export function encodeJson(value: unknown): string {
  return JSON.stringify(value);
}

export function decodeSourceMeta(value: unknown): SourceMeta {
  if (typeof value !== 'string') {
    return {
      title: '',
      album: '',
      artist: '',
      albumArtist: '',
    };
  }

  return JSON.parse(value) as SourceMeta;
}

export function toBool(value: unknown): boolean {
  return value === 1 || value === true;
}

export function toNullableNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

export function placeholders(count: number): string {
  return new Array(count).fill('?').join(', ');
}

export function mapTrack(row: Row): TrackRecord {
  return {
    publicId: String(row.publicId),
    mediaAssetId: String(row.mediaAssetId),
    title: String(row.title),
    artist: String(row.artist),
    durationSeconds: Number(row.durationSeconds ?? 0),
    format: String(row.format),
    year: toNullableNumber(row.year),
    genre: typeof row.genre === 'string' ? row.genre : undefined,
    sourceMeta: decodeSourceMeta(row.sourceMeta),
    displayTitle: typeof row.displayTitle === 'string' ? row.displayTitle : undefined,
    displayArtist: typeof row.displayArtist === 'string' ? row.displayArtist : undefined,
    hidden: toBool(row.hidden),
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  };
}

export function mapMediaAsset(row: Row): MediaAssetRecord {
  return {
    publicId: String(row.publicId),
    sourceKey: String(row.sourceKey),
    relativePath: String(row.relativePath),
    extension: String(row.extension),
    mimeType: String(row.mimeType),
    fileSize: Number(row.fileSize ?? 0),
    modifiedAt: String(row.modifiedAt),
    contentHash: typeof row.contentHash === 'string' ? row.contentHash : undefined,
    cosKey: typeof row.cosKey === 'string' ? row.cosKey : undefined,
    coverPath: typeof row.coverPath === 'string' ? row.coverPath : undefined,
    coverMimeType: typeof row.coverMimeType === 'string' ? row.coverMimeType : undefined,
    coverCosKey: typeof row.coverCosKey === 'string' ? row.coverCosKey : undefined,
    coverSource: row.coverSource as MediaAssetRecord['coverSource'],
    syncStatus: row.syncStatus as MediaAssetRecord['syncStatus'],
    presenceStatus: row.presenceStatus as MediaAssetRecord['presenceStatus'],
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  };
}

export function mapAlbum(row: Row): AlbumRecord {
  return {
    publicId: String(row.publicId),
    albumKey: String(row.albumKey),
    title: String(row.title),
    albumArtist: String(row.albumArtist),
    year: toNullableNumber(row.year),
    sourceDirectory: typeof row.sourceDirectory === 'string' ? row.sourceDirectory : undefined,
    coverAssetId: typeof row.coverAssetId === 'string' ? row.coverAssetId : undefined,
    sourceMeta: JSON.parse(String(row.sourceMeta)) as AlbumRecord['sourceMeta'],
    displayTitle: typeof row.displayTitle === 'string' ? row.displayTitle : undefined,
    displayArtist: typeof row.displayArtist === 'string' ? row.displayArtist : undefined,
    hidden: toBool(row.hidden),
    isSystemGenerated: toBool(row.isSystemGenerated),
    sortTitle: String(row.sortTitle),
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  };
}

export function mapAlbumTrack(row: Row): AlbumTrackRecord {
  return {
    albumId: String(row.albumId),
    trackId: String(row.trackId),
    discNumber: Number(row.discNumber ?? 1),
    discTitle: typeof row.discTitle === 'string' ? row.discTitle : undefined,
    trackNumber: Number(row.trackNumber ?? 0),
    sortOrder: Number(row.sortOrder ?? 0),
    createdAt: String(row.createdAt),
  };
}

export function mapCollection(row: Row): CollectionRecord {
  return {
    publicId: String(row.publicId),
    title: String(row.title),
    description: typeof row.description === 'string' ? row.description : undefined,
    coverAssetId: typeof row.coverAssetId === 'string' ? row.coverAssetId : undefined,
    status: row.status as CollectionRecord['status'],
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  };
}

export function mapCollectionTrack(row: Row): CollectionTrackRecord {
  return {
    collectionId: String(row.collectionId),
    trackId: String(row.trackId),
    sortOrder: Number(row.sortOrder ?? 0),
    createdAt: String(row.createdAt),
  };
}
