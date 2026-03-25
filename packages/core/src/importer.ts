import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import { fileTypeFromBuffer } from 'file-type';
import mime from 'mime-types';
import { parseFile } from 'music-metadata';
import { v7 as uuidv7 } from 'uuid';

import type { AlbumRecord, ImportOptions, LibraryScanSummary, MediaAssetRecord, SourceMeta, TrackRecord } from '@vgm/shared';
import {
  SUPPORTED_AUDIO_EXTENSIONS,
  SUPPORTED_COVER_EXTENSIONS,
  buildCoverFileName,
  compareTrackOrder,
  makeAlbumKey,
  makeSourceKey,
  normalizeDisplayValue,
  normalizeRelativePath,
  normalizeSortTitle,
  parseTagNumber,
} from '@vgm/shared/normalization';

import type { AppConfig } from './config.js';
import {
  all,
  encodeJson,
  mapAlbum,
  mapMediaAsset,
  mapTrack,
  run,
  transaction,
} from './db.js';
import type { DatabaseContext } from './db.js';

interface CoverDescriptor {
  source: 'embedded' | 'external' | 'none';
  mimeType?: string;
  extension?: string;
  data?: Uint8Array;
  absolutePath?: string;
}

interface ScannedCandidate {
  absolutePath: string;
  relativePath: string;
  sourceKey: string;
  sourceDirectory: string;
  fileSize: number;
  modifiedAt: string;
  extension: string;
  mimeType: string;
  metadata: SourceMeta;
  cover: CoverDescriptor;
}

interface ScanInternalResult {
  summary: LibraryScanSummary;
  candidates: ScannedCandidate[];
}

export async function scanLibrary(context: DatabaseContext, options: ImportOptions): Promise<ScanInternalResult> {
  const files = await walkAudioFiles(options.libraryRoot);
  const candidates: ScannedCandidate[] = [];
  const existingAssets = all<Record<string, unknown>>(context, 'SELECT * FROM mediaAssets').map(mapMediaAsset);
  const existingMap = new Map(existingAssets.map((asset) => [asset.sourceKey, asset]));

  for (const absolutePath of files) {
    const candidate = await buildCandidate(options.libraryRoot, absolutePath);
    candidates.push(candidate);
  }

  const seenSourceKeys = new Set(candidates.map((candidate) => candidate.sourceKey));
  const changes: LibraryScanSummary['changes'] = candidates.map((candidate) => {
    const existing = existingMap.get(candidate.sourceKey);

    if (!existing || existing.presenceStatus !== 'active') {
      return {
        sourceKey: candidate.sourceKey,
        relativePath: candidate.relativePath,
        kind: 'new' as const,
      };
    }

    if (existing.fileSize !== candidate.fileSize || existing.modifiedAt !== candidate.modifiedAt) {
      return {
        sourceKey: candidate.sourceKey,
        relativePath: candidate.relativePath,
        kind: 'updated' as const,
      };
    }

    return {
      sourceKey: candidate.sourceKey,
      relativePath: candidate.relativePath,
      kind: 'unchanged' as const,
    };
  });

  for (const asset of existingAssets) {
    if (asset.presenceStatus === 'active' && !seenSourceKeys.has(asset.sourceKey)) {
      changes.push({
        sourceKey: asset.sourceKey,
        relativePath: asset.relativePath,
        kind: 'missing',
      });
    }
  }

  const albumKeys = new Set(candidates.map((candidate) => makeAlbumKey(
    candidate.metadata.album,
    candidate.metadata.albumArtist,
    candidate.metadata.year,
  )));

  const summary: LibraryScanSummary = {
    root: options.libraryRoot,
    scannedAt: new Date().toISOString(),
    totals: {
      files: candidates.length,
      newFiles: changes.filter((change) => change.kind === 'new').length,
      updatedFiles: changes.filter((change) => change.kind === 'updated').length,
      missingFiles: changes.filter((change) => change.kind === 'missing').length,
      unchangedFiles: changes.filter((change) => change.kind === 'unchanged').length,
      albums: albumKeys.size,
    },
    changes,
  };

  return { summary, candidates };
}

