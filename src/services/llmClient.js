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
  const modelName = config?.modelName || defaults.model;

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
      model: modelName,
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

function parseSseLines(buffer) {
  // SSE events are separated by \n\n, but we can parse line-by-line.
  return buffer.split(/\r?\n/);
}

/**
 * Stream chat completions (OpenAI-compatible SSE).
 * Calls onDelta(text) for each incremental token.
 */
export async function chatCompletionStream({ provider, config, messages, signal, onDelta }) {
  const defaults = getProviderDefaults(provider);
  const baseUrl = normalizeBaseUrl(config?.baseUrl) || defaults.baseUrl;
  const apiKey = config?.apiKey || '';
  const modelName = config?.modelName || defaults.model;

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
      model: modelName,
      messages,
      stream: true,
    }),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`LLM 请求失败 (${res.status}): ${text || res.statusText}`);
    err.status = res.status;
    throw err;
  }

  if (!res.body) {
    // Fallback: some environments/providers disable stream
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    const full = typeof content === 'string' ? content : JSON.stringify(data);
    onDelta?.(full);
    return { raw: data, content: full };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');

  let buffer = '';
  let fullText = '';
  let done = false;

  while (!done) {
    const { value, done: doneReading } = await reader.read();
    done = doneReading;
    if (value) {
      buffer += decoder.decode(value, { stream: true });
      const lines = parseSseLines(buffer);
      // keep last partial line in buffer
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (!trimmed.startsWith('data:')) continue;

        const payload = trimmed.slice('data:'.length).trim();
        if (payload === '[DONE]') {
          done = true;
          break;
        }

        try {
          const json = JSON.parse(payload);
          const delta = json?.choices?.[0]?.delta?.content;
          if (typeof delta === 'string' && delta.length) {
            fullText += delta;
            onDelta?.(delta);
          }
        } catch {
          // ignore malformed JSON lines
        }
      }
    }
  }

  return { raw: null, content: fullText };
}
