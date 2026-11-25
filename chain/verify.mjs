import { readSolanaReceipt } from './client.mjs';

if (!process.argv[2]) throw new Error('Usage: npm run verify -- SOLANA_ROOM_ADDRESS');
console.log(JSON.stringify(await readSolanaReceipt(process.argv[2]),null,2));
