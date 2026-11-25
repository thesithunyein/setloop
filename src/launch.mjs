import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createSetloopServer } from './server.mjs';

const data = new URL('../.data/',import.meta.url);
mkdirSync(data,{recursive:true});
const server = createSetloopServer(new URL('setloop.sqlite',data));
server.once('error',error => {
  if (error.code === 'EADDRINUSE') console.error('Port 4173 is already in use. Check whether Setloop is already running at http://127.0.0.1:4173.');
  else console.error(error.message);
  process.exitCode = 1;
});
server.listen(4173,'127.0.0.1',()=>{
  const url = 'http://127.0.0.1:4173';
  console.log(`Setloop is running at ${url}. Close this window to stop the app.`);
  if (process.platform === 'win32') spawn('rundll32.exe',['url.dll,FileProtocolHandler',url],{windowsHide:true}).on('error',()=>{});
});
