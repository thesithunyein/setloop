import { createHash, randomUUID } from 'node:crypto';
import { Keypair, PublicKey } from '@solana/web3.js';
import { makeBridgeWithOperator } from '../chain/bridge.mjs';
import { createStampAlbum } from '../chain/stamps.mjs';
import { RoomError, STAMPS, startingInventory } from './room.mjs';

const MAX_SESSIONS = 3;
const MAX_ROUNDS = 3;
const LOCK_MS = 160_000;
const missing = slot => STAMPS[(slot + 2) % 3];
const response = (data, status = 200) => Response.json(data, {
  status, headers: {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'},
});
const latest = session => session.rounds.at(-1);
const mintView = (session, album) => ({
  rounds: session.rounds.map(({deadline, before, ready, receipt, roleOffset = 0}) => ({deadline, before, ready, receipt, roleOffset})),
  wallets: album.wallets,
  mints: album.mints,
  claims: session.claims || {},
});

function reservation(session, action, body, now) {
  const round = latest(session);
  if (action === 'start') {
    if (round?.deadline) return false;
    if (!round) session.rounds.push({ready: 0});
    return true;
  }
  if (!round?.deadline) throw new RoomError('Start the private round first.', 409);
  if (action === 'claim') {
    if (session.rounds.length !== MAX_ROUNDS || !round.receipt) throw new RoomError('Finish the three demo rounds first.', 409);
    if (!Number.isInteger(body.slot) || body.slot < 0 || body.slot > 2) throw new RoomError('Choose which album to keep.');
    let destination;
    try {
      destination = new PublicKey(body.destination);
      if (!PublicKey.isOnCurve(destination.toBytes()) || destination.toBase58() !== body.destination) throw new Error();
    } catch {
      throw new RoomError('Enter a Solana wallet address.');
    }
    session.claims ??= {};
    const previousClaim = session.claims[body.slot];
    if (previousClaim && previousClaim.destination !== body.destination) {
      throw new RoomError('Retry this claim using the original wallet address.', 409);
    }
    if (previousClaim?.signature) return false;
    session.claims[body.slot] = {destination:body.destination};
    return true;
  }
  if (action === 'next') {
    if (!round.receipt) throw new RoomError('Finish this round before opening another.', 409);
    if (session.rounds.length >= MAX_ROUNDS) throw new RoomError('You completed all three demo rounds.', 409);
    const priorMatch = session.rounds.findLast(item => item.receipt?.transfers.length)?.receipt;
    const received = priorMatch?.transfers.find(transfer => transfer.to === 0)?.stamp;
    const roleOffset = session.rounds.length === 2 && received ? STAMPS.indexOf(received) : 0;
    session.rounds.push({ready: 0, roleOffset});
    return true;
  }
  if (action === 'finish') {
    if (round.receipt) return false;
    if (round.ready !== 7 && now < round.deadline) throw new RoomError('Seal an offer from each seat first.', 409);
    return true;
  }
  if (action !== 'offer') throw new RoomError('Unknown demo action.', 404);
  if (round.receipt || now >= round.deadline) throw new RoomError('This round has closed. Open its result to continue.', 409);
  const {slot, give} = body;
  if (!Number.isInteger(slot) || slot < 0 || slot > 2 || !STAMPS.includes(give)) throw new RoomError('Choose a seat and a stamp.');
  const index = STAMPS.indexOf(give);
  if (startingInventory((slot + (round.roleOffset || 0)) % 3, 'choice')[index] < 2 || round.before[slot][index] < 1) {
    throw new RoomError('That stamp is unavailable for this seat.');
  }
  return true;
}

async function bodyFor(request) {
  const reader = request.body?.getReader();
  if (!reader) return {};
  const chunks = [];
  let length = 0;
  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 512) {
      await reader.cancel();
      throw new RoomError('The request is too large.', 413);
    }
    chunks.push(value);
  }
  if (!length) return {};
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch {
    throw new RoomError('Invalid demo request.');
  }
}

