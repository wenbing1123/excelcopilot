async function http(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const err = new Error(data?.error || res.statusText);
    // attach extra debug info (e.g. {hint:{keys:[]}})
    err.data = data;
    err.status = res.status;
    throw err;
  }
  return data;
}

export function getWorkbookLatest(workbookKey = 'default') {
  const key = encodeURIComponent(String(workbookKey || 'default'));
  return http('GET', `/api/workbook/latest?key=${key}`);
}

export function saveWorkbookSnapshot(payload) {
  return http('POST', '/api/workbook/save', payload);
}

export function deleteWorkbookSnapshot(workbookKey = 'default') {
  const key = encodeURIComponent(String(workbookKey || 'default'));
  return http('DELETE', `/api/workbook/snapshot?key=${key}`);
}
