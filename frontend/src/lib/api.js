const BASE = import.meta.env.VITE_API_URL ?? '/api';
let token = sessionStorage.getItem('tt_token');

export const setToken = (t) => {
  token = t;
  t ? sessionStorage.setItem('tt_token', t) : sessionStorage.removeItem('tt_token');
};
export const haySesion = () => Boolean(token);

async function pedir(path, { method = 'GET', body, form } = {}) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  if (body) headers['Content-Type'] = 'application/json';
  const r = await fetch(BASE + path, { method, headers, body: form ?? (body ? JSON.stringify(body) : undefined) });
  if (r.status === 401 && token) { setToken(null); window.dispatchEvent(new Event('tt:logout')); }
  const datos = r.status === 204 ? null : await r.json().catch(() => null);
  if (!r.ok) throw Object.assign(new Error(datos?.error ?? `Error ${r.status}`), { status: r.status, detalle: datos });
  return datos;
}

export const api = {
  get: (p) => pedir(p),
  post: (p, body) => pedir(p, { method: 'POST', body }),
  put: (p, body) => pedir(p, { method: 'PUT', body }),
  del: (p) => pedir(p, { method: 'DELETE' }),
  subir: (p, archivo, campo = 'archivo') => { const f = new FormData(); f.append(campo, archivo); return pedir(p, { method: 'POST', form: f }); },
};
