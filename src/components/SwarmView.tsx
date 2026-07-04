/**
 * SwarmView — admin-only live swarm runner.
 *
 * Shows a form (task textarea + mode selector), then a grid of
 * per-cell status cards updated in real-time via SSE as the swarm runs.
 *
 * Auth: relies on the `claw_session` cookie already set by visiting /?token=...
 * The swarm endpoints at /api/swarm/* accept that cookie automatically.
 */

import { useState, useCallback } from 'react';
import { useSwarm, type CellState, type SwarmMode } from '../hooks/useSwarm';
import { SwarmConfigPanel } from './SwarmConfigPanel';

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: CellState['status'] }) {
  const base = 'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium';
  switch (status) {
    case 'queued':
      return <span className={`${base} bg-[var(--pc-hover)] text-pc-text-muted`}>queued</span>;
    case 'running':
      return <span className={`${base} bg-yellow-400/20 text-yellow-400 dark:text-yellow-300`}>running</span>;
    case 'done':
      return <span className={`${base} bg-emerald-400/20 text-emerald-600 dark:text-emerald-400`}>done</span>;
    case 'failed':
      return <span className={`${base} bg-red-400/20 text-red-600 dark:text-red-400`}>failed</span>;
  }
}

// ---------------------------------------------------------------------------
// Cell card
// ---------------------------------------------------------------------------

