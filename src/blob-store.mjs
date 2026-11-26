import { BlobPreconditionFailedError, get, put } from '@vercel/blob';

const writeOptions = {access:'private',contentType:'application/json',addRandomSuffix:false};

export function createBlobRoomStore({read = get, write = put, credentials, namespace = 'rooms'} = {}) {
  const pathFor = code => `${namespace}/${code}.json`;
  async function readRoom(code) {
    // Keep the origin ETag used by conditional writes, even when a room grows
    // large enough for an intermediary to compress its JSON response.
    const blob = await read(pathFor(code),{access:'private',useCache:false,headers:{'Accept-Encoding':'identity'},...credentials});
    if (!blob) return null;
    return {room: await new Response(blob.stream).json(),version:blob.blob.etag};
  }

  return {
    get: readRoom,
    async create(room) {
      try {
        await write(pathFor(room.code),JSON.stringify(room),{...writeOptions,...credentials});
        return true;
      } catch (error) {
        if (await readRoom(room.code)) return false;
        throw error;
      }
    },
    async update(room, version) {
      try {
        await write(pathFor(room.code),JSON.stringify(room),{...writeOptions,...credentials,allowOverwrite:true,ifMatch:version});
        return true;
      } catch (error) {
        if (error instanceof BlobPreconditionFailedError) return false;
        throw error;
      }
    },
    async openCount() {
      // A room list is not needed to join. Avoid fetching private objects for a global count.
      return null;
    },
  };
}
