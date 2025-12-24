async function http(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(data?.error || res.statusText);
  }
  return data;
}

export function getRecentConversation() {
  return http('GET', '/api/conversations/recent');
}

export function listConversations() {
  return http('GET', '/api/conversations');
}

export function getConversationMessages(id) {
  return http('GET', `/api/conversations/${id}/messages`);
}

export function createConversation(title = '') {
  return http('POST', '/api/conversations', { title });
}

export function saveConversation(id, payload) {
  return http('POST', `/api/conversations/${id}/save`, payload);
}

export function deleteConversation(id) {
  return http('DELETE', `/api/conversations/${id}`);
}

export function clearConversations() {
  return http('DELETE', '/api/conversations');
}
