import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import type { SessionsFile, Trip, UsersFile } from './types.js';

const locks = new Map<string, Promise<unknown>>();

async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chained = prev.then(() => gate, () => gate);
  locks.set(key, chained);
  await prev.then(
    () => undefined,
    () => undefined,
  );
  try {
    return await fn();
  } finally {
    release();
  }
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return fallback;
    throw err;
  }
}

async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  await ensureDir(path.dirname(filePath));
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmp, filePath);
}

function usersPath(): string {
  return path.join(config.dataDir, 'users.json');
}

function sessionsPath(): string {
  return path.join(config.dataDir, 'sessions.json');
}

function tripsDir(): string {
  return path.join(config.dataDir, 'trips');
}

function tripPath(tripId: string): string {
  return path.join(tripsDir(), `${tripId}.json`);
}

export async function initStore(): Promise<void> {
  await ensureDir(config.dataDir);
  await ensureDir(tripsDir());
  if (!(await exists(usersPath()))) {
    await writeJsonFile(usersPath(), { users: [] } satisfies UsersFile);
  }
  if (!(await exists(sessionsPath()))) {
    await writeJsonFile(sessionsPath(), { sessions: [] } satisfies SessionsFile);
  }
}

export async function readUsers(): Promise<UsersFile> {
  return withLock(usersPath(), () => readJsonFile(usersPath(), { users: [] }));
}

export async function updateUsers(
  mutator: (data: UsersFile) => UsersFile | void,
): Promise<UsersFile> {
  return withLock(usersPath(), async () => {
    const data = await readJsonFile<UsersFile>(usersPath(), { users: [] });
    const next = mutator(data) ?? data;
    await writeJsonFile(usersPath(), next);
    return next;
  });
}

export async function readSessions(): Promise<SessionsFile> {
  return withLock(sessionsPath(), () => readJsonFile(sessionsPath(), { sessions: [] }));
}

export async function updateSessions(
  mutator: (data: SessionsFile) => SessionsFile | void,
): Promise<SessionsFile> {
  return withLock(sessionsPath(), async () => {
    const data = await readJsonFile<SessionsFile>(sessionsPath(), { sessions: [] });
    const next = mutator(data) ?? data;
    await writeJsonFile(sessionsPath(), next);
    return next;
  });
}

export async function readTrip(tripId: string): Promise<Trip | null> {
  return withLock(tripPath(tripId), async () => {
    if (!(await exists(tripPath(tripId)))) return null;
    return readJsonFile<Trip>(tripPath(tripId), null as unknown as Trip);
  });
}

export async function updateTrip(
  tripId: string,
  mutator: (trip: Trip) => Trip | void,
): Promise<Trip | null> {
  return withLock(tripPath(tripId), async () => {
    if (!(await exists(tripPath(tripId)))) return null;
    const trip = await readJsonFile<Trip>(tripPath(tripId), null as unknown as Trip);
    if (!trip) return null;
    const next = mutator(trip) ?? trip;
    await writeJsonFile(tripPath(tripId), next);
    return next;
  });
}

export async function createTrip(trip: Trip): Promise<Trip> {
  return withLock(tripPath(trip.id), async () => {
    await writeJsonFile(tripPath(trip.id), trip);
    return trip;
  });
}

export async function listTrips(): Promise<Trip[]> {
  await ensureDir(tripsDir());
  const files = await fs.readdir(tripsDir());
  const trips: Trip[] = [];
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const trip = await readJsonFile<Trip | null>(path.join(tripsDir(), file), null);
    if (trip?.id) trips.push(trip);
  }
  return trips;
}

export async function findTripByCode(code: string): Promise<Trip | null> {
  const normalized = code.trim().toUpperCase();
  const trips = await listTrips();
  return trips.find((t) => t.code === normalized) ?? null;
}
