import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { listModels } from '@factory/droid-sdk/node';

if (existsSync('../../.env.local')) process.loadEnvFile('../../.env.local');

async function main() {
  const cwd = await mkdtemp(join(tmpdir(), 'byok-'));
  try {
    await mkdir(join(cwd, '.factory'), { recursive: true });
    await writeFile(join(cwd, '.factory/settings.json'), JSON.stringify({
      cloudSessionSync: false,
      customModels: [{
        model: process.argv[2] ?? 'claude-sonnet-4-6',
        displayName: 'Before You Claude',
        provider: 'anthropic',
        baseUrl: 'https://api.anthropic.com',
        apiKey: '${ANTHROPIC_API_KEY}',
        maxOutputTokens: 4096,
      }],
    }));
    const execPath = join(dirname(createRequire(import.meta.url).resolve('droid/package.json')), 'bin', 'droid');
    const env: Record<string, string> = { ...process.env as Record<string, string>, FACTORY_HOME_OVERRIDE: cwd, TERM: 'dumb', CI: '1' };
    const models = await listModels({ apiKey: process.env.FACTORY_API_KEY ?? '', cwd, env, execPath });
    console.log(JSON.stringify(models.filter(m => m.isCustom || m.id.includes('claude')), null, 2));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