export async function commitLibrary(context: DatabaseContext, config: AppConfig) {
  await ensureCacheDirs(config.mediaCacheDir);
  const scan = await scanLibrary(context, {
    libraryRoot: config.libraryRoot,
    cacheDir: config.mediaCacheDir,
  });

  const existingAssets = all<Record<string, unknown>>(context, 'SELECT * FROM mediaAssets').map(mapMediaAsset);
  const assetMap = new Map(existingAssets.map((asset) => [asset.sourceKey, asset]));
  const existingTracks = all<Record<string, unknown>>(context, 'SELECT * FROM tracks').map(mapTrack);
  const trackMap = new Map(existingTracks.map((track) => [track.mediaAssetId, track]));
  const now = new Date().toISOString();

  for (const candidate of scan.candidates) {
    const existingAsset = assetMap.get(candidate.sourceKey);
    const assetPublicId = existingAsset?.publicId ?? uuidv7();
    const unchanged = existingAsset?.fileSize === candidate.fileSize && existingAsset.modifiedAt === candidate.modifiedAt;
    const coverDetails = await materializeCover(candidate.cover, assetPublicId, config.mediaCacheDir);

    const assetRecord: MediaAssetRecord = {
      publicId: assetPublicId,
      sourceKey: candidate.sourceKey,
      relativePath: candidate.relativePath,
      extension: candidate.extension,
      mimeType: candidate.mimeType,
      fileSize: candidate.fileSize,
      modifiedAt: candidate.modifiedAt,
      contentHash: unchanged ? existingAsset?.contentHash : undefined,
      cosKey: existingAsset?.cosKey,
      coverCosKey: existingAsset?.coverCosKey,
      coverPath: coverDetails.coverPath,
      coverMimeType: coverDetails.coverMimeType,
      coverSource: coverDetails.coverSource,
      syncStatus: unchanged ? (existingAsset?.syncStatus ?? 'pending') : 'pending',
      presenceStatus: 'active',
      createdAt: existingAsset?.createdAt ?? now,
      updatedAt: now,
    };

    run(context, `
      INSERT INTO mediaAssets (
        publicId, sourceKey, relativePath, extension, mimeType, fileSize, modifiedAt, contentHash,
        cosKey, coverPath, coverMimeType, coverCosKey, coverSource, syncStatus, presenceStatus, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(sourceKey) DO UPDATE SET
        publicId = excluded.publicId,
        relativePath = excluded.relativePath,
        extension = excluded.extension,
        mimeType = excluded.mimeType,
        fileSize = excluded.fileSize,
        modifiedAt = excluded.modifiedAt,
        contentHash = excluded.contentHash,
        cosKey = excluded.cosKey,
        coverPath = excluded.coverPath,
        coverMimeType = excluded.coverMimeType,
        coverCosKey = excluded.coverCosKey,
        coverSource = excluded.coverSource,
        syncStatus = excluded.syncStatus,
        presenceStatus = excluded.presenceStatus,
        createdAt = excluded.createdAt,
        updatedAt = excluded.updatedAt
    `, [
      assetRecord.publicId,
      assetRecord.sourceKey,
      assetRecord.relativePath,
      assetRecord.extension,
      assetRecord.mimeType,
      assetRecord.fileSize,
      assetRecord.modifiedAt,
      assetRecord.contentHash ?? null,
      assetRecord.cosKey ?? null,
      assetRecord.coverPath ?? null,
      assetRecord.coverMimeType ?? null,
      assetRecord.coverCosKey ?? null,
      assetRecord.coverSource,
      assetRecord.syncStatus,
      assetRecord.presenceStatus,
      assetRecord.createdAt,
      assetRecord.updatedAt,
    ]);

    const existingTrack = trackMap.get(assetPublicId);
    const trackRecord: TrackRecord = {
      publicId: existingTrack?.publicId ?? uuidv7(),
      mediaAssetId: assetPublicId,
      title: candidate.metadata.title,
      artist: candidate.metadata.artist,
      durationSeconds: candidate.metadata.durationSeconds ?? 0,
      format: candidate.extension.replace('.', ''),
      year: candidate.metadata.year,
      genre: candidate.metadata.genre,
      sourceMeta: candidate.metadata,
      displayTitle: existingTrack?.displayTitle,
      displayArtist: existingTrack?.displayArtist,
      hidden: existingTrack?.hidden,
      createdAt: existingTrack?.createdAt ?? now,
      updatedAt: now,
    };

    run(context, `
      INSERT INTO tracks (
        publicId, mediaAssetId, title, artist, durationSeconds, format, year, genre, sourceMeta,
        displayTitle, displayArtist, hidden, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(mediaAssetId) DO UPDATE SET
        publicId = excluded.publicId,
        title = excluded.title,
        artist = excluded.artist,
        durationSeconds = excluded.durationSeconds,
        format = excluded.format,
        year = excluded.year,
        genre = excluded.genre,
        sourceMeta = excluded.sourceMeta,
        displayTitle = excluded.displayTitle,
        displayArtist = excluded.displayArtist,
        hidden = excluded.hidden,
        createdAt = excluded.createdAt,
        updatedAt = excluded.updatedAt
    `, [
      trackRecord.publicId,
      trackRecord.mediaAssetId,
      trackRecord.title,
      trackRecord.artist,
      trackRecord.durationSeconds,
      trackRecord.format,
      trackRecord.year ?? null,
      trackRecord.genre ?? null,
      encodeJson(trackRecord.sourceMeta),
      trackRecord.displayTitle ?? null,
      trackRecord.displayArtist ?? null,
      trackRecord.hidden ? 1 : 0,
      trackRecord.createdAt,
      trackRecord.updatedAt,
    ]);
  }

  const activeSourceKeys = new Set(scan.candidates.map((candidate) => candidate.sourceKey));
  const missingAssets = existingAssets.filter((asset) => !activeSourceKeys.has(asset.sourceKey) && asset.presenceStatus === 'active');
  if (missingAssets.length > 0) {
    for (const asset of missingAssets) {
      run(context, `
        UPDATE mediaAssets
        SET presenceStatus = 'missing', syncStatus = 'pending', updatedAt = ?
        WHERE sourceKey = ?
      `, [now, asset.sourceKey]);
    }
  }

  await rebuildAlbums(context);

  return scan.summary;
}

