import { log } from '@/lib/log';
import { NicoApiError, postNvapi } from './api';
import type { CommentFork } from './comment';
import { accessRightsHlsUrl, channelUrl, ORIGIN, seriesUrl, userUrl, watchApiUrl, watchLazyUrl, watchUrl } from './urls';

/** watch ページが v3 の形のときの `NicoApiError` の `code` */
export const WATCH_API_V3 = 'WATCH_API_V3';


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

/** 投稿できない理由 */
export type PostNgReason = 'userBanned' | 'videoUnavailable' | 'channelRestriction' | (string & {});

export interface CommentThreadInfo {
  id: string;
  fork: CommentFork;
  isPostTarget: boolean;
  /** `184` を付けると投稿できない */
  is184Forced: boolean;
  /** `null` は投稿できる */
  postNgReason: PostNgReason | null;
  syncBufferTime: number;
}

/** 投稿・ニコるを送らないスレッドの `syncBufferTime` */
const RESTRICTED_SYNC_BUFFER_TIME = 400;

export const isRestrictedThread = (t: CommentThreadInfo) => t.syncBufferTime === RESTRICTED_SYNC_BUFFER_TIME;

export interface WatchData {
  videoId: string;
  title: string;
  /** 動画の長さ（秒） */
  duration?: number;
  info: VideoInfo;
  watchTrackId: string;
  nicosid: string;
  viewer?: { id: number; isPremium: boolean };
  /** 開いたときにいいね！済み */
  liked: boolean;
  accessRightKey: string;
  videos: DomandVariant[];
  audios: DomandVariant[];
  nvComment: { server: string; threadKey: string; params: unknown };
  commentThreads: CommentThreadInfo[];
  /** true の動画では共有 NG レベルで隠さない */
  ngScoreDisabled: boolean;
}

/** `server-response` の `data.response.$watchV4.data`・common の応答の `data` のうち使う値 */
interface WatchResponse {
  responseType?: string;
  video: {
    title: string;
    description: string;
    registeredAt: string;
    duration?: number | null;
    count: VideoInfo['count'];
    isLikedByViewer?: boolean | null;
  };
  tags: { items: { name: string; isLocked: boolean }[] };
  genre?: { label: string; isNotSet: boolean } | null;
  client: { watchTrackId: string; nicosid: string };
  viewer?: { id: number; isPremium: boolean } | null;
  media: { accessRightKey: string; contents: { videos: DomandVariant[]; audios: DomandVariant[] } };
  comment: {
    nvComment: { server: string; threadKey: string; params: unknown };
    threads: {
      id: number | string;
      forkLabel: CommentFork;
      isPostTarget: boolean;
      is184Forced: boolean;
      postNgReason?: PostNgReason | null;
      syncBufferTime: number;
    }[];
    ng?: { ngScore?: { isDisabled?: boolean } | null } | null;
  };
  lazy?: { authKey?: string | null } | null;
}

/** lazy の応答の `data` のうち使う値 */
interface LazyResponse {
  owner?:
    | { type: 'user'; visibility: string; id: number; nickname: string; icon?: { url: string } | null }
    | { type: 'channel'; visibility: string; id: string; name: string; thumbnail?: { smallUrl: string } | null }
    | null;
  series?: { id: number; title: string; video?: { prev?: VideoSummary | null; next?: VideoSummary | null } | null } | null;
}

/** `WatchResponse` の必須の値のパスと型 */
const REQUIRED_PATHS: [string, 'string' | 'number' | 'object' | 'array'][] = [
  ['video.title', 'string'],
  ['video.description', 'string'],
  ['video.registeredAt', 'string'],
  ['video.count', 'object'],
  ['tags.items', 'array'],
  ['client.watchTrackId', 'string'],
  ['client.nicosid', 'string'],
  ['media.accessRightKey', 'string'],
  ['media.contents.videos', 'array'],
  ['media.contents.audios', 'array'],
  ['comment.nvComment.server', 'string'],
  ['comment.nvComment.threadKey', 'string'],
  ['comment.threads', 'array'],
];

const WATCH_API_HEADERS = { 'X-Request-With': ORIGIN };

function assertWatchResponse(r: unknown, status: number, prefix: string): asserts r is WatchResponse {
  for (const [path, type] of REQUIRED_PATHS) {
    const v = path.split('.').reduce<any>((o, k) => o?.[k], r);
    const ok = type === 'array' ? Array.isArray(v) : typeof v === type && v !== null;
    if (!ok) throw new NicoApiError(`${prefix}.${path} is not ${type}`, status);
  }
}

function videoInfoOf(r: WatchResponse): VideoInfo {
  return {
    description: r.video.description,
    registeredAt: r.video.registeredAt,
    count: r.video.count,
    tags: r.tags.items.map((t) => ({ name: t.name, isLocked: t.isLocked })),
    genre: r.genre && !r.genre.isNotSet ? r.genre.label : undefined,
  };
}

