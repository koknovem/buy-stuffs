const API_BASE = import.meta.env.VITE_API_BASE ?? '';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  me: () => request<{ user: import('./types').User }>('/api/me'),
  loginGoogle: (idToken: string) =>
    request<{ user: import('./types').User }>('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify({ idToken }),
    }),
  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
  setNickname: (nickname: string | null) =>
    request<{ user: import('./types').User }>('/api/me', {
      method: 'PATCH',
      body: JSON.stringify({ nickname }),
    }),
  myTrips: () => request<{ trips: import('./types').Trip[] }>('/api/trips/mine'),
  createTrip: () =>
    request<{ trip: import('./types').Trip }>('/api/trips', { method: 'POST', body: '{}' }),
  joinTrip: (code: string) =>
    request<{ trip: import('./types').Trip }>('/api/trips/join', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),
  getTrip: (id: string) => request<{ trip: import('./types').Trip }>(`/api/trips/${id}`),
  generateDish: (tripId: string, name: string) =>
    request<{
      draft: { icon: string; ingredients: import('./types').DraftIngredient[] };
    }>(`/api/trips/${tripId}/dishes/generate`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  addDish: (
    tripId: string,
    payload: { name: string; icon: string; ingredients: import('./types').DraftIngredient[] },
  ) =>
    request<{ trip: import('./types').Trip }>(`/api/trips/${tripId}/dishes`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  claim: (id: string) =>
    request<{ trip: import('./types').Trip }>(`/api/ingredients/${id}/claim`, {
      method: 'POST',
      body: '{}',
    }),
  release: (id: string) =>
    request<{ trip: import('./types').Trip }>(`/api/ingredients/${id}/release`, {
      method: 'POST',
      body: '{}',
    }),
  bought: (id: string) =>
    request<{ trip: import('./types').Trip }>(`/api/ingredients/${id}/bought`, {
      method: 'POST',
      body: '{}',
    }),
};
