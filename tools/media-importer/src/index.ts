import { closeDatabase, commitLibrary, getDatabase, loadConfig, loadWorkspaceEnv, scanLibrary } from '@vgm/core';

const command = process.argv[2] ?? 'scan';
loadWorkspaceEnv(process.cwd());
const config = loadConfig(process.env, process.cwd());

async function main() {
  const context = await getDatabase(config);

  if (command === 'commit') {
    const summary = await commitLibrary(context, config);
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  const result = await scanLibrary(context, {
    libraryRoot: config.libraryRoot,
    cacheDir: config.mediaCacheDir,
  });
  console.log(JSON.stringify(result.summary, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
