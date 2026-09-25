export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  blocks: MessageBlock[];
  isStreaming?: boolean;
  runId?: string;
  isSystemEvent?: boolean;
  metadata?: Record<string, unknown>;
  /** Optimistic send status for user messages */
  sendStatus?: 'sending' | 'sent' | 'error';
  /** Timestamp (ms) when streaming started for this message */
  streamStartedAt?: number;
  /** Total generation time in milliseconds (set when streaming ends) */
  generationTimeMs?: number;
  /** True if this message was restored from local cache (pre-compaction) */
  isArchived?: boolean;
  /** True if this is a visual separator showing where compaction occurred */
  isCompactionSeparator?: boolean;
}

export type MessageBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; text: string }
  | { type: 'tool_use'; name: string; input: Record<string, unknown>; id?: string }
  | { type: 'tool_result'; content: string; toolUseId?: string; name?: string }
  | { type: 'image'; mediaType: string; data?: string; url?: string };

export interface OutgoingAttachment {
  file: File;
  fileName: string;
  mimeType: string;
  previewBase64?: string;
}

export interface Session {
  key: string;
  label?: string;
  messageCount?: number;
  isActive?: boolean;
  hasUnread?: boolean;
  unreadCount?: number;
  totalTokens?: number;
  contextTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  channel?: string;
  kind?: string;
  model?: string;
  agentId?: string;
  updatedAt?: number;
  lastMessagePreview?: string;
}

export interface AgentIdentity {
  name?: string;
  emoji?: string;
  avatar?: string;
  agentId?: string;
  /**
   * Whether the authenticated member has the admin flag (server-side
   * `members.is_admin === 1`). Surfaced purely as a UX hint — the server
   * still re-checks on every privileged endpoint hit. Hides admin-only UI
   * (e.g. subagent transcripts) for non-admin members.
   */
  isAdmin?: boolean;
}

/**
 * Per-subagent summary returned by `subagents.list`. These render as nested
 * rows under their parent session in the sidebar, admin-only.
 */
export interface SubagentSummary {
  id: string;
  parentSessionKey: string;
  agentType: string | null;
  description: string | null;
  startedAt: number | null;
  lastActive: number | null;
  messageCount: number;
  preview: string | null;
}

export interface ExecApproval {
  id: string;
  command: string;
  commandArgv: string[];
  cwd: string;
  agentId: string;
  sessionKey: string;
  expiresAtMs: number;
  resolvedPath?: string;
  commandPreview?: string;
}

export type ExecApprovalDecision = 'allow-once' | 'allow-always' | 'deny';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'pairing';

export interface GatewayState {
  status: ConnectionStatus;
  sessions: Session[];
  activeSession: string;
  messages: ChatMessage[];
  isGenerating: boolean;
}
