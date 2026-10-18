import { createServer } from './server.js';
import { loadConfig } from './config.js';
const config = loadConfig();
const app = await createServer(config);
await app.listen({ host: config.host, port: config.port });
console.info(`Before You API: ${config.apiOrigin} · ${config.mode === 'demo' ? 'Demo data — synthetic sources and simulated investigations' : 'Live mode — authenticated accounts'}`);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.on(signal, () => void app.close().then(() => process.exit(0)));
