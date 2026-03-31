import path from 'node:path';

import { all, cleanLibrary, closeDatabase, commitLibrary, extractAudioFeatures, getDatabase, hasAudioFeature, initLibrary, loadConfig, loadWorkspaceEnv, transaction, upsertAudioFeatureBatch } from '@vgm/core';
import type { AudioFeatureVectors } from '@vgm/core';

loadWorkspaceEnv(process.cwd());
const config = loadConfig(process.env, process.cwd());

function formatImportProgress(event: import('@vgm/shared').ImportProgressEvent) {
  const progress = event.total ? ` ${event.processed ?? 0}/${event.total}` : '';
  const elapsed = typeof event.elapsedMs === 'number' ? ` (${Math.round(event.elapsedMs / 1000)}s)` : '';
  return `[import:${event.phase}]${progress}${elapsed} ${event.message}`;
}

const command = process.argv[2] ?? 'update';

async function main() {
  const context = await getDatabase(config);
  const configWithProgress = { ...config, onImportProgress: (event: import('@vgm/shared').ImportProgressEvent) => console.log(formatImportProgress(event)) };

  if (command === 'init') {
    console.log('清空所有数据，开始完整重导入...');
    const summary = await initLibrary(context, configWithProgress);
    console.log(JSON.stringify(summary, null, 2));
  } else if (command === 'clean') {
    const summary = await cleanLibrary(context, config);
    console.log(JSON.stringify(summary, null, 2));
  } else {
    const summary = await commitLibrary(context, configWithProgress);
    console.log(JSON.stringify(summary, null, 2));
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
