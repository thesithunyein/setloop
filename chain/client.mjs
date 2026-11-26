import { createHash } from 'node:crypto';
import { Connection, PublicKey, SystemProgram, Transaction, TransactionInstruction, sendAndConfirmTransaction } from '@solana/web3.js';
import { getAuthToken, permissionPdaFromAccount, verifyTeeRpcIntegrity } from '@magicblock-labs/ephemeral-rollups-sdk';
import nacl from 'tweetnacl';

export const PROGRAM = new PublicKey(process.env.SETLOOP_PROGRAM_ID || 'GHWCZYzCsEEiYvdCVQ5o9aYyserYiJ3TX2tqb6hS3di9');
const DELEGATION = new PublicKey('DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh');
const MAGIC = new PublicKey('Magic11111111111111111111111111111111111111');
const MAGIC_CONTEXT = new PublicKey('MagicContext1111111111111111111111111111111');
const PERMISSION = new PublicKey('ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1');
const VAULT = new PublicKey('MagicVau1t999999999999999999999999999999999');
const VALIDATOR = new PublicKey(process.env.SETLOOP_PER_VALIDATOR || 'MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo');
const TEE = (process.env.SETLOOP_PER_RPC || 'https://devnet-tee.magicblock.app').replace(/\/$/, '');
export const base = new Connection(process.env.SETLOOP_SOLANA_RPC || 'https://api.devnet.solana.com', 'confirmed');
export const stampNames = ['Sun', 'Moon', 'Star'];
let attestation;

export async function assertDevnet() {
  if (await base.getGenesisHash() !== 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG') {
    throw new Error('Setloop’s demo can only sign transactions on Solana devnet.');
  }
}

const meta = (pubkey, isWritable = false, isSigner = false) => ({pubkey,isWritable,isSigner});
const pda = (address, ...seeds) => PublicKey.findProgramAddressSync(seeds, address)[0];
const discriminator = (group, name) => createHash('sha256').update(`${group}:${name}`).digest().subarray(0, 8);
const ix = (name, keys, ...args) => new TransactionInstruction({programId:PROGRAM,keys,data:Buffer.concat([discriminator('global',name),...args])});
const byte = value => Buffer.from([value]);
function number(value,length) {
  const bytes = Buffer.alloc(length);
  if (length === 8) bytes.writeBigUInt64LE(BigInt(value));
  else bytes.writeUInt16LE(value);
  return bytes;
}

export async function privateConnection(wallet) {
  attestation ??= verifyTeeRpcIntegrity(TEE);
  await attestation;
  const {token} = await getAuthToken(TEE,wallet.publicKey,message => Promise.resolve(nacl.sign.detached(message,wallet.secretKey)));
  const endpoint = new URL(TEE);
  endpoint.searchParams.set('token',token);
  return new Connection(endpoint.href,'confirmed');
}

export async function send(connection, payer, instructions, otherSigners = []) {
  const tx = new Transaction().add(...instructions);
  return sendAndConfirmTransaction(connection,tx,[payer,...otherSigners],{commitment:'confirmed',preflightCommitment:'confirmed'});
}

