import { createHash, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { Keypair, SystemProgram } from '@solana/web3.js';
import { PROGRAM, assertDevnet, base, commitmentSignature, decodeRoom, privateConnection, readSolanaReceipt, roomInstructions, send } from './client.mjs';

const keyPath = process.argv[2];
const noMatch = process.argv[3] === '--no-match';
if (!keyPath || (process.argv[3] && !noMatch) || process.argv.length > 4) {
  throw new Error('Usage: npm run demo -- /path/to/funded-devnet-keypair.json [--no-match]');
}
await assertDevnet();
const funder = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(await readFile(keyPath,'utf8'))));
const program = await base.getAccountInfo(PROGRAM);
if (!program?.executable) throw new Error('Setloop’s program is not deployed on the configured Solana devnet RPC.');
const balance = await base.getBalance(funder.publicKey);
if (balance < 100_000_000) throw new Error(`Demo funding is below 0.1 devnet SOL for ${funder.publicKey.toBase58()}.`);

const seats = [Keypair.generate(),Keypair.generate(),Keypair.generate()];
const host = seats[0];
const setup = roomInstructions(host.publicKey,seats.map(seat=>seat.publicKey),funder.publicKey,randomBytes(8).readBigUInt64LE(),180,true);
console.error(`Preparing ${noMatch ? 'no-match' : 'matched'} Choice round ${setup.room.toBase58()}.`);
await send(base,funder,seats.map(seat => SystemProgram.transfer({fromPubkey:funder.publicKey,toPubkey:seat.publicKey,lamports:25_000_000})));
await send(base,host,[setup.create]);
const delegations = [];
for (const [i,seat] of seats.entries()) {
  await send(base,host,[setup.createOffer(i)],i ? [seat] : []);
  delegations.push(await send(base,seat,[setup.delegateOffer(i)]));
}
delegations.push(await send(base,host,[setup.delegateRoom]));
console.error('Room and three offers delegated on Solana devnet.');

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
const before = decodeRoom(rawRound.data);
if (before.connected !== 7) throw new Error('All three seats must be prepared before sealing.');
const give = noMatch ? [1,1,2] : [0,1,2];
const need = [2,0,1];
for (const [i,seat] of seats.entries()) await send(privateSeats[i],seat,[setup.seal(i,give[i],need[i])]);

const discriminator = createHash('sha256').update('account:Offer').digest().subarray(0,8);
for (const [i,connection] of privateSeats.entries()) {
  await until(() => connection.getAccountInfo(setup.offers[i]), account =>
    account?.owner.equals(PROGRAM)
      && account.data.subarray(0,8).equals(discriminator)
      && account.data.subarray(8,40).equals(setup.room.toBuffer())
      && account.data.subarray(40,72).equals(seats[i].publicKey.toBuffer())
      && account.data.subarray(72).equals(Buffer.from([i,1,1,give[i],need[i]])));
  for (const [other,address] of setup.offers.entries()) {
    if (other !== i && await connection.getAccountInfo(address) !== null) {
      throw new Error('Privacy check failed: one seat could read another sealed offer.');
    }
  }
}
console.error('Verified three own-offer reads and six denied cross-seat reads.');
await send(privateSeats[0],host,[setup.closeEarly]);
await send(privateSettler,funder,[setup.settle]);
const perSignature = await send(privateSettler,funder,[setup.publish]);
const signature = await commitmentSignature(privateSettler,perSignature);
console.error('Waiting for the commitment to appear on Solana devnet.');
const expectedResult = noMatch ? 2 : 1;
await until(() => base.getAccountInfo(setup.room),value => value?.owner.equals(PROGRAM) && decodeRoom(value.data).result === expectedResult);
const committed = await until(() => base.getTransaction(signature,{commitment:'confirmed',maxSupportedTransactionVersion:0}), Boolean);
if (committed.meta?.err !== null) throw new Error('The base-layer commitment transaction did not succeed.');
const receipt = await readSolanaReceipt(setup.room);
if (noMatch) {
  if (receipt.transfers.length || JSON.stringify(receipt.inventories) !== JSON.stringify(before.inventories)) {
    throw new Error('A no-match round changed an album.');
  }
} else if (receipt.transfers.length !== 3 || receipt.inventories.some(album => album.includes(0) || album.reduce((sum,count)=>sum+count,0) !== 4)) {
  throw new Error('Settlement did not complete the three albums.');
}
console.log(JSON.stringify({program:PROGRAM.toBase58(),room:setup.room.toBase58(),delegations,signature,privacy:'Each player read their own offer and could not read either other offer.',receipt},null,2));
