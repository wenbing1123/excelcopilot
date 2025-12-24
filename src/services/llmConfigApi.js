const DEFAULT_BASE = '';

function getBase() {
  // 允许在开发时覆盖：localStorage('llm.db.base') 或 Vite env VITE_LLM_DB_BASE
  try {
    const ls = localStorage.getItem('llm.db.base');
    if (ls) return ls;
  } catch {}

  const envBase = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_LLM_DB_BASE) || '';

  // 开发环境默认同源（走 vite proxy），生产环境可用 envBase
  return envBase || DEFAULT_BASE;
}

async function http(method, path, body) {
  const base = getBase();
  const url = `${base}${path}`; // base 为空时即同源 /api

  let res;
  try {
    res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    const hint = base
      ? `模型配置服务不可用（${base}）。请先启动：npm run dev:server 或 npm run dev:all`
      : '模型配置服务不可用（/api）。请先启动：npm run dev:server 或 npm run dev:all（开发环境依赖 Vite 代理）';
    const err = new Error(hint);
    err.cause = e;
    throw err;
  }

  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const msg = data?.error || res.statusText;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export function listLlmConfigs() {
  return http('GET', '/api/llm-configs');
}

export function createLlmConfig(payload) {
  return http('POST', '/api/llm-configs', payload);
}

export function updateLlmConfig(id, payload) {
  return http('PUT', `/api/llm-configs/${id}`, payload);
}

export function deleteLlmConfig(id) {
  return http('DELETE', `/api/llm-configs/${id}`);
}
