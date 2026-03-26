import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import mime from 'mime-types';
import { parseFile } from 'music-metadata';
import sharp from 'sharp';
import { v7 as uuidv7 } from 'uuid';

import type {
  AlbumRecord,
  ImportOptions,
  ImportProgressEvent,
  LibraryScanSummary,
  MediaAssetRecord,
  SeriesRecord,
  SourceMeta,
  TrackRecord,
} from '@vgm/shared';
import {
  SUPPORTED_AUDIO_EXTENSIONS,
  compareTrackOrder,
  makeAlbumKey,
  makeSeriesKey,
  makeSourceKey,
  normalizeDisplayValue,
  normalizeRelativePath,
  normalizeSortTitle,
  parseAlbumSortOrderInSeries,
  parseSeriesFromPath,
  parseTagNumber,
} from '@vgm/shared/normalization';

import type { AppConfig } from './config.js';
import {
  all,
  encodeJson,
  get,
  mapAlbum,
  mapMediaAsset,  mapSeries,  mapTrack,
  run,
  transaction,
} from './db.js';
import type { DatabaseContext } from './db.js';

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
}

interface ScanInternalResult {
  summary: LibraryScanSummary;
  candidates: ScannedCandidate[];
}

interface ProgressReporter {
  onProgress?: (event: ImportProgressEvent) => void;
  onImportProgress?: (event: ImportProgressEvent) => void;
}

function reportProgress(
  options: ProgressReporter | undefined,
  event: ImportProgressEvent,
) {
  options?.onProgress?.(event);
  options?.onImportProgress?.(event);
}

export async function scanLibrary(context: DatabaseContext, options: ImportOptions): Promise<ScanInternalResult> {
  const startedAt = Date.now();
  reportProgress(options, {
    phase: 'discover',
    message: `开始扫描目录：${options.libraryRoot}`,
    elapsedMs: 0,
  });

  const files = await walkAudioFiles(options.libraryRoot, options, { discovered: 0 });
  reportProgress(options, {
    phase: 'discover',
    message: `目录扫描完成，发现 ${files.length} 个音频文件`,
    processed: files.length,
    total: files.length,
    elapsedMs: Date.now() - startedAt,
  });

  const candidates: ScannedCandidate[] = new Array(files.length);
  const existingAssets = all<Record<string, unknown>>(context, 'SELECT * FROM mediaAssets').map(mapMediaAsset);
  const existingMap = new Map(existingAssets.map((asset) => [asset.sourceKey, asset]));
  const existingTracks = all<Record<string, unknown>>(context, 'SELECT * FROM tracks').map(mapTrack);
  const existingTrackByAssetId = new Map(existingTracks.map((t) => [t.mediaAssetId, t]));
  const existingByPath = new Map(
    existingAssets.flatMap((asset) => {
      const track = existingTrackByAssetId.get(asset.publicId);
      return track ? [[asset.relativePath, { asset, sourceMeta: track.sourceMeta }] as const] : [];
    }),
  );

  const METADATA_CONCURRENCY = 16;
  let metaCompleted = 0;
  let nextFileIndex = 0;

  async function processNextFile() {
    while (nextFileIndex < files.length) {
      const i = nextFileIndex++;
      const absolutePath = files[i]!;
      const relativePath = normalizeRelativePath(options.libraryRoot, absolutePath);
      const stat = await fs.stat(absolutePath);
      const cached = existingByPath.get(relativePath);

      if (cached && stat.size === cached.asset.fileSize && stat.mtime.toISOString() === cached.asset.modifiedAt) {
        const extension = path.extname(absolutePath).toLowerCase();
        candidates[i] = {
          absolutePath,
          relativePath,
          sourceKey: cached.asset.sourceKey,
          sourceDirectory: path.dirname(relativePath),
          fileSize: stat.size,
          modifiedAt: cached.asset.modifiedAt,
          extension,
          mimeType: cached.asset.mimeType,
          metadata: cached.sourceMeta,
        };
      } else {
        candidates[i] = await buildCandidate(options.libraryRoot, absolutePath);
      }

      metaCompleted++;
      if (metaCompleted % 100 === 0 || metaCompleted === files.length) {
        reportProgress(options, {
          phase: 'metadata',
          message: `正在读取标签：${metaCompleted}/${files.length}`,
          processed: metaCompleted,
          total: files.length,
          elapsedMs: Date.now() - startedAt,
        });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(METADATA_CONCURRENCY, files.length) }, processNextFile));

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

  reportProgress(options, {
    phase: 'done',
    message: `扫描完成：${summary.totals.files} 个文件，新增 ${summary.totals.newFiles}，更新 ${summary.totals.updatedFiles}，缺失 ${summary.totals.missingFiles}`,
    processed: summary.totals.files,
    total: summary.totals.files,
    elapsedMs: Date.now() - startedAt,
  });

  return { summary, candidates };
}