export function createJudgeHandler({store, signer, clock = Date.now, makeBridge = makeBridgeWithOperator, makeAlbum = createStampAlbum}) {
  const operator = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(signer)));
  const code = operator.publicKey.toBase58();
  async function readLedger() {
    const entry = await store.get(code);
    if (entry) return entry;
    await store.create({code, status:'judge', deadline:null, sessions:{}}, clock());
    const created = await store.get(code);
    if (!created) throw new RoomError('Could not start demo storage. Try again.', 503);
    return created;
  }
  function chainRoom(id, index, roleOffset) {
    return {code: `judge:${id}:${index}`, session: id, roleOffset, variant: 'choice', duration: 5};
  }

  return async function handleJudge(request) {
    try {
      const action = new URL(request.url).pathname.split('/').at(-1);
      if (request.method === 'GET' && action === 'judge') return response({enabled: true});
      if (request.method !== 'POST') throw new RoomError('Unknown demo action.', 404);
      if (!['start', 'next', 'offer', 'finish', 'resume', 'claim'].includes(action)) throw new RoomError('Unknown demo action.', 404);
      const token = /^Bearer ([a-f0-9]{64})$/.exec(request.headers.get('Authorization') || '')?.[1];
      if (!token) throw new RoomError('Reopen the demo in the original browser.', 401);
      const id = createHash('sha256').update(token).digest('hex');
      const body = await bodyFor(request);
      const entry = await readLedger();
      const {room: ledger, version} = entry;
      let session = ledger.sessions[id];
      if (!session) {
        if (action !== 'start') throw new RoomError('Start a live demo first.', 404);
        if (Object.keys(ledger.sessions).length >= MAX_SESSIONS) throw new RoomError('The sponsored demo seats have been used. Open a verified example below.', 503);
        session = ledger.sessions[id] = {rounds: []};
      }
      if (session.lock?.until > clock()) throw new RoomError('An action is still confirming. Wait a moment and retry.', 409);
      const launch = action === 'start' || action === 'next';
      const stale = Number.isInteger(body.round) && body.round < session.rounds.length;
      if (Number.isInteger(body.round) && body.round > session.rounds.length) throw new RoomError('Reload this demo to sync its round.', 409);
      // A setup interrupted before the deadline was saved resumes the same round.
      const resumeOpening = action === 'next' && latest(session) && !latest(session).deadline;
      const shouldWrite = action !== 'resume' && (resumeOpening || (!stale && reservation(session, action, body, clock())));
      const bridge = await makeBridge(operator);
      const roleOffset = latest(session)?.roleOffset || 0;
      const room = chainRoom(id, session.rounds.length, roleOffset);
      const album = makeAlbum(operator, id, bridge.roomAccounts(room).collectors);
      if (action === 'claim' && album.wallets.includes(body.destination)) throw new RoomError('Enter a wallet outside this demo.');
      if (!shouldWrite) return response(mintView(session, album));
      if (launch) await bridge.preflight();
      const lock = {id: randomUUID(), until: clock() + LOCK_MS};
      session.lock = lock;
      if (!await store.update(ledger, version)) throw new RoomError('The demo changed in another tab. Retry this action.', 409);
      const round = latest(session);
      let failure;
      try {
        if (launch) {
          await album.issue();
          round.before = await album.read();
          round.deadline = await bridge.open(room);
        } else if (action === 'offer') {
          const {slot, give} = body;
          const privateSlot = (slot + roleOffset) % 3;
          await bridge.offer(room, {slot:privateSlot, offer:{give, need:missing(privateSlot)}});
          round.ready |= 1 << slot;
        } else if (action === 'claim') {
          const claim = session.claims[body.slot];
          claim.signature = await album.claim(body.slot, new PublicKey(claim.destination), round.receipt.after[body.slot]);
        } else {
          const committed = await bridge.close(room, round.ready === 7);
          const seatOf = slot => (slot + 3 - roleOffset) % 3;
          const receipt = {...committed, transfers:committed.transfers.map(({from,to,stamp}) => ({from:seatOf(from),to:seatOf(to),stamp}))};
          const stampSignature = await album.apply(receipt);
          const after = await album.read();
          const expected = round.before.map(row => [...row]);
          for (const {from, to, stamp} of receipt.transfers) {
            const index = STAMPS.indexOf(stamp);
            expected[from][index]--;
            expected[to][index]++;
          }
          if (JSON.stringify(after) !== JSON.stringify(expected)) throw new Error('Unexpected live stamp balances.');
          round.receipt = {...receipt, after, stampSignature};
        }
      } catch (error) {
        failure = error;
      }
      delete session.lock;
      // Other sessions can update the same budget ledger while this action is on-chain.
      let saved = false;
      for (let attempt = 0; attempt < 8 && !saved; attempt++) {
        const current = await store.get(code);
        if (current?.room.sessions[id]?.lock?.id !== lock.id) break;
        current.room.sessions[id] = session;
        saved = await store.update(current.room, current.version);
      }
      if (!saved) throw new RoomError('The chain action may still be confirming. Retry this step.', 503);
      if (failure) throw failure;
      return response(mintView(session, album));
    } catch (error) {
      // RPC errors can include a private MagicBlock endpoint's short-lived token.
      if (error instanceof RoomError) return response({error: error.message}, error.status || 400);
      return response({error: 'MagicBlock or Solana devnet could not confirm this step. Retry it or open a verified example below.'}, 503);
    }
  };
}
