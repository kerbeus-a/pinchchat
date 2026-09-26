import { useEffect, useRef, useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { useT } from '../hooks/useLocale';
import { getStoredCredentials } from '../lib/hermesCredentials';

// Parse `#bridge=...&token=...` from window.location.hash on mount.
// Also accepts legacy `#agent=...` for stored credentials but ignores it
// since agent is now derived server-side from the token.
//
// Each decodeURIComponent is guarded — malformed input (e.g., `%E0` without
// valid trailing hex) would otherwise throw and crash the whole LoginScreen
// during render.
function safeDecode(v: string): string | null {
  try { return decodeURIComponent(v); } catch { return null; }
}
function readHashParams(): { bridgeUrl?: string; token?: string } {
  if (typeof window === 'undefined') return {};
  const h = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
  const out: { bridgeUrl?: string; token?: string } = {};
  for (const pair of h.split('&')) {
    const idx = pair.indexOf('=');
    if (idx <= 0) continue;
    const k = safeDecode(pair.slice(0, idx));
    const v = safeDecode(pair.slice(idx + 1));
    if (!k || v === null) continue;
    if (k === 'bridge' || k === 'bridgeUrl') out.bridgeUrl = v;
    else if (k === 'token') out.token = v;
    // 'agent' key is intentionally ignored — server derives it from token.
  }
  return out;
}

/** Derive the default bridge URL from the page origin.
 *  When served at /kinchat we can assume the gateway is at
 *  <origin>/kinchat/v1. Falls back to the LAN IP default for dev. */
function deriveDefaultBridgeUrl(): string {
  if (typeof window === 'undefined') return 'http://192.168.1.14:3142/kinchat/v1';
  const { origin, pathname } = window.location;
  if (pathname.startsWith('/kinchat')) {
    return `${origin}/kinchat/v1`;
  }
  return 'http://192.168.1.14:3142/kinchat/v1';
}

// Allowlist for auto-submit bridge URL. Manual form entry stays permissive.
// A crafted URL like `#bridge=https://evil.example.com&token=X` would
// otherwise route every subsequent message to the attacker's server.
const AUTO_BRIDGE_ALLOW_PATTERNS: RegExp[] = [
  /^http:\/\/127\.0\.0\.1(:\d+)?(\/|$)/,
  /^http:\/\/localhost(:\d+)?(\/|$)/,
  // RFC1918 LAN ranges
  /^http:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?(\/|$)/,
  /^http:\/\/192\.168\.\d{1,3}\.\d{1,3}(:\d+)?(\/|$)/,
  /^http:\/\/172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}(:\d+)?(\/|$)/,
  // HTTPS to same allowlisted hosts (for production behind TLS proxy)
  /^https:\/\/127\.0\.0\.1(:\d+)?(\/|$)/,
  /^https:\/\/localhost(:\d+)?(\/|$)/,
  /^https:\/\/192\.168\.\d{1,3}\.\d{1,3}(:\d+)?(\/|$)/,
];

function isBridgeUrlAutoAllowed(url: string): boolean {
  return AUTO_BRIDGE_ALLOW_PATTERNS.some((re) => re.test(url));
}

// Same-origin bridge URLs are always auto-allowed (e.g. /kinchat/#token=X
// served from the kin daemon on :3142 — same origin as the gateway).
function isSameOrigin(bridgeUrl: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const u = new URL(bridgeUrl);
    return u.origin === window.location.origin;
  } catch { return false; }
}

interface Props {
  onConnect: (bridgeUrl: string, token?: string) => void;
  error?: string | null;
  isConnecting?: boolean;
}

