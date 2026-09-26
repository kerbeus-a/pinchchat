/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { GmCommandCenter } from '../GmCommandCenter';

const mission = {
  id: 'm1',
  member_id: 'yuri',
  title: 'Build GM controls',
  goal: 'Build the command center controls',
  acceptance_criteria: ['missions are visible'],
  origin: 'web',
  status: 'active',
  created_at: '2026-07-28T10:00:00Z',
  updated_at: '2026-07-28T10:00:00Z',
  closed_at: null,
};

const task = {
  id: 't1',
  member_id: 'yuri',
  mission_id: 'm1',
  lineage_id: 'l1',
  attempt: 1,
  title: 'Durable backend state',
  objective: 'Implement state APIs',
  acceptance_criteria: ['turns are ordered'],
  runner: 'codex',
  agent_id: '',
  status: 'queued',
  created_at: '2026-07-28T10:01:00Z',
  updated_at: '2026-07-28T10:01:00Z',
  started_at: null,
  completed_at: null,
  cancelled_at: null,
  execution: {
    role: 'analyst',
    risk: 'low',
    expectedArtifact: 'summary',
    policy: { runner: 'claude-cli', model: 'sonnet', toolMode: 'none', writeMode: 'none' },
    policyHash: 'a'.repeat(64),
  },
};

