import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { SimilarTrack } from '@vgm/shared';

import { all, get, prepare, run } from './db.js';
import type { DatabaseContext } from './db.js';

const execFileAsync = promisify(execFile);

// Meyda uses a default export in TS types but CJS named exports at runtime.
// Use dynamic import + fallback to handle both.
let _meyda: typeof import('meyda').default | undefined;
async function getMeyda() {
  if (_meyda) return _meyda;
  const mod = await import('meyda');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _meyda = (mod as any).default ?? mod;
  return _meyda!;
}

const SAMPLE_RATE = 22050;
const BUFFER_SIZE = 2048;
const HOP_SIZE = 1024;
const CHROMA_DIM = 12;
const MFCC_DIM = 13;

// ---------------------------------------------------------------------------
// Feature extraction
// ---------------------------------------------------------------------------

/** Decode any audio file to mono f32le PCM via ffmpeg. */
export async function decodeToMonoPCM(filePath: string): Promise<Float32Array> {
  const { stdout } = await execFileAsync('ffmpeg', [
    '-i', filePath,
    '-f', 'f32le',
    '-acodec', 'pcm_f32le',
    '-ar', String(SAMPLE_RATE),
    '-ac', '1',
    '-v', 'quiet',
    'pipe:1',
  ], {
    encoding: 'buffer',
    maxBuffer: 200 * 1024 * 1024,
  });

  return new Float32Array(stdout.buffer, stdout.byteOffset, stdout.byteLength / 4);
}

export interface AudioFeatureVectors {
  chromaVector: Float32Array;   // mean (12-d)
  mfccVector: Float32Array;     // mean (13-d)
  chromaStdVector: Float32Array; // std  (12-d)
  mfccStdVector: Float32Array;   // std  (13-d)
}

/** Extract chroma and MFCC mean + std vectors from raw PCM samples. */
export async function extractFeatures(samples: Float32Array): Promise<AudioFeatureVectors> {
  const meyda = await getMeyda();
  meyda.sampleRate = SAMPLE_RATE;
  meyda.bufferSize = BUFFER_SIZE;

  const chromaSums = new Float64Array(CHROMA_DIM);
  const chromaSqSums = new Float64Array(CHROMA_DIM);
  const mfccSums = new Float64Array(MFCC_DIM);
  const mfccSqSums = new Float64Array(MFCC_DIM);
  let frameCount = 0;

  for (let offset = 0; offset + BUFFER_SIZE <= samples.length; offset += HOP_SIZE) {
    const frame = samples.slice(offset, offset + BUFFER_SIZE);
    const features = meyda.extract(['chroma', 'mfcc'], frame);

    if (!features) continue;

    if (features.chroma) {
      for (let i = 0; i < CHROMA_DIM; i++) {
        const v = features.chroma[i]!;
        chromaSums[i] = chromaSums[i]! + v;
        chromaSqSums[i] = chromaSqSums[i]! + v * v;
      }
    }
    if (features.mfcc) {
      for (let i = 0; i < MFCC_DIM; i++) {
        const v = features.mfcc[i]!;
        mfccSums[i] = mfccSums[i]! + v;
        mfccSqSums[i] = mfccSqSums[i]! + v * v;
      }
    }
    frameCount++;
  }

  const chromaVector = new Float32Array(CHROMA_DIM);
  const mfccVector = new Float32Array(MFCC_DIM);
  const chromaStdVector = new Float32Array(CHROMA_DIM);
  const mfccStdVector = new Float32Array(MFCC_DIM);

  if (frameCount > 0) {
    for (let i = 0; i < CHROMA_DIM; i++) {
      const mean = chromaSums[i]! / frameCount;
      chromaVector[i] = mean;
      chromaStdVector[i] = Math.sqrt(Math.max(0, chromaSqSums[i]! / frameCount - mean * mean));
    }
    for (let i = 0; i < MFCC_DIM; i++) {
      const mean = mfccSums[i]! / frameCount;
      mfccVector[i] = mean;
      mfccStdVector[i] = Math.sqrt(Math.max(0, mfccSqSums[i]! / frameCount - mean * mean));
    }
  }

  return { chromaVector, mfccVector, chromaStdVector, mfccStdVector };
}

