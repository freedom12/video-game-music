import COS from 'cos-nodejs-sdk-v5';

import type { StreamResolution } from './media.js';
import type { StorageProvider } from './storage.js';

export class CosStorageProvider implements StorageProvider {
  private readonly client: COS;

  constructor(
    private readonly bucket: string,
    private readonly region: string,
    private readonly secretId?: string,
    private readonly secretKey?: string,
  ) {
    if (!secretId || !secretKey) {
      throw new Error('COS credentials (secretId, secretKey) are required');
    }
    this.client = new COS({
      SecretId: secretId,
      SecretKey: secretKey,
    });
  }

  async resolveAudioStream(
    publicId: string,
    extension: string,
    _relativePath: string,
  ): Promise<StreamResolution | null> {
    const key = `audio/${publicId}${extension}`;
    const redirectUrl = await this.getObjectUrl(key);
    return redirectUrl ? { mode: 'redirect', redirectUrl } : null;
  }

  async resolveEmbeddedCover(_relativePath: string): Promise<Buffer | null> {
    // COS mode does not support embedded cover extraction
    return null;
  }

  private async getObjectUrl(key: string): Promise<string | undefined> {
    if (!this.secretId || !this.secretKey) {
      return `https://${this.bucket}.cos.${this.region}.myqcloud.com/${key}`;
    }

    return this.client.getObjectUrl({
      Bucket: this.bucket,
      Region: this.region,
      Key: key,
      Sign: true,
      Expires: 3600,
    });
  }
}
