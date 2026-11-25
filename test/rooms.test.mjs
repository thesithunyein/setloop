import { once } from 'node:events';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSetloopServer } from '../src/server.mjs';
import { findTransfers, settleRoom } from '../src/room.mjs';

async function setup(t, chain) {
  let now = 1_800_000_000_000;
  const server = createSetloopServer(':memory:', () => now, chain);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const call = async (path, { post, token, body } = {}) => {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    if (body) headers['Content-Type'] = 'application/json';
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
      method: post ? 'POST' : 'GET', headers, body: body && JSON.stringify(body),
    });
    return {status:response.status,...await response.json()};
  };
  return {call, advance: milliseconds => {now += milliseconds;}};
}

const OFFER = [{give:'sun',need:'star'},{give:'moon',need:'sun'},{give:'star',need:'moon'}];

test('three concurrent players seal private offers and one atomic result serves all sessions', async t => {
  const { call } = await setup(t);
  const created = await call('/rooms',{post:true,body:{duration:1,name:'Night swap',nickname:'Alice'}});
  const path = `/rooms/${created.room.code}`;
  const joined = await Promise.all(['Ben','Cara'].map(nickname => call(`${path}/join`,{post:true,body:{nickname}})));
  const players = [created,...joined].sort((a,b) => a.room.self.slot-b.room.self.slot);
  assert.equal(new Set(players.map(player => player.room.self.slot)).size,3);
  const sealed = await Promise.all(players.map((player,i) => call(`${path}/offer`,{post:true,token:player.token,body:OFFER[i]})));
  assert(sealed.every(item => item.status === 200));
  const publicRoom = await call(path);
  assert.equal(publicRoom.room.ready,3);
  assert.equal(publicRoom.room.self,null);
  assert(publicRoom.room.players.every(member => !Object.hasOwn(member,'offer') && !Object.hasOwn(member,'inventory')));
  assert.equal((await call(`${path}/receipt`)).status,409);
  assert.equal((await call(`${path}/close`,{post:true,token:players[1].token})).status,409);
  const settled = await Promise.all([1,2].map(() => call(`${path}/close`,{post:true,token:players[0].token})));
  assert.deepEqual(settled[0].room.receipt,settled[1].room.receipt);
  const result = await call(`${path}/receipt`);
  assert.equal(result.receipt.result,'matched');
  assert.equal(result.receipt.transfers.length,3);
  assert(result.receipt.players.every(player => player.after.every(amount => amount === 1)));
  assert.match(result.digest,/^[0-9a-f]{64}$/);
  assert.equal((await call(`${path}/offer`,{post:true,token:players[0].token,body:OFFER[0]})).status,409);
});

test('expired partial offers settle as no-match without exposing the submitted intents', async t => {
  const { call, advance } = await setup(t);
  const demo = await call('/demo',{post:true});
  const path = `/rooms/${demo.room.code}`;
  await call(`${path}/offer`,{post:true,token:demo.demoTokens[0],body:OFFER[0]});
  advance(181_000);
  const receipt = await call(`${path}/receipt`);
  assert.equal(receipt.receipt.result,'no-match');
  assert.deepEqual(receipt.receipt.transfers,[]);
  assert(receipt.receipt.players.every(player => JSON.stringify(player.before) === JSON.stringify(player.after)));
  assert.equal(JSON.stringify(receipt).includes('"offer"'),false);
});

test('a stale inventory rejects the entire cycle before any inventory changes', () => {
  const inventories = [[1,1,0],[0,2,1],[1,0,2]];
  const players = inventories.map((inventory,slot) => ({slot,name:`Player ${slot + 1}`,inventory:[...inventory],offer:OFFER[slot]}));
  assert.deepEqual(findTransfers(players),[]);
  const room = {code:'TEST22',name:'Example',status:'open',players};
  settleRoom(room,1000);
  assert.deepEqual(players.map(player => player.inventory),inventories);
  assert.equal(room.receipt.result,'no-match');
});

test('chain-mode rooms only expose a settled receipt after the chain bridge confirms', async t => {
  const events = [];
  let release;
  const gate = new Promise(resolve=>{release=resolve;});
  const chain = {
    open(room) {events.push('open');return room.deadline;},
    offer(_room,player) {events.push(`offer-${player.slot}`);},
    async close(room,early) {
      assert.equal(early,true);
      events.push('closing');
      await gate;
      return {transfers:findTransfers(room.players),closedAt:1_800_000_001_000,address:'chain-account',program:'chain-program',signature:'chain-signature'};
    },
  };
  const {call} = await setup(t,chain);
  const demo = await call('/demo',{post:true});
  const path = `/rooms/${demo.room.code}`;
  await Promise.all(demo.demoTokens.map((token,i)=>call(`${path}/offer`,{post:true,token,body:OFFER[i]})));
  assert.equal((await call(`${path}/receipt`)).status,409);
  const closing = call(`${path}/close`,{post:true,token:demo.token});
  release();
  assert.equal((await closing).room.receipt.chain.signature,'chain-signature');
  assert.equal((await call(`${path}/receipt`)).mode,'devnet');
  assert.equal(events[0],'open');
  assert.equal(events.at(-1),'closing');
});
