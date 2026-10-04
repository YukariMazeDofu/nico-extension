import { log } from '@/lib/log';
import { NicoApiError } from '@/lib/nico/api';
import { ChallengeRequiredError, Invalid184Error, type PostBlock, postBlockOf, postComment } from '@/lib/nico/post';
import type { WatchContext } from '@/lib/nico/session';
import { el } from './dom';

const BLOCK_TEXT: Record<PostBlock, string> = {
  notLoggedIn: 'ログインするとコメントできます',
  noThread: 'この動画にはコメントできません',
  banned: 'コメントの投稿が制限されています',
  restricted: 'このアカウントではコメントを送れません。公式で開いて投稿してください',
};

export interface CommentFormHooks {
  notify(msg: string): void;
  onPosted(): void;
}

export interface CommentForm {
  readonly element: HTMLFormElement;
  focus(): void;
}

function errorText(e: unknown): string {
  if (e instanceof ChallengeRequiredError) return '確認が必要です。公式で開いて投稿してください';
  if (e instanceof Invalid184Error) return 'この動画では 184 を使えません';
  if (e instanceof NicoApiError) return `投稿に失敗しました (${e.code ?? e.status})`;
  return '投稿に失敗しました';
}

/** コマンド欄と本文の入力欄。Enter で今の再生位置に投稿する。 */
export function mountCommentForm(video: HTMLVideoElement, context: Promise<WatchContext>, hooks: CommentFormHooks): CommentForm {
  const form = el('form', 'post');
  const commands = el('input', 'post-commands');
  commands.placeholder = 'コマンド';
  commands.title = 'コマンド（例: ue red big）';
  const body = el('input', 'post-body');
  body.placeholder = '読み込み中…';
  const submit = el('button', 'post-submit', 'コメント');
  for (const e of [commands, body]) {
    e.type = 'text';
    e.autocomplete = 'off';
    e.spellcheck = false;
  }
  form.append(commands, body, submit);

  let ctx: WatchContext | undefined;
  let posting = false;
  const setEnabled = (enabled: boolean) => {
    for (const e of [commands, body, submit]) e.disabled = !enabled;
  };
  setEnabled(false);
  context.then(
    (c) => {
      ctx = c;
      const block = postBlockOf(c.data);
      body.placeholder = block ? BLOCK_TEXT[block] : 'コメントを入力 (Enter で送信)';
      setEnabled(!block);
    },
    () => (body.placeholder = ''),
  );

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = body.value.trim();
    if (!ctx || posting || !text) return;
    posting = true;
    setEnabled(false);
    const draft = { body: text, commands: commands.value.split(/\s+/).filter(Boolean), vposMs: Math.floor(video.currentTime * 1000) };
    try {
      const posted = await postComment(ctx.data, draft);
      log.info(`comment posted: ${JSON.stringify(posted)}`);
      body.value = '';
      hooks.onPosted();
    } catch (err) {
      log.warn(`comment post failed: ${err instanceof NicoApiError ? `${err.status} ${err.code}` : err}`);
      hooks.notify(errorText(err));
    } finally {
      posting = false;
      setEnabled(true);
      body.focus();
    }
  });

  return {
    element: form,
    focus: () => body.disabled || body.focus(),
  };
}
