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
      AND syncStatus != 'synced'
  `).map(mapMediaAsset);
  const summary = {
    uploadedAudio: 0,
    failed: 0,
  };

  const total = assets.length;
  console.log(`待上传文件：${total} 个`);

  for (const [index, asset] of assets.entries()) {
    const prefix = `[${index + 1}/${total}]`;
    try {
      const localAudioPath = path.join(config.libraryRoot, ...asset.relativePath.split('/'));
      const audioKey = `audio/${asset.publicId}${asset.extension}`;

      process.stdout.write(`${prefix} 上传中 ${asset.relativePath} ...`);
      await uploadFile(client, config, localAudioPath, audioKey);
      process.stdout.write(' ✓\n');
      summary.uploadedAudio += 1;

      run(context, `
        UPDATE mediaAssets
        SET syncStatus = 'synced', updatedAt = ?
        WHERE publicId = ?
      `, [new Date().toISOString(), asset.publicId]);
    } catch (error) {
      process.stdout.write(' ✗\n');
      summary.failed += 1;
      run(context, `
        UPDATE mediaAssets
        SET syncStatus = 'failed', updatedAt = ?
        WHERE publicId = ?
      `, [new Date().toISOString(), asset.publicId]);
      console.error(`${prefix} 失败 ${asset.relativePath}:`, error);
    }
  }

  return summary;
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
