import { defineConfig } from 'wxt';
import { manifestKey } from './manifest-key';
const apiOrigin = process.env.VITE_API_ORIGIN ?? 'http://127.0.0.1:4000';
const mode = process.env.APP_MODE ?? 'live';
if (mode === 'demo' && !['localhost', '127.0.0.1'].includes(new URL(apiOrigin).hostname)) throw new Error('Demo extensions require a loopback API.');
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  hooks: {
    'build:manifestGenerated': (_wxt, manifest) => {
      // WXT adds runtime content-script matches to host_permissions. Keep them optional.
      manifest.host_permissions = [`${new URL(apiOrigin).origin}/*`];
    },
  },
  manifest: {
    key: manifestKey,
    name: 'Antelens', description: 'Investigate requests on sites you explicitly allow.', version: '0.1.0',
    permissions: ['storage', 'scripting', 'activeTab', 'identity'],
    host_permissions: [`${new URL(apiOrigin).origin}/*`],
    optional_host_permissions: ['https://*/*', 'http://localhost/*', 'http://127.0.0.1/*'],
    action: { default_title: 'Antelens' },
    content_security_policy: { extension_pages: "script-src 'self'; object-src 'self'" },
  },
  vite: () => ({ define: { __APP_MODE__: JSON.stringify(mode) } }),
});
