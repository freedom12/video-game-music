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
  cosBasePrefix: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): AppConfig {
  const workspaceRoot = resolveWorkspaceRoot(cwd);

  return {
    apiPort: Number.parseInt(env.API_PORT ?? '8787', 10),
    workspaceRoot,
    databasePath: env.DATABASE_PATH ?? path.join(workspaceRoot, 'var', 'video-game-music.sqlite'),
    mediaSource: env.MEDIA_SOURCE === 'cos' ? 'cos' : 'local',
    libraryRoot: env.MEDIA_LIBRARY_ROOT ?? 'F:\\wh\\音乐',
    mediaCacheDir: env.MEDIA_CACHE_DIR ?? path.join(workspaceRoot, 'var', 'media-cache'),
    adminToken: env.ADMIN_TOKEN?.trim() || undefined,
    cosBucket: env.COS_BUCKET?.trim() || undefined,
    cosRegion: env.COS_REGION?.trim() || undefined,
    cosSecretId: env.COS_SECRET_ID?.trim() || undefined,
    cosSecretKey: env.COS_SECRET_KEY?.trim() || undefined,
    cosBasePrefix: env.COS_BASE_PREFIX?.trim() || 'vgm',
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
  loadDotEnvFile({ path: path.join(workspaceRoot, '.env') });
  return workspaceRoot;
}
