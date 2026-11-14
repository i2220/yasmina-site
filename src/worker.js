// Cloudflare Worker entry: sends /api/* to the handlers and serves everything else from public/.
import * as book from '../functions/api/book.js';
import * as publicSettings from '../functions/api/settings.js';
import * as login from '../functions/api/admin/login.js';
import * as logout from '../functions/api/admin/logout.js';
import * as me from '../functions/api/admin/me.js';
import * as bookings from '../functions/api/admin/bookings.js';
import * as adminSettings from '../functions/api/admin/settings.js';
import * as docs from '../functions/api/admin/docs.js';
import * as zoom from '../functions/api/admin/zoom.js';
import { fail } from './lib.js';

const routes = {
  'POST /api/book': book.onRequestPost,
  'GET /api/settings': publicSettings.onRequestGet,
  'POST /api/admin/login': login.onRequestPost,
  'POST /api/admin/logout': logout.onRequestPost,
  'GET /api/admin/me': me.onRequestGet,
  'GET /api/admin/bookings': bookings.onRequestGet,
  'PATCH /api/admin/bookings': bookings.onRequestPatch,
  'DELETE /api/admin/bookings': bookings.onRequestDelete,
  'GET /api/admin/settings': adminSettings.onRequestGet,
  'PUT /api/admin/settings': adminSettings.onRequestPut,
  'GET /api/admin/docs': docs.onRequestGet,
  'POST /api/admin/docs': docs.onRequestPost,
  'DELETE /api/admin/docs': docs.onRequestDelete,
  'POST /api/admin/zoom': zoom.onRequestPost,
};

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith('/api/')) {
      const handler = routes[`${request.method} ${pathname}`];
      if (!handler) return fail('المسار غير موجود.', 404);
      try {
        return await handler({ request, env });
      } catch (e) {
        console.error('api error', request.method, pathname, e && (e.stack || e.message || e));
        const detail = pathname.startsWith('/api/admin/') ? ' (' + String((e && e.message) || e).slice(0, 160) + ')' : '';
        return fail('حدث خطأ في الخادم. حاول مرة أخرى.' + detail, 500);
      }
    }
    return env.ASSETS.fetch(request);
  },
};
