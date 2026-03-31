import fs from 'node:fs';
import path from 'node:path';

import { config as loadDotEnvFile } from 'dotenv';
import { z } from 'zod';

const envSchema = z
  .object({
    API_PORT: z.string().regex(/^\d+$/).default("5005"),
    MEDIA_SOURCE: z.enum(["local", "cos"]).default("local"),
    MEDIA_LIBRARY_ROOT: z.string().trim().optional(),
    DATABASE_PATH: z.string().trim().optional(),
    MEDIA_CACHE_DIR: z.string().trim().optional(),
    BASE_URL: z.string().trim().optional(),
    COS_BUCKET: z.string().trim().optional(),
    COS_REGION: z.string().trim().optional(),
    COS_SECRET_ID: z.string().trim().optional(),
    COS_SECRET_KEY: z.string().trim().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.MEDIA_SOURCE === "local" && !data.MEDIA_LIBRARY_ROOT) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'MEDIA_LIBRARY_ROOT is required when MEDIA_SOURCE is "local"',
        path: ["MEDIA_LIBRARY_ROOT"],
      });
    }
  });

export interface AppConfig {
  apiPort: number;
  workspaceRoot: string;
  databasePath: string;
  mediaSource: 'local' | 'cos';
  libraryRoot: string;
  mediaCacheDir: string;
  /** 服务对外暴露的 Base URL，用于生成 streamUrl/coverUrl。未配置时从请求头自动推断。 */
  baseUrl?: string;
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

export function loadConfig(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): AppConfig {
  const workspaceRoot = resolveWorkspaceRoot(cwd);

  const parsed = envSchema.parse({
    API_PORT: env.API_PORT,
    MEDIA_SOURCE: env.MEDIA_SOURCE,
    MEDIA_LIBRARY_ROOT: env.MEDIA_LIBRARY_ROOT,
    DATABASE_PATH: env.DATABASE_PATH,
    MEDIA_CACHE_DIR: env.MEDIA_CACHE_DIR,
    BASE_URL: env.BASE_URL,
    COS_BUCKET: env.COS_BUCKET,
    COS_REGION: env.COS_REGION,
    COS_SECRET_ID: env.COS_SECRET_ID,
    COS_SECRET_KEY: env.COS_SECRET_KEY,
  });

  const libraryRootRaw = parsed.MEDIA_LIBRARY_ROOT ?? '';

  return {
    apiPort: Number.parseInt(parsed.API_PORT, 10),
    workspaceRoot,
    databasePath: resolveFromWorkspace(
      workspaceRoot,
      parsed.DATABASE_PATH,
      path.join(workspaceRoot, 'var', 'video-game-music.sqlite'),
    ),
    mediaSource: parsed.MEDIA_SOURCE,
    libraryRoot: libraryRootRaw ? resolveFromWorkspace(workspaceRoot, libraryRootRaw, libraryRootRaw) : '',
    mediaCacheDir: resolveFromWorkspace(
      workspaceRoot,
      parsed.MEDIA_CACHE_DIR,
      path.join(workspaceRoot, 'var', 'media-cache'),
    ),
    baseUrl: parsed.BASE_URL?.replace(/\/$/, '') || undefined,
    cosBucket: parsed.COS_BUCKET || undefined,
    cosRegion: parsed.COS_REGION || undefined,
    cosSecretId: parsed.COS_SECRET_ID || undefined,
    cosSecretKey: parsed.COS_SECRET_KEY || undefined,
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
