import fs from 'node:fs';
import path from 'node:path';

import { config as loadDotEnvFile } from 'dotenv';

export interface AppConfig {
  apiPort: number;
  workspaceRoot: string;
  databasePath: string;
  mediaSource: 'local' | 'cos';
  libraryRoot: string;
  mediaCacheDir: string;
  adminToken?: string;
  cosBucket?: string;
  cosRegion?: string;
  cosSecretId?: string;
  cosSecretKey?: string;
  onImportProgress?: (event: import('@vgm/shared').ImportProgressEvent) => void;
}

function resolveFromWorkspace(workspaceRoot: string, value: string | undefined, fallback: string) {
  if (!value?.trim()) {
    return fallback;
  }

  return path.isAbsolute(value) ? value : path.resolve(workspaceRoot, value);
}

function requireEnv(env: NodeJS.ProcessEnv, key: string) {
  const value = env[key]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): AppConfig {
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const libraryRoot = requireEnv(env, 'MEDIA_LIBRARY_ROOT');

  return {
    apiPort: Number.parseInt(env.API_PORT ?? '8787', 10),
    workspaceRoot,
    databasePath: resolveFromWorkspace(
      workspaceRoot,
      env.DATABASE_PATH,
      path.join(workspaceRoot, 'var', 'video-game-music.sqlite'),
    ),
    mediaSource: env.MEDIA_SOURCE === 'cos' ? 'cos' : 'local',
    libraryRoot: resolveFromWorkspace(workspaceRoot, libraryRoot, libraryRoot),
    mediaCacheDir: resolveFromWorkspace(
      workspaceRoot,
      env.MEDIA_CACHE_DIR,
      path.join(workspaceRoot, 'var', 'media-cache'),
    ),
    adminToken: env.ADMIN_TOKEN?.trim() || undefined,
    cosBucket: env.COS_BUCKET?.trim() || undefined,
    cosRegion: env.COS_REGION?.trim() || undefined,
    cosSecretId: env.COS_SECRET_ID?.trim() || undefined,
    cosSecretKey: env.COS_SECRET_KEY?.trim() || undefined,
  };
}

export function resolveWorkspaceRoot(start = process.cwd()): string {
  let current = path.resolve(start);

  while (true) {
    if (fs.existsSync(path.join(current, 'pnpm-workspace.yaml'))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return start;
    }

    current = parent;
  }
}

export function loadWorkspaceEnv(start = process.cwd()) {
  const workspaceRoot = resolveWorkspaceRoot(start);
  const envPath = path.join(workspaceRoot, '.env');

  if (!fs.existsSync(envPath)) {
    throw new Error(`Missing required environment file: ${envPath}`);
  }

  loadDotEnvFile({ path: envPath });
  return workspaceRoot;
}
