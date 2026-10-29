const SESSION_EXPIRED_EVENT = 'geoclockin:session-expired';

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'UNKNOWN', data = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

/** JSON request to the GeoClockIN API. Throws ApiError with a user-facing message. */
export async function api(path, { method = 'GET', body } = {}) {
  if (navigator.onLine === false) {
    throw new ApiError("You're offline. Check your internet connection and try again.", { code: 'OFFLINE' });
  }

  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Couldn't reach the server. Check your internet connection and try again.", {
      code: 'NETWORK_ERROR',
    });
  }

  if (response.status === 204) return null;
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    if (response.status === 401 && path !== '/auth/login') {
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
    throw new ApiError(data?.error?.message ?? 'Something went wrong. Please try again.', {
      status: response.status,
      code: data?.error?.code ?? 'HTTP_ERROR',
      data,
    });
  }
  return data;
}

export function onSessionExpired(listener) {
  window.addEventListener(SESSION_EXPIRED_EVENT, listener);
  return () => window.removeEventListener(SESSION_EXPIRED_EVENT, listener);
}
