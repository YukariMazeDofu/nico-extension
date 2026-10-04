import Hls, { type Level } from 'hls.js';
import hlsWorkerSource from 'hls.js/dist/hls.worker.js?raw';
import { log } from '@/lib/log';
import { NicoApiError } from '@/lib/nico/api';
import { WatchEventTracker } from '@/lib/nico/heartbeat';
import { WatchContext } from '@/lib/nico/session';
import { type DomandVariant, fetchHlsContentUrl, WATCH_API_V4 } from '@/lib/nico/watch';
import { startPositionOf } from '@/lib/resume';
import { type PlayerSettings, playerSettings } from '@/lib/settings';

const workerPath = URL.createObjectURL(new Blob([hlsWorkerSource], { type: 'text/javascript' }));

const RECOVER_INTERVAL_MS = 30_000;
const WATCH_API_V4_MESSAGE = 'ニコニコ動画の視聴の仕組みが変わりました。拡張の更新が必要です。「公式で開く」で再生できます';

const isWatchApiV4 = (e: unknown) => e instanceof NicoApiError && e.code === WATCH_API_V4;

export const AUTO_LEVEL = -1;

export interface Quality {
  level: number;
  label: string;
  height: number;
}

export interface PlayerHooks {
  onQualityChange(): void;
  onError(msg: string): void;
}

export interface Player {
  /** 高い順。自動は含まない */
  readonly qualities: Quality[];
  readonly selectedLevel: number;
  readonly playingQuality: Quality | undefined;
  readonly context: Promise<WatchContext>;
  setQuality(level: number): void;
}

function qualityOf(level: Level, index: number, videos: DomandVariant[]): Quality {
  const variant = videos.find((v) => level.uri.includes(`/${v.id}.m3u8`));
  return { level: index, label: variant?.label ?? `${level.height}p`, height: level.height };
}

function levelForHeight(qualities: Quality[], maxHeight: number): number {
  return (qualities.find((q) => q.height <= maxHeight) ?? qualities.at(-1))?.level ?? AUTO_LEVEL;
}

/** `signal` の abort でハートビートの `end` を送り、hls.js を止める。 */
export function createPlayer(video: HTMLVideoElement, videoId: string, hooks: PlayerHooks, signal: AbortSignal): Player {
  let hls: Hls | undefined;
  let ctx: WatchContext | undefined;
  let tracker: WatchEventTracker | undefined;
  let lastRecoverAt = 0;
  let qualities: Quality[] = [];
  let selectedLevel = AUTO_LEVEL;
  let settings: PlayerSettings | undefined;
  const context = WatchContext.load(videoId);
  const start = startPositionOf(videoId);

  const save = (patch: Partial<PlayerSettings>) => {
    if (!settings) return;
    settings = { ...settings, ...patch };
    playerSettings.setValue(settings);
  };

  const applyQuality = (h: Hls) => {
    const pref = settings?.quality ?? 'auto';
    selectedLevel = pref === 'auto' ? AUTO_LEVEL : levelForHeight(qualities, pref);
    h.currentLevel = selectedLevel;
    hooks.onQualityChange();
  };

  const attach = (url: string, startPosition: number) => {
    hls?.destroy();
    const h = new Hls({
      workerPath,
      startPosition,
      maxMaxBufferLength: 60,
      xhrSetup: (xhr) => {
        xhr.withCredentials = true;
      },
    });
    hls = h;
    h.on(Hls.Events.MANIFEST_PARSED, (_, d) => {
      log.debug(`manifest parsed: ${d.levels.length} levels`);
      qualities = d.levels.map((l, i) => qualityOf(l, i, ctx?.data.videos ?? [])).sort((a, b) => b.height - a.height);
      applyQuality(h);
    });
    h.on(Hls.Events.LEVEL_SWITCHED, (_, d) => {
      log.debug(`level switched: ${d.level}`);
      hooks.onQualityChange();
    });
    h.on(Hls.Events.ERROR, (_, d) => {
      (d.fatal ? log.warn : log.debug)(`hls error: ${d.type} ${d.details} fatal=${d.fatal} status=${d.response?.code ?? '-'}`);
      if (!d.fatal) return;
      if (d.type === Hls.ErrorTypes.MEDIA_ERROR) h.recoverMediaError();
      else recover();
    });
    h.loadSource(url);
    h.attachMedia(video);
  };

  const recover = async () => {
    if (!ctx || Date.now() - lastRecoverAt < RECOVER_INTERVAL_MS) {
      hooks.onError('再生できなくなりました');
      return;
    }
    lastRecoverAt = Date.now();
    const position = video.currentTime;
    const paused = video.paused;
    try {
      if (!ctx.isFresh('accessRightKey')) log.info('access right key expired, refetching watch data');
      const url = await fetchHlsContentUrl(await ctx.fresh('accessRightKey'));
      if (signal.aborted) return;
      log.info(`session recreated at ${position.toFixed(1)}`);
      attach(url, position);
      if (!paused) await video.play().catch((e) => log.info(`play() rejected: ${e}`));
    } catch (e) {
      log.error(`recover failed: ${e}`);
      hooks.onError(isWatchApiV4(e) ? WATCH_API_V4_MESSAGE : '再生できなくなりました');
    }
  };

  window.addEventListener('pagehide', () => tracker?.end(video.currentTime * 1000, true), { signal });
  signal.addEventListener(
    'abort',
    () => {
      tracker?.end(video.currentTime * 1000);
      hls?.destroy();
    },
    { once: true },
  );

  const on = (type: keyof HTMLMediaElementEventMap, listener: () => void) => video.addEventListener(type, listener, { signal });
  on('play', () => tracker?.play());
  on('playing', () => tracker?.setWatching(true));
  on('pause', () => tracker?.setWatching(false));
  on('ended', () => tracker?.countEnd());
  on('volumechange', () => save({ volume: video.volume, muted: video.muted }));
  on('ratechange', () => {
    video.defaultPlaybackRate = video.playbackRate;
    save({ playbackRate: video.playbackRate });
  });

  (async () => {
    settings = await playerSettings.getValue();
    video.volume = settings.volume;
    video.muted = settings.muted;
    video.defaultPlaybackRate = video.playbackRate = settings.playbackRate;
    ctx = await context;
    if (signal.aborted) return;
    log.info(`watch data: ${ctx.data.videos.length} videos, ${ctx.data.audios.length} audios`);
    tracker = new WatchEventTracker(ctx);
    tracker.start();
    const url = await fetchHlsContentUrl(ctx.data);
    if (signal.aborted) return;
    log.debug('content url acquired');
    attach(url, await start);
    await video.play().catch((e) => log.info(`play() rejected: ${e}`));
  })().catch((e) => {
    log.error(`load failed: ${e}`);
    hooks.onError(isWatchApiV4(e) ? WATCH_API_V4_MESSAGE : `読み込めませんでした（${e.code ?? e.message}）`);
  });

  return {
    get qualities() {
      return qualities;
    },
    get selectedLevel() {
      return selectedLevel;
    },
    get playingQuality() {
      return hls ? qualities.find((q) => q.level === hls?.currentLevel) : undefined;
    },
    context,
    setQuality(level) {
      const q = qualities.find((x) => x.level === level);
      save({ quality: q ? q.height : 'auto' });
      if (hls) applyQuality(hls);
    },
  };
}