function watchDataOf(videoId: string, r: WatchResponse): WatchData {
  return {
    videoId,
    title: r.video.title,
    duration: typeof r.video.duration === 'number' ? r.video.duration : undefined,
    info: videoInfoOf(r),
    watchTrackId: r.client.watchTrackId,
    nicosid: r.client.nicosid,
    viewer: r.viewer ? { id: r.viewer.id, isPremium: r.viewer.isPremium } : undefined,
    liked: !!r.video.isLikedByViewer,
    accessRightKey: r.media.accessRightKey,
    videos: r.media.contents.videos,
    audios: r.media.contents.audios,
    nvComment: r.comment.nvComment,
    commentThreads: r.comment.threads.map((t) => ({
      id: String(t.id),
      fork: t.forkLabel,
      isPostTarget: t.isPostTarget,
      is184Forced: t.is184Forced,
      postNgReason: t.postNgReason ?? null,
      syncBufferTime: t.syncBufferTime,
    })),
    ngScoreDisabled: !!r.comment.ng?.ngScore?.isDisabled,
  };
}

function ownerAndSeriesOf(l: LazyResponse): Pick<VideoInfo, 'owner' | 'series'> {
  const summary = (v?: VideoSummary | null): VideoSummary | undefined => (v ? { id: v.id, title: v.title } : undefined);
  const o = l.owner?.visibility === 'visible' ? l.owner : undefined;
  return {
    owner:
      o?.type === 'user'
        ? { kind: 'user', name: o.nickname, iconUrl: o.icon?.url ?? '', url: userUrl(o.id) }
        : o?.type === 'channel'
          ? { kind: 'channel', name: o.name, iconUrl: o.thumbnail?.smallUrl ?? '', url: channelUrl(o.id) }
          : undefined,
    series: l.series
      ? { title: l.series.title, url: seriesUrl(l.series.id), prev: summary(l.series.video?.prev), next: summary(l.series.video?.next) }
      : undefined,
  };
}

async function postWatchCommon(videoId: string, actionTrackId: string): Promise<WatchResponse> {
  const r = await postNvapi<WatchResponse>(
    'watch common',
    watchApiUrl(videoId),
    { actionTrackId, heartbeat: { method: 'common' } },
    { headers: WATCH_API_HEADERS },
  );
  if (r?.responseType !== 'normal') throw new NicoApiError(`watch common: responseType ${r?.responseType}`, 200);
  assertWatchResponse(r, 200, 'watch common: data');
  return r;
}

/** lazy を呼ぶ。`lazy.authKey` が期限切れなら common で取り直して 1 回だけ再送する。失敗したら投稿者・シリーズなしにする。 */
async function fetchOwnerAndSeries(w: WatchData, authKey: string | null | undefined): Promise<Pick<VideoInfo, 'owner' | 'series'>> {
  const send = async (keyToken: string | null | undefined) => {
    if (!keyToken) throw new NicoApiError('no lazy.authKey', 0);
    const actionTrackId = w.watchTrackId;
    return postNvapi<LazyResponse>('watch lazy', watchLazyUrl(w.videoId, actionTrackId), { actionTrackId, keyToken }, { headers: WATCH_API_HEADERS });
  };
  try {
    const lazy = await send(authKey).catch(async (e) => {
      if (!(e instanceof NicoApiError) || e.code !== 'KEY_EXPIRED') throw e;
      return send((await postWatchCommon(w.videoId, w.watchTrackId)).lazy?.authKey);
    });
    return ownerAndSeriesOf(lazy ?? {});
  } catch (e) {
    log.warn(`watch lazy failed: ${e}`);
    return {};
  }
}

export async function fetchWatchData(videoId: string): Promise<WatchData> {
  const res = await fetch(watchUrl(videoId), { credentials: 'include' });
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
  const content = doc.querySelector('meta[name="server-response"]')?.getAttribute('content');
  if (!content) throw new NicoApiError('server-response not found', res.status);
  const json = JSON.parse(content);
  const r = json.data?.response;
  if (!r?.$watchV4 && r?.media?.domand) {
    log.warn('watch api v3 detected');
    throw new NicoApiError('watch api v3', res.status, WATCH_API_V3);
  }
  const d = r?.$watchV4?.data;
  if (!res.ok || !d) throw new NicoApiError('watch data unavailable', res.status, json.meta?.code);
  assertWatchResponse(d, res.status, 'server-response: data.response.$watchV4.data');
  const w = watchDataOf(videoId, d);
  return { ...w, info: { ...w.info, ...(await fetchOwnerAndSeries(w, d.lazy?.authKey)) } };
}

/** common で watch データを取り直す。`watchTrackId` と `info` は前の値を保つ。 */
export async function fetchWatchCommon(w: WatchData): Promise<WatchData> {
  const r = await postWatchCommon(w.videoId, w.watchTrackId);
  return { ...watchDataOf(w.videoId, r), watchTrackId: w.watchTrackId, info: w.info };
}

export async function fetchHlsContentUrl(w: WatchData): Promise<string> {
  const audio = w.audios.filter((a) => a.isAvailable).sort((a, b) => b.bitRate - a.bitRate)[0];
  if (!audio) throw new NicoApiError('no available audio', 0);
  const outputs = w.videos.filter((v) => v.isAvailable).map((v) => [v.id, audio.id]);
  const data = await postNvapi<{ contentUrl: string }>(
    'access-rights/hls',
    accessRightsHlsUrl(w.videoId, w.watchTrackId),
    { outputs },
    { headers: { 'X-Access-Right-Key': w.accessRightKey, 'X-Request-With': watchUrl(w.videoId) } },
  );
  return data.contentUrl;
}
