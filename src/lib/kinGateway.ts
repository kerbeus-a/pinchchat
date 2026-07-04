/**
 * KinGatewayClient — REST+SSE gateway replacing WebSocket GatewayClient.
 * Same public interface so useGateway.ts works with minimal changes.
 */

export type JsonPayload = Record<string, unknown>;
export type GatewayStatus = 'disconnected' | 'connecting' | 'connected' | 'pairing';

/** Thrown by connect() when the bearer token is rejected by the server. */
export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export class KinGatewayClient {
  private bridgeUrl: string;
  private agent: string;
  private eventHandlers: Array<(event: string, payload: JsonPayload) => void> = [];
  private _onStatus: (s: GatewayStatus) => void = () => {};
  private abortController: AbortController | null = null;
  private connected = false;

  private token: string | null;

  constructor(bridgeUrl: string, token?: string | null) {
    this.bridgeUrl = bridgeUrl.replace(/\/$/, '');
    // agent will be set after connect() resolves identity
    this.agent = '';
    this.token = token ?? null;
  }


  private authHeaders(extra: Record<string, string> = {}): Record<string, string> {
    return this.token
      ? { ...extra, Authorization: `Bearer ${this.token}` }
      : extra;
  }

  onStatus(fn: (s: GatewayStatus) => void) {
    this._onStatus = fn;
  }

  onEvent(fn: (event: string, payload: JsonPayload) => void) {
    this.eventHandlers.push(fn);
    return () => { this.eventHandlers = this.eventHandlers.filter(h => h !== fn); };
  }

  /** Connect by calling /api/identity (Bearer only, no ?agent= param).
   *  Sets this.agent from the returned member_id.
   *  Throws AuthError on 401/403 so callers can surface an error + logout.
   *  Sets status disconnected on network errors (not AuthError — avoid logout loops). */
  async connect() {
    this._onStatus('connecting');
    try {
      const res = await fetch(`${this.bridgeUrl}/api/identity`, { headers: this.authHeaders() });
      if (res.status === 401 || res.status === 403) {
        this._onStatus('disconnected');
        throw new AuthError('Invalid or expired token');
      }
      if (!res.ok) {
        this._onStatus('disconnected');
        return;
      }
      const data = await res.json() as { member_id?: string };
      if (!data.member_id) {
        // Old server without member_id — fall back gracefully
        this._onStatus('disconnected');
        return;
      }
      this.agent = data.member_id;
      this.connected = true;
      this._onStatus('connected');
    } catch (err) {
      if (err instanceof AuthError) throw err;
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
        const res = await fetch(`${url}/api/sessions?agent=${agent}&limit=50`, { headers: this.authHeaders() });
        if (res.status === 401 || res.status === 403) throw new AuthError(`sessions.list: ${res.status}`);
        const data = await res.json();
        // Map to PinchChat session format
        const sessions = (data.sessions || []).map((s: any) => ({
          key: s.id,
          sessionKey: s.id,
          label: s.title || s.preview || 'Untitled',
          messageCount: s.message_count,
          model: s.model,
          updatedAt: s.last_active ? s.last_active * 1000 : s.started_at ? s.started_at * 1000 : undefined,
          lastMessagePreview: s.preview,
          totalTokens: s.active_context_tokens,
          contextTokens: s.context_window,
          inputTokens: s.total_input_tokens,
          outputTokens: s.output_tokens,
        }));
        return { sessions };
      }

      case 'sessions.searchNL': {
        // Natural-language session recall. User types a free-text question;
        // local Qwen picks the best matches from the member's last 50 sessions.
        // Falls back to keyword token matching server-side when the LLM is
        // unavailable. Returns the same PinchChat session shape as sessions.list.
        const q = String(params.q ?? '').slice(0, 500);
        if (q.length < 3) return { sessions: [] };
        const res = await fetch(
          `${url}/api/sessions/search?agent=${agent}&q=${encodeURIComponent(q)}`,
          { headers: this.authHeaders() },
        );
        if (!res.ok) return { sessions: [] };
        const data = await res.json();
        const sessions = (data.sessions || []).map((s: any) => ({
          key: s.id,
          sessionKey: s.id,
          label: s.title || s.preview || 'Untitled',
          messageCount: s.message_count,
          model: s.model,
          updatedAt: s.last_active ? s.last_active * 1000 : s.started_at ? s.started_at * 1000 : undefined,
          lastMessagePreview: s.preview,
        }));
        return { sessions };
      }

      case 'chat.history': {
        const sessionKey = params.sessionKey as string;
        const res = await fetch(`${url}/api/sessions/${encodeURIComponent(sessionKey)}/messages?agent=${agent}`, { headers: this.authHeaders() });
        if (res.status === 401 || res.status === 403) throw new AuthError(`chat.history: ${res.status}`);
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
          headers: this.authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ agent }),
        });
        const data = await res.json();
        return { key: data.session_id || data.key, sessionKey: data.session_id || data.key };
      }

      case 'sessions.delete': {
        const key = params.key as string;
        await fetch(`${url}/api/sessions/${encodeURIComponent(key)}?agent=${agent}`, { method: 'DELETE', headers: this.authHeaders() });
        return {};
      }

      case 'agent.identity.get': {
        // No ?agent= param — the server derives member from the token.
        const res = await fetch(`${url}/api/identity`, { headers: this.authHeaders() });
        const data = await res.json();
        // Server returns is_admin (snake_case); normalise to camelCase here so
        // consumers don't accidentally read `data.is_admin` (would be undefined
        // after a future server tweak). The flag is a UI hint only — the
        // server re-checks admin on every privileged endpoint hit.
        if (data && typeof data.is_admin === 'boolean') {
          data.isAdmin = data.is_admin;
        }
        return data;
      }

      // Admin-only — non-admin members get 403 from the server. We still call
      // it the same way; the gateway client doesn't gate based on identity
      // (the UI does, based on AgentIdentity.isAdmin).
      case 'subagents.list': {
        const sessionKey = params.sessionKey as string;
        const res = await fetch(
          `${url}/api/sessions/${encodeURIComponent(sessionKey)}/subagents?agent=${agent}`,
          { headers: this.authHeaders() },
        );
        if (!res.ok) return { subagents: [] };
        const data = await res.json();
        const subagents = (data.subagents || []).map((s: any) => ({
          id: s.id,
          parentSessionKey: sessionKey,
          agentType: s.agentType ?? null,
          description: s.description ?? null,
          startedAt: s.startedAt ?? null,
          lastActive: s.lastActive ?? null,
          messageCount: s.messageCount ?? 0,
          preview: s.preview ?? null,
        }));
        return { subagents };
      }

      case 'subagents.history': {
        const sessionKey = params.sessionKey as string;
        const subId = params.subId as string;
        const res = await fetch(
          `${url}/api/sessions/${encodeURIComponent(sessionKey)}/subagents/${encodeURIComponent(subId)}/messages?agent=${agent}`,
          { headers: this.authHeaders() },
        );
        if (!res.ok) return { messages: [] };
        const data = await res.json();
        return { messages: data.messages || [] };
      }

      case 'chat.abort': {
        if (this.abortController) {
          this.abortController.abort();
          this.abortController = null;
        }
        return {};
      }

      default:
        console.warn('[KinGW] Unknown method:', method);
        return {};
    }
  }

  private async streamChat(sessionKey: string, message: string, runId: string, signal: AbortSignal) {
    try {
      const res = await fetch(`${this.bridgeUrl}/api/chat`, {
        method: 'POST',
        headers: this.authHeaders({ 'Content-Type': 'application/json' }),
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

          let evt: any;
          try { evt = JSON.parse(jsonStr); } catch { continue; }

          if (evt.type === 'delta') {
            this.emit('chat', {
              state: 'delta',
              message: { content: [{ type: 'text', text: evt.content || '' }] },
              runId,
              sessionKey,
            });
          } else if (evt.type === 'tool_use') {
            this.emit('agent', {
              stream: 'tool',
              data: { phase: 'start', name: evt.name, args: evt.input || {}, toolCallId: evt.toolCallId || '' },
            });
          } else if (evt.type === 'tool_result') {
            this.emit('agent', {
              stream: 'tool',
              data: { phase: 'result', result: evt.content || '', toolCallId: evt.toolCallId || '' },
            });
          } else if (evt.type === 'final') {
            this.emit('chat', { state: 'final', sessionKey });
          } else if (evt.type === 'error') {
            this.emit('chat', { state: 'error', errorMessage: evt.message, sessionKey });
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        this.emit('chat', { state: 'aborted', sessionKey });
      } else {
        this.emit('chat', { state: 'error', errorMessage: String(err), sessionKey });
      }
    }
  }

  get isConnected() { return this.connected; }

  /** The member id resolved from /api/identity. Available after connect(). */
  get memberId() { return this.agent; }
}
