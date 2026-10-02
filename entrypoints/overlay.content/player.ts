import Hls from 'hls.js';
import hlsWorkerSource from 'hls.js/dist/hls.worker.js?raw';
import { fetchHlsContentUrl, fetchWatchData } from '@/lib/nico/watch';

const workerPath = URL.createObjectURL(new Blob([hlsWorkerSource], { type: 'text/javascript' }));

export interface Player {
  destroy(): void;
}

export function createPlayer(video: HTMLVideoElement, videoId: string, log: (msg: string) => void): Player {
  const hls = new Hls({
    workerPath,
    maxMaxBufferLength: 60,
    xhrSetup: (xhr) => {
      xhr.withCredentials = true;
    },
  });
  hls.on(Hls.Events.MANIFEST_PARSED, (_, d) => log(`manifest parsed: ${d.levels.length} levels`));
  hls.on(Hls.Events.KEY_LOADED, () => log('key loaded'));
  hls.on(Hls.Events.FRAG_LOADED, (_, d) => log(`frag loaded: ${d.frag.type} sn=${d.frag.sn}`));
  hls.on(Hls.Events.ERROR, (_, d) => log(`hls error: ${d.type} ${d.details} fatal=${d.fatal}`));
  video.addEventListener('playing', () => log('video playing'));
  video.addEventListener('timeupdate', () => log(`time ${video.currentTime.toFixed(1)}`), { once: true });

  (async () => {
    const watch = await fetchWatchData(videoId);
    log(`watch data: ${watch.videos.length} videos, ${watch.audios.length} audios`);
    const url = await fetchHlsContentUrl(watch);
    log('content url acquired');
    hls.loadSource(url);
    hls.attachMedia(video);
    await video.play().catch((e) => log(`play() rejected: ${e}`));
  })().catch((e) => log(`load failed: ${e}`));

  return { destroy: () => hls.destroy() };
}
