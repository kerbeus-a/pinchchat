import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, Bot, CheckCircle2, CornerUpLeft, Cpu, FileText, GitBranch, KeyRound, Link, MessageSquare, Network, Pause, Play, RefreshCw, RotateCcw, Send, SquarePlus, Undo2, XCircle } from 'lucide-react';
import type { JsonPayload } from '../lib/kinGateway';
import { relativeTime } from '../lib/relativeTime';

type SendFn = (method: string, params: JsonPayload) => Promise<JsonPayload>;

interface GmMission {
  id: string;
  title: string;
  goal: string;
  acceptance_criteria: string[];
  origin: string;
  source_context?: { kind: 'web_session'; sessionId: string } | { kind: 'telegram_topic'; contextKey: string } | null;
  status: string;
  completion_review_status?: 'none' | 'pending' | 'accepted' | 'reopened';
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

interface GmTask {
  id: string;
  mission_id: string;
  lineage_id: string;
  attempt: number;
  title: string;
  objective: string;
  acceptance_criteria: string[];
  runner: string;
  status: string;
  created_at: string;
  updated_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  execution?: {
    role: string;
    risk: string;
    expectedArtifact: string;
    projectId?: string;
    dependsOnTaskIds?: string[];
    policy: {
      runner: string;
      model?: string;
      toolMode: string;
      writeMode: string;
    };
  } | null;
}

interface GmEvent {
  id: string;
  task_id?: string | null;
  type: string;
  summary: string;
  payload?: Record<string, unknown>;
  created_at: string;
}

interface GmWorker {
  memberId: string;
  projectId: string;
  role: string;
  runner: string;
  sessionId: string | null;
  cwd: string | null;
  status: 'idle' | 'running';
  turnsCount: number;
  lastRunAt: string | null;
}

interface GmRunContext {
  runId: string;
  missionId: string;
  taskId: string;
  phase: 'work' | 'review';
  runner: string;
  model: string | null;
  context: string;
  contextChars: number;
  contextLimitTokens: number | null;
  createdAt: string;
}

type InspectorTab = 'overview' | 'context' | 'activity';

interface GmTaskTurn {
  id: string;
  role: string;
  kind: string;
  content: string;
  created_at: string;
}

interface GmTimelineItem {
  id: string;
  source: 'event' | 'turn';
  task_id: string | null;
  type: string;
  content: string;
  role?: string;
  created_at: string;
}

interface GmDetail {
  mission: GmMission;
  tasks: GmTask[];
  events: GmEvent[];
  timeline?: GmTimelineItem[];
}

export function GmCommandCenter({
  send,
  sourceSessionId,
  onOpenSourceSession,
  accessAvailable = true,
  onRequestAccess,
}: {
  send: SendFn;
  sourceSessionId?: string;
  onOpenSourceSession?: (sessionId: string) => void;
  accessAvailable?: boolean;
  onRequestAccess?: () => void;
}) {
  const [missions, setMissions] = useState<GmMission[]>([]);
  const [selectedMissionId, setSelectedMissionId] = useState<string | null>(null);
  const [detail, setDetail] = useState<GmDetail | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [turns, setTurns] = useState<GmTaskTurn[]>([]);
  const [workers, setWorkers] = useState<GmWorker[]>([]);
  const [contexts, setContexts] = useState<GmRunContext[]>([]);
  const [selectedContextRunId, setSelectedContextRunId] = useState<string | null>(null);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('overview');
  const [command, setCommand] = useState('');
  const [criteria, setCriteria] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskObjective, setTaskObjective] = useState('');
  const [steering, setSteering] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);

  const selectedTask = useMemo(
    () => detail?.tasks.find((task) => task.id === selectedTaskId) ?? detail?.tasks[0] ?? null,
    [detail?.tasks, selectedTaskId],
  );

  const loadMissions = useCallback(async () => {
    const res = await send('gm.missions.list', {});
    const list = Array.isArray(res.missions) ? res.missions as unknown as GmMission[] : [];
    setMissions(list);
    setSelectedMissionId((current) => {
      if (current && list.some((mission) => mission.id === current)) return current;
      return list[0]?.id ?? null;
    });
  }, [send]);

  const loadMissionDetail = useCallback(async (missionId: string) => {
    const res = await send('gm.mission.detail', { missionId });
    if (res.mission && typeof res.mission === 'object') {
      setDetail({
        mission: res.mission as unknown as GmMission,
        tasks: Array.isArray(res.tasks) ? res.tasks as unknown as GmTask[] : [],
        events: Array.isArray(res.events) ? res.events as unknown as GmEvent[] : [],
        timeline: Array.isArray(res.timeline) ? res.timeline as unknown as GmTimelineItem[] : undefined,
      });
      if (Array.isArray(res.workers)) setWorkers(res.workers as unknown as GmWorker[]);
    }
  }, [send]);

  const loadTurns = useCallback(async (taskId: string) => {
    const res = await send('gm.task.turns', { taskId });
    setTurns(Array.isArray(res.turns) ? res.turns as unknown as GmTaskTurn[] : []);
  }, [send]);

  const loadContexts = useCallback(async (taskId: string) => {
    const res = await send('gm.task.contexts', { taskId });
    const list = Array.isArray(res.contexts) ? res.contexts as unknown as GmRunContext[] : [];
    setContexts(list);
    setSelectedContextRunId((current) => current && list.some((context) => context.runId === current)
      ? current
      : list[0]?.runId ?? null);
  }, [send]);

  useEffect(() => {
    if (!accessAvailable) return;
    loadMissions().catch(() => setError('Could not load GM missions'));
  }, [accessAvailable, loadMissions]);

  useEffect(() => {
    if (!selectedMissionId) {
      setDetail(null);
      setSelectedTaskId(null);
      return;
    }
    loadMissionDetail(selectedMissionId).catch(() => setError('Could not load mission'));
  }, [loadMissionDetail, selectedMissionId]);

  useEffect(() => {
    const tasks = detail?.tasks ?? [];
    setSelectedTaskId((current) => {
      if (current && tasks.some((task) => task.id === current)) return current;
      return tasks[0]?.id ?? null;
    });
  }, [detail]);

  useEffect(() => {
    if (!selectedTaskId) {
      setTurns([]);
      setContexts([]);
      setSelectedContextRunId(null);
      return;
    }
    Promise.all([loadTurns(selectedTaskId), loadContexts(selectedTaskId)])
      .catch(() => setError('Could not load task details'));
  }, [loadContexts, loadTurns, selectedTaskId]);

  const hasActiveTask = detail?.tasks.some((task) => ['queued', 'running'].includes(task.status)) ?? false;
  const pollingTaskId = selectedTaskId ?? detail?.tasks[0]?.id ?? null;

  useEffect(() => {
    if (!selectedMissionId || !hasActiveTask) return;
    const timer = window.setInterval(() => {
      void (async () => {
        try {
          await loadMissionDetail(selectedMissionId);
          if (pollingTaskId) await loadTurns(pollingTaskId);
        } catch {
          setError('Could not refresh active task');
        }
      })();
    }, 2_000);
    return () => window.clearInterval(timer);
  }, [hasActiveTask, loadMissionDetail, loadTurns, pollingTaskId, selectedMissionId]);

  const criteriaList = useCallback((raw: string): string[] => {
    return raw.split('\n').map((line) => line.trim()).filter(Boolean);
  }, []);

  const runAction = useCallback(async (name: string, fn: () => Promise<void>) => {
    setWorking(name);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'GM action failed');
    } finally {
      setWorking(null);
    }
  }, []);

  const refreshSelected = useCallback(async () => {
    await loadMissions();
    if (selectedMissionId) await loadMissionDetail(selectedMissionId);
    if (selectedTaskId) await Promise.all([loadTurns(selectedTaskId), loadContexts(selectedTaskId)]);
  }, [loadContexts, loadMissions, loadMissionDetail, loadTurns, selectedMissionId, selectedTaskId]);

  const createMission = useCallback(async () => {
    const trimmed = command.trim();
    if (!trimmed) return;
    await runAction('create-mission', async () => {
      const res = await send('gm.command', {
        command: trimmed,
        acceptanceCriteria: criteriaList(criteria),
        ...(sourceSessionId ? { sourceSessionId } : {}),
      });
      const created = res.mission as { id?: string } | undefined;
      if (created?.id) setSelectedMissionId(created.id);
      setCommand('');
      setCriteria('');
      await loadMissions();
    });
  }, [command, criteria, criteriaList, loadMissions, runAction, send, sourceSessionId]);

  const createTask = useCallback(async () => {
    if (!detail) return;
    const title = taskTitle.trim();
    const objective = taskObjective.trim();
    if (!title || !objective) return;
    await runAction('create-task', async () => {
      const res = await send('gm.task.create', {
        missionId: detail.mission.id,
        title,
        objective,
        acceptanceCriteria: [],
        role: 'analyst',
        risk: 'low',
        expectedArtifact: 'summary',
      });
      const task = res.task as { id?: string } | undefined;
      if (task?.id) setSelectedTaskId(task.id);
      setTaskTitle('');
      setTaskObjective('');
      await loadMissionDetail(detail.mission.id);
    });
  }, [detail, loadMissionDetail, runAction, send, taskObjective, taskTitle]);

  const missionAction = useCallback(async (method: string, reason: string) => {
    if (!detail) return;
    await runAction(method, async () => {
      await send(method, { missionId: detail.mission.id, reason });
      await refreshSelected();
    });
  }, [detail, refreshSelected, runAction, send]);

  const taskAction = useCallback(async (method: string, reason: string) => {
    if (!selectedTask) return;
    await runAction(method, async () => {
      const res = await send(method, { taskId: selectedTask.id, reason });
      const task = res.task as { id?: string } | undefined;
      if (task?.id) setSelectedTaskId(task.id);
      await refreshSelected();
    });
  }, [refreshSelected, runAction, selectedTask, send]);

  const sendSteering = useCallback(async () => {
    if (!selectedTask) return;
    const message = steering.trim();
    if (!message) return;
    await runAction('gm.task.message', async () => {
      await send('gm.task.message', { taskId: selectedTask.id, message });
      setSteering('');
      await loadTurns(selectedTask.id);
      setInspectorTab('activity');
    });
  }, [loadTurns, runAction, selectedTask, send, steering]);

  const mission = detail?.mission ?? null;
  const sourceContext = mission?.source_context ?? null;
  const timeline: GmTimelineItem[] = detail?.timeline ?? (detail?.events ?? []).map((event) => ({
    id: event.id,
    source: 'event',
    task_id: null,
    type: event.type,
    content: event.summary,
    created_at: event.created_at,
  }));
  const taskCount = detail?.tasks.length ?? 0;
  const completionReview = mission?.completion_review_status ?? 'none';
  const completionReviewPending = completionReview === 'pending';
  const completionReviewAccepted = completionReview === 'accepted';
  const canPauseMission = mission?.status === 'active' && !completionReviewPending;
  const canResumeMission = mission?.status === 'paused' && !completionReviewPending;
  const canCancelMission = mission ? ['active', 'paused', 'blocked', 'failed'].includes(mission.status) : false;
  const canAcceptCompletion = mission !== null && completionReviewPending
    && ['active', 'paused', 'blocked'].includes(mission.status);
  const canReopenMission = mission !== null && ['pending', 'accepted'].includes(completionReview)
    && ['active', 'paused', 'blocked', 'completed'].includes(mission.status);
  const canCreateTask = mission ? ['active', 'paused', 'blocked'].includes(mission.status) && !completionReviewPending && !completionReviewAccepted : false;
  const canRetryTask = selectedTask ? ['queued', 'completed', 'failed', 'blocked'].includes(selectedTask.status) && !completionReviewPending && !completionReviewAccepted : false;
  const canCancelTask = selectedTask ? ['queued', 'running', 'needs_retry', 'blocked', 'failed'].includes(selectedTask.status) : false;
  const canSteerTask = selectedTask ? ['queued', 'blocked', 'failed'].includes(selectedTask.status) && !completionReviewPending && !completionReviewAccepted : false;
  const selectedContext = contexts.find((context) => context.runId === selectedContextRunId) ?? contexts[0] ?? null;
  const taskEvents = (detail?.events ?? []).filter((event) => event.task_id === selectedTask?.id);
  const selectedRunFinished = [...taskEvents].reverse().find((event) => event.type === 'task.run.finished'
    && (!selectedContext || event.payload?.id === selectedContext.runId));
  const selectedRunStarted = [...taskEvents].reverse().find((event) => event.type === 'task.run.started'
    && (!selectedContext || event.payload?.id === selectedContext.runId));
  const usage = isRecord(selectedRunFinished?.payload?.usage) ? selectedRunFinished.payload.usage : null;
  const selectedWorker = workers.find((worker) => worker.projectId === selectedTask?.execution?.projectId
    && worker.role === selectedTask?.execution?.role) ?? null;
  const actualRunner = stringValue(selectedRunFinished?.payload?.actualRunner)
    ?? selectedContext?.runner
    ?? selectedTask?.execution?.policy.runner
    ?? selectedTask?.runner
    ?? null;
  const actualModel = stringValue(selectedRunFinished?.payload?.actualModel)
    ?? null;
  const runningTasks = detail?.tasks.filter((task) => task.status === 'running').length ?? 0;
  const queuedTasks = detail?.tasks.filter((task) => task.status === 'queued').length ?? 0;
  const activeWorkers = workers.filter((worker) => worker.status === 'running').length;
  const models = new Set((detail?.events ?? [])
    .filter((event) => event.type === 'task.run.finished')
    .map((event) => stringValue(event.payload?.actualModel))
    .filter((model): model is string => Boolean(model)));
  const historicalInstruction = [...turns].reverse().find((turn) => turn.kind === 'instruction') ?? null;
  const dependencyNames = (selectedTask?.execution?.dependsOnTaskIds ?? []).map((taskId) => (
    detail?.tasks.find((task) => task.id === taskId)?.title ?? shortId(taskId)
  ));

  if (!accessAvailable) {
    return (
      <div className="flex h-full min-w-0 flex-col bg-[var(--pc-bg-base)]">
        <div className="shrink-0 border-b border-pc-border bg-[var(--pc-bg-surface)]/90 px-4 py-3 backdrop-blur-xl">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Network size={17} className="text-pc-accent-light" />
              <h1 className="text-sm font-semibold text-pc-text">GM Activity</h1>
            </div>
            <span className="text-xs text-pc-text-muted">Protected</span>
            <button
              type="button"
              onClick={() => { window.location.hash = ''; }}
              className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-pc-border px-3 py-1.5 text-xs text-pc-text-secondary hover:bg-[var(--pc-hover)] hover:text-pc-text"
              aria-label="Open chat"
            >
              <MessageSquare size={13} />
              <span>Chat</span>
            </button>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center p-6">
          <div className="w-full max-w-md text-center">
            <KeyRound size={24} className="mx-auto text-pc-accent-light" aria-hidden="true" />
            <h2 className="mt-4 text-base font-semibold text-pc-text">Sign in to view GM activity</h2>
            <p className="mt-2 text-sm leading-6 text-pc-text-muted">
              Delegation context and worker activity are protected because they can contain private task instructions.
            </p>
            {onRequestAccess && (
              <button
                type="button"
                onClick={onRequestAccess}
                className="mt-5 inline-flex h-9 items-center gap-2 rounded-md bg-pc-accent px-4 text-sm font-medium text-white hover:brightness-110"
              >
                <KeyRound size={14} aria-hidden="true" />
                <span>Unlock GM Activity</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-w-0 flex-col bg-[var(--pc-bg-base)]">
      <div className="shrink-0 border-b border-pc-border bg-[var(--pc-bg-surface)]/90 px-4 py-3 backdrop-blur-xl">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Network size={17} className="text-pc-accent-light" />
            <h1 className="text-sm font-semibold text-pc-text">GM Activity</h1>
          </div>
          <span className="text-xs text-pc-text-muted">{missions.length} mission{missions.length === 1 ? '' : 's'}</span>
          <button
            type="button"
            onClick={() => { window.location.hash = ''; }}
            className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-pc-border px-3 py-1.5 text-xs text-pc-text-secondary hover:bg-[var(--pc-hover)] hover:text-pc-text"
            aria-label="Open chat"
          >
            <MessageSquare size={13} />
            <span>Chat</span>
          </button>
          <button
            type="button"
            onClick={() => { void refreshSelected(); }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-pc-border px-3 py-1.5 text-xs text-pc-text-secondary hover:bg-[var(--pc-hover)] hover:text-pc-text"
            aria-label="Refresh GM"
          >
            <RefreshCw size={13} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)] overflow-hidden max-lg:grid-cols-1">
        <aside className="min-h-0 border-r border-pc-border bg-[var(--pc-bg-surface)]/55 max-lg:border-b max-lg:border-r-0">
          <form
            className="space-y-2 border-b border-pc-border p-3"
            onSubmit={(e) => { e.preventDefault(); void createMission(); }}
          >
            <label htmlFor="gm-command" className="text-[11px] font-medium uppercase tracking-wide text-pc-text-muted">GM command</label>
            <textarea
              id="gm-command"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-xl border border-pc-border bg-[var(--pc-bg-base)] px-3 py-2 text-sm text-pc-text outline-none placeholder:text-pc-text-faint focus:ring-1 focus:ring-pc-accent/60"
              placeholder="Outcome..."
            />
            <label htmlFor="gm-criteria" className="text-[11px] font-medium uppercase tracking-wide text-pc-text-muted">Acceptance criteria</label>
            <textarea
              id="gm-criteria"
              value={criteria}
              onChange={(e) => setCriteria(e.target.value)}
              rows={2}
              className="w-full resize-none rounded-xl border border-pc-border bg-[var(--pc-bg-base)] px-3 py-2 text-sm text-pc-text outline-none placeholder:text-pc-text-faint focus:ring-1 focus:ring-pc-accent/60"
              placeholder="One per line"
            />
            <button
              type="submit"
              disabled={working !== null || !command.trim()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-pc-accent px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-pc-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Create mission"
            >
              <SquarePlus size={14} />
              <span>Create mission</span>
            </button>
          </form>

          <div className="min-h-0 overflow-y-auto p-2">
            {missions.length === 0 ? (
              <div className="px-3 py-8 text-center text-sm text-pc-text-muted">No GM missions</div>
            ) : missions.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedMissionId(item.id)}
                className={`mb-1 w-full rounded-xl px-3 py-2 text-left transition-colors ${
                  selectedMissionId === item.id
                    ? 'bg-pc-accent/10 text-pc-text'
                    : 'text-pc-text-secondary hover:bg-[var(--pc-hover)] hover:text-pc-text'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.title}</span>
                  <StatusPill status={item.status} />
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-pc-text-muted">{item.goal}</p>
              </button>
            ))}
          </div>
        </aside>

        <main className="min-h-0 overflow-y-auto p-4">
          {error && (
            <div className="mb-3 rounded-xl border border-red-400/25 bg-red-400/10 px-3 py-2 text-sm text-red-500 dark:text-red-300">
              {error}
            </div>
          )}

          {!mission ? (
            <div className="flex h-full min-h-[280px] items-center justify-center text-sm text-pc-text-muted">
              Select or create a mission.
            </div>
          ) : (
            <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
              <section className="min-w-0 space-y-4">
                <div className="rounded-lg border border-pc-border bg-[var(--pc-bg-surface)] p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill status={mission.status} />
                    <span className="text-xs text-pc-text-faint">{relativeTime(new Date(mission.updated_at).getTime())}</span>
                    <div className="ml-auto flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => { void missionAction('gm.mission.accept_completion', 'Completion accepted by operator'); }}
                        disabled={!canAcceptCompletion || working !== null}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-400/35 px-3 py-1.5 text-xs text-emerald-600 hover:bg-emerald-400/10 dark:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label="Accept completion"
                      >
                        <CheckCircle2 size={13} />
                        <span>Accept</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => { void missionAction('gm.mission.reopen', 'Mission reopened by operator'); }}
                        disabled={!canReopenMission || working !== null}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-pc-border px-3 py-1.5 text-xs text-pc-text-secondary hover:bg-[var(--pc-hover)] hover:text-pc-text disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label="Reopen mission"
                      >
                        <Undo2 size={13} />
                        <span>Reopen</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => { void missionAction('gm.mission.pause', 'Paused by operator'); }}
                        disabled={!canPauseMission || working !== null}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-pc-border px-3 py-1.5 text-xs text-pc-text-secondary hover:bg-[var(--pc-hover)] hover:text-pc-text disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label="Pause mission"
                      >
                        <Pause size={13} />
                        <span>Pause</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => { void missionAction('gm.mission.resume', 'Resumed by operator'); }}
                        disabled={!canResumeMission || working !== null}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-pc-border px-3 py-1.5 text-xs text-pc-text-secondary hover:bg-[var(--pc-hover)] hover:text-pc-text disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label="Resume mission"
                      >
                        <Play size={13} />
                        <span>Resume</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => { void missionAction('gm.mission.cancel', 'Cancelled by operator'); }}
                        disabled={!canCancelMission || working !== null}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-red-400/35 px-3 py-1.5 text-xs text-red-500 hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label="Cancel mission"
                      >
                        <XCircle size={13} />
                        <span>Cancel</span>
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 min-w-0">
                    <h2 className="text-lg font-semibold leading-7 text-pc-text">{mission.title}</h2>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-pc-text-secondary">{mission.goal}</p>
                    {sourceContext && (
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-pc-text-muted">
                        <Link size={13} aria-hidden="true" />
                        <span>{sourceContext.kind === 'web_session' ? 'Source: web session' : 'Source: Telegram GM topic'}</span>
                        {sourceContext.kind === 'web_session' && onOpenSourceSession && (
                          <button
                            type="button"
                            onClick={() => onOpenSourceSession(sourceContext.sessionId)}
                            className="inline-flex h-6 w-6 items-center justify-center text-pc-text-secondary hover:text-pc-text"
                            aria-label="Open source session"
                            title="Open source session"
                          >
                            <CornerUpLeft size={14} />
                          </button>
                        )}
                      </div>
                    )}
                    {completionReviewPending && (
                      <p className="mt-3 text-sm font-medium text-amber-600 dark:text-amber-300">Awaiting completion review</p>
                    )}
                    {completionReviewAccepted && (
                      <p className="mt-3 text-sm font-medium text-emerald-600 dark:text-emerald-300">Completion accepted</p>
                    )}
                  </div>

                  {mission.acceptance_criteria.length > 0 && (
                    <div className="mt-4 border-t border-pc-border pt-3">
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-pc-text-muted">Acceptance</h3>
                      <ul className="space-y-1.5">
                        {mission.acceptance_criteria.map((item, idx) => (
                          <li key={idx} className="flex gap-2 text-sm text-pc-text-secondary">
                            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-pc-accent/70" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 border border-pc-border bg-[var(--pc-bg-surface)] xl:grid-cols-4">
                  <Metric label="Running tasks" value={runningTasks} tone={runningTasks > 0 ? 'active' : undefined} />
                  <Metric label="Queued tasks" value={queuedTasks} />
                  <Metric label="Active workers" value={`${activeWorkers}/${workers.length}`} tone={activeWorkers > 0 ? 'active' : undefined} />
                  <Metric label="Models used" value={models.size} />
                </div>

                <div className="border border-pc-border bg-[var(--pc-bg-surface)]">
                  <div className="mb-3 flex items-center gap-2">
                    <GitBranch size={15} className="ml-4 mt-4 text-pc-accent-light" />
                    <h3 className="mt-4 text-sm font-semibold text-pc-text">Delegation tree</h3>
                    <span className="text-xs text-pc-text-muted">{taskCount}</span>
                  </div>
                  <div className="border-t border-pc-border">
                    {(detail?.tasks ?? []).map((task) => (
                      <button
                        key={task.id}
                        type="button"
                        onClick={() => { setSelectedTaskId(task.id); setInspectorTab('overview'); }}
                        className={`flex w-full items-start gap-3 border-b border-pc-border px-4 py-3 text-left transition-colors last:border-b-0 ${
                          selectedTaskId === task.id
                            ? 'bg-pc-accent/10'
                            : 'hover:bg-[var(--pc-hover)]'
                        }`}
                      >
                        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center border border-pc-border bg-[var(--pc-bg-base)] text-pc-text-muted">
                          <Bot size={14} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="min-w-0 flex-1 truncate text-sm font-medium text-pc-text">{task.title}</span>
                            <StatusPill status={task.status} />
                          </div>
                          <p className="mt-1 truncate text-xs text-pc-text-muted">
                            {task.execution?.projectId ?? 'One-off task'} / {task.execution?.role ?? 'worker'} / attempt {task.attempt}
                          </p>
                          <p className="mt-0.5 truncate text-[11px] text-pc-text-faint">
                            {modelLabel(task.execution?.policy.model ?? null)}
                          </p>
                          {(task.execution?.dependsOnTaskIds?.length ?? 0) > 0 && (
                            <p className="mt-0.5 truncate text-[11px] text-pc-text-faint">
                              After: {task.execution!.dependsOnTaskIds!.map((taskId) => detail?.tasks.find((candidate) => candidate.id === taskId)?.title ?? shortId(taskId)).join(', ')}
                            </p>
                          )}
                          {task.attempt > 1 && <p className="mt-0.5 text-[11px] text-pc-text-faint">Retry in the same task lineage</p>}
                          <p className="mt-1 line-clamp-2 text-xs text-pc-text-muted">{task.objective}</p>
                        </div>
                      </button>
                    ))}
                    {(detail?.tasks ?? []).length === 0 && (
                      <p className="py-4 text-center text-sm text-pc-text-muted">No delegated tasks</p>
                    )}
                  </div>

                  <form
                    className="grid gap-2 border-t border-pc-border p-3 2xl:grid-cols-[0.8fr_1.2fr_auto]"
                    onSubmit={(e) => { e.preventDefault(); void createTask(); }}
                  >
                    <input
                      value={taskTitle}
                      onChange={(e) => setTaskTitle(e.target.value)}
                      disabled={!canCreateTask}
                      className="rounded-xl border border-pc-border bg-[var(--pc-bg-base)] px-3 py-2 text-sm text-pc-text outline-none placeholder:text-pc-text-faint focus:ring-1 focus:ring-pc-accent/60"
                      placeholder="Task title"
                    />
                    <input
                      value={taskObjective}
                      onChange={(e) => setTaskObjective(e.target.value)}
                      className="rounded-xl border border-pc-border bg-[var(--pc-bg-base)] px-3 py-2 text-sm text-pc-text outline-none placeholder:text-pc-text-faint focus:ring-1 focus:ring-pc-accent/60"
                      placeholder="Objective"
                    />
                    <button
                      type="submit"
                      disabled={working !== null || !canCreateTask || !taskTitle.trim() || !taskObjective.trim()}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-pc-border px-3 py-2 text-xs text-pc-text-secondary hover:bg-[var(--pc-hover)] hover:text-pc-text disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <SquarePlus size={13} />
                      <span>Add task</span>
                    </button>
                  </form>
                </div>
              </section>

              <aside className="min-w-0 space-y-4">
                <div className="border border-pc-border bg-[var(--pc-bg-surface)]">
                  {selectedTask ? (
                    <>
                      <div className="flex items-start gap-3 border-b border-pc-border p-4">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center border border-pc-border bg-[var(--pc-bg-base)] text-pc-accent-light">
                          <Bot size={16} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-medium uppercase text-pc-text-faint">Task inspector</p>
                          <h3 className="truncate text-sm font-semibold text-pc-text">{selectedTask.title}</h3>
                        </div>
                        <StatusPill status={selectedTask.status} />
                      </div>

                      <div className="flex flex-wrap gap-2 border-b border-pc-border px-4 py-3">
                        <button
                          type="button"
                          onClick={() => { void taskAction('gm.task.retry', 'Retry requested by operator'); }}
                          disabled={!canRetryTask || working !== null}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-pc-border px-3 py-1.5 text-xs text-pc-text-secondary hover:bg-[var(--pc-hover)] hover:text-pc-text disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label="Retry task"
                        >
                          <RotateCcw size={13} />
                          <span>Retry</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => { void taskAction('gm.task.cancel', 'Cancelled by operator'); }}
                          disabled={!canCancelTask || working !== null}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-red-400/35 px-3 py-1.5 text-xs text-red-500 hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label="Cancel task"
                        >
                          <XCircle size={13} />
                          <span>Cancel</span>
                        </button>
                      </div>

                      <div className="flex border-b border-pc-border" role="tablist" aria-label="Task inspector">
                        <InspectorTabButton active={inspectorTab === 'overview'} icon={Cpu} label="Overview" onClick={() => setInspectorTab('overview')} />
                        <InspectorTabButton active={inspectorTab === 'context'} icon={FileText} label="Context" onClick={() => setInspectorTab('context')} />
                        <InspectorTabButton active={inspectorTab === 'activity'} icon={Activity} label="Activity" onClick={() => setInspectorTab('activity')} />
                      </div>

                      {inspectorTab === 'overview' && (
                        <div className="divide-y divide-pc-border">
                          <DetailRow label="Relationship" value={`${mission.title} / ${selectedTask.execution?.projectId ?? 'one-off'} / ${selectedTask.execution?.role ?? 'worker'}`} />
                          <DetailRow label="Depends on" value={dependencyNames.join(', ') || 'No task dependencies'} />
                          <DetailRow label="Worker" value={selectedWorker
                            ? `${selectedWorker.projectId} / ${selectedWorker.role} (${selectedWorker.status})`
                            : selectedTask.execution?.projectId ? 'Persistent worker not launched yet' : 'Ephemeral run'} />
                          <DetailRow label="Session" value={selectedWorker?.sessionId ? shortId(selectedWorker.sessionId) : 'No reusable session'} mono />
                          <DetailRow label="Engine" value={runnerLabel(actualRunner)} />
                          <DetailRow label="Model" value={modelLabel(actualModel)} />
                          <DetailRow label="Dispatch context" value={selectedContext
                            ? `${formatNumber(selectedContext.contextChars)} characters`
                            : historicalInstruction ? 'Historical snapshot available' : 'Not dispatched yet'} />
                          <DetailRow label="Context window" value={selectedContext?.contextLimitTokens
                            ? `${formatNumber(selectedContext.contextLimitTokens)} tokens configured`
                            : 'Not reported by runner'} />
                          <DetailRow label="Input tokens" value={numberValue(usage?.inputTokens) === null
                            ? 'Not reported by runner'
                            : formatNumber(numberValue(usage?.inputTokens)!)} />
                          <DetailRow label="Output tokens" value={numberValue(usage?.outputTokens) === null
                            ? 'Not reported by runner'
                            : formatNumber(numberValue(usage?.outputTokens)!)} />
                          <DetailRow label="Tools" value={stringList(selectedRunFinished?.payload?.toolNames).length > 0
                            ? stringList(selectedRunFinished?.payload?.toolNames).join(', ')
                            : stringList(selectedRunStarted?.payload?.capabilities).join(', ') || 'None recorded'} />
                          <DetailRow label="Turn limit" value={numberValue(selectedRunStarted?.payload?.maxTurns)?.toString() ?? 'Not launched yet'} />
                        </div>
                      )}

                      {inspectorTab === 'context' && (
                        <div className="p-4">
                          {contexts.length > 1 && (
                            <label className="mb-3 block text-xs text-pc-text-muted">
                              Dispatch
                              <select
                                value={selectedContext?.runId ?? ''}
                                onChange={(event) => setSelectedContextRunId(event.target.value)}
                                className="mt-1 block w-full border border-pc-border bg-[var(--pc-bg-base)] px-2 py-1.5 text-xs text-pc-text outline-none"
                                aria-label="Dispatch context"
                              >
                                {contexts.map((context) => (
                                  <option key={context.runId} value={context.runId}>
                                    {context.phase} / {modelLabel(context.model)} / {formatNumber(context.contextChars)} chars
                                  </option>
                                ))}
                              </select>
                            </label>
                          )}
                          {selectedContext ? (
                            <>
                              <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-pc-text-muted">
                                <span>{selectedContext.phase} context</span>
                                <span>{modelLabel(selectedContext.model)}</span>
                                <span>{formatNumber(selectedContext.contextChars)} characters</span>
                                {numberValue(usage?.inputTokens) !== null && <span>{formatNumber(numberValue(usage?.inputTokens)!)} input tokens</span>}
                              </div>
                              <pre aria-label="Exact dispatched context" className="max-h-[520px] overflow-auto whitespace-pre-wrap border border-pc-border bg-[var(--pc-bg-base)] p-3 font-mono text-xs leading-5 text-pc-text-secondary">{selectedContext.context}</pre>
                            </>
                          ) : historicalInstruction ? (
                            <>
                              <p className="mb-2 text-xs text-amber-600 dark:text-amber-300">Historical instruction snapshot. It may have been clipped when originally stored.</p>
                              <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap border border-pc-border bg-[var(--pc-bg-base)] p-3 font-mono text-xs leading-5 text-pc-text-secondary">{historicalInstruction.content}</pre>
                            </>
                          ) : (
                            <p className="py-8 text-center text-sm text-pc-text-muted">No context has been dispatched.</p>
                          )}
                        </div>
                      )}

                      {inspectorTab === 'activity' && (
                        <div className="max-h-[520px] overflow-y-auto">
                          <div className="border-b border-pc-border px-4 py-2 text-[10px] font-medium uppercase text-pc-text-faint">Run events</div>
                          {taskEvents.length === 0 ? (
                            <p className="px-4 py-5 text-sm text-pc-text-muted">No run events</p>
                          ) : taskEvents.map((event) => (
                            <div key={event.id} className="border-b border-pc-border px-4 py-2.5">
                              <div className="flex gap-2 text-[10px] text-pc-text-faint">
                                <span className="font-mono">{event.type}</span>
                                <span className="ml-auto">{relativeTime(new Date(event.created_at).getTime())}</span>
                              </div>
                              <p className="mt-1 text-xs text-pc-text-secondary">{event.summary}</p>
                            </div>
                          ))}
                          <div className="border-b border-pc-border px-4 py-2 text-[10px] font-medium uppercase text-pc-text-faint">Task messages</div>
                          {turns.length === 0 ? (
                            <p className="px-4 py-5 text-sm text-pc-text-muted">No task messages</p>
                          ) : turns.map((turn) => (
                            <div key={turn.id} className="border-b border-pc-border px-4 py-3 last:border-b-0">
                              <div className="mb-1 flex items-center gap-2 text-[10px] uppercase text-pc-text-faint">
                                <span>{turn.role}</span>
                                <span>{turn.kind}</span>
                                <span className="ml-auto normal-case">{relativeTime(new Date(turn.created_at).getTime())}</span>
                              </div>
                              <p className="whitespace-pre-wrap text-sm text-pc-text-secondary">{turn.content}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      <form
                        className="flex gap-2 border-t border-pc-border p-3"
                        onSubmit={(e) => { e.preventDefault(); void sendSteering(); }}
                      >
                        <label htmlFor="gm-steering" className="sr-only">Task steering note</label>
                        <input
                          id="gm-steering"
                          value={steering}
                          onChange={(e) => setSteering(e.target.value)}
                          disabled={!canSteerTask}
                          className="min-w-0 flex-1 rounded-xl border border-pc-border bg-[var(--pc-bg-base)] px-3 py-2 text-sm text-pc-text outline-none placeholder:text-pc-text-faint focus:ring-1 focus:ring-pc-accent/60"
                          placeholder="Steer selected task"
                          aria-label="Task steering note"
                        />
                        <button
                          type="submit"
                          disabled={working !== null || !canSteerTask || !steering.trim()}
                          className="inline-flex items-center gap-2 rounded-xl bg-pc-accent px-3 py-2 text-xs font-medium text-white hover:bg-pc-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label="Send note"
                        >
                          <Send size={13} />
                          <span>Send note</span>
                        </button>
                      </form>
                    </>
                  ) : (
                    <p className="py-6 text-center text-sm text-pc-text-muted">Select a task.</p>
                  )}
                </div>

                <div className="rounded-lg border border-pc-border bg-[var(--pc-bg-surface)] p-4">
                  <h3 className="mb-3 text-sm font-semibold text-pc-text">Mission Timeline</h3>
                  <div className="space-y-2">
                    {timeline.length === 0 ? (
                      <p className="py-4 text-center text-sm text-pc-text-muted">No activity</p>
                    ) : timeline.map((item) => (
                      <div key={`${item.source}:${item.id}`} className="rounded-lg border border-pc-border/70 px-3 py-2">
                        <div className="mb-1 flex items-center gap-2 text-[10px] text-pc-text-faint">
                          <span className="font-mono">{item.source === 'turn' && item.role ? `${item.role} · ` : ''}{item.type}</span>
                          <span className="ml-auto">{relativeTime(new Date(item.created_at).getTime())}</span>
                        </div>
                        <p className="whitespace-pre-wrap text-sm text-pc-text-secondary">{item.content}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </aside>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string | number; tone?: 'active' }) {
  return (
    <div className="border-b border-r border-pc-border px-3 py-2.5 last:border-r-0 xl:border-b-0">
      <p className="text-[10px] font-medium uppercase text-pc-text-faint">{label}</p>
      <p className={`mt-0.5 text-lg font-semibold ${tone === 'active' ? 'text-emerald-600 dark:text-emerald-300' : 'text-pc-text'}`}>{value}</p>
    </div>
  );
}

function InspectorTabButton({ active, icon: Icon, label, onClick }: {
  active: boolean;
  icon: typeof Cpu;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`inline-flex flex-1 items-center justify-center gap-1.5 border-r border-pc-border px-2 py-2 text-xs last:border-r-0 ${
        active ? 'bg-pc-accent/10 text-pc-accent-light' : 'text-pc-text-muted hover:bg-[var(--pc-hover)] hover:text-pc-text'
      }`}
    >
      <Icon size={13} />
      <span>{label}</span>
    </button>
  );
}

function DetailRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 px-4 py-2.5 text-xs">
      <span className="text-pc-text-faint">{label}</span>
      <span className={`min-w-0 break-words text-pc-text-secondary ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value);
}

function shortId(value: string): string {
  return value.length > 18 ? `${value.slice(0, 8)}...${value.slice(-6)}` : value;
}

function runnerLabel(runner: string | null): string {
  if (runner === 'qwen') return 'llama.cpp (LAN)';
  if (runner === 'codex') return 'Codex';
  if (runner === 'claude-cli') return 'Claude CLI';
  if (runner === 'claude') return 'Claude';
  return runner ?? 'Not launched yet';
}

function modelLabel(model: string | null): string {
  if (model === 'qwen') return 'Qwen / llama.cpp';
  if (model === 'gpt') return 'GPT / Codex';
  if (model === 'fable' || model === 'opus' || model === 'sonnet') {
    return `${model[0]!.toUpperCase()}${model.slice(1)} / Claude`;
  }
  return model ?? 'Not recorded';
}

function StatusPill({ status }: { status: string }) {
  const label = status.replace(/_/g, ' ');
  const base = 'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium';
  if (status === 'active' || status === 'queued') {
    return <span className={`${base} bg-sky-400/15 text-sky-500 dark:text-sky-300`}>{label}</span>;
  }
  if (status === 'running') {
    return <span className={`${base} bg-yellow-400/15 text-yellow-600 dark:text-yellow-300`}>{label}</span>;
  }
  if (status === 'completed') {
    return <span className={`${base} bg-emerald-400/15 text-emerald-600 dark:text-emerald-300`}>{label}</span>;
  }
  if (status === 'cancelled' || status === 'failed') {
    return <span className={`${base} bg-red-400/15 text-red-500 dark:text-red-300`}>{label}</span>;
  }
  return <span className={`${base} bg-[var(--pc-hover)] text-pc-text-muted`}>{label}</span>;
}