export async function commitLibrary(context: DatabaseContext, config: AppConfig) {
  const startedAt = Date.now();
  await ensureCacheDirs(config.mediaCacheDir);
  const scan = await scanLibrary(context, {
    libraryRoot: config.libraryRoot,
    cacheDir: config.mediaCacheDir,
    onProgress: config.onImportProgress,
  });

  const existingAssets = all<Record<string, unknown>>(context, 'SELECT * FROM mediaAssets').map(mapMediaAsset);
  const assetMap = new Map(existingAssets.map((asset) => [asset.sourceKey, asset]));
  const existingTracks = all<Record<string, unknown>>(context, 'SELECT * FROM tracks').map(mapTrack);
  const trackMap = new Map(existingTracks.map((track) => [track.mediaAssetId, track]));
  const now = new Date().toISOString();

  reportProgress(config, {
    phase: 'write',
    message: `开始写入数据库，共 ${scan.candidates.length} 个文件`,
    processed: 0,
    total: scan.candidates.length,
    elapsedMs: Date.now() - startedAt,
  });

  const activeSourceKeys = new Set(scan.candidates.map((candidate) => candidate.sourceKey));
  const missingAssets = existingAssets.filter((asset) => !activeSourceKeys.has(asset.sourceKey) && asset.presenceStatus === 'active');

  transaction(context, () => {
    for (const [index, candidate] of scan.candidates.entries()) {
      const existingAsset = assetMap.get(candidate.sourceKey);
      const assetPublicId = existingAsset?.publicId ?? uuidv7();
      const unchanged = existingAsset?.fileSize === candidate.fileSize && existingAsset.modifiedAt === candidate.modifiedAt;

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
        syncStatus: unchanged ? (existingAsset?.syncStatus ?? 'pending') : 'pending',
        presenceStatus: 'active',
        createdAt: existingAsset?.createdAt ?? now,
        updatedAt: now,
      };

      run(context, `
      INSERT INTO mediaAssets (
        publicId, sourceKey, relativePath, extension, mimeType, fileSize, modifiedAt, contentHash,
        cosKey, syncStatus, presenceStatus, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(sourceKey) DO UPDATE SET
        publicId = excluded.publicId,
        relativePath = excluded.relativePath,
        extension = excluded.extension,
        mimeType = excluded.mimeType,
        fileSize = excluded.fileSize,
        modifiedAt = excluded.modifiedAt,
        contentHash = excluded.contentHash,
        cosKey = excluded.cosKey,
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

      if ((index + 1) % 100 === 0 || index === scan.candidates.length - 1) {
        reportProgress(config, {
          phase: 'write',
          message: `已写入 ${index + 1}/${scan.candidates.length} 个文件`,
          processed: index + 1,
          total: scan.candidates.length,
          elapsedMs: Date.now() - startedAt,
        });
      }
    }

    for (const asset of missingAssets) {
      run(context, `
        UPDATE mediaAssets
        SET presenceStatus = 'missing', syncStatus = 'pending', updatedAt = ?
        WHERE sourceKey = ?
      `, [now, asset.sourceKey]);
    }
  });

  reportProgress(config, {
    phase: 'rebuild',
    message: '开始重建系统专辑集合',
    elapsedMs: Date.now() - startedAt,
  });

  await rebuildAlbums(context, config);

  reportProgress(config, {
    phase: 'done',
    message: `导入完成：${scan.summary.totals.files} 个文件`,
    processed: scan.summary.totals.files,
    total: scan.summary.totals.files,
    elapsedMs: Date.now() - startedAt,
  });

  return scan.summary;
}

async function rebuildAlbums(context: DatabaseContext, options: Pick<AppConfig, 'libraryRoot' | 'mediaCacheDir'> & Pick<ImportOptions, 'onProgress'>) {
  const tracks = all<Record<string, unknown>>(context, `SELECT * FROM tracks WHERE hidden = 0`).map(mapTrack);
  const assets = all<Record<string, unknown>>(context, `SELECT * FROM mediaAssets WHERE presenceStatus = 'active'`).map(mapMediaAsset);
  const existingAlbums = all<Record<string, unknown>>(context, `SELECT * FROM albums WHERE isSystemGenerated = 1`).map(mapAlbum);

  const trackAssetMap = new Map(assets.map((asset) => [asset.publicId, asset]));
  const activeTracks = tracks.filter((track) => trackAssetMap.has(track.mediaAssetId));
  const groups = new Map<string, typeof activeTracks>();

  for (const track of activeTracks) {
    const albumKey = makeAlbumKey(track.sourceMeta.album, track.sourceMeta.albumArtist);
    const current = groups.get(albumKey);
    if (current) {
      current.push(track);
    } else {
      groups.set(albumKey, [track]);
    }
  }

  const existingAlbumMap = new Map(existingAlbums.map((album) => [album.albumKey, album]));
  const albumDocs: AlbumRecord[] = [];
  const albumFirstTrackPath = new Map<string, string>();
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
    const firstTrackAsset = trackAssetMap.get(firstTrack.mediaAssetId);
    if (firstTrackAsset) {
      albumFirstTrackPath.set(albumPublicId, path.join(options.libraryRoot, ...firstTrackAsset.relativePath.split('/')));
    }

    albumDocs.push({
      publicId: albumPublicId,
      albumKey,
      title: firstTrack.sourceMeta.album,
      albumArtist: firstTrack.sourceMeta.albumArtist,
      year: firstTrack.sourceMeta.year,
      sourceDirectory: commonDirectory(group.map((track) => trackAssetMap.get(track.mediaAssetId)?.relativePath ?? '')),
      coverAssetId: undefined, // will be resolved below
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

  // 为每张专辑查找封面文件（Cover.png / Cover.jpg），无则提取首曲目内嵌封面，统一缩放为 512px PNG
  const coversDir = path.join(options.mediaCacheDir, 'covers');
  await fs.mkdir(coversDir, { recursive: true });

  for (const album of albumDocs) {
    const destPath = path.join(coversDir, `${album.publicId}.png`);
    let covered = false;

    if (album.sourceDirectory) {
      const albumDir = path.join(options.libraryRoot, ...album.sourceDirectory.split('/'));
      const coverEntry = await findAlbumCoverFile(albumDir);
      if (coverEntry) {
        await resizeCoverToPng(coverEntry.absolutePath, destPath);
        covered = true;
      }
    }

    if (!covered) {
      const firstTrackPath = albumFirstTrackPath.get(album.publicId);
      if (firstTrackPath) {
        const tagMeta = await parseFile(firstTrackPath, { skipCovers: false, duration: false });
        const picture = tagMeta.common.picture?.[0];
        if (picture) {
          await resizeCoverToPng(Buffer.from(picture.data), destPath);
          covered = true;
        }
      }
    }

    if (covered) {
      album.coverAssetId = album.publicId;
    }
  }

  reportProgress(options, {
    phase: 'rebuild',
    message: `准备重建 ${albumDocs.length} 张专辑及 ${albumTrackDocs.length} 条专辑曲目关系`,
    processed: albumDocs.length,
    total: albumDocs.length,
  });

  // 从专辑的 sourceDirectory 中提取系列信息
  const seriesNameMap = new Map<string, string>(); // seriesKey → name
  const seriesAlbumLinks: Array<{ seriesKey: string; albumId: string; sortOrder?: number }> = [];

  for (const album of albumDocs) {
    const seriesName = parseSeriesFromPath(album.sourceDirectory);
    if (!seriesName) continue;

    const seriesKey = makeSeriesKey(seriesName);
    if (!seriesNameMap.has(seriesKey)) {
      seriesNameMap.set(seriesKey, seriesName);
    }

    const sortOrder = parseAlbumSortOrderInSeries(album.sourceDirectory);
    seriesAlbumLinks.push({ seriesKey, albumId: album.publicId, sortOrder });
  }

  const existingSeries = all<Record<string, unknown>>(context, 'SELECT * FROM series').map(mapSeries);
  const existingSeriesMap = new Map(existingSeries.map((s) => [s.seriesKey, s]));

  const seriesDocs: SeriesRecord[] = [];
  for (const [seriesKey, name] of seriesNameMap) {
    const existing = existingSeriesMap.get(seriesKey);
    seriesDocs.push({
      publicId: existing?.publicId ?? uuidv7(),
      seriesKey,
      name,
      sortTitle: normalizeSortTitle(name),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
  }

  const seriesIdMap = new Map(seriesDocs.map((s) => [s.seriesKey, s.publicId]));

  transaction(context, () => {
    run(context, `DELETE FROM seriesAlbums`);
    run(context, `DELETE FROM series`);
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

    for (const series of seriesDocs) {
      run(context, `
        INSERT INTO series (publicId, seriesKey, name, sortTitle, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [
        series.publicId,
        series.seriesKey,
        series.name,
        series.sortTitle,
        series.createdAt,
        series.updatedAt,
      ]);
    }

    for (const link of seriesAlbumLinks) {
      const seriesId = seriesIdMap.get(link.seriesKey);
      if (!seriesId) continue;
      run(context, `
        INSERT INTO seriesAlbums (seriesId, albumId, sortOrder, createdAt)
        VALUES (?, ?, ?, ?)
      `, [
        seriesId,
        link.albumId,
        link.sortOrder ?? null,
        now,
      ]);
    }
  });

  reportProgress(options, {
    phase: 'rebuild',
    message: `专辑重建完成：${albumDocs.length} 张专辑，${seriesDocs.length} 个系列`,
    processed: albumDocs.length,
    total: albumDocs.length,
  });
}

