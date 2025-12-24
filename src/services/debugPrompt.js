/**
 * Debug helper: build the actual prompt payload we send to the provider.
 * This is for local inspection only.
 */

export function buildDebugPrompt({ provider, modelName, baseUrl, messages }) {
  return {
    provider,
    baseUrl,
    modelName,
    messages,
  };
}

