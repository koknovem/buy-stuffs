const API_BASE = import.meta.env.VITE_API_BASE ?? '';

const DEFAULT_TIMEOUT_MS = 18_000;
const AI_TIMEOUT_MS = 60_000;
const MAX_RETRIES = 3;

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export class NetworkError extends Error {
  constructor(message = 'Network unavailable') {
    super(message);
    this.name = 'NetworkError';
  }
}

export function isNetworkError(err: unknown): boolean {
  if (err instanceof NetworkError) return true;
  if (err instanceof TypeError) return true;
  if (err instanceof DOMException && err.name === 'AbortError') return true;
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return (
      msg.includes('failed to fetch') ||
      msg.includes('networkerror') ||
      msg.includes('network request failed') ||
      msg.includes('load failed') ||
      msg.includes('timed out')
    );
  }
  return false;
}

export function friendlyError(err: unknown, fallback = 'Something went wrong'): string {
  if (isNetworkError(err)) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return 'You appear to be offline. Check your connection and try again.';
    }
    return 'Connection unstable. Please try again.';
  }
  if (err instanceof ApiError) return err.message || fallback;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function shouldRetryStatus(status: number): boolean {
  return status === 408 || status === 429 || status === 502 || status === 503 || status === 504;
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit | undefined,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const external = init?.signal;
  if (external) {
    if (external.aborted) controller.abort();
    else {
      external.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new NetworkError('Request timed out');
    }
    if (isNetworkError(err)) {
      throw new NetworkError('Network unavailable');
    }
    throw err;
  } finally {
    window.clearTimeout(timer);
  }
}

type RequestOptions = RequestInit & {
  timeoutMs?: number;
  retries?: number;
};

async function request<T>(path: string, init?: RequestOptions): Promise<T> {
  const timeoutMs = init?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = init?.retries ?? MAX_RETRIES;
  const { timeoutMs: _t, retries: _r, ...fetchInit } = init ?? {};

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchWithTimeout(
        `${API_BASE}${path}`,
        {
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            ...(fetchInit.headers ?? {}),
          },
          ...fetchInit,
        },
        timeoutMs,
      );

      if (!res.ok) {
        let message = res.statusText;
        try {
          const body = (await res.json()) as { error?: string; reason?: string };
          if (body.error) message = body.reason ? `${body.error}: ${body.reason}` : body.error;
        } catch {
          /* ignore */
        }
        const apiErr = new ApiError(res.status, message || `HTTP ${res.status}`);
        if (shouldRetryStatus(res.status) && attempt < retries) {
          lastError = apiErr;
          await sleep(400 * 2 ** attempt + Math.random() * 200);
          continue;
        }
        throw apiErr;
      }

      if (res.status === 204) return undefined as T;
      return (await res.json()) as T;
    } catch (err) {
      lastError = err;
      const retryable = isNetworkError(err) || (err instanceof ApiError && shouldRetryStatus(err.status));
      if (!retryable || attempt >= retries) throw err;
      await sleep(400 * 2 ** attempt + Math.random() * 200);
    }
  }
  throw lastError instanceof Error ? lastError : new NetworkError();
}

export const api = {
  me: () => request<{ user: import('./types').User }>('/api/me'),
  loginGoogle: (idToken: string) =>
    request<{ user: import('./types').User }>('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify({ idToken }),
      retries: 2,
    }),
  logout: () =>
    request<{ ok: boolean }>('/api/auth/logout', { method: 'POST', retries: 1 }),
  setNickname: (nickname: string | null) =>
    request<{ user: import('./types').User }>('/api/me', {
      method: 'PATCH',
      body: JSON.stringify({ nickname }),
      retries: 2,
    }),
  myTrips: () => request<{ trips: import('./types').Trip[] }>('/api/trips/mine'),
  createTrip: () =>
    request<{ trip: import('./types').Trip }>('/api/trips', {
      method: 'POST',
      body: '{}',
      retries: 1,
    }),
  joinTrip: (code: string) =>
    request<{ trip: import('./types').Trip }>('/api/trips/join', {
      method: 'POST',
      body: JSON.stringify({ code }),
      retries: 2,
    }),
  getTrip: (id: string) => request<{ trip: import('./types').Trip }>(`/api/trips/${id}`),
  generateDish: (tripId: string, name: string) =>
    request<{
      draft: { icon: string; ingredients: import('./types').DraftIngredient[] };
    }>(`/api/trips/${tripId}/dishes/generate`, {
      method: 'POST',
      body: JSON.stringify({ name }),
      timeoutMs: AI_TIMEOUT_MS,
      retries: 1,
    }),
  addDish: (
    tripId: string,
    payload: { name: string; icon: string; ingredients: import('./types').DraftIngredient[] },
  ) =>
    request<{ trip: import('./types').Trip }>(`/api/trips/${tripId}/dishes`, {
      method: 'POST',
      body: JSON.stringify(payload),
      retries: 1,
    }),
  fillDish: (tripId: string, dishId: string) =>
    request<{ trip: import('./types').Trip }>(`/api/trips/${tripId}/dishes/${dishId}/fill`, {
      method: 'POST',
      body: '{}',
      timeoutMs: AI_TIMEOUT_MS,
      retries: 1,
    }),
  claim: (id: string) =>
    request<{ trip: import('./types').Trip }>(`/api/ingredients/${id}/claim`, {
      method: 'POST',
      body: '{}',
      retries: 2,
    }),
  release: (id: string) =>
    request<{ trip: import('./types').Trip }>(`/api/ingredients/${id}/release`, {
      method: 'POST',
      body: '{}',
      retries: 2,
    }),
  bought: (id: string) =>
    request<{ trip: import('./types').Trip }>(`/api/ingredients/${id}/bought`, {
      method: 'POST',
      body: '{}',
      retries: 2,
    }),
  resetIngredient: (id: string) =>
    request<{ trip: import('./types').Trip }>(`/api/ingredients/${id}/reset`, {
      method: 'POST',
      body: '{}',
      retries: 2,
    }),
  resetTrip: (tripId: string) =>
    request<{ trip: import('./types').Trip }>(`/api/trips/${tripId}/reset`, {
      method: 'POST',
      body: '{}',
      retries: 1,
    }),
  updateDish: (tripId: string, dishId: string, payload: { name?: string; icon?: string }) =>
    request<{ trip: import('./types').Trip }>(`/api/trips/${tripId}/dishes/${dishId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
      retries: 1,
    }),
  deleteDish: (tripId: string, dishId: string) =>
    request<{ trip: import('./types').Trip }>(`/api/trips/${tripId}/dishes/${dishId}`, {
      method: 'DELETE',
      retries: 1,
    }),
  addIngredient: (
    tripId: string,
    dishId: string,
    payload: { name: string; icon?: string },
  ) =>
    request<{ trip: import('./types').Trip }>(
      `/api/trips/${tripId}/dishes/${dishId}/ingredients`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
        retries: 1,
      },
    ),
  updateIngredient: (id: string, payload: { name: string; icon?: string }) =>
    request<{ trip: import('./types').Trip }>(`/api/ingredients/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
      retries: 1,
    }),
  deleteIngredient: (id: string) =>
    request<{ trip: import('./types').Trip }>(`/api/ingredients/${id}`, {
      method: 'DELETE',
      retries: 1,
    }),
};
