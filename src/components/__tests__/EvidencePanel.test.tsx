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
      scope={{ workspaceId: 'tasterra', mode: 'query', sourceIds: [], persisted: true }}
      workspaceLabel="TasTerra"
      evidence={evidence}
      loading={false}
      onRefresh={refresh}
      onClose={vi.fn()}
    />);

    expect(screen.getByText('BILL/2026/0041')).toBeTruthy();
    expect(screen.getByText('Ivan Mining | not_paid | 1200 | USD')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open in source' }).getAttribute('href')).toBe(
      'https://odoo.example.test/web#id=41',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Refresh evidence' }));
    expect(refresh).toHaveBeenCalledOnce();
  });
});