/** Full pipeline: decode file + extract features. */
export async function extractAudioFeatures(filePath: string): Promise<AudioFeatureVectors> {
  const samples = await decodeToMonoPCM(filePath);
  return await extractFeatures(samples);
}

// ---------------------------------------------------------------------------
// Database persistence
// ---------------------------------------------------------------------------

function float32ToBlob(arr: Float32Array): Buffer {
  return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
}

function blobToFloat32(buf: Buffer): Float32Array {
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return new Float32Array(ab);
}

export function upsertAudioFeature(
  context: DatabaseContext,
  mediaAssetId: string,
  features: AudioFeatureVectors,
) {
  const now = new Date().toISOString();
  run(context, `
    INSERT INTO audioFeatures (mediaAssetId, chromaVector, mfccVector, chromaStdVector, mfccStdVector, createdAt)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(mediaAssetId) DO UPDATE SET
      chromaVector = excluded.chromaVector,
      mfccVector = excluded.mfccVector,
      chromaStdVector = excluded.chromaStdVector,
      mfccStdVector = excluded.mfccStdVector,
      createdAt = excluded.createdAt
  `, [
    mediaAssetId,
    float32ToBlob(features.chromaVector),
    float32ToBlob(features.mfccVector),
    float32ToBlob(features.chromaStdVector),
    float32ToBlob(features.mfccStdVector),
    now,
  ]);
}

export function hasAudioFeature(context: DatabaseContext, mediaAssetId: string): boolean {
  const row = get<{ n: number }>(context, `SELECT 1 AS n FROM audioFeatures WHERE mediaAssetId = ?`, [mediaAssetId]);
  return row !== undefined;
}

/** Batch-insert features inside an already-open transaction. */
export function upsertAudioFeatureBatch(
  context: DatabaseContext,
  items: Array<{ mediaAssetId: string; features: AudioFeatureVectors }>,
) {
  const stmt = prepare(context, `
    INSERT INTO audioFeatures (mediaAssetId, chromaVector, mfccVector, chromaStdVector, mfccStdVector, createdAt)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(mediaAssetId) DO UPDATE SET
      chromaVector = excluded.chromaVector,
      mfccVector = excluded.mfccVector,
      chromaStdVector = excluded.chromaStdVector,
      mfccStdVector = excluded.mfccStdVector,
      createdAt = excluded.createdAt
  `);
  const now = new Date().toISOString();
  for (const item of items) {
    stmt.run(
      item.mediaAssetId,
      float32ToBlob(item.features.chromaVector),
      float32ToBlob(item.features.mfccVector),
      float32ToBlob(item.features.chromaStdVector),
      float32ToBlob(item.features.mfccStdVector),
      now,
    );
  }
}

// ---------------------------------------------------------------------------
// Similarity search
// ---------------------------------------------------------------------------

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/** Z-normalize a vector (zero mean, unit variance). Cosine of z-normalized vectors = Pearson r. */
function zNormalize(v: Float32Array): Float32Array {
  const n = v.length;
  let sum = 0;
  let sum2 = 0;
  for (let i = 0; i < n; i++) {
    sum += v[i]!;
    sum2 += v[i]! * v[i]!;
  }
  const mean = sum / n;
  const std = Math.sqrt(sum2 / n - mean * mean) || 1;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = (v[i]! - mean) / std;
  return out;
}

/** Drop MFCC[0] (energy) — it reflects loudness, not timbre. */
function mfccWithoutEnergy(v: Float32Array): Float32Array {
  return v.slice(1);
}

/**
 * Find tracks most similar to the given feature vectors.
 * Four-axis scoring:
 *   0.35 × chroma mean + 0.15 × chroma std + 0.30 × MFCC mean + 0.20 × MFCC std
 * Chroma mean captures melody, MFCC mean captures timbre, std vectors capture
 * temporal dynamics (attack/sustain patterns, arrangement texture).
 * Falls back to mean-only scoring when std vectors are not yet backfilled.
 */
