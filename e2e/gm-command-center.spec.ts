import { expect, test, type APIRequestContext } from '@playwright/test';

const bridgeUrl = (process.env.KINCHAT_E2E_BRIDGE ?? 'http://127.0.0.1:3142/kinchat/v1').replace(/\/$/, '');
const appUrl = process.env.KINCHAT_E2E_APP_URL ?? 'http://127.0.0.1:5174/kinchat/';
const webToken = process.env.KINCHAT_E2E_TOKEN;
const agent = process.env.KINCHAT_E2E_AGENT ?? 'yuri';
const canRunWithoutToken = !/^https?:\/\/(?:localhost|127\.|0\.0\.0\.0|\[::1\])/i.test(bridgeUrl);

test.skip(!webToken && !canRunWithoutToken, 'Set KINCHAT_E2E_TOKEN or use a LAN no-auth bridge URL');

async function issueGmToken(request: APIRequestContext): Promise<string> {
  const headers = webToken ? { Authorization: `Bearer ${webToken}` } : undefined;
  const res = await request.post(`${bridgeUrl}/api/gm/auth/bootstrap?agent=${encodeURIComponent(agent)}`, {
    headers,
  });
  expect(res.ok()).toBe(true);
  const body = await res.json() as { token?: string };
  expect(body.token).toBeTruthy();
  return body.token!;
}

async function gmRequest(
  request: APIRequestContext,
  gmToken: string,
  method: 'get' | 'post',
  path: string,
  data?: Record<string, unknown>,
) {
  const sep = path.includes('?') ? '&' : '?';
  return await request[method](`${bridgeUrl}${path}${sep}agent=${encodeURIComponent(agent)}`, {
    headers: { Authorization: `Bearer ${gmToken}` },
    data,
  });
}

async function cleanupMarker(request: APIRequestContext, marker: string): Promise<void> {
  const gmToken = await issueGmToken(request);
  const missionsRes = await gmRequest(request, gmToken, 'get', '/api/gm/missions');
  if (!missionsRes.ok()) return;
  const body = await missionsRes.json() as { missions?: Array<{ id: string; goal?: string; title?: string; status?: string }> };
  const missions = (body.missions ?? []).filter((mission) =>
    `${mission.title ?? ''}\n${mission.goal ?? ''}`.includes(marker),
  );

  for (const mission of missions) {
    const detailRes = await gmRequest(request, gmToken, 'get', `/api/gm/missions/${encodeURIComponent(mission.id)}`);
    if (detailRes.ok()) {
      const detail = await detailRes.json() as { tasks?: Array<{ id: string; status?: string }> };
      for (const task of detail.tasks ?? []) {
        if (!['cancelled', 'completed'].includes(task.status ?? '')) {
          await gmRequest(request, gmToken, 'post', `/api/gm/tasks/${encodeURIComponent(task.id)}/cancel`, {
            reason: 'playwright cleanup',
          });
        }
      }
    }
    if (!['cancelled', 'completed'].includes(mission.status ?? '')) {
      await gmRequest(request, gmToken, 'post', `/api/gm/missions/${encodeURIComponent(mission.id)}/cancel`, {
        reason: 'playwright cleanup',
      });
    }
  }
}

test('operator can see, communicate with, and manage GM delegated work', async ({ page, request }) => {
  const marker = `PW-GM-${Date.now()}`;
  const missionText = `Browser GM mission ${marker}`;
  const taskTitle = `Browser task ${marker}`;
  const steeringText = `Steering note ${marker}`;

  try {
    await page.addInitScript(({ bridgeUrl, webToken }) => {
      const credentials: { bridgeUrl: string; agent: string; token?: string } = {
        bridgeUrl,
        agent: 'yuri',
      };
      if (webToken) credentials.token = webToken;
      window.localStorage.setItem('pinchchat_hermes_credentials', JSON.stringify({
        ...credentials,
      }));
    }, { bridgeUrl, webToken });

    await page.goto(appUrl, { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('link', { name: 'General Manager' })).toBeVisible();
    await page.getByRole('link', { name: 'General Manager' }).click();
    await expect(page.getByRole('heading', { name: 'General Manager' })).toBeVisible();

    await page.getByLabel('GM command').fill(missionText);
    await page.getByLabel('Acceptance criteria').fill('mission visible\ntask steering works');
    await page.getByRole('button', { name: 'Create mission' }).click();
    await expect(page.getByRole('heading', { name: missionText })).toBeVisible();

    await page.getByPlaceholder('Task title').fill(taskTitle);
    await page.getByPlaceholder('Objective').fill('Verify browser-managed GM task control.');
    await page.getByRole('button', { name: 'Add task' }).click();
    await expect(page.getByText(taskTitle)).toBeVisible();

    await page.getByLabel('Task steering note').fill(steeringText);
    await page.getByRole('button', { name: 'Send note' }).click();
    await expect(page.getByText(steeringText)).toBeVisible();

    await expect(page.getByRole('button', { name: 'Retry task' })).toBeEnabled();
    await page.getByRole('button', { name: 'Pause mission' }).click();
    await expect(page.getByRole('button', { name: 'Resume mission' })).toBeEnabled();
    await page.getByRole('button', { name: 'Resume mission' }).click();
    await expect(page.getByRole('button', { name: 'Pause mission' })).toBeEnabled();

    await page.getByRole('button', { name: 'Cancel task' }).click();
    await expect(page.getByText('cancelled').first()).toBeVisible();
    await page.getByRole('button', { name: 'Cancel mission' }).click();
    await expect(page.getByRole('button', { name: 'Send note' })).toBeDisabled();

  } finally {
    await page.evaluate(() => window.localStorage.removeItem('pinchchat_hermes_credentials')).catch(() => undefined);
    await cleanupMarker(request, marker);
  }
});
