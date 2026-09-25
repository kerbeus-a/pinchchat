import { useEffect, useRef, useState } from 'react';
import { KeyRound, Loader2, X } from 'lucide-react';

interface Props {
  open: boolean;
  connecting: boolean;
  error: string | null;
  onClose: () => void;
  onUnlock: (token: string) => void;
}

export function ActionUnlockDialog({ open, connecting, error, onClose, onUnlock }: Props) {
  const [token, setToken] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 0);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !connecting) {
        setToken('');
        onClose();
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [connecting, onClose, open]);

  if (!open) return null;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const value = token.trim();
    if (value) {
      setToken('');
      onUnlock(value);
    }
  };

  const close = () => {
    if (connecting) return;
    setToken('');
    onClose();
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="action-unlock-title" className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={close} />
      <form onSubmit={submit} className="relative w-full max-w-sm rounded-lg border border-pc-border bg-[var(--pc-bg-base)] shadow-2xl">
        <div className="flex items-center gap-2.5 border-b border-pc-border px-5 py-4">
          <KeyRound size={17} className="text-pc-accent-light" />
          <h2 id="action-unlock-title" className="flex-1 text-sm font-semibold text-pc-text">Unlock protected controls</h2>
          <button type="button" onClick={close} disabled={connecting} aria-label="Close" title="Close" className="flex h-8 w-8 items-center justify-center rounded-md text-pc-text-muted hover:bg-[var(--pc-hover)] hover:text-pc-text disabled:opacity-40">
            <X size={16} />
          </button>
        </div>
        <div className="space-y-3 px-5 py-5">
          <label htmlFor="action-token" className="block text-xs font-medium text-pc-text-secondary">Web chat token</label>
          <input
            ref={inputRef}
            id="action-token"
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            autoComplete="current-password"
            disabled={connecting}
            className="h-10 w-full rounded-md border border-pc-border bg-[var(--pc-bg-input)] px-3 text-sm text-pc-text outline-none focus:border-pc-accent disabled:opacity-60"
          />
          {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-pc-border px-5 py-4">
          <button type="button" onClick={close} disabled={connecting} className="h-9 rounded-md px-3 text-sm text-pc-text-secondary hover:bg-[var(--pc-hover)] disabled:opacity-40">Cancel</button>
          <button type="submit" disabled={connecting || token.trim().length === 0} className="flex h-9 items-center gap-2 rounded-md bg-pc-accent px-4 text-sm font-medium text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40">
            {connecting && <Loader2 size={14} className="animate-spin" />}
            Unlock
          </button>
        </div>
      </form>
    </div>
  );
}