export function LoginScreen({ onConnect, error, isConnecting }: Props) {
  const t = useT();
  const stored = getStoredCredentials();
  const hash = readHashParams();
  const [bridgeUrl, setBridgeUrl] = useState(
    hash.bridgeUrl || stored?.bridgeUrl || deriveDefaultBridgeUrl()
  );
  const [token, setToken] = useState(hash.token || stored?.token || '');

  // Auto-submit if a token came from the URL hash, or if this is the LAN
  // no-auth first-run path. The bridge URL must still be same-origin or on
  // the LAN allowlist, so a crafted remote bridge cannot receive traffic
  // without a manual operator action.
  //
  // `firedRef` guards against React StrictMode dev-mode double-mount
  // calling onConnect twice with stale closure values.
  const firedRef = useRef(false);
  useEffect(() => {
    if (firedRef.current) return;
    if (isConnecting) return;
    const hasHashToken = Boolean(hash.token);
    const effectiveBridge = hasHashToken
      ? hash.bridgeUrl || deriveDefaultBridgeUrl()
      : deriveDefaultBridgeUrl();
    const shouldAutoConnect = hasHashToken || (!stored?.token && !hash.bridgeUrl);
    if (!shouldAutoConnect) return;
    if (!isBridgeUrlAutoAllowed(effectiveBridge) && !isSameOrigin(effectiveBridge)) {
      // Pre-fill but don't auto-submit. User must review.
      return;
    }
    firedRef.current = true;
    // Scrub credential links, but preserve command-center navigation on LAN login.
    if (hash.token !== undefined || hash.bridgeUrl !== undefined) {
      window.history.replaceState({}, '', window.location.pathname + window.location.search);
    }
    onConnect(effectiveBridge, hash.token || undefined);
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bridgeUrl.trim()) return;
    onConnect(bridgeUrl.trim(), token.trim() || undefined);
  };

  return (
    <div className="h-dvh flex items-center justify-center bg-[var(--pc-bg-base)] text-pc-text bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.02),transparent_50%),radial-gradient(ellipse_at_bottom_right,rgba(99,102,241,0.04),transparent_50%)]">
      <div className="w-full max-w-md mx-4">
        <div className="flex flex-col items-center gap-3 mb-8">
          <img src={`${import.meta.env.BASE_URL}logo.png`} alt="PinchChat" className="h-20 w-20 drop-shadow-lg" />
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-pc-text tracking-wide">{t('login.title')}</h1>
            <Sparkles className="h-5 w-5 text-pc-accent-light/60" />
          </div>
          <p className="text-sm text-pc-text-muted">Connect to Hermes Bridge</p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-2xl border border-pc-border bg-[var(--pc-bg-surface)]/80 backdrop-blur-xl p-6 space-y-5 shadow-2xl shadow-black/30">
          <div className="space-y-2">
            <label htmlFor="bridge-url" className="block text-xs font-medium text-pc-text-secondary uppercase tracking-wider">
              Bridge URL
            </label>
            <input
              id="bridge-url"
              type="text"
              value={bridgeUrl}
              onChange={e => setBridgeUrl(e.target.value)}
              placeholder="http://192.168.1.14:8650"
              className="w-full rounded-xl border border-pc-border bg-pc-elevated/50 px-4 py-3 text-sm text-pc-text placeholder:text-pc-text-faint outline-none focus:border-[var(--pc-accent-dim)] focus:ring-1 focus:ring-[var(--pc-accent-glow)] transition-all"
              disabled={isConnecting}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="token-input" className="block text-xs font-medium text-pc-text-secondary uppercase tracking-wider">
              Web Chat Token
            </label>
            <input
              id="token-input"
              type="password"
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder="your member's web_chat_token"
              autoComplete="off"
              className="w-full rounded-xl border border-pc-border bg-pc-elevated/50 px-4 py-3 text-sm text-pc-text outline-none focus:border-[var(--pc-accent-dim)] focus:ring-1 focus:ring-[var(--pc-accent-glow)] transition-all"
              disabled={isConnecting}
            />
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!bridgeUrl.trim() || isConnecting}
            className="w-full rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/30 hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
          >
            {isConnecting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Connecting...
              </>
            ) : (
              'Connect'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
