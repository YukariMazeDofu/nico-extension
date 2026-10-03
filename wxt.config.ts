import { defineConfig } from 'wxt';

const MINIMUM_CHROME_VERSION = 123;

export default defineConfig({
  targetBrowsers: ['chrome'],
  manifest: {
    name: 'nico-extension',
    minimum_chrome_version: String(MINIMUM_CHROME_VERSION),
    permissions: ['storage', 'declarativeNetRequest'],
    host_permissions: ['https://www.nicovideo.jp/*'],
    declarative_net_request: {
      rule_resources: [{ id: 'direct-watch', enabled: true, path: 'rules.json' }],
    },
  },
  // CSS は light-dark()・nesting を変換せずに出力する
  vite: () => ({ build: { cssTarget: `chrome${MINIMUM_CHROME_VERSION}` } }),
});
