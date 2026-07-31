export type IngredientStatus = 'open' | 'claimed' | 'bought';

export interface Ingredient {
  id: string;
  name: string;
  icon: string;
  status: IngredientStatus;
  claimedBy: string | null;
  claimedAt: string | null;
  boughtBy: string | null;
  boughtAt: string | null;
}

export interface Dish {
  id: string;
  name: string;
  icon: string;
  createdBy: string;
  createdAt: string;
  ingredients: Ingredient[];
}

export interface Trip {
  id: string;
  code: string;
  createdBy: string;
  createdAt: string;
  memberIds: string[];
  dishes: Dish[];
}

export interface User {
  id: string;
  googleId: string;
  email: string;
  googleName: string;
  picture: string;
  nickname: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Session {
  id: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}

export interface UsersFile {
  users: User[];
}

export interface SessionsFile {
  sessions: Session[];
}

export interface PublicUser {
  id: string;
  displayName: string;
  picture: string;
}

export function displayName(user: User): string {
  const nick = user.nickname?.trim();
  return nick || user.googleName || user.email || 'Friend';
}