async function walkAudioFiles(
  root: string,
  options?: Pick<ImportOptions, 'onProgress'>,
  progressState: { discovered: number } = { discovered: 0 },
): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkAudioFiles(absolutePath, options, progressState));
      continue;
    }

    if (SUPPORTED_AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push(absolutePath);
      progressState.discovered += 1;
      if (progressState.discovered % 200 === 0) {
        reportProgress(options, {
          phase: 'discover',
          message: `已发现 ${progressState.discovered} 个音频文件`,
          processed: progressState.discovered,
        });
      }
    }
  }

  return files;
}

async function buildCandidate(libraryRoot: string, absolutePath: string): Promise<ScannedCandidate> {
  const metadata = await parseFile(absolutePath, { duration: true, skipCovers: true });
  const stat = await fs.stat(absolutePath);
  const relativePath = normalizeRelativePath(libraryRoot, absolutePath);
  const extension = path.extname(absolutePath).toLowerCase();
  const common = metadata.common;
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
    sourceKey: makeSourceKey(albumArtist, album, discNumber, trackNumber, title),
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
    },
  };
}

async function resizeCoverToPng(input: string | Buffer, destPath: string): Promise<void> {
  await sharp(input)
    .resize(512, 512, { fit: 'inside' })
    .png()
    .toFile(destPath);
}

