import { NicoApiError } from './api';
import { sendToThread } from './comment';
import { dropCommentKey, withCommentKey } from './keys';
import type { CommentThreadInfo, WatchData } from './watch';

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

/** 通常のスレッドに投稿する。`184` のないコマンドには `184` を足す（`isThreadkeyRequired` のスレッドを除く）。 */
export async function postComment(w: WatchData, draft: CommentDraft): Promise<PostedComment> {
  const thread = postThreadOf(w);
  if (!thread) throw new NicoApiError('no post target thread', 0);
  let commands = draft.commands;
  if (thread.isThreadkeyRequired) {
    if (commands.includes('184')) throw new Invalid184Error();
  } else if (!commands.includes('184')) {
    commands = [...commands, '184'];
  }
  const query = { threadId: thread.id };
  return withCommentKey('post', query, async (key: PostKey) => {
    if (key.challenge?.isRequired) throw new ChallengeRequiredError();
    const posted = await sendToThread<PostedComment>(w, 'comment post', 'POST', `${thread.id}/comments`, {
      videoId: w.videoId,
      commands,
      body: draft.body,
      vposMs: draft.vposMs,
      postKey: key.postKey,
    });
    if (posted.shouldRefreshKey) dropCommentKey('post', query);
    return posted;
  });
}
