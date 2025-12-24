const DEFAULT_BASE = '';

function getBase() {
  try {
    const ls = localStorage.getItem('llm.db.base');
    if (ls) return ls;
  } catch {}

  const envBase = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_LLM_DB_BASE) || '';
  return envBase || DEFAULT_BASE;
}

async function http(method, path, body) {
  const base = getBase();
  const url = `${base}${path}`;

  let res;
  try {
    res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    const hint = base
      ? `系统提示词服务不可用（${base}）。请先启动：npm run dev:server 或 npm run dev:all`
      : '系统提示词服务不可用（/api）。请先启动：npm run dev:server 或 npm run dev:all（开发环境依赖 Vite 代理）';
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

export function listSystemPrompts() {
  return http('GET', '/api/system-prompts');
}

export function createSystemPrompt(payload) {
  return http('POST', '/api/system-prompts', payload);
}

export function updateSystemPrompt(id, payload) {
  return http('PUT', `/api/system-prompts/${id}`, payload);
}

export function deleteSystemPrompt(id) {
  return http('DELETE', `/api/system-prompts/${id}`);
}

export function getActiveSystemPrompt() {
  return http('GET', '/api/settings/system-prompt');
}

export function setActiveSystemPrompt(activeSystemPromptId) {
  return http('PUT', '/api/settings/system-prompt', { activeSystemPromptId });
}