function CellCard({ cell }: { cell: CellState }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-pc-border bg-[var(--pc-bg-surface)] p-3 flex flex-col gap-2 min-w-0">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-semibold text-sm text-pc-text">{cell.model}</span>
        {cell.expert && (
          <span className="text-[11px] text-pc-text-muted bg-[var(--pc-hover)] px-1.5 py-0.5 rounded-full">{cell.expert}</span>
        )}
        <StatusBadge status={cell.status} />
        {cell.elapsedMs != null && (
          <span className="text-[10px] text-pc-text-faint ml-auto">{(cell.elapsedMs / 1000).toFixed(1)}s</span>
        )}
      </div>
      {cell.status === 'failed' && cell.error && (
        <p className="text-xs text-red-500 dark:text-red-400 truncate">{cell.error}</p>
      )}
      {cell.status === 'done' && cell.answer && (
        <div>
          <p className={`text-xs text-pc-text-secondary whitespace-pre-wrap break-words ${!expanded ? 'line-clamp-3' : ''}`}>
            {cell.answer}
          </p>
          {cell.answer.length > 200 && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="text-[10px] text-pc-accent mt-1 hover:underline"
            >
              {expanded ? 'collapse' : 'expand'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Result panel
// ---------------------------------------------------------------------------

function ResultPanel({ result }: { result: unknown }) {
  if (!result || typeof result !== 'object') return null;
  const r = result as Record<string, unknown>;

  // Flat swarm result
  if ('synthesized' in r) {
    return (
      <div className="rounded-xl border border-pc-border bg-[var(--pc-bg-surface)] p-4 mt-4 space-y-3">
        <h3 className="text-sm font-semibold text-pc-text">Synthesized Answer</h3>
        <p className="text-sm text-pc-text-secondary whitespace-pre-wrap break-words">{String(r['synthesized'])}</p>
        {r['diffNote'] != null && (
          <div>
            <h4 className="text-xs font-medium text-pc-text-muted mb-1">Differences</h4>
            <p className="text-xs text-pc-text-secondary whitespace-pre-wrap">{String(r['diffNote'])}</p>
          </div>
        )}
      </div>
    );
  }

  // Panel swarm result
  if ('finalAnswer' in r) {
    const experts = Array.isArray(r['experts']) ? r['experts'] : [];
    return (
      <div className="space-y-3 mt-4">
        <div className="rounded-xl border border-pc-border bg-[var(--pc-bg-surface)] p-4">
          <h3 className="text-sm font-semibold text-pc-text mb-2">Final Answer</h3>
          <p className="text-sm text-pc-text-secondary whitespace-pre-wrap break-words">{String(r['finalAnswer'])}</p>
        </div>
        {experts.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-pc-text-muted uppercase tracking-wide">Expert Consensuses</h3>
            {experts.map((e: unknown, i: number) => {
              const ex = e as Record<string, unknown>;
              return (
                <div key={i} className="rounded-xl border border-pc-border bg-[var(--pc-bg-surface)] p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-pc-text">{String(ex['name'] ?? ex['key'])}</span>
                    <span className="text-[10px] text-pc-text-faint">{String(ex['modelCount'] ?? '')} model(s)</span>
                  </div>
                  <p className="text-xs text-pc-text-secondary whitespace-pre-wrap break-words line-clamp-4">{String(ex['consensus'])}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SwarmView() {
  const [task, setTask] = useState('');
  const [mode, setMode] = useState<SwarmMode>('flat');
  const [tab, setTab] = useState<'run' | 'config'>('run');
  const { state, start, stop } = useSwarm();

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = task.trim();
    if (!trimmed) return;
    start(mode, trimmed);
  }, [task, mode, start]);

  const isRunning = state.status === 'running';

  // Group cells: flat has no expert, panel has expert
  const cellGroups = state.cells.length > 0
    ? (mode === 'flat'
        ? [{ label: null, cells: state.cells }]
        : (() => {
            const byExpert = new Map<string, CellState[]>();
            for (const cell of state.cells) {
              const key = cell.expert ?? '__none__';
              if (!byExpert.has(key)) byExpert.set(key, []);
              byExpert.get(key)!.push(cell);
            }
            return Array.from(byExpert.entries()).map(([label, cells]) => ({
              label: label === '__none__' ? null : label,
              cells,
            }));
          })()
      )
    : [];

  const doneCells = state.cells.filter((c) => c.status === 'done').length;
  const totalCells = state.cells.length;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[var(--pc-bg-base)]">
      {/* Header */}
      <div className="px-4 py-3 border-b border-pc-border bg-[var(--pc-bg-surface)]/90 backdrop-blur-xl flex items-center gap-3 shrink-0">
        <span className="font-semibold text-sm text-pc-text">Swarm Runner</span>
        {isRunning && totalCells > 0 && (
          <span className="text-xs text-pc-text-muted">{doneCells}/{totalCells} cells done</span>
        )}
        {state.totalElapsedMs != null && (
          <span className="text-xs text-pc-text-faint">{(state.totalElapsedMs / 1000).toFixed(1)}s total</span>
        )}
        {/* Tab switcher */}
        <div className="ml-auto flex items-center gap-1 text-xs border border-pc-border rounded-xl overflow-hidden">
          <button
            onClick={() => setTab('run')}
            className={`px-3 py-1 ${tab === 'run' ? 'bg-pc-accent text-white' : 'text-pc-text-secondary hover:bg-[var(--pc-hover)]'}`}
          >
            Run
          </button>
          <button
            onClick={() => setTab('config')}
            className={`px-3 py-1 ${tab === 'config' ? 'bg-pc-accent text-white' : 'text-pc-text-secondary hover:bg-[var(--pc-hover)]'}`}
          >
            Config
          </button>
        </div>
      </div>

      {/* Config tab */}
      {tab === 'config' && <div className="flex-1 overflow-y-auto"><SwarmConfigPanel /></div>}

      {/* Run tab */}
      {tab === 'run' && <>
      {/* Form */}
      <form onSubmit={handleSubmit} className="px-4 py-3 border-b border-pc-border bg-[var(--pc-bg-surface)] shrink-0 space-y-3">
        <textarea
          className="w-full rounded-xl border border-pc-border bg-[var(--pc-bg-base)] text-pc-text text-sm px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-pc-accent/50 placeholder:text-pc-text-faint"
          rows={3}
          placeholder="Enter task or question…"
          value={task}
          onChange={(e) => setTask(e.target.value)}
          disabled={isRunning}
        />
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 text-sm">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="swarm-mode"
                value="flat"
                checked={mode === 'flat'}
                onChange={() => setMode('flat')}
                disabled={isRunning}
                className="accent-pc-accent"
              />
              <span className="text-pc-text-secondary">Flat (5 models)</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="swarm-mode"
                value="panel"
                checked={mode === 'panel'}
                onChange={() => setMode('panel')}
                disabled={isRunning}
                className="accent-pc-accent"
              />
              <span className="text-pc-text-secondary">Panel (5×5 matrix)</span>
            </label>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            {isRunning && (
              <button
                type="button"
                onClick={stop}
                className="px-3 py-1.5 rounded-xl text-xs text-pc-text-muted border border-pc-border hover:bg-[var(--pc-hover)] transition-colors"
              >
                Stop
              </button>
            )}
            <button
              type="submit"
              disabled={isRunning || !task.trim()}
              className="px-4 py-1.5 rounded-xl text-xs font-medium bg-pc-accent text-white hover:bg-pc-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isRunning ? 'Running…' : 'Run'}
            </button>
          </div>
        </div>
        {state.error && (
          <p className="text-xs text-red-500 dark:text-red-400">{state.error}</p>
        )}
      </form>

      {/* Cell grid */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {cellGroups.map(({ label, cells }, gi) => (
          <div key={gi}>
            {label && (
              <h3 className="text-xs font-semibold text-pc-text-muted uppercase tracking-wide mb-2">
                Expert: {label}
              </h3>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {cells.map((cell, ci) => (
                <CellCard key={ci} cell={cell} />
              ))}
            </div>
          </div>
        ))}

        {/* Expert consensus indicators (panel mode) */}
        {state.expertConsensuses.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-pc-text-muted uppercase tracking-wide mb-2">Tier-1 Consensuses</h3>
            <div className="flex flex-wrap gap-2">
              {state.expertConsensuses.map((ec, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 text-xs bg-emerald-400/10 text-emerald-600 dark:text-emerald-400 border border-emerald-400/20 rounded-full px-2.5 py-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  {ec.expert} ({ec.consensusLen} chars)
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Tier-2 / Synth done indicators */}
        {(state.tier2Done || state.synthDone) && (
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
            <span className="text-xs text-pc-text-muted">
              {state.tier2Done ? 'Tier-2 integration complete' : 'Synthesis complete'}
            </span>
          </div>
        )}

        {/* Final result */}
        {state.result != null && <ResultPanel result={state.result} />}

        {/* Idle state */}
        {state.status === 'idle' && state.cells.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-pc-text-muted text-sm gap-2">
            <p>Enter a task above and click Run.</p>
            <p className="text-xs text-pc-text-faint">Admin session required (claw_session cookie).</p>
          </div>
        )}
      </div>
      </>}
    </div>
  );
}