async function rebuildAlbums(context: DatabaseContext) {
  const tracks = all<Record<string, unknown>>(context, `SELECT * FROM tracks WHERE hidden = 0`).map(mapTrack);
  const assets = all<Record<string, unknown>>(context, `SELECT * FROM mediaAssets WHERE presenceStatus = 'active'`).map(mapMediaAsset);
  const existingAlbums = all<Record<string, unknown>>(context, `SELECT * FROM albums WHERE isSystemGenerated = 1`).map(mapAlbum);

  const trackAssetMap = new Map(assets.map((asset) => [asset.publicId, asset]));
  const activeTracks = tracks.filter((track) => trackAssetMap.has(track.mediaAssetId));
  const groups = new Map<string, typeof activeTracks>();

  for (const track of activeTracks) {
    const albumKey = makeAlbumKey(track.sourceMeta.album, track.sourceMeta.albumArtist, track.sourceMeta.year);
    const current = groups.get(albumKey);
    if (current) {
      current.push(track);
    } else {
      groups.set(albumKey, [track]);
    }
  }

  const existingAlbumMap = new Map(existingAlbums.map((album) => [album.albumKey, album]));
  const albumDocs: AlbumRecord[] = [];
  const albumTrackDocs: Array<{
    albumId: string;
    trackId: string;
    discNumber: number;
    discTitle?: string;
    trackNumber: number;
    sortOrder: number;
    createdAt: string;
  }> = [];
  const now = new Date().toISOString();

  for (const [albumKey, group] of groups) {
    group.sort((left, right) => compareTrackOrder(
      {
        discNumber: left.sourceMeta.discNumber,
        trackNumber: left.sourceMeta.trackNumber,
        relativePath: trackAssetMap.get(left.mediaAssetId)?.relativePath,
      },
      {
        discNumber: right.sourceMeta.discNumber,
        trackNumber: right.sourceMeta.trackNumber,
        relativePath: trackAssetMap.get(right.mediaAssetId)?.relativePath,
      },
    ));

    const firstTrack = group[0]!;
    const existingAlbum = existingAlbumMap.get(albumKey);
    const albumPublicId = existingAlbum?.publicId ?? uuidv7();
    const coverTrack = group.find((track) => trackAssetMap.get(track.mediaAssetId)?.coverPath);

    albumDocs.push({
      publicId: albumPublicId,
      albumKey,
      title: firstTrack.sourceMeta.album,
      albumArtist: firstTrack.sourceMeta.albumArtist,
      year: firstTrack.sourceMeta.year,
      sourceDirectory: commonDirectory(group.map((track) => trackAssetMap.get(track.mediaAssetId)?.relativePath ?? '')),
      coverAssetId: existingAlbum?.coverAssetId ?? coverTrack?.mediaAssetId,
      sourceMeta: {
        album: firstTrack.sourceMeta.album,
        albumArtist: firstTrack.sourceMeta.albumArtist,
        year: firstTrack.sourceMeta.year,
      },
      displayTitle: existingAlbum?.displayTitle,
      displayArtist: existingAlbum?.displayArtist,
      hidden: existingAlbum?.hidden,
      isSystemGenerated: true,
      sortTitle: normalizeSortTitle(firstTrack.sourceMeta.album),
      createdAt: existingAlbum?.createdAt ?? now,
      updatedAt: now,
    });

    group.forEach((track, index) => {
      albumTrackDocs.push({
        albumId: albumPublicId,
        trackId: track.publicId,
        discNumber: track.sourceMeta.discNumber ?? 1,
        discTitle: track.sourceMeta.discTitle,
        trackNumber: track.sourceMeta.trackNumber ?? index + 1,
        sortOrder: index + 1,
        createdAt: now,
      });
    });
  }

  transaction(context, () => {
    run(context, `DELETE FROM albumTracks`);
    run(context, `DELETE FROM albums WHERE isSystemGenerated = 1`);

    for (const album of albumDocs) {
      run(context, `
        INSERT INTO albums (
          publicId, albumKey, title, albumArtist, year, sourceDirectory, coverAssetId, sourceMeta,
          displayTitle, displayArtist, hidden, isSystemGenerated, sortTitle, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        album.publicId,
        album.albumKey,
        album.title,
        album.albumArtist,
        album.year ?? null,
        album.sourceDirectory ?? null,
        album.coverAssetId ?? null,
        encodeJson(album.sourceMeta),
        album.displayTitle ?? null,
        album.displayArtist ?? null,
        album.hidden ? 1 : 0,
        album.isSystemGenerated ? 1 : 0,
        album.sortTitle,
        album.createdAt,
        album.updatedAt,
      ]);
    }

    for (const link of albumTrackDocs) {
      run(context, `
        INSERT INTO albumTracks (albumId, trackId, discNumber, discTitle, trackNumber, sortOrder, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        link.albumId,
        link.trackId,
        link.discNumber,
        link.discTitle ?? null,
        link.trackNumber,
        link.sortOrder,
        link.createdAt,
      ]);
    }
  });
}

