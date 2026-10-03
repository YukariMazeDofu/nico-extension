import type { WatchContext } from './session';
import { FRONTEND_HEADERS, NicoApiError, type WatchData } from './watch';

export type CommentFork = 'owner' | 'main' | 'easy';

export interface NvComment {
  id: string;
  no: number;
  vposMs: number;
  body: string;
  commands: string[];
  userId: string;
  isPremium: boolean;
  score: number;
  postedAt: string;
  nicoruCount: number;
  /** 自分がニコったコメントなら取り消しに使う ID */
  nicoruId: string | null;
  source: string;
  isMyPost: boolean;
}

export interface NvThread {
  id: string;
  fork: CommentFork;
  commentCount: number;
  comments: NvComment[];
}

async function postThreads(w: WatchData): Promise<NvThread[]> {
  const { server, threadKey, params } = w.nvComment;
  const res = await fetch(`${server}/v1/threads`, {
    method: 'POST',
    headers: {
      ...FRONTEND_HEADERS,
      'Content-Type': 'text/plain;charset=UTF-8',
      'X-Client-Os-Type': 'others',
    },
    body: JSON.stringify({ params, threadKey, additionals: {} }),
  });
  const json = await res.json();
  if (!res.ok) throw new NicoApiError('nvcomment threads failed', res.status, json.meta?.errorCode);
  return json.data.threads;
}

/** nvcomment のスレッドへの書き込み。Cookie は送らず、ボディは JSON の文字列（`Content-Type` なし）。 */
export function sendToThread(w: WatchData, method: string, path: string, body: unknown): Promise<Response> {
  return fetch(`${w.nvComment.server}/v1/threads/${path}?pc=1`, {
    method,
    headers: { ...FRONTEND_HEADERS, 'X-Client-Os-Type': 'others' },
    credentials: 'omit',
    body: JSON.stringify(body),
  });
}

/** `threadKey` が拒否されたら watch ページを取り直して 1 回だけ再試行する。 */
export async function fetchCommentThreads(ctx: WatchContext): Promise<NvThread[]> {
  try {
    return await postThreads(await ctx.fresh('threadKey'));
  } catch (e) {
    if (!(e instanceof NicoApiError) || e.status < 400 || e.status >= 500) throw e;
    return postThreads(await ctx.refresh());
  }
}
