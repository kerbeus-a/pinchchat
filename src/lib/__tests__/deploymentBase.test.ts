import config from '../../../vite.config';

describe('deployment base', () => {
  it('builds assets under /kinchat/ for the Kin static mount', () => {
    expect(config.base).toBe('/kinchat/');
  });
});
