import path from 'node:path';

import COS from 'cos-nodejs-sdk-v5';

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

  const redirectUrl = await resolveCosUrl(config, asset.cosKey);
  return redirectUrl
    ? {
      mode: 'redirect',
      redirectUrl,
    }
    : null;
}

export async function resolveCoverAsset(context: DatabaseContext, config: AppConfig, assetId: string): Promise<StreamResolution | null> {
  const asset = await getMediaAssetById(context, assetId);
  if (!asset?.coverPath) {
    return null;
  }

  if (config.mediaSource === 'local') {
    return {
      mode: 'local',
      filePath: path.join(config.mediaCacheDir, ...asset.coverPath.split('/')),
      mimeType: asset.coverMimeType,
    };
  }

  const redirectUrl = await resolveCosUrl(config, asset.coverCosKey);
  return redirectUrl
    ? {
      mode: 'redirect',
      redirectUrl,
    }
    : null;
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
  });
}
