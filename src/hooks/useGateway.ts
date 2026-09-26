import { useState, useEffect, useRef, useCallback } from 'react';
import { KinGatewayClient, AuthError, type JsonPayload } from '../lib/kinGateway';
import { genIdempotencyKey } from '../lib/utils';
import { getStoredCredentials, storeCredentials, clearCredentials } from '../lib/hermesCredentials';
import { getCachedMessages, setCachedMessages, mergeWithCache } from '../lib/messageCache';
import { extractAgentIdFromKey } from '../lib/sessionName';
import { extractText, extractThinking, type ChatPayloadMessage } from '../lib/messageExtract';
import { parseHistoryMessages } from '../lib/historyParser';
import { isSameMessageHistory, mergeHistoryWithOptimistic } from '../lib/messageHistory';
import { appendBackgroundOutcome } from '../lib/backgroundOutcome';
import { readPendingMessages, writePendingMessages } from '../lib/pendingMessages';
import type { ChatMessage, MessageBlock, ConnectionStatus, Session, AgentIdentity, OutgoingAttachment } from '../types';

export function useGateway() {
  const clientRef = useRef<KinGatewayClient | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSession, setActiveSession] = useState(import.meta.env.VITE_AGENT_SESSION || 'agent:main:main');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isSessionsLoaded, setIsSessionsLoaded] = useState(false);
  const firstSessionsLoadRef = useRef(true);
  const [agents, setAgents] = useState<string[]>([]);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null); // null = checking
  const [connectError, setConnectError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const isConnectingRef = useRef(false);
  const messagesRef = useRef(messages);
  const activeSessionRef = useRef(activeSession);

  const sessionsRef = useRef(sessions);

  // Sync refs in an effect to avoid ref writes during render
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { activeSessionRef.current = activeSession; }, [activeSession]);
  useEffect(() => { sessionsRef.current = sessions; }, [sessions]);
  const currentRunIdRef = useRef<string | null>(null);
  const [activeSessions, setActiveSessions] = useState<Set<string>>(new Set());
  const [unreadSessions, setUnreadSessions] = useState<Map<string, number>>(new Map());
  const [agentIdentity, setAgentIdentity] = useState<AgentIdentity | null>(null);
  /** Map of runId → generation duration (ms), preserved across loadHistory reloads */
  const generationTimesRef = useRef<Map<string, number>>(new Map());

  const handleAgentEvent = useCallback((payload: JsonPayload) => {
    if (payload?.stream !== 'tool') return;
    const data = (payload.data ?? {}) as Record<string, unknown>;
    const phase = data.phase as string | undefined;
    const toolCallId = data.toolCallId as string | undefined;
    const name = (data.name as string) || 'tool';
    if (!toolCallId) return;

    setMessages(prev => {
      const last = prev[prev.length - 1];
      if (!last || last.role !== 'assistant' || !last.isStreaming) return prev;

      const updated = { ...last, blocks: [...last.blocks] };

      if (phase === 'start') {
        updated.blocks.push({
          type: 'tool_use' as const,
          name,
          input: (data.args as Record<string, unknown>) ?? {},
          id: toolCallId,
        });
      } else if (phase === 'result') {
        const rawResult = data.result;
        const result = typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult, null, 2);
        updated.blocks.push({
          type: 'tool_result' as const,
          content: result?.slice(0, 500) || '',
          toolUseId: toolCallId,
          name,
        });
      }

      return [...prev.slice(0, -1), updated];
    });
  }, []);

  // Deleted sessions blacklist (persisted in localStorage)
  const getDeletedSessions = useCallback((): Set<string> => {
    try {
      const raw = localStorage.getItem('pinchchat-deleted-sessions');
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch { return new Set(); }
  }, []);

  const addDeletedSession = useCallback((key: string) => {
    const deleted = getDeletedSessions();
    deleted.add(key);
    localStorage.setItem('pinchchat-deleted-sessions', JSON.stringify([...deleted]));
  }, [getDeletedSessions]);

  const loadAgentIdentity = useCallback(async () => {
    try {
      const res = await clientRef.current?.send('agent.identity.get', { sessionKey: activeSessionRef.current });
      if (res) {
        setAgentIdentity({
          name: res.name as string | undefined,
          emoji: res.emoji as string | undefined,
          avatar: res.avatar as string | undefined,
          agentId: res.agentId as string | undefined,
          isAdmin: res.isAdmin as boolean | undefined,
        });
      }
    } catch {
      // Silently ignore — identity is optional
    }
  }, []);

  /**
   * Lazy-fetch a single subagent's full transcript. Admin-only on the
   * server. Returns [] on any error (auth failure, parser refusal, etc).
   */
  const loadSubagentMessages = useCallback(async (sessionKey: string, subId: string) => {
    try {
      const res = await clientRef.current?.send('subagents.history', { sessionKey, subId });
      const list = (res?.messages as Array<Record<string, unknown>> | undefined) ?? [];
      return list.map(m => ({
        id: String(m.id ?? ''),
        role: (m.role as 'user' | 'assistant') ?? 'assistant',
        content: (m.content as Array<{ type: 'text'; text: string }>) ?? [],
        timestamp: (m.timestamp as number) ?? 0,
      }));
    } catch {
      return [];
    }
  }, []);

  /**
   * Lazy-fetch the subagent list for a parent session. Admin-only on the
   * server; non-admin members get an empty array even if they call.
   * No caching here — the Sidebar caches per-session in component state.
   */
  const loadSubagentsForSession = useCallback(async (sessionKey: string) => {
    try {
      const res = await clientRef.current?.send('subagents.list', { sessionKey });
      const list = (res?.subagents as Array<Record<string, unknown>> | undefined) ?? [];
      return list.map(s => ({
        id: String(s.id ?? ''),
        parentSessionKey: sessionKey,
        agentType: (s.agentType as string | null) ?? null,
        description: (s.description as string | null) ?? null,
        startedAt: (s.startedAt as number | null) ?? null,
        lastActive: (s.lastActive as number | null) ?? null,
        messageCount: (s.messageCount as number) ?? 0,
        preview: (s.preview as string | null) ?? null,
      }));
    } catch {
      return [];
    }
  }, []);

  const loadAgents = useCallback(async () => {
    try {
      const res = await clientRef.current?.send('agents.list', {});
      const agentList = res?.agents as Array<Record<string, unknown>> | undefined;
      if (agentList) {
        const ids = agentList.map(a => (a.id || a.agentId) as string).filter(Boolean).sort();
        setAgents(ids);
      }
    } catch (err) {
      console.warn('[loadAgents] agents.list not supported, agent picker will be unavailable', err);
    }
  }, []);

  const logoutRef = useRef<(() => void) | null>(null);
  // Forward ref so loadSessions (defined before loadHistory) can call loadHistory.
  const loadHistoryRef = useRef<((key: string) => Promise<void>) | null>(null);

  const loadSessions = useCallback(async () => {
    try {
      const res = await clientRef.current?.send('sessions.list', {});
      const sessionList = res?.sessions as Array<Record<string, unknown>> | undefined;
      if (sessionList) {
        const agentPrefix = import.meta.env.VITE_AGENT_PREFIX;
        const filteredSessionList = agentPrefix
          ? sessionList.filter((s) => ((s.key || s.sessionKey) as string).startsWith(agentPrefix))
          : sessionList;
        const deleted = getDeletedSessions();
        // Reconcile: remove blacklisted keys for sessions that no longer exist on the gateway
        // (they were successfully deleted, so no need to keep hiding them)
        const activeKeys = new Set(filteredSessionList.map((s) => (s.key || s.sessionKey) as string));
        const reconciled = new Set([...deleted].filter((k) => activeKeys.has(k)));
        if (reconciled.size !== deleted.size) {
          localStorage.setItem('pinchchat-deleted-sessions', JSON.stringify([...reconciled]));
        }
        const mapped = filteredSessionList.filter((s) => !deleted.has((s.key || s.sessionKey) as string)).map((s) => ({
          key: (s.key || s.sessionKey) as string,
          label: (s.label || s.key || s.sessionKey) as string,
          topicName: s.topicName as string | undefined,
          archived: s.archived === true,
          messageCount: s.messageCount as number | undefined,
          totalTokens: s.totalTokens as number | undefined,
          contextTokens: s.contextTokens as number | undefined,
          inputTokens: s.inputTokens as number | undefined,
          outputTokens: s.outputTokens as number | undefined,
          channel: (s.lastChannel || s.channel) as string | undefined,
          kind: s.kind as string | undefined,
          model: s.model as string | undefined,
          workspaceId: s.workspaceId as string | undefined,
          agentId: s.agentId as string | undefined,
          updatedAt: s.updatedAt as number | undefined,
          lastMessagePreview: s.lastMessagePreview as string | undefined,
        }));
        setSessions(mapped);

        // Stage 3: on first successful load, auto-open the most recent real session
        // if we're still on the placeholder. loadHistory is called via ref set below.
        if (firstSessionsLoadRef.current && mapped.length > 0) {
          firstSessionsLoadRef.current = false;
          const placeholder = import.meta.env.VITE_AGENT_SESSION || 'agent:main:main';
          if (activeSessionRef.current === placeholder) {
            // List is recent-first from server; tiebreak by updatedAt desc
            const sorted = [...mapped].sort((a, b) =>
              ((b.updatedAt ?? 0) as number) - ((a.updatedAt ?? 0) as number),
            );
            const mostRecent = sorted[0];
            if (mostRecent && mostRecent.key !== placeholder) {
              activeSessionRef.current = mostRecent.key;
              setActiveSession(mostRecent.key);
              loadHistoryRef.current?.(mostRecent.key);
            }
          }
        }
      }
    } catch (err) {
      if (err instanceof AuthError) {
        // Definitive auth failure — surface an error and log out.
        console.error('[loadSessions] auth error, logging out:', err.message);
        setConnectError('Session expired — please log in again');
        logoutRef.current?.();
        return;
      }
      // Silently ignore other failures (e.g. disconnected, network hiccup)
    } finally {
      setIsSessionsLoaded(true);
    }
  }, [getDeletedSessions]);

  const loadHistory = useCallback(async (sessionKey: string, options: { background?: boolean } = {}) => {
    const background = options.background === true;
    if (!background) setIsLoadingHistory(true);
    try {
      const res = await clientRef.current?.send('chat.history', { sessionKey, limit: 100 });
      const rawMsgs = res?.messages as Array<Record<string, unknown>> | undefined;
      if (rawMsgs) {
        const merged = parseHistoryMessages(rawMsgs as Array<Record<string, any>>); // eslint-disable-line @typescript-eslint/no-explicit-any
        // Apply stored generation time to the last assistant message if available
        const genKey = sessionKey + ':latest';
        const genTime = generationTimesRef.current.get(genKey);
        if (genTime) {
          generationTimesRef.current.delete(genKey);
          for (let i = merged.length - 1; i >= 0; i--) {
            if (merged[i].role === 'assistant') {
              merged[i] = { ...merged[i], generationTimeMs: genTime };
              break;
            }
          }
        }
        // Merge with cached messages to preserve pre-compaction history
        const cached = await getCachedMessages(sessionKey);
        const { messages: finalMessages, wasCompacted } = mergeWithCache(merged, cached);

        if (wasCompacted) {
          // Store the full merged set so future loads keep the archive
          setCachedMessages(sessionKey, finalMessages.filter(m => !m.isCompactionSeparator));
        } else {
          // No compaction — update cache with latest gateway messages
          setCachedMessages(sessionKey, merged);
        }

        if (activeSessionRef.current !== sessionKey) return;
        setMessages(current => {
          const saved = readPendingMessages(clientRef.current?.memberId ?? '', sessionKey);
          const pending = [...current, ...saved.filter(m => !current.some(item => item.id === m.id))];
          const reconciled = mergeHistoryWithOptimistic(pending, finalMessages);
          writePendingMessages(clientRef.current?.memberId ?? '', sessionKey, reconciled);
          return background && isSameMessageHistory(current, reconciled) ? current : reconciled;
        });
      }
    } catch {
      // Silently ignore history load failures
    } finally {
      if (!background) setIsLoadingHistory(false);
    }
  }, []);

  // Wire the forward ref after loadHistory is defined.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadHistoryRef.current = loadHistory; }, [loadHistory]);

  // setupClient no longer takes an `agent` param — agent is derived from
  // /api/identity after connect(). The `_legacyAgent` param is accepted but
  // ignored so callers from stored credentials (which still carry agent) don't
  // need to be updated in one pass.
  const setupClient = useCallback(async (bridgeUrl: string, _legacyAgent: string, token?: string | null) => {
    // Tear down existing client
    if (clientRef.current) {
      clientRef.current.disconnect();
    }

    const client = new KinGatewayClient(bridgeUrl, token);
    clientRef.current = client;

    client.onStatus((s) => {
      setStatus(s);
      if (s === 'connected') {
        const resolvedAgent = client.memberId;
        const selected = localStorage.getItem(`kin-selected-session:${resolvedAgent}`);
        if (selected) {
          activeSessionRef.current = selected;
          setActiveSession(selected);
        }
        setIsGenerating(false);
        setAuthenticated(true);
        setConnectError(null);
        setIsConnecting(false);
        isConnectingRef.current = false;
        storeCredentials(bridgeUrl, resolvedAgent, token ?? null);
        loadSessions();
        loadAgents();
        loadAgentIdentity();
        loadHistory(activeSessionRef.current);
      } else if (s === 'disconnected' && !client.isConnected) {
        if (isConnectingRef.current) {
          setConnectError('Connection failed — check bridge URL');
          setIsConnecting(false);
          isConnectingRef.current = false;
          setAuthenticated(false);
        }
      }
    });

    client.onEvent((event, payload) => {
      if (event === 'background_message') {
        const session = payload.sessionKey;
        if (session === activeSessionRef.current) {
          setMessages(prev => appendBackgroundOutcome(prev, payload));
        } else if (typeof session === 'string') {
          setUnreadSessions(prev => { const next = new Map(prev); next.set(session, (prev.get(session) ?? 0) + 1); return next; });
        }
        return;
      }
      if (event === 'agent') {
        handleAgentEvent(payload);
        return;
      }
      if (event !== 'chat') return;

      const state = payload.state as string | undefined;
      const runId = payload.runId as string;
      const message = payload.message as ChatPayloadMessage | undefined;
      const errorMessage = payload.errorMessage as string | undefined;
      const evtSession = payload.sessionKey as string | undefined;

      if (evtSession) {
        if (state === 'accepted' || state === 'delta') {
          setActiveSessions(prev => {
            if (prev.has(evtSession)) return prev;
            const next = new Set(prev);
            next.add(evtSession);
            return next;
          });
        } else if (state === 'final' || state === 'error' || state === 'aborted') {
          setActiveSessions(prev => {
            if (!prev.has(evtSession)) return prev;
            const next = new Set(prev);
            next.delete(evtSession);
            return next;
          });
        }
      }

      if (evtSession !== activeSessionRef.current) {
        // Mark non-active sessions as unread when they receive a final message
        if (state === 'final' && evtSession) {
          setUnreadSessions(prev => {
            const next = new Map(prev);
            next.set(evtSession, (prev.get(evtSession) || 0) + 1);
            return next;
          });
        }
        return;
      }

      if (state === 'accepted') {
        currentRunIdRef.current = runId;
        setIsGenerating(true);
        setMessages(prev => {
          const index = prev.map((item) => item.role === 'user' && item.sendStatus === 'sending').lastIndexOf(true);
          if (index < 0) return prev;
          const next = [...prev];
          next[index] = { ...next[index], sendStatus: 'sent', sendError: undefined };
          writePendingMessages(client.memberId, evtSession ?? activeSessionRef.current, next);
          return next;
        });
      } else if (state === 'delta') {
        const text = extractText(message);
        const thinking = extractThinking(message);
        currentRunIdRef.current = runId;

        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last && last.role === 'assistant' && last.isStreaming && last.runId === runId) {
            const updated = { ...last };
            updated.content = text;
            // Preserve tool blocks, rebuild text + thinking blocks from latest delta
            const toolBlocks = updated.blocks.filter(b => b.type === 'tool_use' || b.type === 'tool_result');
            const newBlocks: MessageBlock[] = [];
            if (thinking) newBlocks.push({ type: 'thinking' as const, text: thinking });
            newBlocks.push(...toolBlocks);
            newBlocks.push({ type: 'text' as const, text });
            updated.blocks = newBlocks;
            return [...prev.slice(0, -1), updated];
          }
          const blocks: MessageBlock[] = [];
          if (thinking) blocks.push({ type: 'thinking' as const, text: thinking });
          blocks.push({ type: 'text' as const, text });
          const msg: ChatMessage = {
            id: runId + '-' + Date.now(),
            role: 'assistant',
            content: text,
            timestamp: Date.now(),
            blocks,
            isStreaming: true,
            runId,
            streamStartedAt: Date.now(),
          };
          return [...prev, msg];
        });
      } else if (state === 'final') {
        // Compute generation time from the streaming message before history reload replaces it
        const lastMsg = messagesRef.current[messagesRef.current.length - 1];
        if (lastMsg?.role === 'assistant' && lastMsg.streamStartedAt) {
          generationTimesRef.current.set(activeSessionRef.current + ':latest', Date.now() - lastMsg.streamStartedAt);
        }
        currentRunIdRef.current = null;
        setIsGenerating(false);
        loadHistory(activeSessionRef.current, { background: true });
      } else if (state === 'error') {
        currentRunIdRef.current = null;
        setIsGenerating(false);
        setMessages(prev => {
          const pendingIndex = prev.map((item) => item.role === 'user' && item.sendStatus === 'sending').lastIndexOf(true);
          const withFailure = pendingIndex < 0 ? prev : prev.map((item, index) => (
            index === pendingIndex ? { ...item, sendStatus: 'error' as const, sendError: errorMessage || 'Request failed' } : item
          ));
          writePendingMessages(client.memberId, evtSession ?? '', withFailure);
          const last = withFailure[withFailure.length - 1];
          if (last && last.role === 'assistant' && last.isStreaming && last.runId === runId) {
            return [...withFailure.slice(0, -1), { ...last, isStreaming: false }];
          }
          return [...withFailure, {
            id: 'error-' + Date.now(),
            role: 'assistant' as const,
            content: `Error: ${errorMessage || 'unknown error'}`,
            timestamp: Date.now(),
            blocks: [{ type: 'text' as const, text: `Error: ${errorMessage || 'unknown error'}` }],
          }];
        });
      } else if (state === 'aborted') {
        currentRunIdRef.current = null;
        setIsGenerating(false);
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last && last.role === 'assistant' && last.isStreaming) {
            return [...prev.slice(0, -1), { ...last, isStreaming: false }];
          }
          return prev;
        });
      }
    });

    setIsConnecting(true);
    isConnectingRef.current = true;
    setConnectError(null);
    client.connect().catch((err) => {
      if (err instanceof AuthError) {
        setConnectError('Invalid token — please check and try again');
        setIsConnecting(false);
        isConnectingRef.current = false;
        setAuthenticated(false);
      }
      // Network errors set status disconnected via onStatus; no extra handling needed.
    });
  }, [handleAgentEvent, loadHistory, loadSessions, loadAgents, loadAgentIdentity]);

  // On mount: try stored credentials
  const initRef = useRef(false);
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    const stored = getStoredCredentials();
    if (stored) {
      setupClient(stored.bridgeUrl, stored.agent, stored.token ?? null);
    } else {
      setAuthenticated(false);
    }
  }, [setupClient]);

  const sendMessage = useCallback(async (text: string, attachments?: OutgoingAttachment[]) => {
    const sessionKey = activeSessionRef.current;
    const member = clientRef.current?.memberId ?? '';
    const msgId = 'user-' + Date.now();
    const imageBlocks: MessageBlock[] = (attachments ?? [])
      .filter(a => a.mimeType.startsWith('image/') && a.previewBase64)
      .map(a => ({ type: 'image' as const, mediaType: a.mimeType, data: a.previewBase64 }));
    const fileLines = (attachments ?? [])
      .filter(a => !a.mimeType.startsWith('image/'))
      .map(a => `[File: ${a.fileName}]`);
    const displayText = fileLines.length > 0 ? `${text}\n\n${fileLines.join('\n')}` : text;
    const userMsg: ChatMessage = {
      id: msgId,
      role: 'user',
      content: displayText,
      timestamp: Date.now(),
      blocks: [...imageBlocks, { type: 'text', text: displayText }],
      sendStatus: 'sending',
    };
    setMessages(prev => {
      const next = [...prev.filter(m => !(m.sendStatus === 'error' && m.content === displayText)), userMsg];
      writePendingMessages(member, sessionKey, next);
      return next;
    });
    setIsGenerating(true);

    try {
      if (!clientRef.current) throw new Error('Not connected');
      await clientRef.current.send('chat.send', {
        sessionKey,
        message: text,
        deliver: false,
        idempotencyKey: genIdempotencyKey(),
        ...(attachments && attachments.length > 0 ? { attachments } : {}),
      });
    } catch (cause) {
      // Mark as error and stop generating
      setMessages(prev => {
        const next = prev.map(m => m.id === msgId ? { ...m, sendStatus: 'error' as const, sendError: cause instanceof Error ? cause.message : 'Could not send message' } : m);
        writePendingMessages(member, sessionKey, next);
        return next;
      });
      setIsGenerating(false);
    }
  }, []);

  const abort = useCallback(async () => {
    try {
      await clientRef.current?.send('chat.abort', { sessionKey: activeSessionRef.current });
    } catch {
      // Ignore abort failures
    }
    setIsGenerating(false);
  }, []);

  const switchSession = useCallback((key: string) => {
    localStorage.setItem(`kin-selected-session:${clientRef.current?.memberId ?? ''}`, key);
    setActiveSession(key);
    activeSessionRef.current = key;
    setMessages([]);
    setUnreadSessions(prev => {
      if (!prev.has(key)) return prev;
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
    loadHistory(key);
  }, [loadHistory]);

  const createSessionWithConfig = useCallback(async (agentId: string, channel: string) => {
    const client = clientRef.current;
    if (!client) return;

    const fallbackKey = `agent:${agentId}:webchat-${Date.now()}`;
    let nextKey = fallbackKey;

    try {
      const res = await client.send('sessions.create', { channel, agentId }) as JsonPayload | undefined;
      const fromRoot = (typeof res?.key === 'string' && res.key)
        || (typeof res?.sessionKey === 'string' && res.sessionKey)
        || null;
      const nestedSession = (res?.session && typeof res.session === 'object') ? res.session as Record<string, unknown> : null;
      const fromNested = (nestedSession && typeof nestedSession.key === 'string' && nestedSession.key)
        || (nestedSession && typeof nestedSession.sessionKey === 'string' && nestedSession.sessionKey)
        || null;

      const returnedKey = (fromRoot || fromNested) as string | null;
      if (returnedKey && returnedKey.length <= 200) {
        nextKey = returnedKey;
      }
    } catch (err) {
      console.warn('[createSession] sessions.create not supported, using fallback key', err);
    }

    switchSession(nextKey);
    try {
      await loadSessions();
    } catch (err) {
      console.warn('[createSession] failed to refresh session list', err);
    }
  }, [switchSession, loadSessions]);

  const createNewSession = useCallback(async () => {
    const currentKey = activeSessionRef.current;
    const currentSession = sessionsRef.current.find((s) => s.key === currentKey);
    const targetAgentId = currentSession?.agentId || extractAgentIdFromKey(currentKey) || 'main';
    const targetChannel = currentSession?.channel || 'webchat';
    await createSessionWithConfig(targetAgentId, targetChannel);
  }, [createSessionWithConfig]);

  const createSessionForAgent = useCallback(async (agentId: string) => {
    const currentKey = activeSessionRef.current;
    const currentSession = sessionsRef.current.find((s) => s.key === currentKey);
    const targetChannel = currentSession?.channel || 'webchat';
    await createSessionWithConfig(agentId, targetChannel);
  }, [createSessionWithConfig]);

  const login = useCallback((bridgeUrl: string, token?: string | null) => {
    setupClient(bridgeUrl, '', token);
  }, [setupClient]);

  const deleteSession = useCallback(async (key: string) => {
    try {
      await clientRef.current?.send('sessions.delete', { key, deleteTranscript: true });
    } catch {
      // If the gateway rejects the delete, don't blacklist — the session still exists
      // and hiding it would make it permanently invisible until localStorage is cleared.
      return;
    }
    // Only blacklist and hide if the delete actually succeeded
    addDeletedSession(key);
    // Remove from local state
    setSessions(prev => prev.filter(s => s.key !== key));
    // If we deleted the active session, switch to main
    if (activeSessionRef.current === key) {
      const mainKey = 'agent:main:main';
      setActiveSession(mainKey);
      activeSessionRef.current = mainKey;
      setMessages([]);
      loadHistory(mainKey);
    }
  }, [loadHistory, addDeletedSession]);

  const logout = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.disconnect();
      clientRef.current = null;
    }
    clearCredentials();
    firstSessionsLoadRef.current = true; // reset for next login
    setAuthenticated(false);
    setMessages([]);
    setSessions([]);
    setStatus('disconnected');
    setConnectError(null);
  }, []);

  // Wire logout ref so loadSessions can call it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { logoutRef.current = logout; }, [logout]);

  // Periodic refresh: sessions list every 8s, active session messages every
  // 5s. Catches messages arriving from OTHER channels (Telegram, voice) that
  // the in-tab SSE never sees because the chat-send SSE only streams the
  // outbound request's own response. Refresh frequency picked so a turn from
  // Telegram lands in kinchat within seconds without hammering the LAN. Skip
  // the message refresh while generation is in flight to avoid clobbering
  // streaming deltas.
  useEffect(() => {
    if (status !== 'connected') return;
    const sessionsTimer = setInterval(loadSessions, 8000);
    const outcomesTimer = setInterval(() => { void clientRef.current?.pollBackgroundOutcomes(); }, 3000);
    const messagesTimer = setInterval(() => {
      const key = activeSessionRef.current;
      if (!key) return;
      if (isGenerating) return;
      loadHistory(key, { background: true });
    }, 5000);
    return () => {
      clearInterval(sessionsTimer);
      clearInterval(outcomesTimer);
      clearInterval(messagesTimer);
    };
  }, [status, loadSessions, loadHistory, isGenerating]);

  useEffect(() => {
    if (status !== 'connected') return;
    const download = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest('a') : null;
      if (!anchor) return;
      const url = new URL(anchor.href, window.location.href);
      const id = url.origin === window.location.origin ? url.pathname.match(/^\/gm-artifacts\/([0-9a-f-]{36})$/i)?.[1] : undefined;
      if (!id) return;
      event.preventDefault();
      const client = clientRef.current;
      void client?.downloadArtifact(id).catch(error => {
        if (client !== clientRef.current || !client.isConnected) return;
        const content = error instanceof Error ? error.message : 'Document download failed.';
        setMessages(prev => {
          const active = prev.findIndex(message => message.isStreaming);
          const index = active < 0 ? prev.length : active;
          const message: ChatMessage = { id: `download-error-${genIdempotencyKey()}`, role: 'assistant',
            content, timestamp: Date.now(), blocks: [{ type: 'text', text: content }] };
          return [...prev.slice(0, index), message, ...prev.slice(index)];
        });
      });
    };
    document.addEventListener('click', download);
    return () => document.removeEventListener('click', download);
  }, [status]);

  const enrichedSessions = sessions.map(s => ({
    ...s,
    isActive: activeSessions.has(s.key),
    hasUnread: unreadSessions.has(s.key),
    unreadCount: unreadSessions.get(s.key) || 0,
  }));

  const getClient = useCallback(() => clientRef.current, []);

  const addEventListener = useCallback((fn: (event: string, payload: JsonPayload) => void) => {
    const client = clientRef.current;
    if (!client) return () => {};
    return client.onEvent(fn);
  }, []);

  const send = useCallback((method: string, params: JsonPayload): Promise<JsonPayload> => {
    const client = clientRef.current;
    if (!client) return Promise.reject(new Error('Not connected'));
    return client.send(method, params);
  }, []);

  return {
    status, messages, sessions: enrichedSessions, agents, activeSession, isGenerating, isLoadingHistory,
    isSessionsLoaded,
    sendMessage, abort, switchSession, createNewSession, createSessionForAgent, loadSessions, deleteSession,
    authenticated, login, logout, connectError, isConnecting, agentIdentity,
    getClient, addEventListener, send,
    loadSubagentsForSession, loadSubagentMessages,
  };
}
