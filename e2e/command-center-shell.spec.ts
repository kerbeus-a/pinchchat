import { expect, test, type Page, type Route } from '@playwright/test';

const appUrl = process.env.KINCHAT_E2E_APP_URL ?? 'http://127.0.0.1:5174/kinchat/';
const bridgeUrl = 'http://127.0.0.1:5174/kinchat/v1';

interface ScopeState {
  workspaceId: 'tasterra' | 'other-company' | 'home' | 'everything';
  mode: 'query' | 'action';
  sourceIds: string[];
  persisted: boolean;
}

function json(route: Route, body: unknown) {
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

async function mockCommandCenter(page: Page) {
  const scopes = new Map<string, ScopeState>();
  const defaultScope: ScopeState = { workspaceId: 'tasterra', mode: 'query', sourceIds: [], persisted: true };
  const sources = [
    {
      id: 'mail-tasterra', workspaceId: 'tasterra', connectorId: 's1t5', displayName: 'TasTerra mail archive',
      capabilities: ['search', 'get', 'binary'], enabled: true,
      health: { status: 'healthy', message: null, lastCheckedAt: '2026-09-24T12:00:00Z', lastSuccessAt: '2026-09-24T11:59:00Z' },
    },
    {
      id: 'docs-tasterra', workspaceId: 'tasterra', connectorId: 'paperless', displayName: 'TasTerra documents',
      capabilities: ['search', 'get', 'binary'], enabled: true,
      health: { status: 'healthy', message: null, lastCheckedAt: '2026-09-24T12:00:00Z', lastSuccessAt: '2026-09-24T11:58:00Z' },
    },
  ];

  await page.addInitScript(({ bridgeUrl }) => {
    window.localStorage.setItem('pinchchat_hermes_credentials', JSON.stringify({ bridgeUrl, agent: 'yuri' }));
  }, { bridgeUrl });

  await page.route('**/kinchat/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/kinchat/v1', '');

    if (path === '/api/identity') return json(route, { member_id: 'yuri', name: 'Yuri', agentId: 'yuri', is_admin: true });
    if (path === '/api/sessions') return json(route, { sessions: [{ id: 'session-1', title: 'Invoice review', message_count: 2, last_active: 1_795_000_000, channel: 'Web' }] });
    if (path.endsWith('/messages')) return json(route, { messages: [] });
    if (path === '/api/workspaces') return json(route, { workspaces: [
      { id: 'tasterra', label: 'TasTerra', description: 'TasTerra operations and finances', ownerOnly: false },
      { id: 'other-company', label: 'Other Company', description: 'Other business records', ownerOnly: false },
      { id: 'home', label: 'Home', description: 'Household and personal records', ownerOnly: false },
      { id: 'everything', label: 'Everything', description: 'Cross-workspace research', ownerOnly: true },
    ] });
    if (/^\/api\/sessions\/[^/]+\/scope$/.test(path)) {
      const sessionId = decodeURIComponent(path.split('/')[3] ?? 'session-1');
      if (request.method() === 'PUT') {
        const body = request.postDataJSON() as { workspace_id: ScopeState['workspaceId']; mode: ScopeState['mode']; source_ids?: string[] };
        const scope = { workspaceId: body.workspace_id, mode: body.mode, sourceIds: body.source_ids ?? [], persisted: true };
        scopes.set(sessionId, scope);
        return json(route, { scope });
      }
      return json(route, { scope: scopes.get(sessionId) ?? defaultScope });
    }
    if (/^\/api\/sessions\/[^/]+\/evidence$/.test(path)) {
      return json(route, { evidence: [{
        answerMessageId: '9', citationLabel: '1', connectorStatus: 'complete', id: 'ref-1',
        workspaceId: 'tasterra', sourceId: 'odoo-tasterra', sourceType: 'odoo_record',
        externalId: 'vendor_bill:41', title: 'BILL/2026/0041', occurredAt: '2026-09-20',
        excerpt: 'Ivan Mining | not_paid | 1200 | USD', capturedAt: '2026-09-25T00:00:00Z',
        locator: { deepLink: 'https://odoo.example.test/web#id=41' },
      }] });
    }
    if (path === '/api/sources') {
      return json(route, { sources: url.searchParams.get('workspace') === 'tasterra' ? sources : [] });
    }
    if (path === '/api/gm/outcomes') return json(route, { outcomes: [] });
    return json(route, {});
  });
}

test('desktop command center exposes scope, navigation, sources, and evidence', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockCommandCenter(page);
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('application', { name: 'Kin command center' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Workspace' })).toHaveValue('tasterra');
  await expect(page.getByRole('button', { name: 'query' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('2 healthy')).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Evidence panel' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Evidence panel' }).getByText('BILL/2026/0041')).toBeVisible();

  await page.getByRole('button', { name: 'Sources' }).first().click();
  await expect(page.getByRole('heading', { name: 'Sources' })).toBeVisible();
  const sourcesView = page.getByRole('region', { name: 'Sources' });
  await expect(sourcesView.getByText('TasTerra mail archive')).toBeVisible();
  await expect(sourcesView.getByText('TasTerra documents')).toBeVisible();

  await page.getByRole('button', { name: 'action' }).click();
  await expect(page.getByRole('button', { name: 'action' })).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: 'test-results/command-center-desktop.png', fullPage: true });
});

test('mobile command center keeps navigation and evidence accessible', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockCommandCenter(page);
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });

  const mobileNavigation = page.getByRole('navigation', { name: 'Command center' }).last();
  await expect(mobileNavigation).toBeVisible();
  await expect(page.locator('#chat-input')).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Workspace' }).locator('option:checked')).toHaveText('TasTerra');
  await page.screenshot({ path: 'test-results/command-center-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Open evidence' }).click();
  await expect(page.getByRole('complementary', { name: 'Evidence panel' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Session context' })).toBeVisible();
  await page.screenshot({ path: 'test-results/command-center-mobile-evidence.png', fullPage: true });
});
