import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { Keypair, SystemProgram } from '@solana/web3.js';
import { RoomError, STAMPS } from '../src/room.mjs';
import { PROGRAM, assertDevnet, base, commitmentSignature, decodeRoom, privateConnection, roomInstructions, send } from './client.mjs';

const DELEGATION_ID = 'DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh';
const SEAT_FUNDING = 25_000_000;

async function observe(read, condition) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const value = await read();
    if (condition(value)) return value;
    await delay(500);
  }
  throw new RoomError('Devnet state is still syncing. Retry the same action.',503);
}

async function withSignal(action) {
  try { return await action(); }
  catch (error) {
    if (error instanceof RoomError) throw error;
    // Private RPC errors can contain the URL with a short-lived authentication token.
    throw new RoomError('MagicBlock devnet could not confirm the action. Retry the same action.',503);
  }
}

export async function makeBridge(keyPath) {
  await assertDevnet();
  const operator = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(await readFile(keyPath,'utf8'))));
  if (!(await base.getAccountInfo(PROGRAM))?.executable) throw new Error('Deploy the configured Setloop program to Solana devnet before enabling SETLOOP_CHAIN_KEYPAIR.');

  function roomAccounts(room) {
    const derive = label => createHmac('sha256',operator.secretKey).update(`setloop:v1:${room.code}:${label}`).digest();
    const seats = [0,1,2].map(i=>Keypair.fromSeed(derive(`seat:${i}`)));
    const host = seats[0];
    const plan = roomInstructions(host.publicKey,seats.map(seat=>seat.publicKey),operator.publicKey,derive('nonce').readBigUInt64LE(),room.duration*60,room.variant === 'choice');
    return {seats,host,plan};
  }

  async function open(room) {
    const {seats,host,plan} = roomAccounts(room);
    const current = await base.getAccountInfo(plan.room);
    if (!current || current.owner.toBase58() !== DELEGATION_ID) {
      const balances = await Promise.all(seats.map(seat=>base.getBalance(seat.publicKey)));
      const funding = seats.flatMap((seat,i)=>balances[i]>=SEAT_FUNDING ? [] : [SystemProgram.transfer({fromPubkey:operator.publicKey,toPubkey:seat.publicKey,lamports:SEAT_FUNDING-balances[i]})]);
      if (funding.length) {
        if (await base.getBalance(operator.publicKey) < SEAT_FUNDING*3 + 10_000) throw new RoomError('The Setloop demo signer needs more devnet SOL to open a room.',503);
        await send(base,operator,funding);
      }
      if (!current) await send(base,host,[plan.create]);
      for (const [i,seat] of seats.entries()) {
        const offer = await base.getAccountInfo(plan.offers[i]);
        if (!offer) await send(base,host,[plan.createOffer(i)],i?[seat]:[]);
        if (offer?.owner.toBase58() !== DELEGATION_ID) await send(base,seat,[plan.delegateOffer(i)]);
      }
      await send(base,host,[plan.delegateRoom]);
    }
    const connection = await privateConnection(operator);
    let snapshot = await observe(()=>connection.getAccountInfo(plan.room),value=>value?.owner.equals(PROGRAM));
    for (const [i,seat] of seats.entries()) {
      if (decodeRoom(snapshot.data).connected & (1<<i)) continue;
      const privateSeat = await privateConnection(seat);
      await observe(()=>privateSeat.getAccountInfo(plan.offers[i]),value=>value?.owner.equals(PROGRAM));
      await send(privateSeat,seat,[plan.prepare(i)]);
      snapshot = await observe(()=>connection.getAccountInfo(plan.room),value=>!!value && (decodeRoom(value.data).connected & (1<<i)) !== 0);
    }
    return decodeRoom(snapshot.data).deadline*1000;
  }

  async function offer(room,player) {
    const {seats,plan} = roomAccounts(room);
    const seat = seats[player.slot];
    const connection = await privateConnection(seat);
    await send(connection,seat,[plan.seal(player.slot,STAMPS.indexOf(player.offer.give),STAMPS.indexOf(player.offer.need))]);
  }

  async function close(room,early) {
    const {host,plan} = roomAccounts(room);
    let chainRoom = await base.getAccountInfo(plan.room);
    let signature;
    if (!chainRoom?.owner.equals(PROGRAM) || !decodeRoom(chainRoom.data).result) {
      const connection = await privateConnection(operator);
      const snapshot = decodeRoom((await observe(()=>connection.getAccountInfo(plan.room),value=>value?.owner.equals(PROGRAM))).data);
      if (!snapshot.result) {
        if (early && !snapshot.earlyClose) await send(await privateConnection(host),host,[plan.closeEarly]);
        await send(connection,operator,[plan.settle]);
      }
      const published = await send(connection,operator,[plan.publish]);
      signature = await commitmentSignature(connection,published).catch(()=>undefined);
      chainRoom = await observe(()=>base.getAccountInfo(plan.room),value=>value?.owner.equals(PROGRAM) && decodeRoom(value.data).result !== 0);
    }
    const result = decodeRoom(chainRoom.data);
    const transfers = result.transfers.map(({from,to,stamp})=>({from:result.seats.indexOf(from),to:result.seats.indexOf(to),stamp:stamp.toLowerCase()}));
    return {transfers,closedAt:result.closedAt*1000,address:plan.room.toBase58(),program:PROGRAM.toBase58(),signature};
  }

  return {
    open: room => withSignal(()=>open(room)),
    offer: (room,player) => withSignal(()=>offer(room,player)),
    close: (room,early) => withSignal(()=>close(room,early)),
  };
}
