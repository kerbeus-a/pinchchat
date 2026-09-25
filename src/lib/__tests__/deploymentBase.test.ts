import config from '../../../vite.config';
import { readFileSync } from 'node:fs';

describe('deployment base', () => {
  it('builds assets under /kinchat/ for the Kin static mount', () => {
    expect(config.base).toBe('/kinchat/');
  });

  it('does not request static assets from the server root', () => {
    const files = [
      '../../../index.html',
      '../../../public/manifest.json',
      '../../components/Header.tsx',
      '../../components/Sidebar.tsx',
      '../../hooks/useNotifications.ts',
    ];
    const rootAsset = /["']\/(?:logo\.png|favicon-\d+\.png|apple-touch-icon\.png|manifest\.json)["']/;

    for (const file of files) {
      const source = readFileSync(new URL(file, import.meta.url), 'utf8');
      expect(source, file).not.toMatch(rootAsset);
    }
  });
});
