import path from 'node:path';

import COS from 'cos-nodejs-sdk-v5';

import type { AppConfig } from './config.js';
import { all, mapMediaAsset, run } from './db.js';
import type { DatabaseContext } from './db.js';

export async function syncMediaToCos(context: DatabaseContext, config: AppConfig) {
  if (!config.cosBucket || !config.cosRegion || !config.cosSecretId || !config.cosSecretKey) {
    throw new Error('COS credentials are incomplete. Set COS_BUCKET, COS_REGION, COS_SECRET_ID, and COS_SECRET_KEY.');
  }

  const client = new COS({
    SecretId: config.cosSecretId,
    SecretKey: config.cosSecretKey,
  });

  const assets = all<Record<string, unknown>>(context, `
    SELECT *
    FROM mediaAssets
    WHERE presenceStatus = 'active'
  `).map(mapMediaAsset);
  const summary = {
    uploadedAudio: 0,
    uploadedCovers: 0,
    failed: 0,
  };

  for (const asset of assets) {
    try {
      const localAudioPath = path.join(config.libraryRoot, ...asset.relativePath.split('/'));
      const audioKey = asset.cosKey ?? joinCosKey(config.cosBasePrefix, 'audio', asset.relativePath);

      await uploadFile(client, config, localAudioPath, audioKey);
      summary.uploadedAudio += 1;

      let coverKey = asset.coverCosKey;
      if (asset.coverPath) {
        const localCoverPath = path.join(config.mediaCacheDir, ...asset.coverPath.split('/'));
        coverKey = coverKey ?? joinCosKey(config.cosBasePrefix, 'covers', path.basename(asset.coverPath));
        await uploadFile(client, config, localCoverPath, coverKey);
        summary.uploadedCovers += 1;
      }

      run(context, `
        UPDATE mediaAssets
        SET cosKey = ?, coverCosKey = ?, syncStatus = 'synced', updatedAt = ?
        WHERE publicId = ?
      `, [audioKey, coverKey ?? null, new Date().toISOString(), asset.publicId]);
    } catch (error) {
      summary.failed += 1;
      run(context, `
        UPDATE mediaAssets
        SET syncStatus = 'failed', updatedAt = ?
        WHERE publicId = ?
      `, [new Date().toISOString(), asset.publicId]);
      console.error(`Failed to sync ${asset.relativePath}:`, error);
    }
  }

  return summary;
}

function joinCosKey(prefix: string, category: string, relativePath: string) {
  return [prefix, category, relativePath.replace(/\\/g, '/')].filter(Boolean).join('/');
}

function uploadFile(client: COS, config: AppConfig, filePath: string, key: string) {
  return new Promise<void>((resolve, reject) => {
    client.sliceUploadFile(
      {
        Bucket: config.cosBucket!,
        Region: config.cosRegion!,
        Key: key,
        FilePath: filePath,
      },
      (error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      },
    );
  });
}
