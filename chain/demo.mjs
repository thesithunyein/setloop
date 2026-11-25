import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { Keypair, SystemProgram } from '@solana/web3.js';
import { PROGRAM, assertDevnet, base, commitmentSignature, decodeRoom, privateConnection, readSolanaReceipt, roomInstructions, send } from './client.mjs';

const keyPath = process.argv[2];
if (!keyPath) throw new Error('Usage: npm run demo -- /path/to/funded-devnet-keypair.json');
await assertDevnet();
const funder = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(await readFile(keyPath,'utf8'))));
const program = await base.getAccountInfo(PROGRAM);
if (!program?.executable) throw new Error('Setloop’s program is not deployed on the configured Solana devnet RPC.');
const balance = await base.getBalance(funder.publicKey);
if (balance < 100_000_000) throw new Error(`Demo funding is below 0.1 devnet SOL for ${funder.publicKey.toBase58()}.`);

const seats = [Keypair.generate(),Keypair.generate(),Keypair.generate()];
const host = seats[0];
const setup = roomInstructions(host.publicKey,seats.map(seat=>seat.publicKey),funder.publicKey,randomBytes(8).readBigUInt64LE(),60);
await send(base,funder,seats.map(seat => SystemProgram.transfer({fromPubkey:funder.publicKey,toPubkey:seat.publicKey,lamports:25_000_000})));
await send(base,host,[setup.create]);
for (const [i,seat] of seats.entries()) {
  await send(base,host,[setup.createOffer(i)],i ? [seat] : []);
  await send(base,seat,[setup.delegateOffer(i)]);
}
await send(base,host,[setup.delegateRoom]);

const privateSeats = await Promise.all(seats.map(privateConnection));
const privateSettler = await privateConnection(funder);
async function until(read, condition) {
  for (let attempt = 0; attempt < 35; attempt++) {
    const result = await read();
    if (condition(result)) return result;
    await delay(500);
  }
  throw new Error('The expected delegated account did not propagate in time.');
}

await until(() => privateSettler.getAccountInfo(setup.room),value => value?.owner.equals(PROGRAM));
for (const [i,seat] of seats.entries()) {
  await until(() => privateSeats[i].getAccountInfo(setup.offers[i]),value => value?.owner.equals(PROGRAM));
  await send(privateSeats[i],seat,[setup.prepare(i)]);
}
const rawRound = await privateSettler.getAccountInfo(setup.room);
if (decodeRoom(rawRound.data).connected !== 7) throw new Error('All three seats must be prepared before sealing.');
for (const [i,seat] of seats.entries()) await send(privateSeats[i],seat,[setup.seal(i,i,(i+2)%3)]);
const crossSeat = await privateSeats[0].getAccountInfo(setup.offers[1]).catch(() => null);
if (crossSeat) throw new Error('Privacy check failed: one seat could read another sealed offer.');
await send(privateSeats[0],host,[setup.closeEarly]);
await send(privateSettler,funder,[setup.settle]);
const perSignature = await send(privateSettler,funder,[setup.publish]);
const signature = await commitmentSignature(privateSettler,perSignature);
await until(() => base.getAccountInfo(setup.room),value => value?.owner.equals(PROGRAM) && decodeRoom(value.data).result === 1);
const receipt = await readSolanaReceipt(setup.room);
if (receipt.inventories.flat().some(quantity => quantity !== 1)) throw new Error('Settlement did not complete the three albums.');
console.log(JSON.stringify({program:PROGRAM.toBase58(),room:setup.room.toBase58(),signature,receipt},null,2));
