import {defineConfig} from '@playwright/test';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
if(existsSync('.local/browsers'))process.env.PLAYWRIGHT_BROWSERS_PATH=resolve('.local/browsers');
const baseURL=process.env.E2E_WEB_ORIGIN||'http://127.0.0.1:3002';
const apiOrigin=process.env.E2E_API_ORIGIN||'http://127.0.0.1:4002';
export default defineConfig({
 testDir:'tests/e2e',fullyParallel:false,workers:1,timeout:45000,
 use:{baseURL,viewport:{width:1440,height:900},trace:'retain-on-failure',screenshot:'only-on-failure'},
 reporter:[['list'],['html',{open:'never'}]],
 webServer:{command:'pnpm dev:demo',url:baseURL,reuseExistingServer:!process.env.CI,timeout:90000,env:{WEB_ORIGIN:baseURL,API_ORIGIN:apiOrigin,NEXT_PUBLIC_API_ORIGIN:apiOrigin,API_PORT:new URL(apiOrigin).port,PORT:new URL(baseURL).port,WEB_DIST_DIR:'.next-ui'}},
});
