/**
 * useSwarm — React hook that drives a swarm SSE stream.
 *
 * Returns state and a `start` function. Automatically cleans up on unmount.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { streamSwarm, type SwarmMode, type SwarmProgressEvent } from '../lib/swarmClient';

export type { SwarmMode };

export type CellStatus = 'queued' | 'running' | 'done' | 'failed';

export interface CellState {
  model: string;
  expert?: string;
  status: CellStatus;
  elapsedMs?: number;
  answer?: string;
  error?: string;
}

export interface ExpertConsensus {
  expert: string;
  consensusLen: number;
}

export type SwarmRunStatus = 'idle' | 'running' | 'done' | 'error';

export interface SwarmState {
  status: SwarmRunStatus;
  cells: CellState[];
  expertConsensuses: ExpertConsensus[];
  tier2Done: boolean;
  synthDone: boolean;
  result: unknown | null;
  error: string | null;
  totalElapsedMs: number | null;
}

const INITIAL_STATE: SwarmState = {
  status: 'idle',
  cells: [],
  expertConsensuses: [],
  tier2Done: false,
  synthDone: false,
  result: null,
  error: null,
  totalElapsedMs: null,
};

function cellKey(model: string, expert?: string): string {
  return expert ? `${model}::${expert}` : model;
}

export function useSwarm() {
  const [state, setState] = useState<SwarmState>(INITIAL_STATE);
  const cancelRef = useRef<(() => void) | null>(null);

  // Cancel on unmount
  useEffect(() => {
    return () => { cancelRef.current?.(); };
  }, []);

  const start = useCallback((mode: SwarmMode, task: string) => {
    // Cancel any in-flight run
    cancelRef.current?.();

    setState({ ...INITIAL_STATE, status: 'running' });

    const cancel = streamSwarm(
      mode,
      task,
      (event: SwarmProgressEvent) => {
        setState((prev) => {
          const cells = [...prev.cells];
          const expertConsensuses = [...prev.expertConsensuses];

          switch (event.type) {
            case 'cell_queued': {
              const key = cellKey(event.model, event.expert);
              if (!cells.find((c) => cellKey(c.model, c.expert) === key)) {
                cells.push({ model: event.model, expert: event.expert, status: 'queued' });
              }
              break;
            }
            case 'cell_running': {
              const key = cellKey(event.model, event.expert);
              const idx = cells.findIndex((c) => cellKey(c.model, c.expert) === key);
              if (idx >= 0) {
                cells[idx] = { ...cells[idx]!, status: 'running' };
              } else {
                cells.push({ model: event.model, expert: event.expert, status: 'running' });
              }
              break;
            }
            case 'cell_done': {
              const key = cellKey(event.model, event.expert);
              const idx = cells.findIndex((c) => cellKey(c.model, c.expert) === key);
              const updated: CellState = { model: event.model, expert: event.expert, status: 'done', elapsedMs: event.elapsedMs, answer: event.answer };
              if (idx >= 0) { cells[idx] = updated; } else { cells.push(updated); }
              break;
            }
            case 'cell_failed': {
              const key = cellKey(event.model, event.expert);
              const idx = cells.findIndex((c) => cellKey(c.model, c.expert) === key);
              const updated: CellState = { model: event.model, expert: event.expert, status: 'failed', elapsedMs: event.elapsedMs, error: event.error };
              if (idx >= 0) { cells[idx] = updated; } else { cells.push(updated); }
              break;
            }
            case 'tier1_done': {
              const exists = expertConsensuses.find((e) => e.expert === event.expert);
              if (!exists) {
                expertConsensuses.push({ expert: event.expert, consensusLen: event.consensusLen });
              }
              break;
            }
            case 'tier2_done':
              return { ...prev, cells, expertConsensuses, tier2Done: true };
            case 'synth_done':
              return { ...prev, cells, expertConsensuses, synthDone: true };
            case 'run_complete':
              return { ...prev, cells, expertConsensuses, status: 'done', totalElapsedMs: event.totalElapsedMs };
          }

          return { ...prev, cells, expertConsensuses };
        });
      },
      (result) => {
        setState((prev) => ({ ...prev, result, status: 'done' }));
      },
      (error) => {
        setState((prev) => ({ ...prev, error, status: 'error' }));
      },
    );

    cancelRef.current = cancel;
  }, []);

  const stop = useCallback(() => {
    cancelRef.current?.();
    setState((prev) => ({ ...prev, status: 'idle' }));
  }, []);

  return { state, start, stop };
}
