import { log } from '@/lib/log';
import { NicoApiError } from '@/lib/nico/api';
import { cancelLike, fetchThanksMessage, like, likeBlocked } from '@/lib/nico/like';
import type { WatchContext } from '@/lib/nico/session';
import { el } from './dom';
import { formatCount } from './format';
import { icon } from './icons';

const TEXT = {
  notLoggedIn: 'ログインすると「いいね！」できます',
  notLiked: 'いいね！すると、お礼メッセージがあればここに出ます',
  loading: '読み込み中…',
  none: 'お礼メッセージはありません',
  failed: 'お礼メッセージを読み込めませんでした',
};

export interface LikeBoxHooks {
  notify(msg: string): void;
}

function errorText(e: unknown, liking: boolean): string {
  const text = liking ? '「いいね！」に失敗しました' : '「いいね！」の取り消しに失敗しました';
  return e instanceof NicoApiError ? `${text} (${e.code ?? e.status})` : text;
}

const errorLog = (e: unknown) => (e instanceof NicoApiError ? `${e.status} ${e.code}` : String(e));

/** 右パネルのいいね！の欄。1 行目にボタンと数、その下にお礼メッセージを出す。 */
export function mountLikeBox(context: Promise<WatchContext>, hooks: LikeBoxHooks): HTMLElement {
  const root = el('div', 'like');
  const button = el('button', 'like-button');
  button.type = 'button';
  const message = el('div', 'like-message');
  root.append(button, message);

  let videoId: string | undefined;
  let blocked = false;
  let liked = false;
  let count = 0;
  let busy = false;
  /** お礼メッセージの欄を書き換えるたびに増やす。取得の結果は、取得を始めたときの値のままのときだけ出す */
  let messageSeq = 0;

  const render = () => {
    button.disabled = !videoId || blocked || busy;
    button.setAttribute('aria-pressed', String(liked));
    button.title = blocked ? TEXT.notLoggedIn : liked ? '「いいね！」を取り消す' : '「いいね！」する';
    button.replaceChildren(icon('like'), 'いいね！', el('span', 'like-count', videoId ? formatCount(count) : ''));
  };
  const setMessage = (text: string, status = true) => {
    messageSeq++;
    message.textContent = text;
    message.classList.toggle('status', status);
  };
  const showThanks = (thanks: string | undefined) => setMessage(thanks ?? TEXT.none, !thanks);

  const loadThanks = (id: string) => {
    setMessage(TEXT.loading);
    const seq = messageSeq;
    fetchThanksMessage(id).then(
      (thanks) => {
        log(`like: thanks message ${thanks ? 'loaded' : 'empty'}`);
        if (seq === messageSeq) showThanks(thanks);
      },
      (e) => {
        log(`like: thanks message failed: ${errorLog(e)}`);
        if (seq === messageSeq) setMessage(TEXT.failed);
      },
    );
  };

  render();
  context.then(
    ({ data: w }) => {
      videoId = w.videoId;
      blocked = likeBlocked(w);
      liked = w.liked;
      count = w.info.count.like;
      render();
      if (blocked) setMessage(TEXT.notLoggedIn);
      else if (!liked) setMessage(TEXT.notLiked);
      else if (w.info.owner?.kind === 'user') loadThanks(w.videoId);
      else setMessage(TEXT.none);
    },
    () => {},
  );

  button.addEventListener('click', async () => {
    if (!videoId || blocked || busy) return;
    const liking = !liked;
    busy = true;
    render();
    try {
      if (liking) {
        showThanks(await like(videoId));
        count++;
      } else {
        await cancelLike(videoId);
        setMessage(TEXT.notLiked);
        count = Math.max(0, count - 1);
      }
      liked = liking;
      log(`like: ${liking ? 'liked' : 'cancelled'}`);
    } catch (e) {
      log(`like: ${liking ? 'like' : 'cancel'} failed: ${errorLog(e)}`);
      hooks.notify(errorText(e, liking));
    } finally {
      busy = false;
      render();
    }
  });
  // 画面の幅が 900px 以下のとき、1 行に省略する表示と 3 行の表示を切り替える
  message.addEventListener('click', () => root.closest('.window.narrow') && message.classList.toggle('expanded'));

  return root;
}
