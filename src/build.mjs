import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';

const root = new URL('../',import.meta.url);
const bundle = new URL('dist/server/',root);
await mkdir(bundle,{recursive:true});
await mkdir(new URL('dist/.openai/',root),{recursive:true});
const types = {html:'text/html',js:'text/javascript',css:'text/css',svg:'image/svg+xml',txt:'text/plain'};
const assets = {};
for (const path of ['index.html','app.js','styles.css','logo.svg','favicon.svg','lettermark.svg','Google-Sans-OFL.txt']) {
  assets[`/${path}`] = [await readFile(new URL(`public/${path}`,root),'utf8'),types[path.split('.').pop()]];
}
assets['/room-rules.mjs'] = [await readFile(new URL('src/room.mjs',root),'utf8'),'text/javascript'];
for (const [path,type] of [['google-sans.woff2','font/woff2'],['setloop-logo.png','image/png']]) {
  assets[`/${path}`] = [(await readFile(new URL(`public/${path}`,root))).toString('base64'),type];
}
await writeFile(new URL('assets.mjs',bundle),`export const assets=${JSON.stringify(assets)};\n`);
for (const file of ['room.mjs','api.mjs','store.mjs','solana.mjs']) await cp(new URL(`src/${file}`,root),new URL(file,bundle));
await cp(new URL('src/worker.mjs',root),new URL('index.js',bundle));
await cp(new URL('.openai/hosting.json',root),new URL('dist/.openai/hosting.json',root));
console.log('Built Setloop Worker in dist/server.');
