import './style.css';
import { watchIdFromAnchor } from '@/lib/nico/link';
import { createPlayer, type Player } from './player';

export default defineContentScript({
  matches: ['https://www.nicovideo.jp/*'],
  cssInjectionMode: 'ui',

  main(ctx) {
    let close: (() => void) | undefined;

    const log = (msg: string) => console.info(`[nico-ext] ${msg}`);

    const open = async (videoId: string) => {
      close?.();
      const ui = await createShadowRootUi<Player>(ctx, {
        name: 'nico-ext-overlay',
        position: 'modal',
        zIndex: 2147483647,
        isolateEvents: true,
        onMount(container) {
          const backdrop = document.createElement('div');
          backdrop.className = 'backdrop';
          const video = document.createElement('video');
          video.controls = true;
          const button = document.createElement('button');
          button.className = 'close';
          button.textContent = '✕';
          button.addEventListener('click', () => close?.());
          backdrop.append(video, button);
          container.append(backdrop);
          return createPlayer(video, videoId, log);
        },
        onRemove(player) {
          player?.destroy();
        },
      });
      ui.mount();
      close = () => {
        ui.remove();
        close = undefined;
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

    ctx.addEventListener(document, 'keydown', (e) => {
      if (e.key === 'Escape') close?.();
    });
  },
});
