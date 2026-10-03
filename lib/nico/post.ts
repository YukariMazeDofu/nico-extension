import { FRONTEND_HEADERS, NicoApiError, type CommentThreadInfo, type WatchData } from './watch';

const NVAPI = 'https://nvapi.nicovideo.jp';

/** 投稿できない理由 */
export type PostBlock = 'notLoggedIn' | 'noThread' | 'banned' | 'restricted';

/** 鍵の応答が Cloudflare Turnstile の確認を求めた */
export class ChallengeRequiredError extends Error {
  constructor() {
    super('challenge required');
  }
}

/** チャンネル・コミュニティの動画のスレッドに `184` を付けた */
export class Invalid184Error extends Error {
  constructor() {
    super('184 is not allowed');
  }
}

interface PostKey {
  postKey: string;
  challenge?: { isRequired: boolean; siteKey?: string };
}

export interface CommentDraft {
  body: string;
  commands: string[];
  vposMs: number;
}

export interface PostedComment {
  id: string;
  no: number;
  shouldRefreshKey?: boolean;
}

const postThreadOf = (w: WatchData): CommentThreadInfo | undefined => w.commentThreads.find((t) => t.isDefaultPostTarget);

export function postBlockOf(w: WatchData): PostBlock | undefined {
  if (!w.viewer) return 'notLoggedIn';
  const thread = postThreadOf(w);
  if (!thread) return 'noThread';
  if (thread.postkeyStatus === 4) return 'banned';
  if (thread.postkeyStatus === 5) return 'restricted';
  return undefined;
}

/** 鍵はスレッドごとに使い回す */
const postKeys = new Map<string, Promise<PostKey>>();

function postKeyOf(threadId: string): Promise<PostKey> {
  let key = postKeys.get(threadId);
  if (!key) {
    key = (async () => {
      const res = await fetch(`${NVAPI}/v1/comment/keys/post?threadId=${threadId}&pc=1`, {
        credentials: 'include',
        headers: FRONTEND_HEADERS,
      });
      const json = await res.json();
      if (!res.ok) throw new NicoApiError('comment/keys/post failed', res.status, json.meta?.errorCode);
      return json.data;
    })();
    key.catch(() => postKeys.delete(threadId));
    postKeys.set(threadId, key);
  }
  return key;
}

/** 通常のスレッドに投稿する。鍵の期限切れ（`EXPIRED_TOKEN`）では鍵を取り直して 1 回だけ再送する。 */
export async function postComment(w: WatchData, draft: CommentDraft): Promise<PostedComment> {
  const thread = postThreadOf(w);
  if (!thread) throw new NicoApiError('no post target thread', 0);
  let commands = draft.commands;
  if (thread.isThreadkeyRequired) {
    if (commands.includes('184')) throw new Invalid184Error();
  } else if (!commands.includes('184')) {
    commands = [...commands, '184'];
  }
  for (let retried = false; ; retried = true) {
    const key = await postKeyOf(thread.id);
    if (key.challenge?.isRequired) throw new ChallengeRequiredError();
    const res = await fetch(`${w.nvComment.server}/v1/threads/${thread.id}/comments?pc=1`, {
      method: 'POST',
      headers: { ...FRONTEND_HEADERS, 'X-Client-Os-Type': 'others' },
      body: JSON.stringify({ videoId: w.videoId, commands, body: draft.body, vposMs: draft.vposMs, postKey: key.postKey }),
    });
    const json = await res.json();
    if (res.ok) {
      if (json.data.shouldRefreshKey) postKeys.delete(thread.id);
      return json.data;
    }
    postKeys.delete(thread.id);
    const code = json.meta?.errorCode;
    if (retried || code !== 'EXPIRED_TOKEN') throw new NicoApiError('comment post failed', res.status, code);
  }
}
