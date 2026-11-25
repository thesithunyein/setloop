import { handleApi } from '../src/api.mjs';
import { createBlobRoomStore } from '../src/blob-store.mjs';

const store = createBlobRoomStore();

export default {
  fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/api/dispatch') {
      const path = url.searchParams.get('setloopPath');
      if (!path || !/^[a-z0-9/-]+$/i.test(path)) {
        return Response.json({error:'Action not found.'},{status:404});
      }
      url.pathname = `/api/${path.replace(/^\/+/, '')}`;
      url.searchParams.delete('setloopPath');
      request = new Request(url,request);
    }
    if (!process.env.BLOB_READ_WRITE_TOKEN && !(process.env.BLOB_STORE_ID && process.env.VERCEL_OIDC_TOKEN)) {
      return Response.json({error:'Setloop’s private room storage is unavailable.'},{status:503});
    }
    return handleApi(request,store);
  },
};
