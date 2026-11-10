// Zoom API (Server-to-Server OAuth): creates and deletes meetings for the admin panel.

export class ZoomError extends Error {}

export const zoomConfigured = (env) => Boolean(env.ZOOM_ACCOUNT_ID && env.ZOOM_CLIENT_ID && env.ZOOM_CLIENT_SECRET);

let cache = { token: '', exp: 0 };
export const resetZoomCache = () => {
  cache = { token: '', exp: 0 };
};

async function accessToken(env) {
  if (cache.token && cache.exp > Date.now() + 60_000) return cache.token;
  const basic = btoa(`${env.ZOOM_CLIENT_ID}:${env.ZOOM_CLIENT_SECRET}`);
  let res;
  try {
    res = await fetch(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(env.ZOOM_ACCOUNT_ID)}`, {
      method: 'POST',
      headers: { authorization: `Basic ${basic}`, 'content-type': 'application/x-www-form-urlencoded' },
    });
  } catch {
    throw new ZoomError('تعذّر الاتصال بزووم.');
  }
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) {
    throw new ZoomError('رفض زووم بيانات الربط. تحقق من ZOOM_ACCOUNT_ID وZOOM_CLIENT_ID وZOOM_CLIENT_SECRET وأن التطبيق مفعّل.');
  }
  cache = { token: j.access_token, exp: Date.now() + (Number(j.expires_in) || 3600) * 1000 };
  return cache.token;
}

// start is local Kuwait time like 2026-11-12T16:00:00
export async function createMeeting(env, { host, topic, start, duration }) {
  const token = await accessToken(env);
  let res;
  try {
    res = await fetch(`https://api.zoom.us/v2/users/${encodeURIComponent(host || 'me')}/meetings`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        topic: String(topic).slice(0, 200),
        type: 2,
        start_time: start,
        timezone: 'Asia/Kuwait',
        duration,
        settings: { join_before_host: false, waiting_room: true, host_video: true, participant_video: true },
      }),
    });
  } catch {
    throw new ZoomError('تعذّر الاتصال بزووم.');
  }
  const j = await res.json().catch(() => ({}));
  if (res.status === 401) resetZoomCache();
  if (!res.ok || !j.join_url) throw new ZoomError(j.message ? `زووم: ${j.message}` : `رفض زووم الطلب (${res.status}).`);
  return { id: String(j.id), joinUrl: j.join_url };
}

// best effort: an old meeting that cannot be deleted is not worth failing the new one
export async function deleteMeeting(env, id) {
  if (!id) return;
  try {
    await fetch(`https://api.zoom.us/v2/meetings/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${await accessToken(env)}` },
    });
  } catch {
    /* ignore */
  }
}
