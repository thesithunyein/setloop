import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { Readable } from 'node:stream';
import { handleApi } from './api.mjs';
import { roomStore, SCHEMA } from './store.mjs';

const contentTypes = new Map([
  ['/app.js', 'text/javascript'], ['/styles.css', 'text/css'], ['/favicon.svg', 'image/svg+xml'],
  ['/setloop-logo.png', 'image/png'],
  ['/logo.svg', 'image/svg+xml'], ['/lettermark.svg', 'image/svg+xml'],
  ['/google-sans.woff2','font/woff2'], ['/Google-Sans-OFL.txt','text/plain'],
]);

export function createSetloopServer(databasePath = ':memory:', clock = Date.now, chain = null) {
  const db = new DatabaseSync(databasePath);
  db.exec(SCHEMA);
  const store = roomStore({
    first: (sql, ...args) => db.prepare(sql).get(...args),
    run: (sql, ...args) => db.prepare(sql).run(...args).changes,
  });
  const active = new Map();
  async function routeRequest(request, path) {
    const key = path.match(/^\/api\/rooms\/([A-Z0-9]{6})(?:\/|$)/i)?.[1]?.toUpperCase();
    if (!chain || !key) return handleApi(request,store,clock,chain);
    const result = (active.get(key) || Promise.resolve()).catch(()=>{}).then(()=>handleApi(request,store,clock,chain));
    active.set(key,result);
    try { return await result; }
    finally { if (active.get(key) === result) active.delete(key); }
  }
  const server = createServer(async (incoming, response) => {
    try {
      const origin = `http://${incoming.headers.host || 'localhost'}`;
      const url = new URL(incoming.url, origin);
      if (url.pathname.startsWith('/api/')) {
        const body = incoming.method === 'POST' ? Readable.toWeb(incoming) : undefined;
        const request = new Request(url, {method: incoming.method, headers: incoming.headers, body, duplex: 'half'});
        const result = await routeRequest(request,url.pathname);
        response.writeHead(result.status, Object.fromEntries(result.headers));
        response.end(Buffer.from(await result.arrayBuffer()));
        return;
      }
      const path = contentTypes.has(url.pathname) ? url.pathname : '/index.html';
      const bytes = await readFile(new URL(`../public${path}`, import.meta.url));
      const type = contentTypes.get(path) || 'text/html';
      response.writeHead(200, {'Content-Type': (type === 'image/png' || type.startsWith('font/')) ? type : `${type}; charset=utf-8`, 'X-Content-Type-Options': 'nosniff'});
      response.end(incoming.method === 'HEAD' ? undefined : bytes);
    } catch (error) {
      console.error(error);
      if (!response.headersSent) response.writeHead(500, {'Content-Type': 'text/plain'});
      response.end('Setloop could not complete this request.');
    }
  });
  server.on('close', () => db.close());
  return server;
}

if (process.argv[1] && new URL(import.meta.url).pathname.endsWith('/src/server.mjs') && /(?:^|[/\\])server\.mjs$/.test(process.argv[1])) {
  const directory = new URL('../.data/', import.meta.url);
  mkdirSync(directory, {recursive: true});
  const programMode = process.env.SETLOOP_CHAIN_KEYPAIR;
  const chain = programMode ? await (await import('../chain/bridge.mjs')).makeBridge(programMode) : null;
  const file = chain ? 'setloop-devnet.sqlite' : 'setloop.sqlite';
  const server = createSetloopServer(process.env.SETLOOP_DB || new URL(file,directory),Date.now,chain);
  const host = process.env.SETLOOP_HOST || '127.0.0.1';
  server.listen(Number(process.env.PORT || 4173), host, () => console.log(`Setloop running at http://${host}:${server.address().port}`));
}
