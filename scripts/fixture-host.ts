import { createServer } from 'node:http';
import { fixturePage, scenarios } from '../fixtures/src/index.ts';
import { capturePages, rentalPage, scenarioIndexPage } from '../fixtures/src/capture-pages.ts';

const port = Number(process.env.FIXTURE_HOST_PORT ?? 4080);
const host = process.env.FIXTURE_HOST ?? '127.0.0.1';

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${host}:${port}`);
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Method not allowed');
    return;
  }
  const headers = {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; frame-ancestors 'none'",
    'Cache-Control': 'no-store',
  };
  if (url.pathname === '/' || url.pathname === '/fixtures' || url.pathname === '/fixtures/') {
    res.writeHead(200, headers);
    res.end(scenarioIndexPage());
    return;
  }
  const match = url.pathname.match(/^\/fixtures\/([A-Z0-9-]+)$/);
  if (!match) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }
  const page = capturePages[match[1]!];
  if (page) {
    res.writeHead(200, headers);
    res.end(page.render());
    return;
  }
  const scenario = scenarios[match[1]!];
  if (!scenario) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Fixture not found');
    return;
  }
  const rawFee = url.searchParams.get('monthlyFee');
  const fee = rawFee == null ? 29 : Math.min(999, Math.max(0, Number.parseInt(rawFee, 10) || 29));
  res.writeHead(200, headers);
  res.end(scenario.id === 'SC-01' ? rentalPage(fee) : fixturePage(scenario, fee));
});

server.listen(port, host, () => {
  console.log(`Controlled fixture host · scenario index http://${host}:${port}/`);
});
