import { defineConfig } from 'wxt';

export default defineConfig({
  targetBrowsers: ['chrome'],
  manifest: {
    name: 'nico-extension',
    permissions: ['storage', 'declarativeNetRequest'],
    host_permissions: ['https://www.nicovideo.jp/*'],
    declarative_net_request: {
      rule_resources: [{ id: 'direct-watch', enabled: true, path: 'rules.json' }],
    },
  },
});
