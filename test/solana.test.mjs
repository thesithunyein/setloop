import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { readDevnetReceipt } from '../src/solana.mjs';

const program = 'GHWCZYzCsEEiYvdCVQ5o9aYyserYiJ3TX2tqb6hS3di9';
const room = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabc';

test('the devnet verifier checks owner, account discriminator and settled balances', async () => {
  const account = Buffer.alloc(213);
  createHash('sha256').update('account:Room').digest().copy(account,0,0,8);
  account.fill(1,48,80);
  account.fill(2,80,112);
  account.fill(3,112,144);
  account[189]=1;
  account.writeBigInt64LE(1_800_000_000n,190);
  account.fill(1,198,207);
  Buffer.from([2,0,1,0,1,2]).copy(account,207);
  const rpc = (owner = program) => async (_url, options) => {
    assert.equal(JSON.parse(options.body).params[0],room);
    return Response.json({result:{value:{owner,data:[account.toString('base64'),'base64']}}});
  };
  const receipt = await readDevnetReceipt(room,rpc());
  assert.deepEqual(receipt.transfers.map(transfer=>transfer.stamp),['Star','Sun','Moon']);
  assert.equal(new Set(receipt.transfers.map(transfer=>transfer.from)).size,3);
  await assert.rejects(readDevnetReceipt(room,rpc('11111111111111111111111111111111')), /No committed/);
  account[199]=2;
  await assert.rejects(readDevnetReceipt(room,rpc()), /inconsistent trade/);
});
