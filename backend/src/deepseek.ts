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

const SYSTEM_PROMPT = `你係香港朋友夾份買餸助手。根據菜式名稱，只回覆有效 JSON（唔好用 markdown code fence）：
{"icon":"🍜","ingredients":[{"name":"雞蛋","icon":"🥚"}]}
規則：
- 所有文字必須用繁體中文（香港用語 / zh-HK），例如用「餸」「豉油」「椰漿」，唔好用簡體，亦唔好用英文名
- 即使菜式名係日文、英文或其他語言，食材名稱都要翻譯成香港繁體中文
- 優先列出超市／街市常見要買嘅食材
- 跳過常備調味（鹽、胡椒、油、水），除非對呢道菜好關鍵
- 食材名要短（約 2–8 字）
- 每樣食材同菜式各一個 emoji
- 分量約 2–4 人
- 最多 20 樣食材
- JSON 嘅 name 欄位只用繁體中文，icon 用 emoji`;

function normalizeKey(name: string): string {
  return `zh-HK:${name.trim().toLowerCase().replace(/\s+/g, ' ')}`;
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
      { role: 'user', content: `菜式：${dishName.trim().slice(0, 120)}\n請用香港繁體中文列出要買嘅食材 JSON。` },
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