export function findSimilarTracks(
  context: DatabaseContext,
  query: AudioFeatureVectors,
  topK = 20,
): SimilarTrack[] {
  const rows = all<Record<string, unknown>>(
    context,
    `SELECT af.mediaAssetId, af.chromaVector, af.mfccVector,
            af.chromaStdVector, af.mfccStdVector
     FROM audioFeatures af
     JOIN mediaAssets ma ON ma.publicId = af.mediaAssetId
     WHERE ma.presenceStatus = 'active'`,
  );

  const qChromaMean = zNormalize(query.chromaVector);
  const qMfccMean = zNormalize(mfccWithoutEnergy(query.mfccVector));
  const qChromaStd = zNormalize(query.chromaStdVector);
  const qMfccStd = zNormalize(mfccWithoutEnergy(query.mfccStdVector));

  const scored: Array<{ mediaAssetId: string; score: number; melodySim: number; overallSim: number }> = [];
  for (const row of rows) {
    const chromaMean = zNormalize(blobToFloat32(row.chromaVector as Buffer));
    const mfccMean = zNormalize(mfccWithoutEnergy(blobToFloat32(row.mfccVector as Buffer)));
    const chromaMeanSim = cosineSimilarity(qChromaMean, chromaMean);
    const mfccMeanSim = cosineSimilarity(qMfccMean, mfccMean);

    let raw: number;
    let melodySim: number;
    const hasStd = row.chromaStdVector != null && row.mfccStdVector != null;
    if (hasStd) {
      const chromaStd = zNormalize(blobToFloat32(row.chromaStdVector as Buffer));
      const mfccStd = zNormalize(mfccWithoutEnergy(blobToFloat32(row.mfccStdVector as Buffer)));
      const chromaStdSim = cosineSimilarity(qChromaStd, chromaStd);
      const mfccStdSim = cosineSimilarity(qMfccStd, mfccStd);
      melodySim = 0.7 * chromaMeanSim + 0.3 * chromaStdSim;
      raw = 0.35 * chromaMeanSim + 0.15 * chromaStdSim + 0.30 * mfccMeanSim + 0.20 * mfccStdSim;
    } else {
      // Legacy rows without std vectors — fall back to mean-only
      melodySim = chromaMeanSim;
      raw = 0.6 * chromaMeanSim + 0.4 * mfccMeanSim;
    }
    scored.push({
      mediaAssetId: String(row.mediaAssetId),
      score: Math.max(0, raw),
      melodySim: Math.max(0, melodySim),
      overallSim: Math.max(0, raw),
    });
  }

  scored.sort((a, b) => b.score - a.score);
  const topItems = scored.slice(0, topK);

  // Enrich with track info
  const results: SimilarTrack[] = [];
  for (const item of topItems) {
    const row = get<Record<string, unknown>>(context, `
      SELECT t.publicId, t.title, t.artist, t.durationSeconds,
             t.displayTitle, t.displayArtist, t.mediaAssetId,
             at2.albumId, a.title AS albumTitle, a.albumArtist
      FROM tracks t
      LEFT JOIN albumTracks at2 ON at2.trackId = t.publicId
      LEFT JOIN albums a ON a.publicId = at2.albumId
      WHERE t.mediaAssetId = ? AND t.hidden = 0
      LIMIT 1
    `, [item.mediaAssetId]);

    if (!row) continue;

    results.push({
      publicId: String(row.publicId),
      title: typeof row.displayTitle === 'string' && row.displayTitle ? row.displayTitle : String(row.title),
      artist: typeof row.displayArtist === 'string' && row.displayArtist ? row.displayArtist : String(row.artist),
      durationSeconds: Number(row.durationSeconds ?? 0),
      mediaAssetId: String(row.mediaAssetId),
      albumId: typeof row.albumId === 'string' ? row.albumId : undefined,
      albumTitle: typeof row.albumTitle === 'string' ? row.albumTitle : undefined,
      albumArtist: typeof row.albumArtist === 'string' ? row.albumArtist : undefined,
      similarityScore: Math.round(item.score * 10000) / 10000,
      melodySimilarity: Math.round(item.melodySim * 10000) / 10000,
      overallSimilarity: Math.round(item.overallSim * 10000) / 10000,
    });
  }

  return results;
}

/**
 * High-level: given a temporary uploaded audio file, find similar tracks.
 */
export async function findSimilarByFile(
  context: DatabaseContext,
  filePath: string,
  topK = 20,
): Promise<SimilarTrack[]> {
  const features = await extractAudioFeatures(filePath);
  return findSimilarTracks(context, features, topK);
}
