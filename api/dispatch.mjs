import { handleApi } from '../src/api.mjs';
import { createBlobRoomStore } from '../src/blob-store.mjs';

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
    if (request.method === 'GET' && /^\/api\/devnet\/[^/]+$/.test(url.pathname)) return handleApi(request, null);
    const oidcToken = request.headers.get('x-vercel-oidc-token') || process.env.VERCEL_OIDC_TOKEN;
    const storeId = process.env.BLOB_STORE_ID;
    if (!process.env.BLOB_READ_WRITE_TOKEN && !(storeId && oidcToken)) {
      return Response.json({error:'Setloop’s private room storage is unavailable.'},{status:503});
    }
    const credentials = storeId && oidcToken ? {storeId,oidcToken} : {token:process.env.BLOB_READ_WRITE_TOKEN};
    const store = createBlobRoomStore({credentials});
    return handleApi(request,store);
  },
};
