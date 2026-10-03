import { type CommentFork, type NvComment, sendToThread } from './comment';
import { commentKey, dropCommentKey } from './keys';
import { FRONTEND_HEADERS, NicoApiError, NVAPI, type WatchData } from './watch';

/** ニコれない理由 */
export type NicoruBlock = 'notLoggedIn' | 'owner' | 'restricted';

export interface Nicorued {
  nicoruId: string;
  nicoruCount: number;
}

export function nicoruBlockOf(w: WatchData, threadId: string, fork: CommentFork): NicoruBlock | undefined {
  if (!w.viewer) return 'notLoggedIn';
  if (fork === 'owner') return 'owner';
  const thread = w.commentThreads.find((t) => t.id === threadId && t.fork === fork);
  if (thread?.postkeyStatus === 5) return 'restricted';
  return undefined;
}

/** コメントをニコる。鍵の期限切れ（`EXPIRED_TOKEN`）では鍵を取り直して 1 回だけ再送する。 */
export async function nicoru(w: WatchData, threadId: string, fork: CommentFork, c: Pick<NvComment, 'no' | 'body'>): Promise<Nicorued> {
  const query = { threadId, fork };
  for (let retried = false; ; retried = true) {
    const { nicoruKey } = await commentKey<{ nicoruKey: string }>('nicoru', query);
    const res = await sendToThread(w, 'POST', `${threadId}/nicorus`, { videoId: w.videoId, fork, no: c.no, content: c.body, nicoruKey });
    const json = await res.json();
    if (res.ok) return json.data;
    dropCommentKey('nicoru', query);
    const code = json.meta?.errorCode;
    if (retried || code !== 'EXPIRED_TOKEN') throw new NicoApiError('nicoru failed', res.status, code);
  }
}

export async function cancelNicoru(nicoruId: string): Promise<void> {
  const res = await fetch(`${NVAPI}/v1/users/me/nicoru/send/${encodeURIComponent(nicoruId)}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: { ...FRONTEND_HEADERS, 'X-Request-With': 'nicovideo' },
  });
  if (!res.ok) {
    const json = await res.json().catch(() => undefined);
    throw new NicoApiError('nicoru cancel failed', res.status, json?.meta?.errorCode);
  }
}
