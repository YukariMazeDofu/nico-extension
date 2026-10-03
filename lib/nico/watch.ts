import { FRONTEND_HEADERS, NicoApiError, nicoFetch } from './api';
import type { CommentFork } from './comment';
import { accessRightsHlsUrl, channelUrl, seriesUrl, userUrl, watchUrl } from './urls';

export interface DomandVariant {
  id: string;
  isAvailable: boolean;
  bitRate: number;
  qualityLevel: number;
  label?: string;
  width?: number;
  height?: number;
}

export interface VideoSummary {
  id: string;
  title: string;
}

export interface VideoInfo {
  /** HTML（サニタイズ前） */
  description: string;
  registeredAt: string;
  count: { view: number; comment: number; mylist: number; like: number };
  tags: { name: string; isLocked: boolean }[];
  genre?: string;
  owner?: { kind: 'user' | 'channel'; name: string; iconUrl: string; url: string };
  series?: { title: string; url: string; prev?: VideoSummary; next?: VideoSummary };
}

export interface CommentThreadInfo {
  id: string;
  fork: CommentFork;
  isDefaultPostTarget: boolean;
  isEasyCommentPostTarget: boolean;
  /** チャンネル・コミュニティの動画のスレッド。`184` を付けると投稿できない */
  isThreadkeyRequired: boolean;
  /** 0 は通常、4 は投稿できない、5 は公式が投稿を送らない */
  postkeyStatus: number;
}

export interface WatchData {
  videoId: string;
  title: string;
  info: VideoInfo;
  watchTrackId: string;
  nicosid: string;
  viewer?: { id: number; isPremium: boolean };
  accessRightKey: string;
  videos: DomandVariant[];
  audios: DomandVariant[];
  nvComment: { server: string; threadKey: string; params: unknown };
  commentThreads: CommentThreadInfo[];
  /** true の動画では共有 NG レベルで隠さない */
  ngScoreDisabled: boolean;
}

/** `server-response` の `data.response` のうち使う値 */
interface ServerResponse {
  video: { title: string; description: string; registeredAt: string; count: VideoInfo['count'] };
  tag: { items: { name: string; isLocked: boolean }[] };
  genre?: { label: string; isNotSet: boolean } | null;
  owner?: { id: number; nickname: string; iconUrl: string } | null;
  channel?: { id: string; name: string; thumbnail?: { smallUrl: string } | null } | null;
  series?: { id: number; title: string; video?: { prev?: VideoSummary | null; next?: VideoSummary | null } | null } | null;
  client: { watchTrackId: string; nicosid: string };
  viewer?: { id: number; isPremium: boolean } | null;
  media: { domand: { accessRightKey: string; videos: DomandVariant[]; audios: DomandVariant[] } };
  comment: {
    nvComment: { server: string; threadKey: string; params: unknown };
    threads: {
      id: number | string;
      forkLabel: CommentFork;
      isDefaultPostTarget: boolean;
      isEasyCommentPostTarget: boolean;
      isThreadkeyRequired: boolean;
      postkeyStatus: number;
    }[];
    ng?: { ngScore?: { isDisabled?: boolean } | null } | null;
  };
}

/** `ServerResponse` の必須の値のパスと型 */
const REQUIRED_PATHS: [string, 'string' | 'number' | 'object' | 'array'][] = [
  ['video.title', 'string'],
  ['video.description', 'string'],
  ['video.registeredAt', 'string'],
  ['video.count', 'object'],
  ['tag.items', 'array'],
  ['client.watchTrackId', 'string'],
  ['client.nicosid', 'string'],
  ['media.domand.accessRightKey', 'string'],
  ['media.domand.videos', 'array'],
  ['media.domand.audios', 'array'],
  ['comment.nvComment.server', 'string'],
  ['comment.nvComment.threadKey', 'string'],
  ['comment.threads', 'array'],
];

function assertServerResponse(r: unknown, status: number): asserts r is ServerResponse {
  for (const [path, type] of REQUIRED_PATHS) {
    const v = path.split('.').reduce<any>((o, k) => o?.[k], r);
    const ok = type === 'array' ? Array.isArray(v) : typeof v === type && v !== null;
    if (!ok) throw new NicoApiError(`server-response: data.response.${path} is not ${type}`, status);
  }
}

function videoInfoOf(r: ServerResponse): VideoInfo {
  const summary = (v?: VideoSummary | null): VideoSummary | undefined => (v ? { id: v.id, title: v.title } : undefined);
  const owner = r.owner
    ? { kind: 'user' as const, name: r.owner.nickname, iconUrl: r.owner.iconUrl, url: userUrl(r.owner.id) }
    : r.channel
      ? { kind: 'channel' as const, name: r.channel.name, iconUrl: r.channel.thumbnail?.smallUrl ?? '', url: channelUrl(r.channel.id) }
      : undefined;
  return {
    description: r.video.description,
    registeredAt: r.video.registeredAt,
    count: r.video.count,
    tags: r.tag.items.map((t) => ({ name: t.name, isLocked: t.isLocked })),
    genre: r.genre && !r.genre.isNotSet ? r.genre.label : undefined,
    owner,
    series: r.series
      ? {
          title: r.series.title,
          url: seriesUrl(r.series.id),
          prev: summary(r.series.video?.prev),
          next: summary(r.series.video?.next),
        }
      : undefined,
  };
}

export async function fetchWatchData(videoId: string): Promise<WatchData> {
  const res = await fetch(watchUrl(videoId), { credentials: 'include' });
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
  const content = doc.querySelector('meta[name="server-response"]')?.getAttribute('content');
  if (!content) throw new NicoApiError('server-response not found', res.status);
  const json = JSON.parse(content);
  const r = json.data?.response;
  if (!res.ok || !r?.media?.domand) throw new NicoApiError('watch data unavailable', res.status, json.meta?.code);
  assertServerResponse(r, res.status);
  return {
    videoId,
    title: r.video.title,
    info: videoInfoOf(r),
    watchTrackId: r.client.watchTrackId,
    nicosid: r.client.nicosid,
    viewer: r.viewer ? { id: r.viewer.id, isPremium: r.viewer.isPremium } : undefined,
    accessRightKey: r.media.domand.accessRightKey,
    videos: r.media.domand.videos,
    audios: r.media.domand.audios,
    nvComment: r.comment.nvComment,
    commentThreads: r.comment.threads.map((t) => ({
      id: String(t.id),
      fork: t.forkLabel,
      isDefaultPostTarget: t.isDefaultPostTarget,
      isEasyCommentPostTarget: t.isEasyCommentPostTarget,
      isThreadkeyRequired: t.isThreadkeyRequired,
      postkeyStatus: t.postkeyStatus,
    })),
    ngScoreDisabled: !!r.comment.ng?.ngScore?.isDisabled,
  };
}

export async function fetchHlsContentUrl(w: WatchData): Promise<string> {
  const audio = w.audios.filter((a) => a.isAvailable).sort((a, b) => b.bitRate - a.bitRate)[0];
  if (!audio) throw new NicoApiError('no available audio', 0);
  const outputs = w.videos.filter((v) => v.isAvailable).map((v) => [v.id, audio.id]);
  const data = await nicoFetch<{ contentUrl: string }>('access-rights/hls', accessRightsHlsUrl(w.videoId, w.watchTrackId), {
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
  return data.contentUrl;
}
