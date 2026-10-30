const SESSION_EXPIRED_EVENT = 'geoclockin-admin:session-expired';

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'UNKNOWN', data = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

async function request(path, { method = 'GET', body, raw } = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: raw ? { 'Content-Type': 'application/octet-stream' } : body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
    });
  } catch {
    throw new ApiError("Couldn't reach the server. Check your connection and try again.", { code: 'NETWORK_ERROR' });
  }
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    if (response.status === 401 && path !== '/admin/auth/login') window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    throw new ApiError(data?.error?.message ?? 'Something went wrong. Please try again.', {
      status: response.status,
      code: data?.error?.code ?? 'HTTP_ERROR',
      data,
    });
  }
  return response;
}

/** JSON request to the API. Throws ApiError with a user-facing message. */
export async function api(path, options) {
  const response = await request(path, options);
  return response.status === 204 ? null : response.json();
}

/** Downloads a file (e.g. an Excel export) and saves it with the server's filename. */
export async function download(path, fallbackName = 'export.xlsx') {
  const response = await request(path);
  const blob = await response.blob();
  const name = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') ?? '')?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Uploads a file as the raw request body. */
export async function upload(path, file) {
  const response = await request(path, { method: 'POST', raw: file });
  return response.json();
}

export function onSessionExpired(listener) {
  window.addEventListener(SESSION_EXPIRED_EVENT, listener);
  return () => window.removeEventListener(SESSION_EXPIRED_EVENT, listener);
}

/** Query string from an object, skipping empty values. */
export function qs(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== '') search.set(key, value);
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}
