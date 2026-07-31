import { Router } from 'express';
import { nanoid } from 'nanoid';
import { requireAuth, type AuthedRequest } from '../auth.js';
import { config } from '../config.js';
import { generateBuyList } from '../deepseek.js';
import { rateLimit } from '../rateLimit.js';
import {
  createTrip,
  findTripByCode,
  listTrips,
  readTrip,
  readUsers,
  updateTrip,
} from '../store.js';
import {
  findIngredient,
  generateInviteCode,
  isMember,
  newDish,
} from '../tripHelpers.js';
import { displayName, type Trip } from '../types.js';

export const tripsRouter = Router();

async function uniqueCode(): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const code = generateInviteCode();
    const existing = await findTripByCode(code);
    if (!existing) return code;
  }
  return generateInviteCode(8);
}

async function enrichTrip(trip: Trip) {
  const { users } = await readUsers();
  const members = trip.memberIds
    .map((id) => users.find((u) => u.id === id))
    .filter(Boolean)
    .map((u) => ({
      id: u!.id,
      displayName: displayName(u!),
      picture: u!.picture,
    }));
  const userMap = Object.fromEntries(members.map((m) => [m.id, m]));
  return {
    ...trip,
    joinUrl: `${config.publicAppUrl}/join/${trip.code}`,
    members,
    userMap,
  };
}

function requireMember(trip: Trip | null, userId: string): trip is Trip {
  return !!trip && isMember(trip, userId);
}

tripsRouter.post('/', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const user = req.user!;
    const trip: Trip = {
      id: nanoid(12),
      code: await uniqueCode(),
      createdBy: user.id,
      createdAt: new Date().toISOString(),
      memberIds: [user.id],
      dishes: [],
    };
    await createTrip(trip);
    res.status(201).json({ trip: await enrichTrip(trip) });
  } catch (err) {
    next(err);
  }
});

tripsRouter.post('/join', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const code = String(req.body?.code ?? '')
      .trim()
      .toUpperCase();
    if (!code) {
      res.status(400).json({ error: 'code required' });
      return;
    }
    const trip = await findTripByCode(code);
    if (!trip) {
      res.status(404).json({ error: 'Trip not found' });
      return;
    }
    const userId = req.user!.id;
    const updated = await updateTrip(trip.id, (t) => {
      if (!t.memberIds.includes(userId)) t.memberIds.push(userId);
      return t;
    });
    res.json({ trip: await enrichTrip(updated!) });
  } catch (err) {
    next(err);
  }
});

tripsRouter.get('/mine', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const userId = req.user!.id;
    const trips = (await listTrips())
      .filter((t) => t.memberIds.includes(userId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const enriched = await Promise.all(trips.map((t) => enrichTrip(t)));
    res.json({ trips: enriched });
  } catch (err) {
    next(err);
  }
});

tripsRouter.get('/:id', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const trip = await readTrip(req.params.id);
    if (!requireMember(trip, req.user!.id)) {
      res.status(404).json({ error: 'Trip not found' });
      return;
    }
    res.json({ trip: await enrichTrip(trip) });
  } catch (err) {
    next(err);
  }
});

tripsRouter.post('/:id/dishes/generate', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const trip = await readTrip(req.params.id);
    if (!requireMember(trip, req.user!.id)) {
      res.status(404).json({ error: 'Trip not found' });
      return;
    }
    const name = String(req.body?.name ?? '').trim();
    if (!name) {
      res.status(400).json({ error: 'name required' });
      return;
    }
    if (!rateLimit(`gen:${req.user!.id}`, 10, 60_000)) {
      res.status(429).json({ error: 'Too many generate requests' });
      return;
    }
    try {
      const draft = await generateBuyList(name);
      res.json({ draft });
    } catch (err) {
      console.error('DeepSeek generate failed', err);
      res.status(502).json({ error: 'Could not generate buy list' });
    }
  } catch (err) {
    next(err);
  }
});

