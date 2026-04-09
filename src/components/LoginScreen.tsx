import { useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { useT } from '../hooks/useLocale';
import { getStoredCredentials } from '../lib/hermesCredentials';

interface Props {
  onConnect: (bridgeUrl: string, agent: string) => void;
  error?: string | null;
  isConnecting?: boolean;
}

const ALL_AGENTS = [
  { id: 'kerbeus', label: 'Kerbeus 🐺' },
  { id: 'beatrice', label: 'Beatrice 🦋' },
];

// VITE_AGENT locks to a single agent (no selector shown)
const LOCKED_AGENT = import.meta.env.VITE_AGENT as string | undefined;
const AGENTS = LOCKED_AGENT
  ? ALL_AGENTS.filter(a => a.id === LOCKED_AGENT)
  : ALL_AGENTS;

export function LoginScreen({ onConnect, error, isConnecting }: Props) {
  const t = useT();
  const stored = getStoredCredentials();
  const [bridgeUrl, setBridgeUrl] = useState(stored?.bridgeUrl || 'http://192.168.1.14:8650');
  const [agent, setAgent] = useState(stored?.agent || LOCKED_AGENT || 'kerbeus');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bridgeUrl.trim()) return;
    onConnect(bridgeUrl.trim(), agent);
  };

  return (
    <div className="h-dvh flex items-center justify-center bg-[var(--pc-bg-base)] text-pc-text bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.02),transparent_50%),radial-gradient(ellipse_at_bottom_right,rgba(99,102,241,0.04),transparent_50%)]">
      <div className="w-full max-w-md mx-4">
        <div className="flex flex-col items-center gap-3 mb-8">
          <img src="/logo.png" alt="PinchChat" className="h-20 w-20 drop-shadow-lg" />
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
            <label htmlFor="agent-select" className="block text-xs font-medium text-pc-text-secondary uppercase tracking-wider">
              Agent
            </label>
            <select
              id="agent-select"
              value={agent}
              onChange={e => setAgent(e.target.value)}
              className="w-full rounded-xl border border-pc-border bg-pc-elevated/50 px-4 py-3 text-sm text-pc-text outline-none focus:border-[var(--pc-accent-dim)] focus:ring-1 focus:ring-[var(--pc-accent-glow)] transition-all"
              disabled={isConnecting}
            >
              {AGENTS.map(a => (
                <option key={a.id} value={a.id}>{a.label}</option>
              ))}
            </select>
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
