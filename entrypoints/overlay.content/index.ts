import './style.css';
import { watchIdFromAnchor } from '@/lib/nico/link';
import { mountPlayerUi, type PlayerUi } from './controls';

export default defineContentScript({
  matches: ['https://www.nicovideo.jp/*'],
  cssInjectionMode: 'ui',

  main(ctx) {
    let close: (() => void) | undefined;
    let playerUi: PlayerUi | undefined;

    const log = (msg: string) => console.info(`[nico-ext] ${msg}`);

    const open = async (videoId: string) => {
      close?.();
      const ui = await createShadowRootUi<PlayerUi>(ctx, {
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
          button.textContent = '✕';
          button.title = '閉じる (Esc)';
          button.addEventListener('click', () => close?.());
          container.append(backdrop);
          playerUi = mountPlayerUi(backdrop, videoId, log);
          backdrop.append(button);
          return playerUi;
        },
        onRemove(mounted) {
          mounted?.destroy();
        },
      });
      ui.mount();
      close = () => {
        ui.remove();
        close = undefined;
        playerUi = undefined;
      };
    };

    ctx.addEventListener(
      document,
      'click',
      (e) => {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        const a = (e.target as Element | null)?.closest('a');
        const videoId = a && watchIdFromAnchor(a);
        if (!videoId) return;
        e.preventDefault();
        e.stopPropagation();
        open(videoId);
      },
      { capture: true },
    );

    ctx.addEventListener(
      window,
      'keydown',
      (e) => {
        if (!playerUi) return;
        e.stopPropagation();
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
