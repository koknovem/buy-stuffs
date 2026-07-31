import { nanoid } from 'nanoid';
import type { Dish, Ingredient, Trip } from './types.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateInviteCode(length = 6): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

export function newIngredient(name: string, icon: string): Ingredient {
  return {
    id: nanoid(10),
    name: name.trim().slice(0, 80),
    icon: (icon || '🛒').slice(0, 8),
    status: 'open',
    claimedBy: null,
    claimedAt: null,
    boughtBy: null,
    boughtAt: null,
  };
}

export function newDish(
  name: string,
  icon: string,
  createdBy: string,
  ingredients: { name: string; icon: string }[],
): Dish {
  return {
    id: nanoid(10),
    name: name.trim().slice(0, 80),
    icon: (icon || '🍽️').slice(0, 8),
    createdBy,
    createdAt: new Date().toISOString(),
    ingredients: ingredients.map((i) => newIngredient(i.name, i.icon)),
  };
}

export function findIngredient(
  trip: Trip,
  ingredientId: string,
): { dish: Dish; ingredient: Ingredient } | null {
  for (const dish of trip.dishes) {
    const ingredient = dish.ingredients.find((i) => i.id === ingredientId);
    if (ingredient) return { dish, ingredient };
  }
  return null;
}

export function isMember(trip: Trip, userId: string): boolean {
  return trip.memberIds.includes(userId);
}
