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
  // CSS は light-dark()・nesting を変換せずに出力する。変換した light-dark()（space toggle の変数）は Dark Reader に書き換えられ、背景色と文字色が消える
  vite: () => ({ build: { cssTarget: `chrome${MINIMUM_CHROME_VERSION}` } }),
});
