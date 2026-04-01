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
} from './types.js';
import {
  SUPPORTED_AUDIO_EXTENSIONS,
  compareTrackOrder,
  normalizeDisplayValue,
  normalizeRelativePath,
  normalizeSortTitle,
  parseAlbumSortOrderInSeries,
  parseSeriesFromPath,
  parseTagNumber,
} from '@vgm/shared/normalization';

import { extractAudioFeatures, hasAudioFeature, upsertAudioFeatureBatch } from './similarity.js';
import type { AudioFeatureVectors } from './similarity.js';
import type { AppConfig } from './config.js';
import {
  all,
  encodeJson,
  get,
  mapAlbum,
  mapMediaAsset,  mapSeries,  mapTrack,
  prepare,
  run,
  transaction,
} from './db.js';
import type { DatabaseContext } from './db.js';

interface ScannedCandidate {
  absolutePath: string;
  relativePath: string;
  contentHash: string;
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
  existingAssets: MediaAssetRecord[];
  existingTracks: TrackRecord[];
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
  const existingByHash = new Map(existingAssets.map((asset) => [asset.contentHash, asset]));
  const existingTracks = all<Record<string, unknown>>(context, 'SELECT * FROM tracks').map(mapTrack);
  const existingTrackByAssetId = new Map(existingTracks.map((t) => [t.mediaAssetId, t]));
  // Cache for skipping metadata re-parse when file hasn't changed on disk
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
          contentHash: cached.asset.contentHash,
          sourceDirectory: path.dirname(relativePath),
          fileSize: stat.size,
          modifiedAt: cached.asset.modifiedAt,
          extension,
          mimeType: cached.asset.mimeType,
          metadata: cached.sourceMeta,
        };
      } else {
        candidates[i] = await buildCandidate(options.libraryRoot, absolutePath, { size: stat.size, mtime: stat.mtime });
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

  const seenHashes = new Set(candidates.map((candidate) => candidate.contentHash));
  const changes: LibraryScanSummary['changes'] = candidates.map((candidate) => {
    const existing = existingByHash.get(candidate.contentHash);

    if (!existing || existing.presenceStatus !== 'active') {
      return {
        relativePath: candidate.relativePath,
        kind: 'new' as const,
      };
    }

    if (existing.fileSize !== candidate.fileSize || existing.modifiedAt !== candidate.modifiedAt) {
      return {
        relativePath: candidate.relativePath,
        kind: 'updated' as const,
      };
    }

    return {
      relativePath: candidate.relativePath,
      kind: 'unchanged' as const,
    };
  });

  for (const asset of existingAssets) {
    if (asset.presenceStatus === 'active' && !seenHashes.has(asset.contentHash)) {
      changes.push({
        relativePath: asset.relativePath,
        kind: 'missing',
      });
    }
  }

  const albumTitles = new Set(candidates.map((candidate) => candidate.metadata.album));

  const summary: LibraryScanSummary = {
    root: options.libraryRoot,
    scannedAt: new Date().toISOString(),
    totals: {
      files: candidates.length,
      newFiles: changes.filter((change) => change.kind === 'new').length,
      updatedFiles: changes.filter((change) => change.kind === 'updated').length,
      missingFiles: changes.filter((change) => change.kind === 'missing').length,
      unchangedFiles: changes.filter((change) => change.kind === 'unchanged').length,
      albums: albumTitles.size,
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

  return { summary, candidates, existingAssets, existingTracks };
}

/** Shared context threaded through each updateLibrary phase */
interface UpdatePhaseContext {
  db: DatabaseContext;
  config: AppConfig;
  startedAt: number;
}

function elapsed(ctx: UpdatePhaseContext): number {
  return Date.now() - ctx.startedAt;
}

/** Deduplicate candidates by contentHash, keeping the first occurrence per hash */
function deduplicateCandidates(
  ctx: UpdatePhaseContext,
  candidates: ScannedCandidate[],
): ScannedCandidate[] {
  const seen = new Set<string>();
  const unique: ScannedCandidate[] = [];
  for (const candidate of candidates) {
    if (!seen.has(candidate.contentHash)) {
      seen.add(candidate.contentHash);
      unique.push(candidate);
    }
  }
  if (unique.length < candidates.length) {
    reportProgress(ctx.config, {
      phase: 'write',
      message: `去重：${candidates.length} → ${unique.length}（跳过 ${candidates.length - unique.length} 个重复文件）`,
      elapsedMs: elapsed(ctx),
    });
  }
  return unique;
}

/** Write assets and tracks to the database, mark missing assets */
function writeAssetsAndTracks(
  ctx: UpdatePhaseContext,
  scan: ScanInternalResult,
  uniqueCandidates: ScannedCandidate[],
): void {
  const assetMap = new Map(scan.existingAssets.map((a) => [a.contentHash, a]));
  const trackMap = new Map(scan.existingTracks.map((t) => [t.mediaAssetId, t]));
  const now = new Date().toISOString();

  reportProgress(ctx.config, {
    phase: 'write',
    message: `开始写入数据库，共 ${uniqueCandidates.length} 个文件`,
    processed: 0,
    total: uniqueCandidates.length,
    elapsedMs: elapsed(ctx),
  });

  const activeHashes = new Set(uniqueCandidates.map((c) => c.contentHash));
  const missingAssets = scan.existingAssets.filter(
    (a) => !activeHashes.has(a.contentHash) && a.presenceStatus === 'active',
  );

  const insertAssetStmt = prepare(ctx.db, `
    INSERT INTO mediaAssets (
      publicId, relativePath, extension, mimeType, fileSize, modifiedAt, contentHash,
      syncStatus, presenceStatus, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(contentHash) DO UPDATE SET
      relativePath = excluded.relativePath,
      extension = excluded.extension,
      mimeType = excluded.mimeType,
      fileSize = excluded.fileSize,
      modifiedAt = excluded.modifiedAt,
      syncStatus = excluded.syncStatus,
      presenceStatus = excluded.presenceStatus,
      updatedAt = excluded.updatedAt
  `);

  const insertTrackStmt = prepare(ctx.db, `
    INSERT INTO tracks (
      publicId, mediaAssetId, title, artist, durationSeconds, format, year, genre, sourceMeta,
      displayTitle, displayArtist, hidden, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(mediaAssetId) DO UPDATE SET
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
      updatedAt = excluded.updatedAt
  `);

  const markMissingStmt = prepare(ctx.db, `
    UPDATE mediaAssets
    SET presenceStatus = 'missing', syncStatus = 'pending', updatedAt = ?
    WHERE contentHash = ?
  `);

  transaction(ctx.db, () => {
    for (const [index, candidate] of uniqueCandidates.entries()) {
      const existingAsset = assetMap.get(candidate.contentHash);
      const assetPublicId = existingAsset?.publicId ?? uuidv7();
      const syncStatus = existingAsset?.syncStatus ?? 'pending';

      insertAssetStmt.run(
        assetPublicId,
        candidate.relativePath,
        candidate.extension,
        candidate.mimeType,
        candidate.fileSize,
        candidate.modifiedAt,
        candidate.contentHash,
        syncStatus,
        'active',
        existingAsset?.createdAt ?? now,
        now,
      );

      const existingTrack = trackMap.get(assetPublicId);
      insertTrackStmt.run(
        existingTrack?.publicId ?? uuidv7(),
        assetPublicId,
        candidate.metadata.title,
        candidate.metadata.artist,
        candidate.metadata.durationSeconds ?? 0,
        candidate.extension.replace('.', ''),
        candidate.metadata.year ?? null,
        candidate.metadata.genre ?? null,
        encodeJson(candidate.metadata),
        existingTrack?.displayTitle ?? null,
        existingTrack?.displayArtist ?? null,
        existingTrack?.hidden ? 1 : 0,
        existingTrack?.createdAt ?? now,
        now,
      );

      if ((index + 1) % 100 === 0 || index === uniqueCandidates.length - 1) {
        reportProgress(ctx.config, {
          phase: 'write',
          message: `已写入 ${index + 1}/${uniqueCandidates.length} 个文件`,
          processed: index + 1,
          total: uniqueCandidates.length,
          elapsedMs: elapsed(ctx),
        });
      }
    }

    for (const asset of missingAssets) {
      markMissingStmt.run(now, asset.contentHash);
    }
  });
}

/** Extract audio features for candidates that don't already have them */
async function extractMissingFeatures(
  ctx: UpdatePhaseContext,
  uniqueCandidates: ScannedCandidate[],
): Promise<void> {
  const candidates: Array<{ assetId: string; absolutePath: string }> = [];
  for (const candidate of uniqueCandidates) {
    const row = get<{ publicId: string }>(
      ctx.db,
      `SELECT publicId FROM mediaAssets WHERE contentHash = ?`,
      [candidate.contentHash],
    );
    if (row && !hasAudioFeature(ctx.db, row.publicId)) {
      candidates.push({ assetId: row.publicId, absolutePath: candidate.absolutePath });
    }
  }

  if (candidates.length === 0) return;

  reportProgress(ctx.config, {
    phase: 'features',
    message: `开始提取音频特征，共 ${candidates.length} 个文件`,
    processed: 0,
    total: candidates.length,
    elapsedMs: elapsed(ctx),
  });

  const CONCURRENCY = 8;
  const BATCH_SIZE = 100;
  let nextIndex = 0;
  let completed = 0;
  let succeeded = 0;
  const batch: Array<{ mediaAssetId: string; features: AudioFeatureVectors }> = [];

  function flushBatch() {
    if (batch.length === 0) return;
    const toWrite = batch.splice(0);
    transaction(ctx.db, () => {
      upsertAudioFeatureBatch(ctx.db, toWrite);
    });
  }

  async function worker() {
    while (nextIndex < candidates.length) {
      const idx = nextIndex++;
      const item = candidates[idx]!;
      try {
        const features = await extractAudioFeatures(item.absolutePath);
        batch.push({ mediaAssetId: item.assetId, features });
        succeeded++;
      } catch {
        // skip files that fail feature extraction
      }
      completed++;

      if (batch.length >= BATCH_SIZE) {
        flushBatch();
      }

      if (completed % 100 === 0 || completed === candidates.length) {
        reportProgress(ctx.config, {
          phase: 'features',
          message: `正在提取音频特征：${completed}/${candidates.length}`,
          processed: completed,
          total: candidates.length,
          elapsedMs: elapsed(ctx),
        });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, candidates.length) }, worker));
  flushBatch();

  reportProgress(ctx.config, {
    phase: 'features',
    message: `音频特征提取完成：${succeeded}/${candidates.length} 成功`,
    processed: candidates.length,
    total: candidates.length,
    elapsedMs: elapsed(ctx),
  });
}

export async function updateLibrary(context: DatabaseContext, config: AppConfig) {
  const ctx: UpdatePhaseContext = { db: context, config, startedAt: Date.now() };

  await ensureCacheDirs(config.mediaCacheDir);

  // Phase 1: Scan
  const scan = await scanLibrary(context, {
    libraryRoot: config.libraryRoot,
    cacheDir: config.mediaCacheDir,
    onProgress: config.onImportProgress,
  });

  // Phase 2: Deduplicate
  const uniqueCandidates = deduplicateCandidates(ctx, scan.candidates);

  // Phase 3: Write assets & tracks
  writeAssetsAndTracks(ctx, scan, uniqueCandidates);

  // Phase 4: Audio feature extraction
  await extractMissingFeatures(ctx, uniqueCandidates);

  // Phase 5: Rebuild albums & series
  reportProgress(config, {
    phase: 'rebuild',
    message: '开始重建系统专辑集合',
    elapsedMs: elapsed(ctx),
  });

  await rebuildAlbums(context, config);

  reportProgress(config, {
    phase: 'done',
    message: `导入完成：${scan.summary.totals.files} 个文件`,
    processed: scan.summary.totals.files,
    total: scan.summary.totals.files,
    elapsedMs: elapsed(ctx),
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
    const title = track.sourceMeta.album;
    const current = groups.get(title);
    if (current) {
      current.push(track);
    } else {
      groups.set(title, [track]);
    }
  }

  const existingAlbumMap = new Map(existingAlbums.map((album) => [album.title, album]));
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

  for (const [title, group] of groups) {
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
    const existingAlbum = existingAlbumMap.get(title);
    const albumPublicId = existingAlbum?.publicId ?? uuidv7();
    const firstTrackAsset = trackAssetMap.get(firstTrack.mediaAssetId);
    if (firstTrackAsset) {
      albumFirstTrackPath.set(albumPublicId, path.join(options.libraryRoot, ...firstTrackAsset.relativePath.split('/')));
    }

    albumDocs.push({
      publicId: albumPublicId,
      title: firstTrack.sourceMeta.album,
      albumArtist: firstTrack.sourceMeta.albumArtist,
      year: firstTrack.sourceMeta.year,
      sourceDirectory: commonDirectory(group.map((track) => trackAssetMap.get(track.mediaAssetId)?.relativePath ?? '')),
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

  const COVER_CONCURRENCY = 6;
  let nextCoverIndex = 0;

  async function processCover() {
    while (nextCoverIndex < albumDocs.length) {
      const album = albumDocs[nextCoverIndex++]!;
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
          try {
            const tagMeta = await parseFile(firstTrackPath, { skipCovers: false, duration: false });
            const picture = tagMeta.common.picture?.[0];
            if (picture) {
              await resizeCoverToPng(Buffer.from(picture.data), destPath);
            }
          } catch { /* skip failed cover extraction */ }
        }
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(COVER_CONCURRENCY, albumDocs.length) }, processCover));

  reportProgress(options, {
    phase: 'rebuild',
    message: `准备重建 ${albumDocs.length} 张专辑及 ${albumTrackDocs.length} 条专辑曲目关系`,
    processed: albumDocs.length,
    total: albumDocs.length,
  });

  // 从专辑的 sourceDirectory 中提取系列信息
  const seriesNames = new Set<string>();
  const seriesAlbumLinks: Array<{ seriesName: string; albumId: string; sortOrder?: number }> = [];

  for (const album of albumDocs) {
    const seriesName = parseSeriesFromPath(album.sourceDirectory);
    if (!seriesName) continue;

    seriesNames.add(seriesName);

    const sortOrder = parseAlbumSortOrderInSeries(album.sourceDirectory);
    seriesAlbumLinks.push({ seriesName, albumId: album.publicId, sortOrder });
  }

  const existingSeries = all<Record<string, unknown>>(context, 'SELECT * FROM series').map(mapSeries);
  const existingSeriesMap = new Map(existingSeries.map((s) => [s.name, s]));

  const seriesDocs: SeriesRecord[] = [];
  for (const name of seriesNames) {
    const existing = existingSeriesMap.get(name);
    seriesDocs.push({
      publicId: existing?.publicId ?? uuidv7(),
      name,
      sortTitle: normalizeSortTitle(name),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
  }

  const seriesIdMap = new Map(seriesDocs.map((s) => [s.name, s.publicId]));

  // Prepare statements once for all inserts
  const insertAlbumStmt = prepare(context, `
    INSERT INTO albums (
      publicId, title, albumArtist, year, sourceDirectory, sourceMeta,
      displayTitle, displayArtist, hidden, isSystemGenerated, sortTitle, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertAlbumTrackStmt = prepare(context, `
    INSERT INTO albumTracks (albumId, trackId, discNumber, discTitle, trackNumber, sortOrder, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertSeriesStmt = prepare(context, `
    INSERT INTO series (publicId, name, sortTitle, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertSeriesAlbumStmt = prepare(context, `
    INSERT INTO seriesAlbums (seriesId, albumId, sortOrder, createdAt)
    VALUES (?, ?, ?, ?)
  `);

  transaction(context, () => {
    run(context, `DELETE FROM seriesAlbums`);
    run(context, `DELETE FROM series`);
    run(context, `DELETE FROM albumTracks`);
    run(context, `DELETE FROM albums WHERE isSystemGenerated = 1`);

    for (const album of albumDocs) {
      insertAlbumStmt.run(
        album.publicId,
        album.title,
        album.albumArtist,
        album.year ?? null,
        album.sourceDirectory ?? null,
        encodeJson(album.sourceMeta),
        album.displayTitle ?? null,
        album.displayArtist ?? null,
        album.hidden ? 1 : 0,
        album.isSystemGenerated ? 1 : 0,
        album.sortTitle,
        album.createdAt,
        album.updatedAt,
      );
    }

    for (const link of albumTrackDocs) {
      insertAlbumTrackStmt.run(
        link.albumId,
        link.trackId,
        link.discNumber,
        link.discTitle ?? null,
        link.trackNumber,
        link.sortOrder,
        link.createdAt,
      );
    }

    for (const series of seriesDocs) {
      insertSeriesStmt.run(
        series.publicId,
        series.name,
        series.sortTitle,
        series.createdAt,
        series.updatedAt,
      );
    }

    for (const link of seriesAlbumLinks) {
      const seriesId = seriesIdMap.get(link.seriesName);
      if (!seriesId) continue;
      insertSeriesAlbumStmt.run(
        seriesId,
        link.albumId,
        link.sortOrder ?? null,
        now,
      );
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

async function buildCandidate(libraryRoot: string, absolutePath: string, existingStat?: { size: number; mtime: Date }): Promise<ScannedCandidate> {
  const metadata = await parseFile(absolutePath, { duration: true, skipCovers: true });
  const stat = existingStat ?? await fs.stat(absolutePath);
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
  const contentHash = await computeAudioHash(absolutePath);

  return {
    absolutePath,
    relativePath,
    contentHash,
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

/**
 * Compute a SHA-1 hash of the audio data only (skipping metadata/tags).
 * Uses music-metadata to find where the audio stream starts,
 * then hashes from that offset to the end of the audio data.
 * Falls back to hashing the entire file if offset detection fails.
 */
export async function computeAudioHash(absolutePath: string): Promise<string> {
  let audioOffset = 0;
  let audioEnd: number | undefined;
  try {
    const metadata = await parseFile(absolutePath, { duration: false, skipCovers: true });
    const native = metadata.format;
    // Use the codec header offset if available, otherwise 0
    if (native.tagTypes) {
      // For formats with leading tags (ID3v2 in MP3), the audioOffset
      // marks where audio frames actually start.
      // music-metadata exposes this via an internal path, but a reliable
      // approach is to hash from after any ID3v2 header.
      const stat = await fs.stat(absolutePath);
      const totalSize = stat.size;

      // Detect ID3v2 header size for MP3 files
      const ext = path.extname(absolutePath).toLowerCase();
      if (ext === '.mp3') {
        const fd = await fs.open(absolutePath, 'r');
        try {
          const header = Buffer.alloc(10);
          await fd.read(header, 0, 10, 0);
          // ID3v2 header: "ID3" followed by version, flags, and 4 bytes syncsafe size
          if (header[0] === 0x49 && header[1] === 0x44 && header[2] === 0x33) {
            const size = (header[6]! << 21) | (header[7]! << 14) | (header[8]! << 7) | header[9]!;
            audioOffset = 10 + size;
          }
        } finally {
          await fd.close();
        }
      }
      audioEnd = totalSize;
    }
  } catch {
    // Fall back to full file hash
  }

  const hash = createHash('sha1');
  const stream = createReadStream(absolutePath, {
    start: audioOffset,
    ...(audioEnd !== undefined ? { end: audioEnd - 1 } : {}),
  });

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

  return updateLibrary(context, config);
}
