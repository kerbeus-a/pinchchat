/**
 * SwarmConfigPanel — admin-only runtime config form for swarm settings.
 *
 * Loads effective config via GET /api/swarm/config and saves changes via
 * POST /api/swarm/config. Shows validation errors returned by the server.
 *
 * Follows the same styling conventions as SwarmView.tsx.
 */

import { useState, useEffect, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types (mirror server-side shape)
// ---------------------------------------------------------------------------

interface PanelEntry {
  label: string;
  model: string;
  runner: string;
  timeoutMs?: number;
}

interface Expert {
  key: string;
  name: string;
  instruction: string;
}

interface SwarmConfigData {
  panel: PanelEntry[];
  experts: Expert[];
  synthModel: string;
  synthRunner: string;
  timeoutMs: number;
  maxConcurrency: number;
  maxInflight: number;
  legTools: boolean;
}

interface ConfigResponse {
  effective: SwarmConfigData;
  defaults: SwarmConfigData;
  hasOverride: boolean;
}

// ---------------------------------------------------------------------------
// Small field components
// ---------------------------------------------------------------------------

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-wider text-pc-text-faint font-semibold mb-1">
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder, disabled }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <input
      className="w-full rounded-lg border border-pc-border bg-[var(--pc-bg-base)] text-pc-text text-xs px-2 py-1 focus:outline-none focus:ring-1 focus:ring-pc-accent/50 placeholder:text-pc-text-faint disabled:opacity-50"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
    />
  );
}

function NumericInput({ value, onChange, min, max, disabled }: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  disabled?: boolean;
}) {
  return (
    <input
      type="number"
      className="w-24 rounded-lg border border-pc-border bg-[var(--pc-bg-base)] text-pc-text text-xs px-2 py-1 focus:outline-none focus:ring-1 focus:ring-pc-accent/50 disabled:opacity-50"
      value={value}
      min={min}
      max={max}
      onChange={(e) => onChange(Number(e.target.value))}
      disabled={disabled}
    />
  );
}

// ---------------------------------------------------------------------------
// Panel entries editor
// ---------------------------------------------------------------------------

