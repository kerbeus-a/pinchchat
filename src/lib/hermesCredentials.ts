const STORAGE_KEY = 'pinchchat_hermes_credentials';

export interface HermesCredentials {
  bridgeUrl: string;
  agent: string;
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

export function storeCredentials(bridgeUrl: string, agent: string) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ bridgeUrl, agent }));
}

export function clearCredentials() {
  localStorage.removeItem(STORAGE_KEY);
}
