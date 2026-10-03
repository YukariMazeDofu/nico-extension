import './style.css';
import { officialWatchUrl, watchIdFromAnchor, watchIdFromDirectPath } from '@/lib/nico/link';
import { watchUrl } from '@/lib/nico/watch';
import { mountPlayerUi, type PlayerUi } from './controls';
import { icon } from './icons';
import { mountThemeSwitch } from './theme';

const LEAVE_FALLBACK_MS = 300;

/** 履歴を戻る。戻れなければトップページへ移る。 */
function leave() {
  let leaving = false;
  window.addEventListener('beforeunload', () => (leaving = true), { once: true });
  if (history.length > 1) history.back();
  setTimeout(() => leaving || location.replace('/'), history.length > 1 ? LEAVE_FALLBACK_MS : 0);
}

const isPlainClick = (e: MouseEvent) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

/** URL を一時的に書き換えて訪問済み（`:visited`）にする。履歴の項目は増やさない。 */
function markVisited(urls: string[]) {
  const current = location.href;
  for (const url of new Set(urls)) history.replaceState(history.state, '', url);
  history.replaceState(history.state, '', current);
}

export default defineContentScript({
  matches: ['https://www.nicovideo.jp/*'],
  cssInjectionMode: 'ui',

  main(ctx) {
    let close: (() => void) | undefined;
    let playerUi: PlayerUi | undefined;
    // `/watch/{id}` を直接開いたときは、リダイレクト先のページで開いて閉じたらページを離れる
    const directId = watchIdFromDirectPath(location.pathname);

    const log = (msg: string) => console.info(`[nico-ext] ${msg}`);

    const open = async (videoId: string, href?: string) => {
      close?.();
      markVisited([watchUrl(videoId), ...(href ? [href] : [])]);
      const ui = await createShadowRootUi<{ ui: PlayerUi; destroyTheme(): void }>(ctx, {
        name: 'nico-ext-overlay',
        position: 'modal',
        isolateEvents: true,
        onMount(container) {
          // WXT はホストに zIndex を付けるが、シャドウルートのリセット `:host{all:initial !important}` で打ち消される
          container.style.zIndex = '2147483647';
          const backdrop = document.createElement('div');
          backdrop.className = 'backdrop';
          const button = document.createElement('button');
          button.className = 'close';
          button.append(icon('close'));
          button.title = '閉じる (Esc)';
          button.setAttribute('aria-label', '閉じる');
          button.addEventListener('click', () => close?.());
          const official = document.createElement('button');
          official.className = 'official';
          official.append(icon('external'), '公式で開く');
          official.title = '公式プレイヤーで開く';
          official.addEventListener('click', () => {
            if (directId) location.replace(officialWatchUrl(videoId));
            else location.assign(officialWatchUrl(videoId));
          });
          container.append(backdrop);
          // オーバーレイ内の動画リンクは、オーバーレイでその動画に切り替える
          backdrop.addEventListener('click', (e) => {
            if (!isPlainClick(e)) return;
            const a = (e.target as Element | null)?.closest('a');
            const id = a && watchIdFromAnchor(a);
            if (!id) return;
            e.preventDefault();
            if (directId) location.assign(watchUrl(id));
            else open(id, a.href);
          });
          const theme = mountThemeSwitch(backdrop);
          const mounted = mountPlayerUi(backdrop, videoId, { log, actions: [theme.element, official, button] });
          playerUi = mounted;
          return { ui: mounted, destroyTheme: theme.destroy };
        },
        onRemove(mounted) {
          mounted?.ui.destroy();
          mounted?.destroyTheme();
        },
      });
      ui.mount();
      if (directId) {
        close = leave;
        playerUi?.context.then((c) => (document.title = `${c.data.title} - ニコニコ動画`), () => {});
        return;
      }
      close = () => {
        ui.remove();
        close = undefined;
        playerUi = undefined;
      };
    };

    if (directId) {
      history.replaceState(history.state, '', `/watch/${directId}${location.search}${location.hash}`);
      open(directId);
    }

    ctx.addEventListener(
      document,
      'click',
      (e) => {
        if (!isPlainClick(e)) return;
        const a = (e.target as Element | null)?.closest('a');
        const videoId = a && watchIdFromAnchor(a);
        if (!videoId) return;
        e.preventDefault();
        e.stopPropagation();
        open(videoId, a.href);
      },
      { capture: true },
    );

    ctx.addEventListener(
      window,
      'keydown',
      (e) => {
        if (!playerUi) return;
        e.stopPropagation();
        // 入力欄と設定のスライダーではキーをそのまま使い、Esc で抜ける
        const target = e.composedPath()[0];
        if (target instanceof HTMLInputElement && (target.type === 'text' || target.classList.contains('setting-range'))) {
          if (e.key === 'Escape') target.blur();
          return;
        }
        if (e.key === 'Escape') {
          if (!document.fullscreenElement) close?.();
        } else if (playerUi.handleKey(e)) {
          e.preventDefault();
        }
      },
      { capture: true },
    );
  },
});
