const STORAGE_KEY = 'pinchchat_hermes_credentials';

export interface HermesCredentials {
  bridgeUrl: string;
  agent: string;
  /** Bearer token for the kin gateway. Persisted so reloads don't log out. */
  token?: string;
}

export function getStoredCredentials(): HermesCredentials | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.bridgeUrl && parsed.agent) return parsed;
  } catch {
    // Ignore
  }
  return null;
}

export function storeCredentials(bridgeUrl: string, agent: string, token?: string | null) {
  const payload: HermesCredentials = { bridgeUrl, agent };
  if (token) payload.token = token;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function clearCredentials() {
  localStorage.removeItem(STORAGE_KEY);
}
