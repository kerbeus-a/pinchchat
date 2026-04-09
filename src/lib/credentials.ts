/**
 * Credentials adapter — redirects to hermesCredentials for Hermes bridge mode.
 */
import { getStoredCredentials as getHermes, storeCredentials as storeHermes, clearCredentials as clearHermes } from './hermesCredentials';

export type AuthMode = 'token' | 'password';

export interface StoredCredentials {
  url: string;
  token: string;
  authMode?: AuthMode;
  clientId?: string;
}

export function getStoredCredentials(): StoredCredentials | null {
  const h = getHermes();
  if (!h) return null;
  return { url: h.bridgeUrl, token: h.agent, authMode: 'token' };
}

export function storeCredentials(url: string, token: string, _authMode: AuthMode = 'token', _clientId?: string) {
  storeHermes(url, token);
}

export function clearCredentials() {
  clearHermes();
}
