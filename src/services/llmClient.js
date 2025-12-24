const STORAGE_KEY = 'llm.config.v2';

/**
 * @typedef {{ apiKey?: string, baseUrl?: string }} ProviderConfig
 * @typedef {{ providers: Record<string, ProviderConfig> }} LlmConfig
 */

export const PROVIDERS = {
  GPT: 'GPT',
  DEEPSEEK: 'DEEPSEEK',
  DOUBAO: 'DOUBAO',
};

export function getDefaultConfig() {
  return {
    providers: {
      [PROVIDERS.GPT]: { apiKey: '', baseUrl: '' },
      [PROVIDERS.DEEPSEEK]: { apiKey: '', baseUrl: '' },
      [PROVIDERS.DOUBAO]: { apiKey: '', baseUrl: '' },
    },
  };
}

export function loadLlmConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultConfig();
    const parsed = JSON.parse(raw);

    const def = getDefaultConfig();
    const providers = { ...def.providers, ...(parsed?.providers || {}) };

    return { providers };
  } catch {
    return getDefaultConfig();
  }
}

export function saveLlmConfig(cfg) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg ?? {}));
}

export function getProviderDefaults(provider) {
  if (provider === PROVIDERS.GPT || provider === 'GPT') {
    return {
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
    };
  }
  if (provider === PROVIDERS.DEEPSEEK || provider === 'DEEPSEEK') {
    return {
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-chat',
    };
  }
  if (provider === PROVIDERS.DOUBAO || provider === 'DOUBAO') {
    // 说明：豆包/火山引擎不同账号域名可能不同，这里给一个常见占位默认；用户可在 UI 覆盖。
    return {
      baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      model: 'doubao-lite-4k',
    };
  }
  return { baseUrl: '', model: '' };
}

function normalizeBaseUrl(url) {
  // allow empty
  if (!url) return '';
  return url.replace(/\/+$/, '');
}

/**
 * Minimal Chat Completions caller.
 * Uses OpenAI-compatible schema (works for OpenAI & many providers).
 */
export async function chatCompletion({ provider, config, messages, signal }) {
  const defaults = getProviderDefaults(provider);
  const baseUrl = normalizeBaseUrl(config?.baseUrl) || defaults.baseUrl;
  const apiKey = config?.apiKey || '';

  if (!apiKey) {
    const err = new Error(`${provider} 未配置 apiKey`);
    err.code = 'NO_API_KEY';
    throw err;
  }
  if (!baseUrl) {
    const err = new Error(`${provider} baseUrl 无效`);
    err.code = 'NO_BASE_URL';
    throw err;
  }

  const endpoint = `${baseUrl}/chat/completions`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: defaults.model,
      messages,
      stream: false,
    }),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`LLM 请求失败 (${res.status}): ${text || res.statusText}`);
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  return {
    raw: data,
    content: typeof content === 'string' ? content : JSON.stringify(data),
  };
}
