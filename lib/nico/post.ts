import { NicoApiError } from './api';
import { sendToThread } from './comment';
import { dropCommentKey, withCommentKey } from './keys';
import { type CommentThreadInfo, isRestrictedThread, type PostNgReason, type WatchData } from './watch';

/** 投稿できない理由 */
export type PostBlock = 'notLoggedIn' | 'noThread' | 'banned' | 'restricted';

/** 鍵の応答が Cloudflare Turnstile の確認を求めた */
export class ChallengeRequiredError extends Error {
  constructor() {
    super('challenge required');
  }
}

/** `is184Forced` のスレッドに `184` を付けた */
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

const postThreadOf = (w: WatchData): CommentThreadInfo | undefined => w.commentThreads.find((t) => t.isPostTarget);

const POST_NG_BLOCKS: Partial<Record<PostNgReason, PostBlock>> = {
  userBanned: 'banned',
  videoUnavailable: 'noThread',
  channelRestriction: 'noThread',
};

export function postBlockOf(w: WatchData): PostBlock | undefined {
  if (!w.viewer) return 'notLoggedIn';
  const thread = postThreadOf(w);
  if (!thread) return 'noThread';
  const block = thread.postNgReason ? POST_NG_BLOCKS[thread.postNgReason] : undefined;
  if (block) return block;
  if (isRestrictedThread(thread)) return 'restricted';
  return undefined;
}

/** 投稿先（`isPostTarget`）のスレッドに投稿する。`184` のないコマンドには `184` を足す（`is184Forced` のスレッドを除く）。 */
export async function postComment(w: WatchData, draft: CommentDraft): Promise<PostedComment> {
  const thread = postThreadOf(w);
  if (!thread) throw new NicoApiError('no post target thread', 0);
  let commands = draft.commands;
  if (thread.is184Forced) {
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
