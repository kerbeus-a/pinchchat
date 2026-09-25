/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { EvidencePanel } from '../EvidencePanel';

void React;

const evidence = [{
  answerMessageId: '9', citationLabel: '1', connectorStatus: 'complete' as const, id: 'ref-1',
  workspaceId: 'tasterra' as const, sourceId: 'odoo-tasterra', sourceType: 'odoo_record' as const,
  externalId: 'vendor_bill:41', title: 'BILL/2026/0041', occurredAt: '2026-09-20',
  excerpt: 'Ivan Mining | not_paid | 1200 | USD',
  deepLink: 'https://odoo.example.test/web#id=41', capturedAt: '2026-09-25T00:00:00Z',
}];

describe('EvidencePanel', () => {
  it('renders durable citations and opens the authoritative record', () => {
    const refresh = vi.fn();
    render(<EvidencePanel
      open
      session={{ key: 'topic-41', topicName: 'Invoices', channel: 'Group topic 4346', agentId: 'main', model: 'Qwen3.5', messageCount: 18, totalTokens: 12000, contextTokens: 131072 }}
      scope={{ workspaceId: 'tasterra', mode: 'query', sourceIds: [], persisted: true }}
      workspaceLabel="TasTerra"
      sources={[]}
      evidence={evidence}
      sessionContext={{ systemPrompt: 'Workspace: TasTerra. Query mode.', historyMode: 'runner-managed' }}
      messages={[{
        id: 'm1', role: 'user', content: 'Find the Ivan invoice', timestamp: 1,
        blocks: [{ type: 'text', text: 'Find the Ivan invoice' }],
      }]}
      loading={false}
      onRefresh={refresh}
      onClose={vi.fn()}
    />);

    expect(screen.getByText('Invoices')).toBeTruthy();
    expect(screen.getByText('Telegram topic')).toBeTruthy();
    expect(screen.queryByText('Group topic 4346')).toBeNull();
    expect(screen.getByText('Qwen3.5')).toBeTruthy();
    expect(screen.getByText('12,000 / 131,072 tokens')).toBeTruthy();
    expect(screen.getByText('Workspace: TasTerra. Query mode.')).toBeTruthy();
    expect(screen.getByText('Recorded conversation (1)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Evidence' }));
    expect(screen.getByText('BILL/2026/0041')).toBeTruthy();
    expect(screen.getByText('Ivan Mining | not_paid | 1200 | USD')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open in source' }).getAttribute('href')).toBe(
      'https://odoo.example.test/web#id=41',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Refresh evidence' }));
    expect(refresh).toHaveBeenCalledOnce();
  });
});
