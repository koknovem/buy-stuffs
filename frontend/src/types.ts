export type IngredientStatus = 'open' | 'claimed' | 'bought';

export interface Member {
  id: string;
  displayName: string;
  picture: string;
}

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
  joinUrl: string;
  members: Member[];
  userMap: Record<string, Member>;
}

export interface User {
  id: string;
  displayName: string;
  picture: string;
  nickname: string | null;
  googleName: string;
  email: string;
  needsNickname: boolean;
}

export interface DraftIngredient {
  name: string;
  icon: string;
}
