import { FRONTEND_HEADERS, nicoFetch } from './api';
import { NVAPI, ORIGIN } from './urls';
import type { WatchData } from './watch';

interface LikeData {
  thanksMessage?: string | null;
}

const likeUrl = (videoId: string) => `${NVAPI}/v1/users/me/likes/items?${new URLSearchParams({ videoId })}`;

const SEND_HEADERS = { ...FRONTEND_HEADERS, 'X-Request-With': ORIGIN };

const thanksOf = (data: LikeData | undefined) => data?.thanksMessage || undefined;

/** いいね！できないとき true */
export const likeBlocked = (w: WatchData) => !w.viewer;

/** いいね！し、お礼メッセージを返す。 */
export async function like(videoId: string): Promise<string | undefined> {
  return thanksOf(await nicoFetch<LikeData>('like', likeUrl(videoId), { method: 'POST', credentials: 'include', headers: SEND_HEADERS }));
}

export async function cancelLike(videoId: string): Promise<void> {
  await nicoFetch('like cancel', likeUrl(videoId), { method: 'DELETE', credentials: 'include', headers: SEND_HEADERS });
}

/** いいね！済みの動画のお礼メッセージ */
export async function fetchThanksMessage(videoId: string): Promise<string | undefined> {
  return thanksOf(await nicoFetch<LikeData>('thanks message', likeUrl(videoId), { credentials: 'include', headers: FRONTEND_HEADERS }));
}
