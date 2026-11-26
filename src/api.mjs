import { addPlayer, putOffer, roomView, RoomError, settleRoom } from './room.mjs';
import { readDevnetReceipt } from './solana.mjs';

const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_CODE = /^[A-HJ-NP-Z2-9]{6}$/;
const TOKEN = /^[0-9a-f]{64}$/;
const json = (body, status = 200) => Response.json(body, { status, headers: {'Cache-Control': 'no-store'} });
const hex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
export const digest = async value => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))));
const secret = () => hex(crypto.getRandomValues(new Uint8Array(32)));
const roomCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), byte => ROOM_CHARS[byte & 31]).join('');

function label(value, length) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, length);
}

async function payload(request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new RoomError('Send a JSON request.', 415);
  const reader = request.body?.getReader();
  if (!reader) throw new RoomError('Request body is missing.');
  const chunks = [];
  let size = 0;
  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 4096) {
      await reader.cancel();
      throw new RoomError('Request is too large.', 413);
    }
    chunks.push(value);
  }
  try {
    const data = JSON.parse(await new Blob(chunks).text());
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
    return data;
  } catch {
    throw new RoomError('The request is not valid JSON.');
  }
}

async function createRoom(store, input, demo, now, chain) {
  const duration = demo ? 3 : Number(input.duration || 3);
  if (![1, 3, 5].includes(duration)) throw new RoomError('Choose a one, three or five minute round.');
  const variant = input.variant ?? 'classic';
  if (!['classic', 'choice'].includes(variant)) throw new RoomError('Choose a Classic or Choice round.');
  const tokens = demo ? [secret(), secret(), secret()] : [secret()];
  const hashes = await Promise.all(tokens.map(digest));
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = roomCode();
    const room = {code, name: demo ? 'Demo room' : label(input.name, 40), duration, variant, demo, status: 'waiting', deadline: null, players: [], receipt: null};
    hashes.forEach(hash => addPlayer(room, label(input.nickname, 24), hash, now, demo));
    if (!await store.create(room, now)) continue;
    if (chain && room.status === 'open') {
      room.deadline = await chain.open(room);
      await store.update(room,0);
    }
    return json({room: roomView(room, room.players[0], now), token: tokens[0], demoTokens: demo ? tokens : undefined}, 201);
  }
  throw new RoomError('Could not allocate a room code. Try again.', 503);
}

export async function handleApi(request, store, clock = Date.now, chain = null) {
  try {
    const url = new URL(request.url);
    const { method } = request;
    if (method === 'POST' && request.headers.has('origin') && request.headers.get('origin') !== url.origin) {
      throw new RoomError('Open Setloop in its own tab to continue.', 403);
    }
    const path = url.pathname.split('/').filter(Boolean);
    const now = clock();
    if (method === 'GET' && path[1] === 'devnet' && path.length === 3) return json(await readDevnetReceipt(path[2]));
    if (method === 'GET' && url.pathname === '/api/status') return json({open: await store.openCount(now), mode: chain ? 'devnet' : 'server'});
    if (method === 'POST' && url.pathname === '/api/rooms') return await createRoom(store, await payload(request), false, now, chain);
    if (method === 'POST' && url.pathname === '/api/demo') return await createRoom(store, {}, true, now, chain);
    const code = path[2]?.toUpperCase();
    const action = path[3];
    if (path[1] !== 'rooms' || path.length > 4 || !ROOM_CODE.test(code || '')) throw new RoomError('Room not found.', 404);
    const auth = request.headers.get('authorization')?.replace(/^Bearer /, '');
    const tokenHash = TOKEN.test(auth || '') ? await digest(auth) : null;
    const body = method === 'POST' && ['join', 'offer'].includes(action) ? await payload(request) : {};
    const newToken = method === 'POST' && action === 'join' ? secret() : null;
    const newHash = newToken ? await digest(newToken) : null;
    for (let attempt = 0; attempt < 8; attempt++) {
      const entry = await store.get(code);
      if (!entry) throw new RoomError('That room code could not be found.', 404);
      const room = entry.room;
      const player = tokenHash ? room.players.find(member => member.tokenHash === tokenHash) : null;
      let changed = false;
      let responsePlayer = player;
      if (room.status === 'open' && room.deadline <= now) {
        const proof = chain && await chain.close(room,false);
        settleRoom(room, now, proof);
        if (!await store.update(room, entry.version)) continue;
        // Re-enter through the closed-room path, including for an offer submitted on the buzzer.
        continue;
      }
      if (method === 'GET' && action === 'receipt') {
        if (!room.receipt) throw new RoomError('This round is still in progress.', 409);
        return json({receipt: room.receipt, digest: await digest(JSON.stringify(room.receipt)), mode: room.receipt.chain ? 'devnet' : 'server'});
      }
      if (method === 'POST' && action === 'join' && !player) {
        responsePlayer = addPlayer(room, label(body.nickname, 24), newHash, now);
        if (chain && room.status === 'open') room.deadline = await chain.open(room);
        changed = true;
      } else if (method === 'POST' && ['offer', 'close'].includes(action)) {
        if (!player) throw new RoomError('Join this room before taking an action.', 403);
        if (action === 'offer') {
          putOffer(room, player, body.give, body.need);
          if (chain) await chain.offer(room,player);
        }
        if (action === 'close') {
          if (room.receipt && player.slot === 0) return json({room: roomView(room, player, now)});
          if (player.slot !== 0 || room.status !== 'open' || !room.players.every(member => member.offer)) {
            throw new RoomError('The host can close early when all three offers are sealed.', 409);
          }
          const proof = chain && await chain.close(room,true);
          settleRoom(room,now,proof);
        }
        changed = true;
      } else if (!(method === 'GET' && !action) && !(method === 'POST' && action === 'join' && player)) {
        throw new RoomError('Action not found.', 404);
      }
      if (changed && !await store.update(room, entry.version)) continue;
      return json({room: roomView(room, responsePlayer, now), token: changed && action === 'join' ? newToken : undefined});
    }
    throw new RoomError('The room is busy. Try again.', 409);
  } catch (error) {
    if (error instanceof RoomError) return json({error: error.message}, error.status);
    console.error('Setloop request failed', error);
    return json({error: 'Setloop could not complete the request. Try again.'}, 500);
  }
}
