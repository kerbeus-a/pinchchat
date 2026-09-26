/**
 * KinGatewayClient — REST+SSE gateway replacing WebSocket GatewayClient.
 * Same public interface so useGateway.ts works with minimal changes.
 */

export type JsonPayload = Record<string, unknown>;
export type GatewayStatus = 'disconnected' | 'connecting' | 'connected' | 'pairing';

import type { OutgoingAttachment } from '../types';
import { genIdempotencyKey } from './utils';

interface SessionRow {
  id?: unknown;
  title?: unknown;
  preview?: unknown;
  message_count?: unknown;
  model?: unknown;
  workspace_id?: unknown;
  last_active?: unknown;
  started_at?: unknown;
  active_context_tokens?: unknown;
  context_window?: unknown;
  total_input_tokens?: unknown;
  output_tokens?: unknown;
  channel?: unknown;
  topic_name?: unknown;
  archived?: unknown;
}

interface SubagentRow {
  id?: unknown;
  agentType?: unknown;
  description?: unknown;
  startedAt?: unknown;
  lastActive?: unknown;
  messageCount?: unknown;
  preview?: unknown;
}

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
  private outcomeCursor = 0;
  private pollingOutcomes = false;
  private outcomesAllowed = true;
  private connectionGeneration = 0;
  private downloads = new Set<AbortController>();

  private token: string | null;
  private gmToken: string | null = null;
  private gmTokenExpiresAt = 0;

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

  private async getGmToken(): Promise<string> {
    if (this.gmToken && Date.now() < this.gmTokenExpiresAt - 5_000) return this.gmToken;
    if (!this.agent) throw new AuthError('Missing member identity');

    const res = await fetch(`${this.bridgeUrl}/api/gm/auth/bootstrap?agent=${encodeURIComponent(this.agent)}`, {
      method: 'POST',
      headers: this.authHeaders(),
    });
    if (res.status === 401 || res.status === 403) throw new AuthError(`gm bootstrap: ${res.status}`);
    if (!res.ok) throw new Error(`gm bootstrap: HTTP ${res.status}`);
    const data = await res.json() as { token?: string; expires_at?: number };
    if (!data.token || typeof data.expires_at !== 'number') throw new Error('gm bootstrap returned invalid token');
    this.gmToken = data.token;
    this.gmTokenExpiresAt = data.expires_at;
    return data.token;
  }

  private async gmFetch(path: string, init: RequestInit = {}): Promise<JsonPayload> {
    const gmToken = await this.getGmToken();
    const sep = path.includes('?') ? '&' : '?';
    const res = await fetch(`${this.bridgeUrl}${path}${sep}agent=${encodeURIComponent(this.agent)}`, {
      ...init,
      headers: {
        ...(init.headers as Record<string, string> | undefined),
        Authorization: `Bearer ${gmToken}`,
      },
    });
    if (res.status === 401 || res.status === 403) {
      this.gmToken = null;
      this.gmTokenExpiresAt = 0;
      throw new AuthError(`gm route: ${res.status}`);
    }
    if (!res.ok) throw new Error(`gm route: HTTP ${res.status}`);
    const contentType = res.headers.get('Content-Type') ?? '';
    if (!contentType.includes('application/json')) return {};
    return await res.json() as JsonPayload;
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
    this.connectionGeneration++;
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
    this.connectionGeneration++;
    for (const download of this.downloads) download.abort();
    this.downloads.clear();
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.connected = false;
    this._onStatus('disconnected');
  }

  async pollBackgroundOutcomes(): Promise<void> {
    if (!this.connected || this.pollingOutcomes || !this.outcomesAllowed) return;
    this.pollingOutcomes = true;
    try {
      const res = await fetch(`${this.bridgeUrl}/api/gm/outcomes?after=${this.outcomeCursor}`, { headers: this.authHeaders() });
      if (res.status === 403) { this.outcomesAllowed = false; return; }
      if (!res.ok) return;
      const data = await res.json() as { outcomes?: unknown };
      if (!this.connected || !Array.isArray(data.outcomes)) return;
      for (const raw of data.outcomes) {
        if (!raw || typeof raw !== 'object') continue;
        const row = raw as JsonPayload;
        const id = typeof row.id === 'string' ? Number(row.id) : NaN;
        if (!Number.isSafeInteger(id) || id <= this.outcomeCursor || typeof row.sessionKey !== 'string'
          || typeof row.content !== 'string') continue;
        this.emit('background_message', row);
        this.outcomeCursor = id;
      }
    } catch { /* A disconnected poll retries with the same durable cursor. */ }
    finally { this.pollingOutcomes = false; }
  }

  async downloadArtifact(id: string): Promise<void> {
    if (!/^[0-9a-f-]{36}$/i.test(id) || !this.connected) throw new Error('Document is unavailable.');
    const controller = new AbortController();
    const generation = this.connectionGeneration;
    this.downloads.add(controller);
    const assertConnected = () => {
      if (!this.connected || generation !== this.connectionGeneration || controller.signal.aborted) throw new Error('Document download cancelled.');
    };
    try {
      const res = await fetch(`${this.bridgeUrl}/api/gm/artifacts/${id}`, { headers: this.authHeaders(), signal: controller.signal });
      assertConnected();
      if (!res.ok) throw new Error('Document is unavailable or access was revoked.');
      const file = await res.blob();
      assertConnected();
      const filename = res.headers.get('Content-Disposition')?.match(/filename="([0-9a-f-]+\.(?:md|patch))"/i)?.[1] ?? `${id}.md`;
      const url = URL.createObjectURL(file);
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = filename;
      document.body.append(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } finally {
      this.downloads.delete(controller);
    }
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
        const data = await res.json() as { sessions?: SessionRow[] };
        // Map to PinchChat session format
        const sessions = (data.sessions || []).map((s) => ({
          key: String(s.id ?? ''),
          sessionKey: String(s.id ?? ''),
          label: String(s.title || s.preview || 'Untitled'),
          topicName: typeof s.topic_name === 'string' ? s.topic_name : undefined,
          archived: s.archived === true,
          messageCount: typeof s.message_count === 'number' ? s.message_count : undefined,
          model: typeof s.model === 'string' ? s.model : undefined,
          workspaceId: typeof s.workspace_id === 'string' ? s.workspace_id : undefined,
          updatedAt: typeof s.last_active === 'number'
            ? s.last_active * 1000
            : typeof s.started_at === 'number'
              ? s.started_at * 1000
              : undefined,
          lastMessagePreview: typeof s.preview === 'string' ? s.preview : undefined,
          totalTokens: typeof s.active_context_tokens === 'number' ? s.active_context_tokens : undefined,
          contextTokens: typeof s.context_window === 'number' ? s.context_window : undefined,
          inputTokens: typeof s.total_input_tokens === 'number' ? s.total_input_tokens : undefined,
          outputTokens: typeof s.output_tokens === 'number' ? s.output_tokens : undefined,
          channel: typeof s.channel === 'string' ? s.channel : undefined,
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
        const data = await res.json() as { sessions?: SessionRow[] };
        const sessions = (data.sessions || []).map((s) => ({
          key: String(s.id ?? ''),
          sessionKey: String(s.id ?? ''),
          label: String(s.title || s.preview || 'Untitled'),
          topicName: typeof s.topic_name === 'string' ? s.topic_name : undefined,
          archived: s.archived === true,
          messageCount: typeof s.message_count === 'number' ? s.message_count : undefined,
          model: typeof s.model === 'string' ? s.model : undefined,
          workspaceId: typeof s.workspace_id === 'string' ? s.workspace_id : undefined,
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
        const res = await fetch(`${url}/api/sessions/${encodeURIComponent(sessionKey)}/messages?agent=${agent}`, { headers: this.authHeaders() });
        if (res.status === 401 || res.status === 403) throw new AuthError(`chat.history: ${res.status}`);
        const data = await res.json();
        return { messages: data.messages || [] };
      }

      case 'chat.send': {
        const sessionKey = params.sessionKey as string;
        const message = params.message as string;
        const attachments = Array.isArray(params.attachments)
          ? params.attachments.filter(isOutgoingAttachment)
          : undefined;
        const runId = 'run-' + genIdempotencyKey();

        // Abort any existing stream
        if (this.abortController) this.abortController.abort();
        this.abortController = new AbortController();

        // Fire off SSE request, emit events as they come
        this.streamChat(sessionKey, message, runId, this.abortController.signal, attachments);
        return { runId };
      }

      case 'sessions.create': {
        const res = await fetch(`${url}/api/sessions`, {
          method: 'POST',
          headers: this.authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ agent }),
        });
        if (!res.ok) throw new Error(`Could not create session: HTTP ${res.status}`);
        const data = await res.json();
        return { key: data.session_id || data.key, sessionKey: data.session_id || data.key };
      }

      case 'workspaces.list': {
        const res = await fetch(`${url}/api/workspaces`, { headers: this.authHeaders() });
        if (res.status === 401 || res.status === 403) throw new AuthError(`workspaces.list: ${res.status}`);
        if (!res.ok) throw new Error(`workspaces.list: HTTP ${res.status}`);
        return await res.json() as JsonPayload;
      }

      case 'workspaces.create': {
        const res = await fetch(`${url}/api/workspaces`, {
          method: 'POST',
          headers: this.authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ label: params.label, description: params.description }),
        });
        if (res.status === 401 || res.status === 403) throw new AuthError(`workspaces.create: ${res.status}`);
        if (!res.ok) throw new Error(`workspaces.create: HTTP ${res.status}`);
        return await res.json() as JsonPayload;
      }

      case 'workspaces.update': {
        const workspaceId = params.workspaceId as string;
        const res = await fetch(`${url}/api/workspaces/${encodeURIComponent(workspaceId)}`, {
          method: 'PATCH',
          headers: this.authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ label: params.label, description: params.description }),
        });
        if (res.status === 401 || res.status === 403) throw new AuthError(`workspaces.update: ${res.status}`);
        if (!res.ok) throw new Error(`workspaces.update: HTTP ${res.status}`);
        return await res.json() as JsonPayload;
      }

      case 'session.scope.get': {
        const sessionKey = params.sessionKey as string;
        const res = await fetch(`${url}/api/sessions/${encodeURIComponent(sessionKey)}/scope`, { headers: this.authHeaders() });
        if (res.status === 401 || res.status === 403) throw new AuthError(`session.scope.get: ${res.status}`);
        if (!res.ok) throw new Error(`session.scope.get: HTTP ${res.status}`);
        return await res.json() as JsonPayload;
      }

      case 'session.scope.set': {
        const sessionKey = params.sessionKey as string;
        const res = await fetch(`${url}/api/sessions/${encodeURIComponent(sessionKey)}/scope`, {
          method: 'PUT',
          headers: this.authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            workspace_id: params.workspaceId,
            mode: params.mode,
            source_ids: params.sourceIds,
            reset_context: params.resetContext === true,
          }),
        });
        if (res.status === 401 || res.status === 403) throw new AuthError(`session.scope.set: ${res.status}`);
        if (!res.ok) throw new Error(`session.scope.set: HTTP ${res.status}`);
        return await res.json() as JsonPayload;
      }

      case 'session.context.get': {
        const sessionKey = params.sessionKey as string;
        const res = await fetch(`${url}/api/sessions/${encodeURIComponent(sessionKey)}/context`, { headers: this.authHeaders() });
        if (res.status === 401 || res.status === 403) throw new AuthError(`session.context.get: ${res.status}`);
        if (!res.ok) throw new Error(`session.context.get: HTTP ${res.status}`);
        return await res.json() as JsonPayload;
      }

      case 'sources.list': {
        const workspaceId = params.workspaceId as string;
        const res = await fetch(`${url}/api/sources?workspace=${encodeURIComponent(workspaceId)}`, { headers: this.authHeaders() });
        if (res.status === 401 || res.status === 403) throw new AuthError(`sources.list: ${res.status}`);
        if (!res.ok) throw new Error(`sources.list: HTTP ${res.status}`);
        return await res.json() as JsonPayload;
      }

      case 'evidence.list': {
        const sessionKey = params.sessionKey as string;
        const workspaceId = params.workspaceId as string;
        const res = await fetch(
          `${url}/api/sessions/${encodeURIComponent(sessionKey)}/evidence?workspace=${encodeURIComponent(workspaceId)}`,
          { headers: this.authHeaders() },
        );
        if (res.status === 401 || res.status === 403) throw new AuthError(`evidence.list: ${res.status}`);
        if (!res.ok) throw new Error(`evidence.list: HTTP ${res.status}`);
        return await res.json() as JsonPayload;
      }

      case 'system.status': {
        const res = await fetch(`${url}/api/system/status?agent=${agent}`, { headers: this.authHeaders() });
        if (res.status === 401 || res.status === 403) throw new AuthError(`system.status: ${res.status}`);
        if (!res.ok) throw new Error(`system.status: HTTP ${res.status}`);
        return await res.json() as JsonPayload;
      }

      case 'processing.list':
      case 'processing.enqueue':
      case 'processing.control':
      case 'processing.preview':
      case 'processing.activity':
      case 'processing.upload': {
        const workspace = encodeURIComponent(String(params.workspaceId ?? ''));
        let path = `/api/processing/${workspace}`;
        let options: RequestInit = { headers: this.authHeaders(), signal: AbortSignal.timeout(30_000) };
        if (method === 'processing.list') {
          if (params.before != null) path += `?before=${encodeURIComponent(String(params.before))}`;
        } else if (method === 'processing.upload') {
          if (!(params.file instanceof File) || params.file.size < 1 || params.file.size > 50 * 1024 ** 2) throw new Error('Choose a PDF of up to 50 MiB.');
          path = `/api/intake/${workspace}?action=process_as_record&request_id=${encodeURIComponent(String(params.requestId))}&name=${encodeURIComponent(params.file.name)}`;
          options = { method: 'POST', headers: this.authHeaders({ 'Content-Type': 'application/pdf' }), body: params.file, signal: AbortSignal.timeout(125_000) };
        } else if (method === 'processing.preview' || method === 'processing.activity') {
          path += `/${encodeURIComponent(String(params.jobId))}/${method === 'processing.preview' ? 'preview' : 'activity'}`;
        } else {
          path += method === 'processing.enqueue' ? '/enqueue' : `/${encodeURIComponent(String(params.jobId))}/control`;
          options = { ...options, method: 'POST', headers: this.authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(method === 'processing.enqueue' ? { receiptId: params.receiptId } : { action: params.action, revision: params.revision }) };
        }
        const res = await fetch(`${url}${path}`, options);
        if (res.status === 401 || res.status === 403) throw new AuthError('Owner access is no longer available.');
        const result = await res.json() as JsonPayload;
        if (!res.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Document request failed.');
        return result;
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

      case 'agents.list': {
        if (!agent) return { agents: [] };
        return { agents: [{ id: agent, agentId: agent }] };
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
        const data = await res.json() as { subagents?: SubagentRow[] };
        const subagents = (data.subagents || []).map((s) => ({
          id: String(s.id ?? ''),
          parentSessionKey: sessionKey,
          agentType: typeof s.agentType === 'string' ? s.agentType : null,
          description: typeof s.description === 'string' ? s.description : null,
          startedAt: typeof s.startedAt === 'number' ? s.startedAt : null,
          lastActive: typeof s.lastActive === 'number' ? s.lastActive : null,
          messageCount: typeof s.messageCount === 'number' ? s.messageCount : 0,
          preview: typeof s.preview === 'string' ? s.preview : null,
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

      case 'gm.command': {
        const sourceSessionId = typeof params.sourceSessionId === 'string' && params.sourceSessionId.length > 0
          ? params.sourceSessionId
          : undefined;
        return await this.gmFetch('/api/gm/command', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            command: String(params.command ?? ''),
            acceptance_criteria: Array.isArray(params.acceptanceCriteria) ? params.acceptanceCriteria : [],
            ...(params.startTask === true ? { start_task: true } : {}),
            ...(typeof params.localReasoningEffort === 'string' ? { local_reasoning_effort: params.localReasoningEffort } : {}),
            ...(sourceSessionId ? { source_session_id: sourceSessionId } : {}),
          }),
        });
      }

      case 'gm.missions.list': {
        return await this.gmFetch('/api/gm/missions');
      }

      case 'gm.workers.list': {
        return await this.gmFetch('/api/gm/workers');
      }

      case 'gm.mission.detail': {
        const missionId = encodeURIComponent(String(params.missionId ?? ''));
        return await this.gmFetch(`/api/gm/missions/${missionId}`);
      }

      case 'gm.mission.events': {
        const missionId = encodeURIComponent(String(params.missionId ?? ''));
        return await this.gmFetch(`/api/gm/missions/${missionId}/events`);
      }

      case 'gm.mission.pause': {
        const missionId = encodeURIComponent(String(params.missionId ?? ''));
        return await this.gmFetch(`/api/gm/missions/${missionId}/pause`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: String(params.reason ?? '') }),
        });
      }

      case 'gm.mission.resume': {
        const missionId = encodeURIComponent(String(params.missionId ?? ''));
        return await this.gmFetch(`/api/gm/missions/${missionId}/resume`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: String(params.reason ?? '') }),
        });
      }

      case 'gm.mission.accept_completion': {
        const missionId = encodeURIComponent(String(params.missionId ?? ''));
        return await this.gmFetch(`/api/gm/missions/${missionId}/accept-completion`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: String(params.reason ?? '') }),
        });
      }

      case 'gm.mission.reopen': {
        const missionId = encodeURIComponent(String(params.missionId ?? ''));
        return await this.gmFetch(`/api/gm/missions/${missionId}/reopen`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: String(params.reason ?? '') }),
        });
      }

      case 'gm.mission.cancel': {
        const missionId = encodeURIComponent(String(params.missionId ?? ''));
        return await this.gmFetch(`/api/gm/missions/${missionId}/cancel`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: String(params.reason ?? '') }),
        });
      }

      case 'gm.task.create': {
        const missionId = encodeURIComponent(String(params.missionId ?? ''));
        const body: Record<string, unknown> = {
          title: String(params.title ?? ''),
          objective: String(params.objective ?? ''),
          acceptance_criteria: Array.isArray(params.acceptanceCriteria) ? params.acceptanceCriteria : [],
        };
        if (typeof params.role === 'string') body.role = params.role;
        if (typeof params.risk === 'string') body.risk = params.risk;
        if (typeof params.expectedArtifact === 'string') body.expected_artifact = params.expectedArtifact;
        if (typeof params.localReasoningEffort === 'string') body.local_reasoning_effort = params.localReasoningEffort;
        return await this.gmFetch(`/api/gm/missions/${missionId}/tasks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      }

      case 'gm.task.turns': {
        const taskId = encodeURIComponent(String(params.taskId ?? ''));
        return await this.gmFetch(`/api/gm/tasks/${taskId}/turns`);
      }

      case 'gm.task.contexts': {
        const taskId = encodeURIComponent(String(params.taskId ?? ''));
        return await this.gmFetch(`/api/gm/tasks/${taskId}/contexts`);
      }

      case 'gm.task.message': {
        const taskId = encodeURIComponent(String(params.taskId ?? ''));
        return await this.gmFetch(`/api/gm/tasks/${taskId}/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: String(params.message ?? '') }),
        });
      }

      case 'gm.task.retry': {
        const taskId = encodeURIComponent(String(params.taskId ?? ''));
        return await this.gmFetch(`/api/gm/tasks/${taskId}/retry`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: String(params.reason ?? '') }),
        });
      }

      case 'gm.task.cancel': {
        const taskId = encodeURIComponent(String(params.taskId ?? ''));
        return await this.gmFetch(`/api/gm/tasks/${taskId}/cancel`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: String(params.reason ?? '') }),
        });
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

  private async streamChat(
    sessionKey: string,
    message: string,
    runId: string,
    signal: AbortSignal,
    attachments?: OutgoingAttachment[],
  ) {
    try {
      const hasAttachments = !!attachments?.length;
      const body = hasAttachments
        ? this.buildChatFormData(sessionKey, message, attachments)
        : JSON.stringify({ agent: this.agent, session_id: sessionKey, request_id: runId, message, stream: true });
      if (body instanceof FormData) body.set('request_id', runId);
      const res = await fetch(`${this.bridgeUrl}/api/chat`, {
        method: 'POST',
        headers: hasAttachments
          ? this.authHeaders()
          : this.authHeaders({ 'Content-Type': 'application/json' }),
        body,
        signal,
      });

      if (!res.ok || !res.body) {
        let errorMessage = `HTTP ${res.status}`;
        try {
          const error = await res.json() as JsonPayload;
          if (res.status === 409 && ['local_only_session', 'private_attachment_required'].includes(String(error.code))
            && typeof error.error === 'string') errorMessage = error.error.slice(0, 500);
        } catch { /* Keep the status when the server did not return a known safe error. */ }
        this.emit('chat', { state: 'error', errorMessage, runId, sessionKey });
        return;
      }

      this.emit('chat', { state: 'accepted', runId, sessionKey });

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

          let evt: Record<string, unknown>;
          try {
            const parsed = JSON.parse(jsonStr) as unknown;
            if (!parsed || typeof parsed !== 'object') continue;
            evt = parsed as Record<string, unknown>;
          } catch { continue; }

          if (evt.type === 'delta') {
            this.emit('chat', {
              state: 'delta',
              message: { content: [{ type: 'text', text: String(evt.content || '') }] },
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
            this.emit('chat', { state: 'final', runId, sessionKey });
          } else if (evt.type === 'error') {
            this.emit('chat', { state: 'error', errorMessage: String(evt.message || ''), runId, sessionKey });
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        this.emit('chat', { state: 'aborted', runId, sessionKey });
      } else {
        this.emit('chat', { state: 'error', errorMessage: String(err), runId, sessionKey });
      }
    }
  }

  get isConnected() { return this.connected; }

  /** The member id resolved from /api/identity. Available after connect(). */
  get memberId() { return this.agent; }

  private buildChatFormData(sessionKey: string, message: string, attachments: OutgoingAttachment[]): FormData {
    const form = new FormData();
    form.set('agent', this.agent);
    form.set('session_id', sessionKey);
    form.set('message', message);
    form.set('stream', 'true');
    for (const attachment of attachments) {
      form.append('files', attachment.file, attachment.fileName);
    }
    return form;
  }
}

function isOutgoingAttachment(value: unknown): value is OutgoingAttachment {
  if (!value || typeof value !== 'object') return false;
  const attachment = value as Partial<OutgoingAttachment>;
  return attachment.file instanceof File
    && typeof attachment.fileName === 'string'
    && typeof attachment.mimeType === 'string';
}
