import { createServer } from './server.js';
import { loadConfig } from './config.js';
import { fileURLToPath } from 'node:url';
import { loadEnvLocal } from '../../../scripts/load-env-local.js';
loadEnvLocal(fileURLToPath(new URL('../../../.env.local', import.meta.url)));
const config = loadConfig();
const app = await createServer(config);
await app.listen({ host: config.host, port: config.port });
console.info(`Antelens API: ${config.apiOrigin} · ${config.mode === 'demo' ? 'Demo data — synthetic sources and simulated investigations' : 'Live mode — authenticated accounts'}`);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.on(signal, () => void app.close().then(() => process.exit(0)));
