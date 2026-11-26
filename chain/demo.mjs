import { createHash, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Connection, Keypair, SystemProgram } from '@solana/web3.js';
import { PROGRAM, assertDevnet, base, decodeRoom, findCommitmentSignature, privateConnection, readSolanaReceipt, roomInstructions, send } from './client.mjs';

const keyPath = process.argv[2];
const flags = process.argv.slice(3);
const noMatch = flags.includes('--no-match');
const publicEr = flags.includes('--public-er');
if (!keyPath || new Set(flags).size !== flags.length || flags.some(flag => !['--no-match','--public-er'].includes(flag))) {
  throw new Error('Usage: npm run demo -- /path/to/funded-devnet-keypair.json [--no-match] [--public-er]');
}
await assertDevnet();
const funder = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(await readFile(keyPath,'utf8'))));
const program = await base.getAccountInfo(PROGRAM);
if (!program?.executable) throw new Error('Setloop’s program is not deployed on the configured Solana devnet RPC.');
const balance = await base.getBalance(funder.publicKey);
if (balance < 100_000_000) throw new Error(`Demo funding is below 0.1 devnet SOL for ${funder.publicKey.toBase58()}.`);

const keyDirectory = process.env.SETLOOP_DEMO_KEY_DIR;
const seats = await Promise.all([1,2,3].map(async slot => {
  if (!keyDirectory) return Keypair.generate();
  const contents = await readFile(join(keyDirectory,`seat-${slot}.keypair.json`),'utf8');
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(contents)));
}));
const host = seats[0];
const rpc = publicEr ? new Connection('https://devnet-as.magicblock.app','confirmed') : null;
if (publicEr && process.env.SETLOOP_PER_VALIDATOR !== 'MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57') {
  throw new Error('Set SETLOOP_PER_VALIDATOR to the public MagicBlock Asia devnet validator before using --public-er.');
}
const seatConnections = rpc ? seats.map(() => rpc) : await Promise.all(seats.map(privateConnection));
const settlerConnection = rpc || await privateConnection(funder);
const setup = roomInstructions(host.publicKey,seats.map(seat=>seat.publicKey),funder.publicKey,randomBytes(8).readBigUInt64LE(),180,true);
console.error(`Preparing ${noMatch ? 'no-match' : 'matched'} Choice round ${setup.room.toBase58()} on the ${publicEr ? 'public' : 'private'} ER.`);
const balances = await base.getMultipleAccountsInfo(seats.map(seat => seat.publicKey));
const funding = seats.flatMap((seat,i) => {
  const lamports = 25_000_000 - (balances[i]?.lamports ?? 0);
  return lamports > 0 ? [SystemProgram.transfer({fromPubkey:funder.publicKey,toPubkey:seat.publicKey,lamports})] : [];
});
if (funding.length) await send(base,funder,funding);
await send(base,host,[setup.create]);
const delegations = [];
for (const [i,seat] of seats.entries()) {
  await send(base,host,[setup.createOffer(i)],i ? [seat] : []);
  delegations.push(await send(base,seat,[setup.delegateOffer(i)]));
}
delegations.push(await send(base,host,[setup.delegateRoom]));
console.error('Room and three offers delegated on Solana devnet.');

async function until(read, condition, message = 'The expected delegated account did not propagate in time.') {
  for (let attempt = 0; attempt < 35; attempt++) {
    const result = await read();
    if (condition(result)) return result;
    await delay(500);
  }
  throw new Error(message);
}

await until(() => settlerConnection.getAccountInfo(setup.room),value => value?.owner.equals(PROGRAM));
for (const [i,seat] of seats.entries()) {
  await until(() => seatConnections[i].getAccountInfo(setup.offers[i]),value => value?.owner.equals(PROGRAM));
  await send(seatConnections[i],seat,[setup.prepare(i)]);
}
const rawRound = await settlerConnection.getAccountInfo(setup.room);
const before = decodeRoom(rawRound.data);
if (before.connected !== 7) throw new Error('All three seats must be prepared before sealing.');
const give = noMatch ? [1,1,2] : [0,1,2];
const need = [2,0,1];
for (const [i,seat] of seats.entries()) await send(seatConnections[i],seat,[setup.seal(i,give[i],need[i])]);

const discriminator = createHash('sha256').update('account:Offer').digest().subarray(0,8);
for (const [i,connection] of seatConnections.entries()) {
  await until(() => connection.getAccountInfo(setup.offers[i]), account =>
    account?.owner.equals(PROGRAM)
      && account.data.subarray(0,8).equals(discriminator)
      && account.data.subarray(8,40).equals(setup.room.toBuffer())
      && account.data.subarray(40,72).equals(seats[i].publicKey.toBuffer())
      && account.data.subarray(72).equals(Buffer.from([i,1,1,give[i],need[i]])));
  if (publicEr) continue;
  for (const [other,address] of setup.offers.entries()) {
    if (other !== i && await connection.getAccountInfo(address) !== null) {
      throw new Error('Privacy check failed: one seat could read another sealed offer.');
    }
  }
}
console.error(publicEr ? 'Verified three synthetic offers on the public ER. Privacy was not tested.' : 'Verified three own-offer reads and six denied cross-seat reads.');
await send(seatConnections[0],host,[setup.closeEarly]);
await send(settlerConnection,funder,[setup.settle]);
const rollupSignature = await send(settlerConnection,funder,[setup.publish]);
console.error('Waiting for the commitment to appear on Solana devnet.');
const expectedResult = noMatch ? 2 : 1;
await until(() => base.getAccountInfo(setup.room),value => value?.owner.equals(PROGRAM) && decodeRoom(value.data).result === expectedResult, 'Solana did not return the expected committed room.');
const signature = await until(() => findCommitmentSignature(setup.room), Boolean, 'Could not identify the Solana commitment transaction.');
const receipt = await readSolanaReceipt(setup.room);
if (noMatch) {
  if (receipt.transfers.length || JSON.stringify(receipt.inventories) !== JSON.stringify(before.inventories)) {
    throw new Error('A no-match round changed an album.');
  }
} else if (receipt.transfers.length !== 3 || receipt.inventories.some(album => album.includes(0) || album.reduce((sum,count)=>sum+count,0) !== 4)) {
  throw new Error('Settlement did not complete the three albums.');
}
console.log(JSON.stringify({program:PROGRAM.toBase58(),room:setup.room.toBase58(),delegations,rollupSignature,signature,network:publicEr?'public-er':'private-er',privacy:publicEr?'Unverified. This run used synthetic offers on the public ER.':'Each player read their own offer and could not read either other offer.',receipt},null,2));