function PanelEditor({ entries, onChange, disabled }: {
  entries: PanelEntry[];
  onChange: (v: PanelEntry[]) => void;
  disabled: boolean;
}) {
  function update(i: number, field: keyof PanelEntry, val: string | number | undefined) {
    const next = entries.map((e, idx) => idx === i ? { ...e, [field]: val } : e);
    onChange(next);
  }

  return (
    <div className="space-y-2">
      {entries.map((e, i) => (
        <div key={i} className="grid grid-cols-3 gap-2 items-center">
          <Input value={e.label} onChange={(v) => update(i, 'label', v)} placeholder="label" disabled={disabled} />
          <Input value={e.model} onChange={(v) => update(i, 'model', v)} placeholder="model (empty=default)" disabled={disabled} />
          <Input value={e.runner} onChange={(v) => update(i, 'runner', v)} placeholder="runner" disabled={disabled} />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Experts editor
// ---------------------------------------------------------------------------

function ExpertsEditor({ experts, onChange, disabled }: {
  experts: Expert[];
  onChange: (v: Expert[]) => void;
  disabled: boolean;
}) {
  function update(i: number, field: keyof Expert, val: string) {
    const next = experts.map((e, idx) => idx === i ? { ...e, [field]: val } : e);
    onChange(next);
  }

  return (
    <div className="space-y-3">
      {experts.map((e, i) => (
        <div key={i} className="rounded-lg border border-pc-border p-2 space-y-1.5">
          <div className="grid grid-cols-2 gap-2">
            <Input value={e.key} onChange={(v) => update(i, 'key', v)} placeholder="key (stable id)" disabled={disabled} />
            <Input value={e.name} onChange={(v) => update(i, 'name', v)} placeholder="display name" disabled={disabled} />
          </div>
          <textarea
            className="w-full rounded-lg border border-pc-border bg-[var(--pc-bg-base)] text-pc-text text-xs px-2 py-1 resize-none focus:outline-none focus:ring-1 focus:ring-pc-accent/50 placeholder:text-pc-text-faint disabled:opacity-50"
            rows={2}
            placeholder="instruction prepended to each cell prompt"
            value={e.instruction}
            onChange={(ev) => update(i, 'instruction', ev.target.value)}
            disabled={disabled}
          />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SwarmConfigPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);
  const [hasOverride, setHasOverride] = useState(false);

  // Form state — initialised from the effective config on load
  const [panel, setPanel] = useState<PanelEntry[]>([]);
  const [experts, setExperts] = useState<Expert[]>([]);
  const [synthModel, setSynthModel] = useState('');
  const [synthRunner, setSynthRunner] = useState('');
  const [timeoutMs, setTimeoutMs] = useState(120_000);
  const [maxConcurrency, setMaxConcurrency] = useState(8);
  const [maxInflight, setMaxInflight] = useState(3);
  const [legTools, setLegTools] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/swarm/config', { credentials: 'include' });
      if (!res.ok) {
        setError(`Failed to load config: HTTP ${res.status}`);
        return;
      }
      const data = await res.json() as ConfigResponse;
      const eff = data.effective;
      setPanel(eff.panel);
      setExperts(eff.experts);
      setSynthModel(eff.synthModel);
      setSynthRunner(eff.synthRunner);
      setTimeoutMs(eff.timeoutMs);
      setMaxConcurrency(eff.maxConcurrency);
      setMaxInflight(eff.maxInflight);
      setLegTools(eff.legTools);
      setHasOverride(data.hasOverride);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load config');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    setSaveOk(false);

    try {
      const payload = {
        panel,
        experts,
        synthModel,
        synthRunner,
        timeoutMs,
        maxConcurrency,
        maxInflight,
        legTools,
      };
      const res = await fetch('/api/swarm/config', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as Record<string, unknown>;
        setSaveError(typeof body['error'] === 'string' ? body['error'] : `HTTP ${res.status}`);
        return;
      }
      setHasOverride(true);
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [panel, experts, synthModel, synthRunner, timeoutMs, maxConcurrency, maxInflight, legTools]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-pc-text-muted text-xs">
        Loading swarm config...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <p className="text-xs text-red-500 dark:text-red-400">{error}</p>
        <button
          onClick={() => void load()}
          className="mt-2 px-3 py-1.5 rounded-xl text-xs border border-pc-border hover:bg-[var(--pc-hover)] text-pc-text-secondary"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void handleSave(e)} className="p-4 space-y-5 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-pc-text">
          Swarm Config
          {hasOverride && (
            <span className="ml-2 text-[10px] text-pc-accent bg-pc-accent/10 px-1.5 py-0.5 rounded-full">
              override active
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || saving}
          className="text-[10px] text-pc-text-muted hover:text-pc-text border border-pc-border rounded-lg px-2 py-0.5 disabled:opacity-50"
        >
          Reload
        </button>
      </div>

      {/* Panel models */}
      <div>
        <Label>Panel Models</Label>
        <div className="text-[10px] text-pc-text-faint mb-1.5">label / model / runner</div>
        <PanelEditor entries={panel} onChange={setPanel} disabled={saving} />
      </div>

      {/* Synthesizer */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Synthesizer Model</Label>
          <Input value={synthModel} onChange={setSynthModel} placeholder="e.g. fable, opus" disabled={saving} />
        </div>
        <div>
          <Label>Synthesizer Runner</Label>
          <Input value={synthRunner} onChange={setSynthRunner} placeholder="e.g. claude-cli" disabled={saving} />
        </div>
      </div>

      {/* Experts */}
      <div>
        <Label>Experts</Label>
        <ExpertsEditor experts={experts} onChange={setExperts} disabled={saving} />
      </div>

      {/* Numeric params */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label>Timeout (ms)</Label>
          <NumericInput value={timeoutMs} onChange={setTimeoutMs} min={5000} max={600000} disabled={saving} />
        </div>
        <div>
          <Label>Max Concurrency</Label>
          <NumericInput value={maxConcurrency} onChange={setMaxConcurrency} min={1} max={32} disabled={saving} />
        </div>
        <div>
          <Label>Max Inflight</Label>
          <NumericInput value={maxInflight} onChange={setMaxInflight} min={1} max={10} disabled={saving} />
        </div>
      </div>

      {/* Tools toggle */}
      <div className="flex items-start gap-3 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3">
        <input
          type="checkbox"
          id="swarm-leg-tools"
          checked={legTools}
          onChange={(e) => setLegTools(e.target.checked)}
          disabled={saving}
          className="mt-0.5 accent-amber-400"
        />
        <label htmlFor="swarm-leg-tools" className="text-xs text-pc-text cursor-pointer">
          <span className="font-medium text-amber-500 dark:text-amber-400">Leg Tools (DANGEROUS)</span>
          <span className="text-pc-text-muted ml-1">— gives panel legs full shell + exec access. Default: off.</span>
        </label>
      </div>

      {/* Save / error */}
      {saveError && (
        <p className="text-xs text-red-500 dark:text-red-400">{saveError}</p>
      )}
      {saveOk && (
        <p className="text-xs text-emerald-600 dark:text-emerald-400">Config saved.</p>
      )}
      <button
        type="submit"
        disabled={saving}
        className="w-full px-4 py-2 rounded-xl text-xs font-medium bg-pc-accent text-white hover:bg-pc-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {saving ? 'Saving…' : 'Save Config'}
      </button>
    </form>
  );
}
