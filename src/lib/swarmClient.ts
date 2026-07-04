/**
 * SwarmClient — thin fetch wrapper for the /api/swarm SSE endpoints.
 *
 * The swarm endpoints live on the same origin/port as the dashboard and
 * are gated by the `claw_session` cookie (set when you visit /?token=...).
 * No explicit auth header needed — the browser sends the cookie automatically.
 *
 * Usage:
 *   const stop = streamSwarm('flat', 'my task', onEvent, onDone, onError);
 *   // call stop() to abort early
 */

export type SwarmMode = 'flat' | 'panel';

export type SwarmProgressEvent =
  | { type: 'cell_queued';   model: string; expert?: string }
  | { type: 'cell_running';  model: string; expert?: string }
  | { type: 'cell_done';     model: string; expert?: string; elapsedMs: number; answer: string }
  | { type: 'cell_failed';   model: string; expert?: string; elapsedMs: number; error: string }
  | { type: 'tier1_done';    expert: string; consensusLen: number }
  | { type: 'tier2_done';    finalLen: number }
  | { type: 'synth_done';    synthesizedLen: number; diffNoteLen: number }
  | { type: 'run_complete';  totalElapsedMs: number };

/**
 * Stream swarm progress events from the backend.
 *
 * @param mode      'flat' or 'panel'
 * @param task      Task text to send
 * @param onEvent   Called for each progress event
 * @param onResult  Called with the final JSON result object (SwarmResult | SwarmPanelResult)
 * @param onError   Called on network or server error
 * @returns         A cancel function — call it to abort the stream
 */
export function streamSwarm(
  mode: SwarmMode,
  task: string,
  onEvent: (event: SwarmProgressEvent) => void,
  onResult: (result: unknown) => void,
  onError: (error: string) => void,
): () => void {
  const url = mode === 'panel' ? '/api/swarm/panel/run' : '/api/swarm/run';
  const abortController = new AbortController();

  (async () => {
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task }),
        signal: abortController.signal,
        credentials: 'include', // send claw_session cookie
      });
    } catch (err) {
      if (!abortController.signal.aborted) {
        onError(err instanceof Error ? err.message : String(err));
      }
      return;
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      onError(`HTTP ${response.status}: ${text}`);
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      onError('No response body');
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let currentEvent = 'message';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (currentEvent === 'error') {
              onError(data);
            } else if (currentEvent === 'result') {
              try {
                onResult(JSON.parse(data));
              } catch {
                // ignore parse errors on result
              }
            } else if (data === '[DONE]') {
              // stream complete — wait for result event
            } else {
              try {
                const event = JSON.parse(data) as SwarmProgressEvent;
                onEvent(event);
              } catch {
                // ignore parse errors on progress events
              }
            }
            // Reset event type after each data line
            currentEvent = 'message';
          } else if (line === '') {
            // blank line = SSE message separator, reset event type
            currentEvent = 'message';
          }
        }
      }
    } catch (err) {
      if (!abortController.signal.aborted) {
        onError(err instanceof Error ? err.message : String(err));
      }
    }
  })();

  return () => abortController.abort();
}
