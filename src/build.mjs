import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';

const root = new URL('../',import.meta.url);
const bundle = new URL('dist/server/',root);
await mkdir(bundle,{recursive:true});
await mkdir(new URL('dist/.openai/',root),{recursive:true});
const types = {html:'text/html',js:'text/javascript',css:'text/css',svg:'image/svg+xml',txt:'text/plain'};
const assets = {};
for (const path of ['index.html','app.js','styles.css','logo.svg','favicon.svg','lettermark.svg','Inter-OFL.txt']) {
  assets[`/${path}`] = [await readFile(new URL(`public/${path}`,root),'utf8'),types[path.split('.').pop()]];
}
assets['/inter.woff2'] = [(await readFile(new URL('public/inter.woff2',root))).toString('base64'),'font/woff2'];
await writeFile(new URL('assets.mjs',bundle),`export const assets=${JSON.stringify(assets)};\n`);
for (const file of ['room.mjs','api.mjs','store.mjs','solana.mjs']) await cp(new URL(`src/${file}`,root),new URL(file,bundle));
await cp(new URL('src/worker.mjs',root),new URL('index.js',bundle));
await cp(new URL('.openai/hosting.json',root),new URL('dist/.openai/hosting.json',root));
console.log('Built Setloop Worker in dist/server.');
