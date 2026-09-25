import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { X, Search, Pin, Trash2, Columns2, Clock, Bot, MessageSquare, Globe, Archive, ArrowUpCircle, Download, Pencil, Link, Plus, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import type { Session, SubagentSummary } from '../types';
import { useT } from '../hooks/useLocale';
import { SessionIcon } from './SessionIcon';
import { sessionDisplayName, extractAgentIdFromKey } from '../lib/sessionName';
import { relativeTime } from '../lib/relativeTime';
import { useUpdateCheck } from '../hooks/useUpdateCheck';
import { usePwaInstall } from '../hooks/usePwaInstall';
import {
  FILTER_KEY, AGENT_FILTER_KEY,
  MIN_WIDTH, MAX_WIDTH, WIDTH_KEY,
  getCustomNames, saveCustomNames,
  sessionCategory, getAvailableCategories, categoryLabel,
  getSavedWidth, getPinnedSessions, savePinnedSessions,
  getSavedOrder, saveOrder,
} from '../lib/sidebarStorage';
import { copyToClipboard } from '../lib/clipboard';
import { SessionRecall } from './SessionRecall';
import { SessionPreview } from './SessionPreview';

function VersionBadge() {
  const update = useUpdateCheck(__APP_VERSION__);
  if (update.available) {
    return (
      <span className="ml-1 inline-flex items-center gap-1.5 text-[9px]">
        <span className="text-pc-text-faint select-all">v{__APP_VERSION__}</span>
        <a
          href={update.releaseUrl || '#'}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/25 transition-colors"
          title={`Update available: v${update.latestVersion}`}
        >
          <ArrowUpCircle size={10} />
          <span>{update.latestVersion} available</span>
        </a>
      </span>
    );
  }
  return (
    <span className="ml-1 text-[9px] text-pc-text-faint select-all" title={`PinchChat v${__APP_VERSION__}`}>v{__APP_VERSION__}</span>
  );
}

function SidebarFooter() {
  const pwa = usePwaInstall();
  return (
    <div className="px-4 py-3 border-t border-pc-border flex items-center justify-center gap-3">
      {pwa.canInstall && (
        <button
          onClick={pwa.install}
          className="inline-flex items-center gap-1 text-[10px] text-pc-accent-light hover:text-[var(--pc-accent)] transition-colors"
          title="Install app"
          aria-label="Install app"
        >
          <Download size={11} />
          <span>Install</span>
        </button>
      )}
      <a
        href="https://github.com/MarlBurroW/pinchchat"
        target="_blank"
        rel="noopener noreferrer"
        className="text-pc-text-faint hover:text-pc-text-secondary transition-colors"
        title="GitHub"
        aria-label="GitHub repository"
      >
        <Globe size={11} />
      </a>
      <VersionBadge />
    </div>
  );
}

/**
 * Read-only nested list of subagent transcripts under a parent session.
 * Rendered only when the session is expanded by an admin. Per-row click
 * is wired to a no-op for now — the transcript-viewer panel is a follow-up.
 */
function SubagentList({ sessionKey, subagents, loading, onViewSubagent }: {
  sessionKey: string;
  subagents: SubagentSummary[] | undefined;
  loading: boolean;
  onViewSubagent?: (sub: SubagentSummary) => void;
}) {
  if (loading && !subagents) {
    return (
      <div className="ml-7 mt-1 mb-1 flex items-center gap-1.5 px-3 py-1.5 text-[10px] text-pc-text-muted">
        <Loader2 size={10} className="animate-spin" />
        <span>Loading subagents…</span>
      </div>
    );
  }
  if (!subagents || subagents.length === 0) {
    return (
      <div className="ml-7 mt-1 mb-1 px-3 py-1 text-[10px] text-pc-text-muted italic">
        No subagents
      </div>
    );
  }
  return (
    <div className="ml-7 mb-1 border-l border-pc-border/40 pl-2">
      {subagents.map(sub => {
        const ts = sub.lastActive ?? sub.startedAt;
        const tsLabel = ts ? new Date(ts).toLocaleString() : '';
        const title = sub.description ?? sub.id;
        const subtitle = [sub.agentType, sub.preview].filter(Boolean).join(' — ');
        const clickable = !!onViewSubagent;
        return (
          <button
            key={`${sessionKey}/${sub.id}`}
            type="button"
            onClick={clickable ? () => onViewSubagent!(sub) : undefined}
            disabled={!clickable}
            className={`group/sub w-full flex items-start gap-2 px-2 py-1.5 rounded-lg text-pc-text-muted text-[11px] text-left transition-colors ${
              clickable
                ? 'hover:bg-[var(--pc-hover)] cursor-pointer'
                : 'cursor-default'
            }`}
            title={`${title}\n${tsLabel}${clickable ? '\n\nClick to view transcript' : ''}`}
          >
            <Bot size={10} className="shrink-0 mt-0.5 text-pc-accent-light/50" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-pc-text-secondary">{title}</span>
                <span className="ml-auto shrink-0 text-[9px] text-pc-text-faint tabular-nums">
                  {sub.messageCount > 0 ? `${sub.messageCount} msg` : '0'}
                </span>
              </div>
              {subtitle && (
                <p className="truncate mt-0.5 leading-tight text-[10px] text-pc-text-faint">
                  {subtitle}
                </p>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

/** Icons for filter chips */
function FilterChipIcon({ cat, size = 12 }: { cat: string; size?: number }) {
  switch (cat) {
    case 'cron': return <Clock size={size} />;
    case 'agent': return <Bot size={size} />;
    case 'discord': return <MessageSquare size={size} />;
    case 'telegram': return <MessageSquare size={size} />;
    case 'direct': return <MessageSquare size={size} />;
    case 'telegram-group': return <MessageSquare size={size} />;
    case 'telegram-topic': return <MessageSquare size={size} />;
    default: return <Globe size={size} />;
  }
}

function normalizeStoredChannelFilter(value: string | null): string | null {
  if (!value) return null;
  if (value === 'active') return null;
  if (value === 'dm') return 'direct';
  if (value === 'group') return 'telegram-group';
  if (value.startsWith('group topic ') || value.startsWith('dm topic ')) return 'telegram-topic';
  if (value === 'webchat' || value === 'other') return 'web';
  return value;
}

export function NewSessionSplitButton({ onNewSession, onNewSessionForAgent, agents }: {
  onNewSession: () => Promise<void>;
  onNewSessionForAgent: (agentId: string) => Promise<void>;
  agents: string[];
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const showDropdown = agents.length >= 2;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative flex items-center" ref={wrapperRef}>
      <button
        onClick={() => { void onNewSession(); }}
        className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-pc-text-secondary hover:text-pc-text hover:bg-[var(--pc-hover)] border border-pc-border bg-pc-elevated/30 transition-colors ${showDropdown ? 'rounded-l-xl border-r-0' : 'rounded-xl'}`}
        title={t('sidebar.newSession')}
        aria-label={t('sidebar.newSession')}
      >
        <Plus size={13} />
        <span>New</span>
      </button>
      {showDropdown && (
        <button
          onClick={() => setOpen(v => !v)}
          className={`flex items-center px-1.5 py-1.5 text-xs text-pc-text-secondary hover:text-pc-text hover:bg-[var(--pc-hover)] border border-pc-border bg-pc-elevated/30 rounded-r-xl transition-colors ${open ? 'bg-[var(--pc-hover)] text-pc-text' : ''}`}
          title={t('sidebar.selectAgent')}
          aria-label={t('sidebar.selectAgent')}
          aria-expanded={open}
        >
          <ChevronDown size={12} className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
        </button>
      )}
      {open && showDropdown && (
        <div className="absolute top-full right-0 mt-1.5 min-w-[150px] rounded-xl border border-pc-border bg-[var(--pc-bg-surface)] shadow-xl z-50 backdrop-blur-xl overflow-hidden">
          <div className="px-3 py-1.5 text-[10px] text-pc-text-muted border-b border-pc-border font-medium uppercase tracking-wider">
            {t('sidebar.selectAgent')}
          </div>
          {agents.map(id => (
            <button
              key={id}
              onClick={() => { void onNewSessionForAgent(id); setOpen(false); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-pc-text-secondary hover:bg-[var(--pc-hover)] hover:text-pc-text transition-colors"
              aria-label={`${t('sidebar.newSession')} ${id}`}
            >
              <Bot size={12} className="shrink-0 text-pc-accent-light/70" />
              <span className="font-mono truncate">{id}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface Props {
  sessions: Session[];
  agents?: string[];
  activeSession: string;
  onSwitch: (key: string) => void;
  onDelete: (key: string) => void;
  onSplit?: (key: string) => void;
  splitSession?: string | null;
  open: boolean;
  onClose: () => void;
  onRename?: (key: string, label: string) => Promise<boolean>;
  onNewSession?: () => Promise<void>;
  onNewSessionForAgent?: (agentId: string) => Promise<void>;
  onToast?: (opts: { message: string; type: 'success' | 'warning' }) => void;
  /**
   * UX hint from `/api/identity` — toggles visibility of the subagent
   * expansion chevron. Server still authorises every subagent fetch
   * independently, so a tampered flag exposes nothing.
   */
  isAdmin?: boolean;
  /** Lazy fetcher for subagent summaries under a parent session. */
  loadSubagents?: (sessionKey: string) => Promise<SubagentSummary[]>;
  /** Callback when a subagent row is clicked — caller opens transcript modal. */
  onViewSubagent?: (sub: SubagentSummary) => void;
}

export function Sidebar({ sessions, agents = [], activeSession, onSwitch, onDelete, onSplit, splitSession, open, onClose, onRename, onNewSession, onNewSessionForAgent, onToast, isAdmin = false, loadSubagents, onViewSubagent }: Props) {
  const t = useT();
  const [filter, setFilter] = useState('');
  const [focusIdx, setFocusIdx] = useState(-1);
  const [pinned, setPinned] = useState(getPinnedSessions);
  const [width, setWidth] = useState(getSavedWidth);
  const [dragging, setDragging] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [customOrder, setCustomOrder] = useState<string[]>(getSavedOrder);
  const [channelFilter, setChannelFilter] = useState<string | null>(() => {
    try { return normalizeStoredChannelFilter(localStorage.getItem(FILTER_KEY)); } catch { return null; }
  });
  const [agentFilter, setAgentFilter] = useState<string | null>(() => {
    try { return localStorage.getItem(AGENT_FILTER_KEY); } catch { return null; }
  });
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [customNames, setCustomNames] = useState<Record<string, string>>(getCustomNames);
  const [renamingKey, setRenamingKey] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Subagent expansion state (admin-only). Keyed by session key:
  //   expandedSubagents = which sessions are expanded
  //   subagentsByKey    = lazy-loaded cache (undefined = not loaded yet)
  //   loadingSubagents  = sessions whose fetch is in flight
  const [expandedPreview, setExpandedPreview] = useState<Set<string>>(new Set());
  const togglePreview = useCallback((sessionKey: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedPreview((prev) => {
      const next = new Set(prev);
      if (next.has(sessionKey)) next.delete(sessionKey);
      else next.add(sessionKey);
      return next;
    });
  }, []);
  const [expandedSubagents, setExpandedSubagents] = useState<Set<string>>(new Set());
  const [subagentsByKey, setSubagentsByKey] = useState<Map<string, SubagentSummary[]>>(new Map());
  const [loadingSubagents, setLoadingSubagents] = useState<Set<string>>(new Set());

  const toggleSubagentExpand = useCallback((sessionKey: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isAdmin || !loadSubagents) return;

    setExpandedSubagents(prev => {
      const next = new Set(prev);
      if (next.has(sessionKey)) {
        next.delete(sessionKey);
        return next;
      }
      next.add(sessionKey);
      // Trigger a lazy load only on first expand. The cache persists for the
      // life of the component — if the user wants fresh data, they collapse
      // and we leave the cache; explicit refresh is out of scope for now.
      if (!subagentsByKey.has(sessionKey)) {
        setLoadingSubagents(loading => {
          const ls = new Set(loading);
          ls.add(sessionKey);
          return ls;
        });
        void loadSubagents(sessionKey).then(list => {
          setSubagentsByKey(map => {
            const m = new Map(map);
            m.set(sessionKey, list);
            return m;
          });
        }).finally(() => {
          setLoadingSubagents(loading => {
            const ls = new Set(loading);
            ls.delete(sessionKey);
            return ls;
          });
        });
      }
      return next;
    });
  }, [isAdmin, loadSubagents, subagentsByKey]);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ startX: 0, startW: 0 });

  // Drag-to-resize logic
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent | TouchEvent) => {
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const newW = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, dragRef.current.startW + (clientX - dragRef.current.startX)));
      setWidth(newW);
    };
    const onUp = () => {
      setDragging(false);
      // persist on release
      localStorage.setItem(WIDTH_KEY, String(width));
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchmove', onMove);
    document.addEventListener('touchend', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
    };
  }, [dragging, width]);

  // Save width when it changes (debounced via drag end above, but also on unmount)
  useEffect(() => {
    return () => { try { localStorage.setItem(WIDTH_KEY, String(width)); } catch { /* noop */ } };
  }, [width]);

  const startDrag = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    dragRef.current = { startX: clientX, startW: width };
    setDragging(true);
  }, [width]);

  const togglePin = useCallback((key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPinned(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      savePinnedSessions(next);
      return next;
    });
  }, []);

  const startRename = useCallback((key: string, currentName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingKey(key);
    setRenameValue(currentName);
    // Focus the input after render
    requestAnimationFrame(() => renameInputRef.current?.focus());
  }, []);

  const commitRename = useCallback(() => {
    if (!renamingKey) return;
    const trimmed = renameValue.trim();
    setCustomNames(prev => {
      const next = { ...prev };
      if (trimmed) {
        next[renamingKey] = trimmed;
      } else {
        delete next[renamingKey];
      }
      saveCustomNames(next);
      return next;
    });
    // Also persist server-side via sessions.patch
    if (onRename && trimmed) {
      onRename(renamingKey, trimmed).catch(() => { /* best effort */ });
    }
    setRenamingKey(null);
    setRenameValue('');
  }, [renamingKey, renameValue, onRename]);

  const cancelRename = useCallback(() => {
    setRenamingKey(null);
    setRenameValue('');
  }, []);

  // Focus rename input when it appears
  useEffect(() => {
    if (renamingKey) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [renamingKey]);

  // Keyboard shortcut: Ctrl+K or Cmd+K to focus search when sidebar is open
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const updateFilter = useCallback((value: string) => {
    setFilter(value);
    setFocusIdx(-1);
  }, []);

  const availableCategories = useMemo(
    () => getAvailableCategories(sessions.filter(session => !session.archived)),
    [sessions],
  );
  const hasArchivedSessions = useMemo(() => sessions.some(session => session.archived), [sessions]);
  const showSessionFilters = availableCategories.length > 1 || hasArchivedSessions;

  const availableAgentIds = useMemo(() => {
    const ids = new Set<string>();
    sessions.forEach(s => {
      const id = s.agentId || extractAgentIdFromKey(s.key);
      if (id) ids.add(id);
    });
    return Array.from(ids).sort();
  }, [sessions]);

  const toggleAgentFilter = useCallback((id: string) => {
    setAgentFilter(prev => {
      const next = prev === id ? null : id;
      try {
        if (next) localStorage.setItem(AGENT_FILTER_KEY, next);
        else localStorage.removeItem(AGENT_FILTER_KEY);
      } catch { /* noop */ }
      return next;
    });
  }, []);

  const toggleChannelFilter = useCallback((cat: string) => {
    setFocusIdx(-1);
    if (listRef.current) listRef.current.scrollTop = 0;
    setChannelFilter(prev => {
      const next = prev === cat ? null : cat;
      try {
        if (next) localStorage.setItem(FILTER_KEY, next);
        else localStorage.removeItem(FILTER_KEY);
      } catch { /* noop */ }
      return next;
    });
  }, []);

  const filtered = useMemo(() => {
    let list = sessions;
    // Archive is a separate view. Every other filter works only on current
    // sessions, so older runner sessions cannot clutter the main list.
    if (channelFilter === 'archive') {
      list = list.filter(s => s.archived);
    } else {
      list = list.filter(s => !s.archived);
      if (channelFilter) {
        list = list.filter(s => sessionCategory(s) === channelFilter);
      }
    }
    if (agentFilter) {
      list = list.filter(s => {
        const id = s.agentId || extractAgentIdFromKey(s.key);
        return id === agentFilter;
      });
    }
    if (filter.trim()) {
      const q = filter.toLowerCase();
      list = list.filter(s => (s.topicName || customNames[s.key] || sessionDisplayName(s)).toLowerCase().includes(q));
    }
    // Sort pinned sessions to top (preserving relative order within each group)
    const pinnedList = list.filter(s => pinned.has(s.key));
    const unpinnedList = list.filter(s => !pinned.has(s.key));
    // Sort each group: use custom order if set, then fall back to most recently updated
    const orderMap = new Map(customOrder.map((k, i) => [k, i]));
    const byCustomThenRecent = (a: Session, b: Session) => {
      const aIdx = orderMap.get(a.key);
      const bIdx = orderMap.get(b.key);
      if (aIdx !== undefined && bIdx !== undefined) return aIdx - bIdx;
      if (aIdx !== undefined) return -1;
      if (bIdx !== undefined) return 1;
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    };
    pinnedList.sort(byCustomThenRecent);
    unpinnedList.sort(byCustomThenRecent);
    return [...pinnedList, ...unpinnedList];
  }, [sessions, filter, pinned, customOrder, channelFilter, agentFilter, customNames]);

  return (
    <>
      {open && <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden" onClick={onClose} onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }} role="button" tabIndex={-1} aria-label="Close sidebar" />}
      <aside role="navigation" aria-label="Sessions" className={`fixed lg:relative top-0 left-0 h-full bg-[var(--pc-bg-base)]/95 border-r border-pc-border z-50 transform ${dragging ? '' : 'transition-transform'} lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'} flex flex-col backdrop-blur-xl`} style={{ width: `${width}px` }}>
        <div className="h-14 flex items-center justify-between px-4 border-b border-pc-border gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="relative shrink-0">
              <div className="absolute -inset-1.5 rounded-xl bg-gradient-to-r from-cyan-400/15 to-violet-500/15 blur-lg" />
              <div className="relative flex h-8 w-8 items-center justify-center rounded-xl overflow-hidden">
                <img src={`${import.meta.env.BASE_URL}logo.png`} alt="PinchChat" className="h-8 w-8 object-contain" />
              </div>
            </div>
            <span className="font-semibold text-sm text-pc-text tracking-wide truncate">{t('sidebar.title')}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onNewSession && onNewSessionForAgent && (
              <NewSessionSplitButton
                onNewSession={onNewSession}
                onNewSessionForAgent={onNewSessionForAgent}
                agents={agents}
              />
            )}
            <button onClick={onClose} className="lg:hidden p-1.5 rounded-xl hover:bg-[var(--pc-hover)] text-pc-text-secondary transition-colors" aria-label={t('sidebar.close')}>
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Session search */}
        {sessions.length > 3 && (
          <div className="px-2 pt-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-pc-text-muted" />
              <input
                ref={searchRef}
                type="text"
                value={filter}
                onChange={e => updateFilter(e.target.value)}
                placeholder={t('sidebar.search')}
                aria-label={t('sidebar.search')}
                className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-pc-border bg-pc-elevated/30 text-xs text-pc-text placeholder:text-pc-text-muted outline-none focus:ring-1 focus:ring-[var(--pc-accent-dim)] transition-all"
              />
              {filter && (
                <button
                  onClick={() => updateFilter('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-pc-text-muted hover:text-pc-text"
                  aria-label={t('sidebar.clearSearch')}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Natural-language session recall — collapsed by default, expands to a
            search input that asks local Qwen to find sessions matching a
            free-text description. Falls back to keyword token matching on the
            server when the LLM is down. */}
        <div className="px-2 pt-1">
          <SessionRecall onPick={(key) => { onSwitch(key); onClose(); }} />
        </div>

        {/* Filter chips */}
        {(showSessionFilters || availableAgentIds.length >= 2) && (
          <div className="px-2 pt-2 pb-1 flex flex-col gap-2">
            {showSessionFilters && (
              <div className="flex flex-wrap gap-1">
                <button
                  onClick={() => {
                    setChannelFilter(null);
                    setFocusIdx(-1);
                    if (listRef.current) listRef.current.scrollTop = 0;
                    try { localStorage.removeItem(FILTER_KEY); } catch { /* noop */ }
                  }}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors border ${
                    !channelFilter
                      ? 'bg-[var(--pc-accent-glow)] text-pc-accent-light border-[var(--pc-accent-dim)]'
                      : 'bg-transparent text-pc-text-muted border-pc-border hover:bg-[var(--pc-hover)] hover:text-pc-text-secondary'
                  }`}
                  aria-label="Current"
                  aria-pressed={!channelFilter}
                >
                  Current
                </button>
                {hasArchivedSessions && (
                  <button
                    onClick={() => toggleChannelFilter('archive')}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors border ${
                      channelFilter === 'archive'
                        ? 'bg-[var(--pc-accent-glow)] text-pc-accent-light border-[var(--pc-accent-dim)]'
                        : 'bg-transparent text-pc-text-muted border-pc-border hover:bg-[var(--pc-hover)] hover:text-pc-text-secondary'
                    }`}
                    aria-label="Archive"
                    aria-pressed={channelFilter === 'archive'}
                  >
                    <Archive size={10} />
                    Archive
                  </button>
                )}
                {availableCategories.length > 1 && availableCategories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => toggleChannelFilter(cat)}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors border ${
                      channelFilter === cat
                        ? 'bg-[var(--pc-accent-glow)] text-pc-accent-light border-[var(--pc-accent-dim)]'
                        : 'bg-transparent text-pc-text-muted border-pc-border hover:bg-[var(--pc-hover)] hover:text-pc-text-secondary'
                    }`}
                    aria-label={categoryLabel(cat)}
                    aria-pressed={channelFilter === cat}
                  >
                    <FilterChipIcon cat={cat} size={10} />
                    {categoryLabel(cat)}
                  </button>
                ))}
              </div>
            )}

            {showSessionFilters && availableAgentIds.length >= 2 && (
              <div className="h-px bg-pc-border/50" />
            )}

            {availableAgentIds.length >= 2 && (
              <div className="flex flex-wrap gap-1">
                <button
                  onClick={() => { setAgentFilter(null); try { localStorage.removeItem(AGENT_FILTER_KEY); } catch { /* noop */ } }}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors border ${
                    !agentFilter
                      ? 'bg-[var(--pc-accent-glow)] text-pc-accent-light border-[var(--pc-accent-dim)]'
                      : 'bg-transparent text-pc-text-muted border-pc-border hover:bg-[var(--pc-hover)] hover:text-pc-text-secondary'
                  }`}
                  aria-label={t('sidebar.filterAllAgents')}
                  aria-pressed={!agentFilter}
                >
                  {t('sidebar.filterAllAgents')}
                </button>
                {availableAgentIds.map(id => (
                  <button
                    key={id}
                    onClick={() => toggleAgentFilter(id)}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors border ${
                      agentFilter === id
                        ? 'bg-[var(--pc-accent-glow)] text-pc-accent-light border-[var(--pc-accent-dim)]'
                        : 'bg-transparent text-pc-text-muted border-pc-border hover:bg-[var(--pc-hover)] hover:text-pc-text-secondary'
                    }`}
                    aria-label={`Filter agent: ${id}`}
                    aria-pressed={agentFilter === id}
                  >
                    <Bot size={10} className="shrink-0" />
                    <span className="font-mono">{id}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div
          ref={listRef}
          className="flex-1 overflow-y-auto py-2 px-2"
          role="listbox"
          aria-label={t('sidebar.title')}
          tabIndex={0}
          onKeyDown={(e) => {
            const len = filtered.length;
            if (!len) return;
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              const next = focusIdx < len - 1 ? focusIdx + 1 : 0;
              setFocusIdx(next);
              listRef.current?.querySelectorAll<HTMLElement>('[role="option"]')[next]?.scrollIntoView({ block: 'nearest' });
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              const prev = focusIdx > 0 ? focusIdx - 1 : len - 1;
              setFocusIdx(prev);
              listRef.current?.querySelectorAll<HTMLElement>('[role="option"]')[prev]?.scrollIntoView({ block: 'nearest' });
            } else if (e.key === 'Enter' && focusIdx >= 0 && focusIdx < len) {
              e.preventDefault();
              onSwitch(filtered[focusIdx].key);
              onClose();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              onClose();
            }
          }}
        >
          {sessions.length === 0 && (
            <div className="flex flex-col items-center justify-center px-4 py-10 gap-3 text-center">
              <div className="h-10 w-10 rounded-2xl bg-[var(--pc-hover)] flex items-center justify-center text-pc-text-muted">
                <MessageSquare size={20} />
              </div>
              <div>
                <p className="text-sm text-pc-text-secondary font-medium">{t('sidebar.emptyTitle')}</p>
                <p className="text-xs text-pc-text-muted mt-0.5">{t('sidebar.emptySubtitle')}</p>
              </div>
              {onNewSession && (
                <button
                  onClick={() => { void onNewSession(); }}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--pc-accent)] text-white text-xs font-medium hover:opacity-90 transition-opacity shadow-[0_4px_12px_rgba(var(--pc-accent-rgb),0.2)]"
                  aria-label={t('sidebar.newSession')}
                >
                  <Plus size={14} />
                  {t('sidebar.newSession')}
                </button>
              )}
            </div>
          )}
          {sessions.length > 0 && filtered.length === 0 && (
            <div className="px-3 py-6 text-center text-pc-text-muted text-xs">{t('sidebar.noResults')}</div>
          )}
          {filtered.map((s, idx) => {
            const isActive = s.key === activeSession;
            const isFocused = idx === focusIdx;
            const isPinned = pinned.has(s.key);
            const isFirstUnpinned = !isPinned && idx > 0 && pinned.has(filtered[idx - 1].key);
            const isDragged = dragKey === s.key;
            const isDropTarget = dropTarget === s.key && dragKey !== s.key;
            const topicName = s.topicName?.trim();
            const displayName = topicName || customNames[s.key] || sessionDisplayName(s);
            return (
              <div key={s.key}>
                {isFirstUnpinned && (
                  <div className="flex items-center gap-2 px-3 py-1.5 mt-1 mb-1">
                    <div className="flex-1 h-px bg-[var(--pc-hover)]" />
                  </div>
                )}
                <div
                  role="option"
                  aria-selected={isActive}
                  tabIndex={-1}
                  draggable={!filter.trim()}
                  onDragStart={(e) => {
                    setDragKey(s.key);
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', s.key);
                  }}
                  onDragEnd={() => { setDragKey(null); setDropTarget(null); }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (dragKey && dragKey !== s.key) setDropTarget(s.key);
                  }}
                  onDragLeave={() => { if (dropTarget === s.key) setDropTarget(null); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (!dragKey || dragKey === s.key) return;
                    // Only reorder within same group (pinned or unpinned)
                    const dragPinned = pinned.has(dragKey);
                    const dropPinned = pinned.has(s.key);
                    if (dragPinned !== dropPinned) { setDragKey(null); setDropTarget(null); return; }
                    // Build new order from current filtered list
                    const keys = filtered.map(f => f.key);
                    const fromIdx = keys.indexOf(dragKey);
                    const toIdx = keys.indexOf(s.key);
                    if (fromIdx === -1 || toIdx === -1) return;
                    keys.splice(fromIdx, 1);
                    keys.splice(toIdx, 0, dragKey);
                    setCustomOrder(keys);
                    saveOrder(keys);
                    setDragKey(null);
                    setDropTarget(null);
                  }}
                  onClick={() => { onSwitch(s.key); onClose(); }}
                  onMouseEnter={() => setFocusIdx(idx)}
                  className={`group/item w-full flex flex-col px-3 py-2.5 rounded-2xl text-left text-sm transition-all mb-1 ${
                    isActive
                      ? 'bg-[var(--pc-hover)] text-pc-accent-light border border-pc-border shadow-[0_0_12px_rgba(34,211,238,0.08)]'
                      : s.isActive
                        ? 'bg-violet-500/5 text-violet-200 border border-violet-500/15 shadow-[0_0_10px_rgba(168,85,247,0.06)]'
                        : 'text-pc-text-secondary hover:bg-[var(--pc-hover)] border border-transparent'
                  } ${isFocused && !isActive ? 'ring-1 ring-[var(--pc-accent-dim)]' : ''} ${isDragged ? 'opacity-40' : ''} ${isDropTarget ? 'ring-1 ring-[var(--pc-accent)] bg-[var(--pc-accent-glow)]' : ''}`}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="relative shrink-0">
                      <SessionIcon session={s} isActive={s.isActive} isCurrentSession={isActive} />
                      {s.isActive && (
                        <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-violet-400 shadow-[0_0_8px_rgba(168,85,247,0.7)] animate-pulse" />
                      )}
                      {s.hasUnread && !isActive && (
                        <span className="absolute -top-1.5 -left-1.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-[var(--pc-accent)] text-[9px] font-bold text-zinc-900 leading-none px-1 shadow-[0_0_8px_rgba(34,211,238,0.5)]">
                          {(s.unreadCount || 1) > 99 ? '99+' : (s.unreadCount || 1)}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div
                        data-testid={`session-title-row-${s.key}`}
                        className="flex items-center min-w-0"
                      >
                      {renamingKey === s.key ? (
                        <input
                          ref={renameInputRef}
                          type="text"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onBlur={commitRename}
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
                            if (e.key === 'Escape') { e.preventDefault(); cancelRename(); }
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="flex-1 min-w-0 bg-[var(--pc-hover)] text-pc-text-primary text-[13px] rounded px-1 py-0 border border-pc-border outline-none focus:ring-1 focus:ring-[var(--pc-accent-dim)]"
                          maxLength={60}
                        />
                      ) : (
                        <span
                          data-testid={`session-title-${s.key}`}
                          className="flex-1 min-w-0 truncate text-[13px] font-medium leading-tight text-pc-text-secondary"
                          onDoubleClick={topicName ? undefined : (e) => startRename(s.key, displayName, e)}
                          title={displayName}
                        >
                          {displayName}
                        </span>
                      )}
                      </div>
                      <div
                        data-testid={`session-meta-row-${s.key}`}
                        className="mt-1 flex items-center gap-1.5 min-w-0"
                      >
                      {s.channel && (
                        <span
                          className="inline-block max-w-[96px] truncate align-middle text-[9px] text-pc-text-muted bg-[var(--pc-hover)] border border-pc-border rounded px-1 py-[1px] tracking-tight shrink-0"
                          aria-label={`channel: ${s.channel}`}
                        >
                          {s.channel}
                        </span>
                      )}
                      {(() => {
                        const rel = relativeTime(s.updatedAt);
                        return rel ? <span className="text-[10px] text-pc-text-muted tabular-nums shrink-0">{rel}</span> : null;
                      })()}
                      {s.messageCount != null && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${isActive ? 'bg-[var(--pc-accent-glow)] text-pc-accent-light' : 'bg-[var(--pc-hover)] text-pc-text-muted'}`}>
                          {s.messageCount}
                        </span>
                      )}
                    <div
                      data-testid={`session-actions-${s.key}`}
                      className="ml-auto flex items-center justify-end gap-0.5 opacity-0 group-hover/item:opacity-70 group-focus-within/item:opacity-100 transition-opacity"
                    >
                      {/* Inline-preview toggle, all members (not admin-gated).
                          Fetches last 10 turns lazily, renders below row. */}
                      <button
                        onClick={(e) => togglePreview(s.key, e)}
                        className={`shrink-0 p-0.5 rounded-lg transition-all ${
                          expandedPreview.has(s.key)
                            ? 'text-pc-accent opacity-90'
                            : 'text-pc-text-faint opacity-0 group-hover/item:opacity-60 hover:!opacity-100 hover:text-pc-text-secondary'
                        }`}
                        title="Preview last messages"
                        aria-label="Toggle preview"
                        aria-expanded={expandedPreview.has(s.key)}
                      >
                        {expandedPreview.has(s.key) ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                      </button>
                      {isAdmin && loadSubagents && (
                        <button
                          onClick={(e) => toggleSubagentExpand(s.key, e)}
                          className={`shrink-0 p-0.5 rounded-lg transition-all ${
                            expandedSubagents.has(s.key)
                              ? 'text-pc-accent opacity-90'
                              : 'text-pc-text-faint opacity-0 group-hover/item:opacity-60 hover:!opacity-100 hover:text-pc-text-secondary'
                          }`}
                          title="Subagents"
                          aria-label="Toggle subagents"
                          aria-expanded={expandedSubagents.has(s.key)}
                        >
                          {expandedSubagents.has(s.key) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        </button>
                      )}
                      {!topicName && (
                        <button
                          onClick={(e) => startRename(s.key, displayName, e)}
                          className="shrink-0 p-0.5 rounded-lg transition-all text-pc-text-faint opacity-0 group-hover/item:opacity-60 hover:!opacity-100 hover:text-pc-text-secondary"
                          title={t('sidebar.rename')}
                          aria-label={t('sidebar.rename')}
                        >
                          <Pencil size={11} />
                        </button>
                      )}
                      <button
                        onClick={(e) => togglePin(s.key, e)}
                        className={`shrink-0 p-0.5 rounded-lg transition-all ${
                          isPinned
                            ? 'text-pc-accent opacity-80 hover:opacity-100'
                            : 'text-pc-text-faint opacity-0 group-hover/item:opacity-60 hover:!opacity-100 hover:text-pc-text-secondary'
                        }`}
                        title={isPinned ? t('sidebar.unpin') : t('sidebar.pin')}
                        aria-label={isPinned ? t('sidebar.unpin') : t('sidebar.pin')}
                      >
                        <Pin size={12} className={isPinned ? 'fill-current' : ''} />
                      </button>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          const params = new URLSearchParams(window.location.search);
                          params.set('session', s.key);
                          const url = window.location.origin + window.location.pathname + '?' + params.toString();
                          const ok = await copyToClipboard(url);
                          if (ok) {
                            onToast?.({ message: t('session.linkCopied'), type: 'success' });
                          } else {
                            onToast?.({ message: t('session.copyLinkFailed'), type: 'warning' });
                          }
                        }}
                        className="shrink-0 p-0.5 rounded-lg transition-all text-pc-text-faint opacity-0 group-hover/item:opacity-60 hover:!opacity-100 hover:text-pc-text-secondary"
                        title={t('sidebar.copyLink')}
                        aria-label={t('sidebar.copyLink')}
                      >
                        <Link size={12} />
                      </button>
                      {onSplit && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onSplit(s.key); }}
                          className={`shrink-0 p-0.5 rounded-lg transition-all ${
                            splitSession === s.key
                              ? 'text-pc-accent opacity-80 hover:opacity-100'
                              : 'text-pc-text-faint opacity-0 group-hover/item:opacity-60 hover:!opacity-100 hover:text-pc-text-secondary'
                          }`}
                          title={t('sidebar.openSplit')}
                          aria-label={t('sidebar.openSplit')}
                        >
                          <Columns2 size={12} />
                        </button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); setConfirmDelete(s.key); }}
                        className="shrink-0 p-0.5 rounded-lg transition-all text-pc-text-faint opacity-0 group-hover/item:opacity-60 hover:!opacity-100 hover:text-red-400"
                        title={t('sidebar.delete')}
                        aria-label={t('sidebar.delete')}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                    </div>
                    {s.lastMessagePreview && (
                      <p className="text-[11px] text-pc-text-muted truncate mt-0.5 leading-tight">{s.lastMessagePreview.replace(/\s+/g, ' ').slice(0, 80)}</p>
                    )}
                    {(() => {
                      if (!s.contextTokens) return null;
                      const pct = Math.min(100, ((s.totalTokens || 0) / s.contextTokens) * 100);
                      const barOpacity = Math.max(0.35, Math.min(1, pct / 100));
                      const barStyle = { width: `${pct}%`, backgroundColor: `rgba(var(--pc-accent-rgb), ${barOpacity})` };
                      return (
                        <div className="flex items-center gap-1.5 mt-1">
                          <div className="flex-1 h-[3px] rounded-full bg-[var(--pc-hover)] overflow-hidden">
                            <div className="h-full rounded-full" style={barStyle} />
                          </div>
                          <span className="text-[9px] text-pc-text-muted tabular-nums shrink-0">{Math.round(pct)}%</span>
                        </div>
                      );
                    })()}
                    </div>
                  </div>
                </div>
                {isAdmin && expandedSubagents.has(s.key) && (
                  <SubagentList
                    sessionKey={s.key}
                    subagents={subagentsByKey.get(s.key)}
                    loading={loadingSubagents.has(s.key)}
                    onViewSubagent={onViewSubagent}
                  />
                )}
                {/* Inline preview of the last 10 turns. Available to every
                    member (not admin-gated). Lazy-loaded on expand. */}
                <SessionPreview sessionKey={s.key} open={expandedPreview.has(s.key)} />
              </div>
            );
          })}
        </div>
        {/* Footer with version */}
        <SidebarFooter />
        {/* Resize drag handle */}
        <div
          onMouseDown={startDrag}
          onTouchStart={startDrag}
          className={`hidden lg:block absolute top-0 right-0 w-1.5 h-full cursor-col-resize group/resize z-10 ${dragging ? 'bg-[var(--pc-accent-glow)]' : 'hover:bg-[var(--pc-accent-glow)]'} transition-colors`}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          aria-valuenow={width}
          aria-valuemin={MIN_WIDTH}
          aria-valuemax={MAX_WIDTH}
        >
          <div className={`absolute top-1/2 -translate-y-1/2 right-0 w-0.5 h-8 rounded-full ${dragging ? 'bg-[var(--pc-accent-dim)]' : 'bg-transparent group-hover/resize:bg-[var(--pc-accent-dim)]'} transition-colors`} />
        </div>
      </aside>
      {/* Prevent text selection while dragging */}
      {dragging && <div className="fixed inset-0 z-[60] cursor-col-resize" />}
      {/* Delete confirmation dialog */}
      {confirmDelete && (
        <>
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70]" onClick={() => setConfirmDelete(null)} onKeyDown={(e) => { if (e.key === 'Escape') setConfirmDelete(null); }} role="button" tabIndex={-1} aria-label="Cancel deletion" />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[80] w-72 bg-[var(--pc-bg-base)] border border-pc-border-strong rounded-2xl p-5 shadow-2xl">
            <p className="text-sm text-pc-text mb-4">{t('sidebar.deleteConfirm')}</p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-3 py-1.5 text-xs rounded-xl border border-pc-border-strong text-pc-text-secondary hover:bg-[var(--pc-hover)] transition-colors"
                aria-label={t('sidebar.deleteCancel')}
              >
                {t('sidebar.deleteCancel')}
              </button>
              <button
                onClick={() => { onDelete(confirmDelete); setConfirmDelete(null); }}
                className="px-3 py-1.5 text-xs rounded-xl bg-red-500/20 text-red-300 border border-red-500/20 hover:bg-red-500/30 transition-colors"
                aria-label={t('sidebar.delete')}
              >
                {t('sidebar.delete')}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