async function walkAudioFiles(root: string): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkAudioFiles(absolutePath));
      continue;
    }

    if (SUPPORTED_AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push(absolutePath);
    }
  }

  return files;
}

async function buildCandidate(libraryRoot: string, absolutePath: string): Promise<ScannedCandidate> {
  const metadata = await parseFile(absolutePath, { duration: true, skipCovers: false });
  const stat = await fs.stat(absolutePath);
  const relativePath = normalizeRelativePath(libraryRoot, absolutePath);
  const extension = path.extname(absolutePath).toLowerCase();
  const common = metadata.common;
  const picture = common.picture?.[0];
  const cover = picture
    ? await embeddedCover(picture.data, picture.format)
    : await findDirectoryCover(path.dirname(absolutePath));
  const albumArtist = normalizeDisplayValue(common.albumartist || common.artist || 'Unknown Album Artist');
  const title = normalizeDisplayValue(common.title || path.parse(absolutePath).name);
  const artist = normalizeDisplayValue(common.artist || albumArtist || 'Unknown Artist');
  const album = normalizeDisplayValue(common.album || path.basename(path.dirname(absolutePath)));
  const year = common.year ? Number(common.year) : undefined;
  const discNumber = parseTagNumber(common.disk.no) ?? parseDiscNumberFromDirectory(relativePath) ?? 1;
  const trackNumber = parseTagNumber(common.track.no) ?? 0;
  const discTitle = parseDiscTitle(relativePath, discNumber);

  return {
    absolutePath,
    relativePath,
    sourceKey: makeSourceKey(relativePath),
    sourceDirectory: path.dirname(relativePath),
    fileSize: stat.size,
    modifiedAt: stat.mtime.toISOString(),
    extension,
    mimeType: mime.lookup(extension) || 'application/octet-stream',
    metadata: {
      title,
      album,
      artist,
      albumArtist,
      year,
      genre: common.genre?.[0],
      trackNumber,
      discNumber,
      discTitle,
      durationSeconds: metadata.format.duration ? Math.round(metadata.format.duration) : 0,
      pictureCount: common.picture?.length ?? 0,
    },
    cover,
  };
}

