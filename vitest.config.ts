import { defineConfig } from 'vitest/config';
export default defineConfig({test:{include:['packages/**/*.test.ts','apps/**/*.test.ts','fixtures/**/*.test.ts'],testTimeout:15000}});