async function findAlbumCoverFile(albumDir: string): Promise<{ absolutePath: string; ext: string } | undefined> {
  for (const name of ['Cover.png', 'Cover.jpg', 'Cover.jpeg', 'Cover.webp']) {
    const absolutePath = path.join(albumDir, name);
    try {
      await fs.access(absolutePath);
      return { absolutePath, ext: path.extname(name).toLowerCase() };
    } catch {
      // not found, try next
    }
  }
  return undefined;
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

export interface CleanSummary {
  removedMissingAssets: number;
  removedOrphanedTracks: number;
  removedOrphanedCovers: number;
}

/** 删除 missing 状态的资产及其关联数据，并清理无对应专辑的封面缓存文件 */
export async function cleanLibrary(context: DatabaseContext, config: AppConfig): Promise<CleanSummary> {
  const removedMissingAssets = get<{ n: number }>(
    context,
    `SELECT COUNT(*) AS n FROM mediaAssets WHERE presenceStatus = 'missing'`,
  )?.n ?? 0;

  const removedOrphanedTracks = get<{ n: number }>(
    context,
    `SELECT COUNT(*) AS n FROM tracks
     WHERE mediaAssetId IN (SELECT publicId FROM mediaAssets WHERE presenceStatus = 'missing')`,
  )?.n ?? 0;

  transaction(context, () => {
    run(context, `DELETE FROM albumTracks WHERE trackId IN (
      SELECT publicId FROM tracks
      WHERE mediaAssetId IN (SELECT publicId FROM mediaAssets WHERE presenceStatus = 'missing')
    )`);
    run(context, `DELETE FROM collectionTracks WHERE trackId IN (
      SELECT publicId FROM tracks
      WHERE mediaAssetId IN (SELECT publicId FROM mediaAssets WHERE presenceStatus = 'missing')
    )`);
    run(context, `DELETE FROM tracks
      WHERE mediaAssetId IN (SELECT publicId FROM mediaAssets WHERE presenceStatus = 'missing')`);
    run(context, `DELETE FROM mediaAssets WHERE presenceStatus = 'missing'`);
  });

  // 删除没有对应专辑的封面缓存文件
  const coversDir = path.join(config.mediaCacheDir, 'covers');
  let removedOrphanedCovers = 0;
  try {
    const albumIds = new Set(
      all<{ publicId: string }>(context, `SELECT publicId FROM albums`).map((a) => a.publicId),
    );
    const entries = await fs.readdir(coversDir);
    for (const entry of entries) {
      const ext = path.extname(entry).toLowerCase();
      const id = path.basename(entry, ext);
      if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext) && !albumIds.has(id)) {
        await fs.unlink(path.join(coversDir, entry));
        removedOrphanedCovers++;
      }
    }
  } catch { /* covers 目录不存在则跳过 */ }

  return { removedMissingAssets, removedOrphanedTracks, removedOrphanedCovers };
}

/** 清空所有导入数据和封面缓存，然后进行完整重导入 */
export async function initLibrary(context: DatabaseContext, config: AppConfig) {
  transaction(context, () => {
    run(context, `DELETE FROM seriesAlbums`);
    run(context, `DELETE FROM series`);
    run(context, `DELETE FROM albumTracks`);
    run(context, `DELETE FROM albums WHERE isSystemGenerated = 1`);
    run(context, `DELETE FROM collectionTracks`);
    run(context, `DELETE FROM tracks`);
    run(context, `DELETE FROM mediaAssets`);
  });

  const coversDir = path.join(config.mediaCacheDir, 'covers');
  await fs.rm(coversDir, { recursive: true, force: true });
  await fs.mkdir(coversDir, { recursive: true });

  return commitLibrary(context, config);
}