async function embeddedCover(data: Uint8Array, format?: string): Promise<CoverDescriptor> {
  const detected = await fileTypeFromBuffer(data);
  return {
    source: 'embedded',
    data,
    mimeType: format || detected?.mime,
    extension: detected?.ext ? `.${detected.ext}` : '.jpg',
  };
}

async function findDirectoryCover(directory: string): Promise<CoverDescriptor> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const coverEntry = entries.find((entry) =>
    entry.isFile()
    && SUPPORTED_COVER_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
    && /(cover|front)/i.test(entry.name),
  ) ?? entries.find((entry) =>
    entry.isFile() && SUPPORTED_COVER_EXTENSIONS.has(path.extname(entry.name).toLowerCase()),
  );

  if (!coverEntry) {
    return { source: 'none' };
  }

  const absolutePath = path.join(directory, coverEntry.name);
  return {
    source: 'external',
    absolutePath,
    mimeType: mime.lookup(absolutePath) || 'image/jpeg',
    extension: path.extname(absolutePath).toLowerCase(),
  };
}

async function materializeCover(cover: CoverDescriptor, publicId: string, cacheDir: string) {
  const coversDirectory = path.join(cacheDir, 'covers');
  await fs.mkdir(coversDirectory, { recursive: true });

  if (cover.source === 'none') {
    return {
      coverPath: undefined,
      coverMimeType: undefined,
      coverSource: 'none' as const,
    };
  }

  const extension = cover.extension || '.jpg';
  const fileName = buildCoverFileName(publicId, extension);
  const absolutePath = path.join(coversDirectory, fileName);

  if (cover.source === 'embedded' && cover.data) {
    await fs.writeFile(absolutePath, cover.data);
  } else if (cover.source === 'external' && cover.absolutePath) {
    await fs.copyFile(cover.absolutePath, absolutePath);
  }

  return {
    coverPath: `covers/${fileName}`,
    coverMimeType: cover.mimeType || (mime.lookup(extension) || 'image/jpeg'),
    coverSource: cover.source,
  };
}

function parseDiscNumberFromDirectory(relativePath: string): number | undefined {
  const segments = relativePath.split('/');
  const discSegment = segments.find((segment) => /^disc\s+\d+/i.test(segment));

  if (!discSegment) {
    return undefined;
  }

  const value = Number.parseInt(discSegment.replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(value) ? value : undefined;
}

function parseDiscTitle(relativePath: string, discNumber: number | undefined): string | undefined {
  const segments = relativePath.split('/');
  return segments.find((segment) => segment.toLowerCase().startsWith(`disc ${discNumber}`));
}

function commonDirectory(paths: string[]): string | undefined {
  const filtered = paths.filter(Boolean);
  if (filtered.length === 0) {
    return undefined;
  }

  const splitPaths = filtered.map((item) => item.split('/').slice(0, -1));
  const minLength = Math.min(...splitPaths.map((parts) => parts.length));
  const shared: string[] = [];

  for (let index = 0; index < minLength; index += 1) {
    const value = splitPaths[0]?.[index];
    if (value === undefined) {
      break;
    }
    if (splitPaths.every((parts) => parts[index] === value)) {
      shared.push(value);
    } else {
      break;
    }
  }

  return shared.length > 0 ? shared.join('/') : undefined;
}

async function ensureCacheDirs(cacheDir: string) {
  await fs.mkdir(path.join(cacheDir, 'covers'), { recursive: true });
}

export async function computeFileHash(absolutePath: string) {
  const hash = createHash('sha1');
  const stream = createReadStream(absolutePath);

  await new Promise<void>((resolve, reject) => {
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve());
  });

  return hash.digest('hex');
}
