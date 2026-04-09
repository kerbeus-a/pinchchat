import { useState, useCallback, useEffect, useRef } from 'react';
import type { GatewayClient, JsonPayload } from '../lib/gateway';
import type { ChatMessage, MessageBlock } from '../types';
import { parseHistoryMessages } from '../lib/historyParser';
import { extractText, extractThinking } from '../lib/messageExtract';
import type { ChatPayloadMessage } from '../lib/messageExtract';

/**
 * Hook to manage a secondary session for split view.
 * Loads history and listens for streaming events for a specific session.
 */
export function useSecondarySession(
  getClient: () => GatewayClient | null,
  addEventListener: (fn: (event: string, payload: JsonPayload) => void) => () => void,
  sessionKey: string | null,
) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const sessionKeyRef = useRef(sessionKey);
  const currentRunIdRef = useRef<string | null>(null);

  useEffect(() => { sessionKeyRef.current = sessionKey; }, [sessionKey]);

  const loadHistory = useCallback(async (key: string) => {
    setIsLoadingHistory(true);
    try {
      const res = await getClient()?.send('chat.history', { sessionKey: key, limit: 100 });
      const rawMsgs = res?.messages as Array<Record<string, unknown>> | undefined;
      if (!rawMsgs) return;
      const merged = parseHistoryMessages(rawMsgs as Array<Record<string, any>>); // eslint-disable-line @typescript-eslint/no-explicit-any
      setMessages(merged);
    } catch {
      // ignore
    } finally {
      setIsLoadingHistory(false);
    }
  }, [getClient]);

  // Load history when session changes
  useEffect(() => {
    if (!sessionKey) {
      setMessages([]);
      return;
    }
    loadHistory(sessionKey);
  }, [sessionKey, loadHistory]);

  // Handle streaming events for this secondary session
  const handleEvent = useCallback((event: string, payload: JsonPayload) => {
    if (!sessionKeyRef.current) return;
    const evtSession = payload.sessionKey as string | undefined;
    if (evtSession !== sessionKeyRef.current) return;

    if (event === 'agent') {
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
          updated.blocks.push({ type: 'tool_use' as const, name, input: (data.args as Record<string, unknown>) ?? {}, id: toolCallId });
        } else if (phase === 'result') {
          const rawResult = data.result;
          const result = typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult, null, 2);
          updated.blocks.push({ type: 'tool_result' as const, content: result?.slice(0, 500) || '', toolUseId: toolCallId, name });
        }
        return [...prev.slice(0, -1), updated];
      });
      return;
    }

    if (event !== 'chat') return;
    const state = payload.state as string | undefined;
    const runId = payload.runId as string;
    const message = payload.message as ChatPayloadMessage | undefined;
    const errorMessage = payload.errorMessage as string | undefined;

    if (state === 'delta') {
      const text = extractText(message);
      const thinking = extractThinking(message);
      currentRunIdRef.current = runId;
      setIsGenerating(true);
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last && last.role === 'assistant' && last.isStreaming && last.runId === runId) {
          const updated = { ...last };
          updated.content = text;
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
        return [...prev, { id: runId + '-' + Date.now(), role: 'assistant' as const, content: text, timestamp: Date.now(), blocks, isStreaming: true, runId }];
      });
    } else if (state === 'final') {
      currentRunIdRef.current = null;
      setIsGenerating(false);
      if (sessionKeyRef.current) loadHistory(sessionKeyRef.current);
    } else if (state === 'error') {
      currentRunIdRef.current = null;
      setIsGenerating(false);
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last && last.role === 'assistant' && last.isStreaming && last.runId === runId) {
          return [...prev.slice(0, -1), { ...last, isStreaming: false }];
        }
        return [...prev, { id: 'error-' + Date.now(), role: 'assistant' as const, content: `Error: ${errorMessage || 'unknown error'}`, timestamp: Date.now(), blocks: [{ type: 'text' as const, text: `Error: ${errorMessage || 'unknown error'}` }] }];
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
  }, [loadHistory]);

  // Register event listener for streaming updates
  useEffect(() => {
    if (!sessionKey) return;
    const unsub = addEventListener(handleEvent);
    return unsub;
  }, [sessionKey, addEventListener, handleEvent]);

  const sendMessage = useCallback(async (text: string, attachments?: Array<{ mimeType: string; fileName: string; content: string }>) => {
    if (!sessionKeyRef.current) return;
    const msgId = 'user-' + Date.now();
    const userMsg: ChatMessage = {
      id: msgId,
      role: 'user',
      content: text,
      timestamp: Date.now(),
      blocks: [{ type: 'text', text }],
      sendStatus: 'sending',
    };
    setMessages(prev => [...prev, userMsg]);
    setIsGenerating(true);
    try {
      await getClient()?.send('chat.send', {
        sessionKey: sessionKeyRef.current,
        message: text,
        deliver: false,
        ...(attachments && attachments.length > 0 ? { attachments } : {}),
      });
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, sendStatus: 'sent' as const } : m));
    } catch {
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, sendStatus: 'error' as const } : m));
      setIsGenerating(false);
    }
  }, [getClient]);

  const abort = useCallback(async () => {
    if (!sessionKeyRef.current) return;
    try {
      await getClient()?.send('chat.abort', { sessionKey: sessionKeyRef.current });
    } catch { /* ignore */ }
    setIsGenerating(false);
  }, [getClient]);

  return { messages, isLoadingHistory, isGenerating, sendMessage, abort, handleEvent };
}
