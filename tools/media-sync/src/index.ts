import { closeDatabase, getDatabase, loadConfig, loadWorkspaceEnv, syncMediaToCos } from '@vgm/core';

const command = process.argv[2] ?? 'sync';
loadWorkspaceEnv(process.cwd());

async function main() {
  if (command !== 'sync') {
    throw new Error(`Unsupported command: ${command}`);
  }

  const config = loadConfig(process.env, process.cwd());
  const context = await getDatabase(config);
  const summary = await syncMediaToCos(context, config);
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
