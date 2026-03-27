import path from 'node:path';

import COS from 'cos-nodejs-sdk-v5';
import { parseFile } from 'music-metadata';
import sharp from 'sharp';

import type { AppConfig } from './config.js';
import type { DatabaseContext } from './db.js';
import { getMediaAssetById, getTrackById } from './catalog.js';

export interface StreamResolution {
  mode: 'local' | 'redirect';
  filePath?: string;
  mimeType?: string;
  redirectUrl?: string;
}

export async function resolveTrackStream(context: DatabaseContext, config: AppConfig, trackId: string): Promise<StreamResolution | null> {
  const track = await getTrackById(context, trackId);
  if (!track) {
    return null;
  }

  const asset = await getMediaAssetById(context, track.mediaAssetId);
  if (!asset) {
    return null;
  }

  if (config.mediaSource === 'local') {
    return {
      mode: 'local',
      filePath: path.join(config.libraryRoot, ...asset.relativePath.split('/')),
      mimeType: asset.mimeType,
    };
  }

  const cosKey = `audio/${asset.publicId}${asset.extension}`;
  const redirectUrl = await resolveCosUrl(config, cosKey);
  return redirectUrl
    ? {
      mode: 'redirect',
      redirectUrl,
    }
    : null;
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
  const track = await getTrackById(context, trackId);
  if (!track) return null;

  const asset = await getMediaAssetById(context, track.mediaAssetId);
  if (!asset || config.mediaSource !== 'local') return null;

  const filePath = path.join(config.libraryRoot, ...asset.relativePath.split('/'));
  const metadata = await parseFile(filePath, { skipCovers: false, duration: false });
  const picture = metadata.common.picture?.[0];
  if (!picture) return null;

  return sharp(Buffer.from(picture.data))
    .resize(512, 512, { fit: 'inside' })
    .png()
    .toBuffer();
}

async function resolveCosUrl(config: AppConfig, key?: string) {
  if (!key || !config.cosBucket || !config.cosRegion) {
    return undefined;
  }

  if (!config.cosSecretId || !config.cosSecretKey) {
    return `https://${config.cosBucket}.cos.${config.cosRegion}.myqcloud.com/${key}`;
  }

  const client = new COS({
    SecretId: config.cosSecretId,
    SecretKey: config.cosSecretKey,
  });

  return client.getObjectUrl({
    Bucket: config.cosBucket,
    Region: config.cosRegion,
    Key: key,
    Sign: true,
    Expires: 3600,
  });
}
