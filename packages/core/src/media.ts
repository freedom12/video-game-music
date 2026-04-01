import path from 'node:path';

import type { AppConfig } from './config.js';
import type { DatabaseContext } from './db.js';
import { getMediaAssetById, getTrackRecordById } from './catalog.js';
import { CosStorageProvider } from './storage-cos.js';
import { LocalStorageProvider } from './storage-local.js';
import type { StorageProvider } from './storage.js';

export interface StreamResolution {
  mode: 'local' | 'redirect';
  filePath?: string;
  mimeType?: string;
  redirectUrl?: string;
}

export function createStorageProvider(config: AppConfig): StorageProvider {
  if (config.mediaSource === 'cos') {
    return new CosStorageProvider(
      config.cosBucket ?? '',
      config.cosRegion ?? '',
      config.cosSecretId,
      config.cosSecretKey,
    );
  }

  return new LocalStorageProvider(config.libraryRoot);
}

export async function resolveTrackStream(context: DatabaseContext, config: AppConfig, trackId: string): Promise<StreamResolution | null> {
  const track = await getTrackRecordById(context, trackId);
  if (!track) {
    return null;
  }

  const asset = await getMediaAssetById(context, track.mediaAssetId);
  if (!asset) {
    return null;
  }

  const provider = createStorageProvider(config);
  return provider.resolveAudioStream(asset.publicId, asset.extension, asset.relativePath);
}

export async function resolveCoverAsset(_context: DatabaseContext, config: AppConfig, assetId: string): Promise<StreamResolution | null> {
  const coversDir = path.join(config.mediaCacheDir, 'covers');

  for (const ext of ['.png', '.jpg', '.jpeg', '.webp'] as const) {
    const filePath = path.join(coversDir, `${assetId}${ext}`);
    try {
      await import('node:fs/promises').then((fs) => fs.access(filePath));
      return {
        mode: 'local',
        filePath,
        mimeType: ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg',
      };
    } catch {
      // try next extension
    }
  }

  return null;
}

export async function resolveTrackEmbeddedCover(
  context: DatabaseContext,
  config: AppConfig,
  trackId: string,
): Promise<Buffer | null> {
  const track = await getTrackRecordById(context, trackId);
  if (!track) return null;

  const asset = await getMediaAssetById(context, track.mediaAssetId);
  if (!asset) return null;

  const provider = createStorageProvider(config);
  return provider.resolveEmbeddedCover(asset.relativePath);
}
