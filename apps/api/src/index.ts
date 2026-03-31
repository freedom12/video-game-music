import { loadWorkspaceEnv } from '@vgm/core';

import { createApp } from './app.js';

loadWorkspaceEnv(process.cwd());
const app = await createApp();
const port = Number.parseInt(process.env.API_PORT ?? "5005", 10);

try {
  await app.listen({
    port,
    host: '0.0.0.0',
  });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
