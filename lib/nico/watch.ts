export const FRONTEND_ID = '6';

export const FRONTEND_HEADERS = {
  'X-Frontend-Id': FRONTEND_ID,
  'X-Frontend-Version': '0',
};

export interface DomandVariant {
  id: string;
  isAvailable: boolean;
  bitRate: number;
  qualityLevel: number;
  label?: string;
  width?: number;
  height?: number;
}

export interface WatchData {
  videoId: string;
  watchTrackId: string;
  nicosid: string;
  viewer?: { id: number; isPremium: boolean };
  accessRightKey: string;
  videos: DomandVariant[];
  audios: DomandVariant[];
  nvComment: { server: string; threadKey: string; params: unknown };
}

export class NicoApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

export const watchUrl = (videoId: string) => `https://www.nicovideo.jp/watch/${videoId}`;

export const accessRightsHlsUrl = (w: WatchData) =>
  `https://nvapi.nicovideo.jp/v1/watch/${w.videoId}/access-rights/hls?actionTrackId=${w.watchTrackId}`;

export async function fetchWatchData(videoId: string): Promise<WatchData> {
  const res = await fetch(watchUrl(videoId), { credentials: 'include' });
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
  const content = doc.querySelector('meta[name="server-response"]')?.getAttribute('content');
  if (!content) throw new NicoApiError('server-response not found', res.status);
  const json = JSON.parse(content);
  const r = json.data?.response;
  if (!res.ok || !r?.media?.domand) throw new NicoApiError('watch data unavailable', res.status, json.meta?.code);
  return {
    videoId,
    watchTrackId: r.client.watchTrackId,
    nicosid: r.client.nicosid,
    viewer: r.viewer ? { id: r.viewer.id, isPremium: r.viewer.isPremium } : undefined,
    accessRightKey: r.media.domand.accessRightKey,
    videos: r.media.domand.videos,
    audios: r.media.domand.audios,
    nvComment: r.comment.nvComment,
  };
}

export async function fetchHlsContentUrl(w: WatchData): Promise<string> {
  const audio = w.audios.filter((a) => a.isAvailable).sort((a, b) => b.bitRate - a.bitRate)[0];
  if (!audio) throw new NicoApiError('no available audio', 0);
  const outputs = w.videos.filter((v) => v.isAvailable).map((v) => [v.id, audio.id]);
  const res = await fetch(accessRightsHlsUrl(w), {
    method: 'POST',
    credentials: 'include',
    headers: {
      ...FRONTEND_HEADERS,
      'Content-Type': 'application/json',
      'X-Access-Right-Key': w.accessRightKey,
      'X-Request-With': watchUrl(w.videoId),
    },
    body: JSON.stringify({ outputs }),
  });
  const json = await res.json();
  if (!res.ok) throw new NicoApiError('access-rights/hls failed', res.status, json.meta?.errorCode);
  return json.data.contentUrl;
}