tripsRouter.post('/:id/dishes', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const trip = await readTrip(req.params.id);
    if (!requireMember(trip, req.user!.id)) {
      res.status(404).json({ error: 'Trip not found' });
      return;
    }
    const name = String(req.body?.name ?? '').trim();
    const icon = String(req.body?.icon ?? '🍽️');
    const ingredientsIn = Array.isArray(req.body?.ingredients) ? req.body.ingredients : [];
    if (!name) {
      res.status(400).json({ error: 'name required' });
      return;
    }
    const ingredients = ingredientsIn
      .map((i: { name?: string; icon?: string }) => ({
        name: String(i?.name ?? '').trim(),
        icon: String(i?.icon ?? '🛒'),
      }))
      .filter((i: { name: string }) => i.name);

    if (ingredients.length === 0) {
      res.status(400).json({ error: 'at least one ingredient required' });
      return;
    }

    const dish = newDish(name, icon, req.user!.id, ingredients);
    const updated = await updateTrip(trip.id, (t) => {
      t.dishes.push(dish);
      return t;
    });
    res.status(201).json({ trip: await enrichTrip(updated!), dish });
  } catch (err) {
    next(err);
  }
});

async function mutateIngredient(
  req: AuthedRequest,
  res: import('express').Response,
  action: 'claim' | 'release' | 'bought',
) {
  const ingredientId = req.params.id;
  const userId = req.user!.id;
  const trips = await listTrips();
  const trip = trips.find(
    (t) => isMember(t, userId) && findIngredient(t, ingredientId),
  );
  if (!trip) {
    res.status(404).json({ error: 'Ingredient not found' });
    return;
  }

  const updated = await updateTrip(trip.id, (t) => {
    const found = findIngredient(t, ingredientId);
    if (!found) return t;
    const { ingredient } = found;
    const now = new Date().toISOString();

    if (action === 'claim') {
      if (ingredient.status === 'bought') {
        throw Object.assign(new Error('Already bought'), { status: 409 });
      }
      if (ingredient.status === 'claimed' && ingredient.claimedBy !== userId) {
        throw Object.assign(new Error('Already claimed'), { status: 409 });
      }
      ingredient.status = 'claimed';
      ingredient.claimedBy = userId;
      ingredient.claimedAt = now;
    } else if (action === 'release') {
      if (ingredient.status !== 'claimed' || ingredient.claimedBy !== userId) {
        throw Object.assign(new Error('Cannot release'), { status: 409 });
      }
      ingredient.status = 'open';
      ingredient.claimedBy = null;
      ingredient.claimedAt = null;
    } else if (action === 'bought') {
      if (ingredient.status === 'bought') {
        throw Object.assign(new Error('Already bought'), { status: 409 });
      }
      if (ingredient.status === 'claimed' && ingredient.claimedBy !== userId) {
        throw Object.assign(new Error('Claimed by someone else'), { status: 409 });
      }
      ingredient.status = 'bought';
      ingredient.boughtBy = userId;
      ingredient.boughtAt = now;
      if (!ingredient.claimedBy) {
        ingredient.claimedBy = userId;
        ingredient.claimedAt = now;
      }
    }
    return t;
  });

  res.json({ trip: await enrichTrip(updated!) });
}

export const ingredientsRouter = Router();

ingredientsRouter.post('/:id/claim', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await mutateIngredient(req, res, 'claim');
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 409) {
      res.status(409).json({ error: (err as Error).message });
      return;
    }
    next(err);
  }
});

ingredientsRouter.post('/:id/release', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await mutateIngredient(req, res, 'release');
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 409) {
      res.status(409).json({ error: (err as Error).message });
      return;
    }
    next(err);
  }
});

ingredientsRouter.post('/:id/bought', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await mutateIngredient(req, res, 'bought');
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 409) {
      res.status(409).json({ error: (err as Error).message });
      return;
    }
    next(err);
  }
});