describe('GmCommandCenter', () => {
  it('offers an unlock instead of loading protected activity without admin access', () => {
    const send = vi.fn();
    const onRequestAccess = vi.fn();

    render(<GmCommandCenter send={send} accessAvailable={false} onRequestAccess={onRequestAccess} />);

    expect(screen.getByText('Sign in to view GM activity')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Unlock GM Activity' }));
    expect(onRequestAccess).toHaveBeenCalledOnce();
    expect(send).not.toHaveBeenCalled();
  });

  it('loads missions and shows mission, task, and event controls', async () => {
    const send = vi.fn()
      .mockResolvedValueOnce({ missions: [mission] })
      .mockResolvedValueOnce({
        mission,
        tasks: [task],
        events: [{ id: 'e1', type: 'mission.created', summary: 'Mission created from command', created_at: '2026-07-28T10:00:00Z' }],
      })
      .mockResolvedValueOnce({ turns: [] })
      .mockResolvedValueOnce({ contexts: [] });

    render(<GmCommandCenter send={send} />);

    expect(await screen.findByText('Build GM controls')).toBeDefined();
    expect(await screen.findAllByText('Durable backend state')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Pause mission' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Cancel mission' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Retry task' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Cancel task' })).toBeDefined();
    expect(screen.getByText('Mission created from command')).toBeDefined();
  });

  it('sends a steering note to the selected task', async () => {
    const send = vi.fn()
      .mockResolvedValueOnce({ missions: [mission] })
      .mockResolvedValueOnce({ mission, tasks: [task], events: [] })
      .mockResolvedValueOnce({ turns: [] })
      .mockResolvedValueOnce({ contexts: [] })
      .mockResolvedValueOnce({ task })
      .mockResolvedValueOnce({ turns: [{ id: 'turn1', role: 'user', kind: 'steering', content: 'Tighten the tests', created_at: '2026-07-28T10:02:00Z' }] });

    render(<GmCommandCenter send={send} />);

    await screen.findAllByText('Durable backend state');
    fireEvent.change(screen.getByLabelText('Task steering note'), {
      target: { value: 'Tighten the tests' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send note' }));

    await waitFor(() => {
      expect(send).toHaveBeenCalledWith('gm.task.message', {
        taskId: 't1',
        message: 'Tighten the tests',
      });
    });
    expect(await screen.findByText('Tighten the tests')).toBeDefined();
  });

  it('creates a mission from the GM command box and refreshes the list', async () => {
    const send = vi.fn()
      .mockResolvedValueOnce({ missions: [] })
      .mockResolvedValueOnce({ mission })
      .mockResolvedValueOnce({ missions: [mission] })
      .mockResolvedValueOnce({ mission, tasks: [], events: [] });

    render(<GmCommandCenter send={send} sourceSessionId="session-1" />);

    fireEvent.change(await screen.findByLabelText('GM command'), {
      target: { value: 'Build the command center controls' },
    });
    fireEvent.change(screen.getByLabelText('Acceptance criteria'), {
      target: { value: 'missions are visible' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create mission' }));

    await waitFor(() => {
      expect(send).toHaveBeenCalledWith('gm.command', {
        command: 'Build the command center controls',
        acceptanceCriteria: ['missions are visible'],
        startTask: true,
        localReasoningEffort: 'xhigh',
        sourceSessionId: 'session-1',
      });
    });
    expect(await screen.findByText('Build GM controls')).toBeDefined();
  });

  it('shows a linked web source and returns to that session', async () => {
    const onOpenSourceSession = vi.fn();
    const linkedMission = {
      ...mission,
      source_context: { kind: 'web_session' as const, sessionId: 'session-1' },
    };
    const send = vi.fn()
      .mockResolvedValueOnce({ missions: [linkedMission] })
      .mockResolvedValueOnce({ mission: linkedMission, tasks: [], events: [] });

    render(<GmCommandCenter send={send} onOpenSourceSession={onOpenSourceSession} />);

    expect(await screen.findByText('Source: web session')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Open source session' }));
    expect(onOpenSourceSession).toHaveBeenCalledExactlyOnceWith('session-1');
  });

  it('renders one chronological mission timeline for events and task output', async () => {
    const timeline = [
      { id: 'e1', source: 'event', task_id: null, type: 'mission.created', content: 'Mission created from command', created_at: '2026-07-28T10:00:00Z' },
      { id: 'i1', source: 'turn', task_id: 't1', type: 'instruction', role: 'gm', content: 'Assess the boundaries.', created_at: '2026-07-28T10:01:00Z' },
      { id: 'r1', source: 'turn', task_id: 't1', type: 'result', role: 'agent', content: 'Keep the Kin-native room.', created_at: '2026-07-28T10:02:00Z' },
    ];
    const send = vi.fn()
      .mockResolvedValueOnce({ missions: [mission] })
      .mockResolvedValueOnce({ mission, tasks: [task], events: [], timeline })
      .mockResolvedValueOnce({ turns: [] })
      .mockResolvedValueOnce({ contexts: [] });

    render(<GmCommandCenter send={send} />);

    expect(await screen.findByText('Mission Timeline')).toBeDefined();
    expect(screen.getByText('Assess the boundaries.')).toBeDefined();
    expect(screen.getByText('Keep the Kin-native room.')).toBeDefined();
  });

  it('renders completion review controls and prevents new work until the operator decides', async () => {
    const pendingMission = { ...mission, status: 'paused', completion_review_status: 'pending' };
    const acceptedMission = { ...mission, status: 'completed', completion_review_status: 'accepted' };
    const send = vi.fn()
      .mockResolvedValueOnce({ missions: [pendingMission] })
      .mockResolvedValueOnce({ mission: pendingMission, tasks: [task], events: [] })
      .mockResolvedValueOnce({ turns: [] })
      .mockResolvedValueOnce({ contexts: [] })
      .mockResolvedValueOnce({ ok: true, mission: acceptedMission })
      .mockResolvedValueOnce({ missions: [acceptedMission] })
      .mockResolvedValueOnce({ mission: acceptedMission, tasks: [task], events: [] })
      .mockResolvedValueOnce({ turns: [] })
      .mockResolvedValueOnce({ contexts: [] });

    render(<GmCommandCenter send={send} />);

    expect(await screen.findByText('Awaiting completion review')).toBeDefined();
    expect((screen.getByRole('button', { name: 'Add task' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Accept completion' }));

    await waitFor(() => {
      expect(send).toHaveBeenCalledWith('gm.mission.accept_completion', {
        missionId: 'm1',
        reason: 'Completion accepted by operator',
      });
    });
  });

  it('shows delegation, worker, model, usage, and exact dispatched context', async () => {
    const dispatch = 'SYSTEM: inspect local records\nTASK: reconcile invoices';
    const operationalTask = {
      ...task,
      status: 'running',
      execution: { ...task.execution, projectId: 'kin' },
    };
    const events = [
      {
        id: 'start-1', task_id: 't1', type: 'task.run.started', summary: 'work invocation started', created_at: '2026-07-28T10:02:00Z',
        payload: { id: 'run-1', maxTurns: 50, capabilities: ['read_source'], localReasoningEffort: 'medium' },
      },
      {
        id: 'finish-1', task_id: 't1', type: 'task.run.finished', summary: 'work invocation returned', created_at: '2026-07-28T10:03:00Z',
        payload: { id: 'run-1', actualRunner: 'qwen', actualModel: 'qwen3.5-35b-a3b-q4_k_m', usage: { inputTokens: 12400, outputTokens: 820 }, toolNames: ['read_source'] },
      },
    ];
    const send = vi.fn()
      .mockResolvedValueOnce({ missions: [mission] })
      .mockResolvedValueOnce({
        mission,
        tasks: [operationalTask],
        events,
        workers: [{ memberId: 'yuri', projectId: 'kin', role: 'analyst', runner: 'qwen', sessionId: 'session-1234567890-abcdef', cwd: '/work/kin', status: 'running', turnsCount: 3, lastRunAt: '2026-07-28T10:02:00Z' }],
      })
      .mockResolvedValueOnce({ turns: [] })
      .mockResolvedValueOnce({ contexts: [{ runId: 'run-1', missionId: 'm1', taskId: 't1', phase: 'work', runner: 'qwen', model: 'qwen', context: dispatch, contextChars: dispatch.length, contextLimitTokens: 32768, createdAt: '2026-07-28T10:02:00Z' }] });

    render(<GmCommandCenter send={send} />);

    expect(await screen.findByText('kin / analyst (running)')).toBeDefined();
    expect(screen.getByText('llama.cpp (LAN)')).toBeDefined();
    expect(screen.getByText('qwen3.5-35b-a3b-q4_k_m')).toBeDefined();
    expect(await screen.findByText('32,768 tokens configured')).toBeDefined();
    expect(screen.getByText('12,400')).toBeDefined();
    expect(screen.getByText('medium')).toBeDefined();

    fireEvent.click(screen.getByRole('tab', { name: 'Context' }));
    expect((await screen.findByLabelText('Exact dispatched context')).textContent).toBe(dispatch);
    expect(screen.getByText('Reasoning: medium')).toBeDefined();
    fireEvent.click(screen.getByRole('tab', { name: 'Activity' }));
    expect(await screen.findAllByText('work invocation returned')).toHaveLength(2);
    expect(send).toHaveBeenCalledWith('gm.task.contexts', { taskId: 't1' });
  });

  it('disables unavailable terminal-state controls and keeps chat navigation visible', async () => {
    const cancelledMission = { ...mission, status: 'cancelled' };
    const cancelledTask = { ...task, status: 'cancelled' };
    const send = vi.fn()
      .mockResolvedValueOnce({ missions: [cancelledMission] })
      .mockResolvedValueOnce({ mission: cancelledMission, tasks: [cancelledTask], events: [] })
      .mockResolvedValueOnce({ turns: [] })
      .mockResolvedValueOnce({ contexts: [] });

    render(<GmCommandCenter send={send} />);

    expect(await screen.findAllByText('Durable backend state')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Open chat' })).toBeDefined();
    expect((screen.getByRole('button', { name: 'Pause mission' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Resume mission' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Cancel mission' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Retry task' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Cancel task' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('polls an active task and renders the real completed result', async () => {
    let poll: (() => void) | undefined;
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval').mockImplementation(((callback) => {
      poll = callback as () => void;
      return 1 as unknown as ReturnType<typeof setInterval>;
    }) as typeof setInterval);
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval').mockImplementation(() => undefined);
    try {
      const runningTask = { ...task, status: 'running', started_at: '2026-07-28T10:02:00Z' };
      const completedTask = {
        ...runningTask,
        status: 'completed',
        completed_at: '2026-07-28T10:03:00Z',
        updated_at: '2026-07-28T10:03:00Z',
      };
      const send = vi.fn()
        .mockResolvedValueOnce({ missions: [mission] })
        .mockResolvedValueOnce({ mission, tasks: [runningTask], events: [] })
        .mockResolvedValueOnce({ turns: [{ id: 'i1', role: 'gm', kind: 'instruction', content: 'policy', created_at: '2026-07-28T10:02:00Z' }] })
        .mockResolvedValueOnce({ contexts: [] })
        .mockResolvedValueOnce({ mission, tasks: [completedTask], events: [] })
        .mockResolvedValueOnce({ turns: [{ id: 'r1', role: 'agent', kind: 'result', content: 'Use the Kin-native project room.', created_at: '2026-07-28T10:03:00Z' }] })
        .mockResolvedValueOnce({ contexts: [] });

      render(<GmCommandCenter send={send} />);
      expect(await screen.findAllByText('Durable backend state')).toHaveLength(2);
      expect(poll).toEqual(expect.any(Function));
      fireEvent.click(screen.getByRole('tab', { name: 'Activity' }));

      await act(async () => {
        poll?.();
        await Promise.resolve();
        await Promise.resolve();
      });

      await waitFor(() => expect(send).toHaveBeenCalledTimes(7));
      expect(await screen.findByText('Use the Kin-native project room.')).toBeDefined();
      expect(send).toHaveBeenCalledWith('gm.mission.detail', { missionId: 'm1' });
      expect(send).toHaveBeenCalledWith('gm.task.turns', { taskId: 't1' });
    } finally {
      setIntervalSpy.mockRestore();
      clearIntervalSpy.mockRestore();
    }
  });

  it('disables live steering while a CLI task is running', async () => {
    const runningTask = { ...task, status: 'running', started_at: '2026-07-28T10:02:00Z' };
    const send = vi.fn()
      .mockResolvedValueOnce({ missions: [mission] })
      .mockResolvedValueOnce({ mission, tasks: [runningTask], events: [] })
      .mockResolvedValueOnce({ turns: [] })
      .mockResolvedValueOnce({ contexts: [] });

    render(<GmCommandCenter send={send} />);

    await screen.findAllByText('Durable backend state');
    expect((screen.getByLabelText('Task steering note') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Send note' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Cancel task' }) as HTMLButtonElement).disabled).toBe(false);
  });
});
