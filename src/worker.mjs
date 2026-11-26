import { handleApi } from './api.mjs';
import { roomStore } from './store.mjs';
import { assets } from './assets.mjs';

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path.startsWith('/api/')) {
      if (!env.DB) return Response.json({error:'The room database is unavailable.'},{status:503});
      const store = roomStore({
        first: (sql,...args) => env.DB.prepare(sql).bind(...args).first(),
        run: async (sql,...args) => (await env.DB.prepare(sql).bind(...args).run()).meta.changes,
      });
      return handleApi(request,store);
    }
    const [body,type] = Object.hasOwn(assets,path) ? assets[path] : assets['/index.html'];
    const binary = type === 'image/png' || type.startsWith('font/');
    const content = binary ? Uint8Array.from(atob(body),letter=>letter.charCodeAt(0)) : body;
    return new Response(request.method === 'HEAD' ? null : content,{headers:{'Content-Type':binary ? type : `${type}; charset=utf-8`,'X-Content-Type-Options':'nosniff'}});
  },
};
