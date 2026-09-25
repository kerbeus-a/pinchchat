/**
 * HermesGatewayClient — REST+SSE gateway replacing WebSocket GatewayClient.
 * Same public interface so useGateway.ts works with minimal changes.
 */

export type JsonPayload = Record<string, unknown>;
export type GatewayStatus = 'disconnected' | 'connecting' | 'connected' | 'pairing';

interface SessionRow {
  id?: unknown;
  title?: unknown;
  preview?: unknown;
  message_count?: unknown;
  model?: unknown;
  last_active?: unknown;
  started_at?: unknown;
}

export class HermesGatewayClient {
  private bridgeUrl: string;
  private agent: string;
  private eventHandlers: Array<(event: string, payload: JsonPayload) => void> = [];
  private _onStatus: (s: GatewayStatus) => void = () => {};
  private abortController: AbortController | null = null;
  private connected = false;

  constructor(bridgeUrl: string, agent: string) {
    this.bridgeUrl = bridgeUrl.replace(/\/$/, '');
    this.agent = agent;
  }

  onStatus(fn: (s: GatewayStatus) => void) {
    this._onStatus = fn;
  }

  onEvent(fn: (event: string, payload: JsonPayload) => void) {
    this.eventHandlers.push(fn);
    return () => { this.eventHandlers = this.eventHandlers.filter(h => h !== fn); };
  }

  async connect() {
    this._onStatus('connecting');
    try {
      const res = await fetch(`${this.bridgeUrl}/health`);
      if (res.ok) {
        this.connected = true;
        this._onStatus('connected');
      } else {
        this._onStatus('disconnected');
      }
    } catch {
      this._onStatus('disconnected');
    }
  }

  disconnect() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.connected = false;
    this._onStatus('disconnected');
  }

  private emit(event: string, payload: JsonPayload) {
    for (const h of this.eventHandlers) h(event, payload);
  }

  async send(method: string, params: JsonPayload): Promise<JsonPayload> {
    const url = this.bridgeUrl;
    const agent = this.agent;

    switch (method) {
      case 'sessions.list': {
        const res = await fetch(`${url}/api/sessions?agent=${agent}&limit=50`);
        const data = await res.json() as { sessions?: SessionRow[] };
        // Map to PinchChat session format
        const sessions = (data.sessions || []).map((s) => ({
          key: String(s.id ?? ''),
          sessionKey: String(s.id ?? ''),
          label: String(s.title || s.preview || 'Untitled'),
          messageCount: typeof s.message_count === 'number' ? s.message_count : undefined,
          model: typeof s.model === 'string' ? s.model : undefined,
          updatedAt: typeof s.last_active === 'number'
            ? s.last_active * 1000
            : typeof s.started_at === 'number'
              ? s.started_at * 1000
              : undefined,
          lastMessagePreview: typeof s.preview === 'string' ? s.preview : undefined,
        }));
        return { sessions };
      }

      case 'chat.history': {
        const sessionKey = params.sessionKey as string;
        const res = await fetch(`${url}/api/sessions/${encodeURIComponent(sessionKey)}/messages?agent=${agent}`);
        const data = await res.json();
        return { messages: data.messages || [] };
      }

      case 'chat.send': {
        const sessionKey = params.sessionKey as string;
        const message = params.message as string;
        const runId = 'run-' + Date.now();

        // Abort any existing stream
        if (this.abortController) this.abortController.abort();
        this.abortController = new AbortController();

        // Fire off SSE request, emit events as they come
        this.streamChat(sessionKey, message, runId, this.abortController.signal);
        return {};
      }

      case 'sessions.create': {
        const res = await fetch(`${url}/api/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agent }),
        });
        const data = await res.json();
        return { key: data.session_id || data.key, sessionKey: data.session_id || data.key };
      }

      case 'sessions.delete': {
        const key = params.key as string;
        await fetch(`${url}/api/sessions/${encodeURIComponent(key)}?agent=${agent}`, { method: 'DELETE' });
        return {};
      }

      case 'agent.identity.get': {
        const res = await fetch(`${url}/api/identity?agent=${agent}`);
        return await res.json();
      }

      case 'chat.abort': {
        if (this.abortController) {
          this.abortController.abort();
          this.abortController = null;
        }
        return {};
      }

      default:
        console.warn('[HermesGW] Unknown method:', method);
        return {};
    }
  }

  private async streamChat(sessionKey: string, message: string, runId: string, signal: AbortSignal) {
    try {
      const res = await fetch(`${this.bridgeUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent: this.agent, session_id: sessionKey, message, stream: true }),
        signal,
      });

      if (!res.ok || !res.body) {
        this.emit('chat', { state: 'error', errorMessage: `HTTP ${res.status}`, sessionKey });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulatedContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        while (buffer.includes('\n')) {
          const idx = buffer.indexOf('\n');
          const line = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 1);

          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6);
          if (jsonStr === '[DONE]') continue;

          let evt: Record<string, unknown>;
          try {
            const parsed = JSON.parse(jsonStr) as unknown;
            if (!parsed || typeof parsed !== 'object') continue;
            evt = parsed as Record<string, unknown>;
          } catch { continue; }

          if (evt.type === 'delta') {
            accumulatedContent += String(evt.content || '');
            this.emit('chat', {
              state: 'delta',
              message: { content: [{ type: 'text', text: accumulatedContent }] },
              runId,
              sessionKey,
            });
          } else if (evt.type === 'tool_use') {
            const input = evt.input && typeof evt.input === 'object'
              ? evt.input as JsonPayload
              : {};
            this.emit('agent', {
              stream: 'tool',
              data: {
                phase: 'start',
                name: String(evt.name || ''),
                args: input,
                toolCallId: String(evt.toolCallId || ''),
              },
            });
          } else if (evt.type === 'tool_result') {
            this.emit('agent', {
              stream: 'tool',
              data: { phase: 'result', result: String(evt.content || ''), toolCallId: String(evt.toolCallId || '') },
            });
          } else if (evt.type === 'final') {
            this.emit('chat', { state: 'final', sessionKey });
          } else if (evt.type === 'error') {
            this.emit('chat', { state: 'error', errorMessage: String(evt.message || ''), sessionKey });
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        this.emit('chat', { state: 'aborted', sessionKey });
      } else {
        this.emit('chat', { state: 'error', errorMessage: String(err), sessionKey });
      }
    }
  }

  get isConnected() { return this.connected; }
}