export function roomInstructions(host, seats, settler, nonce, duration, choiceRound = false) {
  const nonceBytes = number(nonce, 8);
  const room = pda(PROGRAM,Buffer.from('room'),host.toBuffer(),nonceBytes);
  const offers = seats.map((_,i) => pda(PROGRAM,Buffer.from('offer'),room.toBuffer(),byte(i)));
  const writable = value => meta(value,true);
  const signed = value => meta(value,true,true);
  const delegationPrefix = address => [
    writable(pda(PROGRAM,Buffer.from('buffer'),address.toBuffer())),
    writable(pda(DELEGATION,Buffer.from('delegation'),address.toBuffer())),
    writable(pda(DELEGATION,Buffer.from('delegation-metadata'),address.toBuffer())),
    writable(address),meta(VALIDATOR),meta(PROGRAM),meta(DELEGATION),meta(SystemProgram.programId),
  ];
  return {
    room, offers,
    create: ix('create_room',[signed(host),writable(room),meta(SystemProgram.programId)],nonceBytes,...seats.map(seat=>seat.toBuffer()),settler.toBuffer(),number(duration,2),byte(Number(choiceRound))),
    createOffer: i => ix('create_offer',[signed(host),meta(seats[i],false,true),meta(room),writable(offers[i]),meta(SystemProgram.programId)],byte(i)),
    delegateRoom: ix('delegate_room',[signed(host),...delegationPrefix(room)],nonceBytes),
    delegateOffer: i => ix('delegate_offer',[signed(seats[i]),meta(room),...delegationPrefix(offers[i])],byte(i)),
    prepare: i => ix('prepare_offer',[meta(seats[i],false,true),writable(room),writable(offers[i]),writable(permissionPdaFromAccount(offers[i])),meta(PERMISSION),writable(VAULT),meta(MAGIC)],byte(i)),
    seal: (i,give,need) => ix('seal_offer',[meta(seats[i],false,true),writable(room),writable(offers[i])],byte(i),byte(give),byte(need)),
    closeEarly: ix('request_early_close',[meta(host,false,true),writable(room)]),
    settle: ix('settle',[meta(settler,false,true),writable(room),...offers.map(writable)]),
    publish: ix('publish_receipt',[signed(settler),writable(room),meta(MAGIC),writable(MAGIC_CONTEXT)]),
  };
}

export async function findCommitmentSignature(room) {
  const signatures = await base.getSignaturesForAddress(room,{limit:5},'confirmed');
  for (const {signature,err} of signatures) {
    if (err) continue;
    // MagicBlock's base-layer commit can use transaction version 1. Read parsed RPC
    // data directly because the legacy web3 client only models versions legacy and 0.
    const response = await fetch(base.rpcEndpoint,{
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getTransaction',params:[signature,{
        encoding:'jsonParsed',commitment:'confirmed',maxSupportedTransactionVersion:1,
      }]}),
      signal:AbortSignal.timeout(8_000),
    });
    if (!response.ok) continue;
    const {result} = await response.json();
    const keys = result?.transaction?.message?.accountKeys;
    const logs = result?.meta?.logMessages;
    if (result?.meta?.err === null && keys?.some(key => key.pubkey === room.toBase58())
      && logs?.includes(`Program ${DELEGATION.toBase58()} success`)
      && logs.includes('Program log: Instruction: ProcessUndelegation')
      && logs.includes(`Program ${PROGRAM.toBase58()} success`)) return signature;
  }
  return null;
}

export function decodeRoom(data) {
  if (data.length !== 213 || !data.subarray(0,8).equals(discriminator('account','Room'))) throw new Error('The account does not contain a Setloop room.');
  let offset = 8;
  const take = length => { const field = data.subarray(offset,offset+length); offset += length; return field; };
  const address = () => new PublicKey(take(32)).toBase58();
  const host = address();
  const nonce = String(take(8).readBigUInt64LE());
  const seats = [address(),address(),address()];
  const settler = address();
  const duration = take(2).readUInt16LE();
  const deadline = Number(take(8).readBigInt64LE());
  const [connected,ready,earlyClose,result] = take(4);
  const closedAt = Number(take(8).readBigInt64LE());
  const inventories = [Array.from(take(3)),Array.from(take(3)),Array.from(take(3))];
  const donors = Array.from(take(3));
  const given = Array.from(take(3));
  const transfers = result === 1 ? donors.map((donor,recipient) => ({from:seats[donor],to:seats[recipient],stamp:stampNames[given[donor]]})) : [];
  return {host,nonce,seats,settler,duration,deadline,connected,ready,earlyClose:!!earlyClose,result,closedAt,inventories,transfers};
}

export async function readSolanaReceipt(roomAddress) {
  const info = await base.getAccountInfo(new PublicKey(roomAddress),'confirmed');
  if (!info || !info.owner.equals(PROGRAM)) throw new Error('No committed Setloop receipt exists at that devnet address.');
  const receipt = decodeRoom(info.data);
  if (receipt.result !== 1 && receipt.result !== 2) throw new Error('This room has not published a completed round.');
  return receipt;
}
