import { FRONTEND_HEADERS, nicoFetch } from './api';
import { type CommentFork, type NvComment, sendToThread } from './comment';
import { withCommentKey } from './keys';
import { NVAPI } from './urls';
import type { WatchData } from './watch';

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

export function nicoru(w: WatchData, threadId: string, fork: CommentFork, c: Pick<NvComment, 'no' | 'body'>): Promise<Nicorued> {
  return withCommentKey('nicoru', { threadId, fork }, ({ nicoruKey }: { nicoruKey: string }) =>
    sendToThread<Nicorued>(w, 'nicoru', 'POST', `${threadId}/nicorus`, { videoId: w.videoId, fork, no: c.no, content: c.body, nicoruKey }),
  );
}

export async function cancelNicoru(nicoruId: string): Promise<void> {
  await nicoFetch('nicoru cancel', `${NVAPI}/v1/users/me/nicoru/send/${encodeURIComponent(nicoruId)}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: { ...FRONTEND_HEADERS, 'X-Request-With': 'nicovideo' },
  });
}
