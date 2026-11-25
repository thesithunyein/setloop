import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BlobPreconditionFailedError } from '@vercel/blob';
import { createBlobRoomStore } from '../src/blob-store.mjs';

test('private Vercel rooms read fresh and reject stale updates', async () => {
  const blobs = new Map();
  const store = createBlobRoomStore({
    async read(path, options) {
      assert.deepEqual(options,{access:'private',useCache:false});
      const entry = blobs.get(path);
      return entry ? {blob:{etag:entry.etag},stream:new Response(entry.body).body} : null;
    },
    async write(path, body, options) {
      assert.equal(options.access,'private');
      const entry = blobs.get(path);
      if (entry && !options.allowOverwrite) throw new Error('Already exists.');
      if (options.ifMatch && entry?.etag !== options.ifMatch) throw new BlobPreconditionFailedError();
      blobs.set(path,{etag:String(Number(entry?.etag || '0')+1),body});
    },
  });

  const room = {code:'ABC234',status:'waiting'};
  assert.equal(await store.create(room),true);
  assert.equal(await store.create(room),false);
  const first = await store.get(room.code);
  assert.equal(await store.update({...room,status:'open'},first.version),true);
  assert.equal(await store.update({...room,status:'matched'},first.version),false);
  assert.equal((await store.get(room.code)).room.status,'open');
});
