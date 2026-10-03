const PANEL_MIN = 320;
const PANEL_MAX = 480;
const NARROW_MAX = 900;
const NARROW_PANEL_VH = 0.3;

export interface FitTargets {
  /** 上段・動画とコントロールの枠・パネルを並べる grid */
  layout: HTMLElement;
  header: HTMLElement;
  player: HTMLElement;
  controls: HTMLElement;
  video: HTMLVideoElement;
}

/**
 * 動画の枠を動画の縦横比（読み込み前は 16:9）に合わせる。横に余った幅はパネル（320〜480px）に回し、それでも余る分は左右の余白にする。
 * 画面の幅が 900px 以下ではパネルを動画の下（画面の高さの 30% 以上）に置く。全画面のあいだは何もしない。
 * 大きさが変わるたびに合わせ直し、合わせ直す関数を返す。
 */
export function mountFit(t: FitTargets, isPinned: () => boolean, signal: AbortSignal): () => void {
  const { layout, header, player, controls, video } = t;
  const fit = () => {
    if (document.fullscreenElement) return;
    const cs = getComputedStyle(layout);
    const colGap = parseFloat(cs.columnGap) || 0;
    const rowGap = parseFloat(cs.rowGap) || 0;
    const width = layout.clientWidth;
    const height = layout.clientHeight - header.offsetHeight - rowGap;
    const controlsHeight = isPinned() ? controls.offsetHeight : 0;
    const aspect = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 16 / 9;
    const narrow = window.innerWidth <= NARROW_MAX;
    layout.classList.toggle('narrow', narrow);
    let videoWidth: number;
    if (narrow) {
      const available = height - window.innerHeight * NARROW_PANEL_VH - rowGap - controlsHeight;
      videoWidth = Math.min(width, available * aspect);
      layout.style.gridTemplateColumns = '';
    } else {
      videoWidth = Math.min(width - PANEL_MIN - colGap, (height - controlsHeight) * aspect);
      const panelWidth = Math.min(PANEL_MAX, Math.max(PANEL_MIN, width - videoWidth - colGap));
      layout.style.gridTemplateColumns = `${videoWidth}px ${panelWidth}px`;
    }
    videoWidth = Math.max(0, videoWidth);
    player.style.width = narrow ? `${videoWidth}px` : '';
    player.style.height = `${videoWidth / aspect + controlsHeight}px`;
  };
  const observer = new ResizeObserver(fit);
  for (const e of [layout, header, controls]) observer.observe(e);
  signal.addEventListener('abort', () => observer.disconnect(), { once: true });
  video.addEventListener('resize', fit, { signal });
  document.addEventListener('fullscreenchange', fit, { signal });
  return fit;
}
