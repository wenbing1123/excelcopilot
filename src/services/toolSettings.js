const LS_KEY = 'sheetnext.tools.settings.v1';

export function getDefaultToolSettings() {
  return {
    enableAll: true,
    enabledToolNames: [],
  };
}

export function loadToolSettings() {
  const defaults = getDefaultToolSettings();
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);

    const enableAll = typeof parsed?.enableAll === 'boolean' ? parsed.enableAll : defaults.enableAll;
    const enabledToolNames = Array.isArray(parsed?.enabledToolNames) ? parsed.enabledToolNames.filter(Boolean) : defaults.enabledToolNames;

    return { enableAll, enabledToolNames };
  } catch {
    return defaults;
  }
}

export function saveToolSettings(settings) {
  const enableAll = typeof settings?.enableAll === 'boolean' ? settings.enableAll : true;
  const enabledToolNames = Array.isArray(settings?.enabledToolNames) ? settings.enabledToolNames.filter(Boolean) : [];
  const payload = { enableAll, enabledToolNames };
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
  return payload;
}

