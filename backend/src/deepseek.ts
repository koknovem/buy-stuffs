import { config } from './config.js';

export interface GeneratedIngredient {
  name: string;
  icon: string;
}

export interface GeneratedDishDraft {
  icon: string;
  ingredients: GeneratedIngredient[];
}

const cache = new Map<string, { at: number; value: GeneratedDishDraft }>();
const CACHE_TTL_MS = 60 * 60 * 1000;

const SYSTEM_PROMPT = `You are a grocery shopping assistant for friends buying dinner ingredients.
Given a dish name, reply with ONLY valid JSON (no markdown fences):
{"icon":"🍜","ingredients":[{"name":"eggs","icon":"🥚"}]}
Rules:
- Prefer common store-bought items people need to buy
- Skip pantry staples (salt, pepper, oil, water) unless essential to the dish identity
- Short ingredient names (1-3 words)
- One emoji icon per ingredient and one for the dish
- Assume servings for 2-4 people
- At most 20 ingredients
- Language: match the dish name language (Chinese dish → Chinese ingredient names)`;

function normalizeKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function sanitizeDraft(raw: unknown): GeneratedDishDraft {
  const obj = raw as { icon?: unknown; ingredients?: unknown };
  const icon = typeof obj.icon === 'string' && obj.icon.trim() ? obj.icon.trim().slice(0, 8) : '🍽️';
  const list = Array.isArray(obj.ingredients) ? obj.ingredients : [];
  const ingredients: GeneratedIngredient[] = [];
  for (const item of list.slice(0, 20)) {
    const row = item as { name?: unknown; icon?: unknown };
    const name = typeof row.name === 'string' ? row.name.trim().slice(0, 80) : '';
    if (!name) continue;
    const itemIcon =
      typeof row.icon === 'string' && row.icon.trim() ? row.icon.trim().slice(0, 8) : '🛒';
    ingredients.push({ name, icon: itemIcon });
  }
  return { icon, ingredients };
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error('Model did not return JSON');
  }
}

async function callDeepSeek(dishName: string): Promise<GeneratedDishDraft> {
  if (!config.deepseekApiKey) {
    throw new Error('DEEPSEEK_API_KEY is not configured');
  }

  const url = `${config.deepseekBaseUrl}/chat/completions`;
  const body = {
    model: config.deepseekModel,
    temperature: 0.4,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Dish: ${dishName.trim().slice(0, 120)}` },
    ],
  };

  const doFetch = async (): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      return await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.deepseekApiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  };

  let res = await doFetch();
  if (res.status === 429 || res.status >= 500) {
    await new Promise((r) => setTimeout(r, 800));
    res = await doFetch();
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`DeepSeek error ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty DeepSeek response');
  return sanitizeDraft(extractJson(content));
}

export async function generateBuyList(dishName: string): Promise<GeneratedDishDraft> {
  const key = normalizeKey(dishName);
  if (!key) throw new Error('Dish name required');

  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.value;
  }

  const draft = await callDeepSeek(dishName);
  cache.set(key, { at: Date.now(), value: draft });
  return draft;
}
