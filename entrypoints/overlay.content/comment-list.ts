import type { CommentFork, NvComment, NvThread } from '@/lib/nico/comment';
import { cancelNicoru, type NicoruBlock, nicoru, nicoruBlockOf } from '@/lib/nico/nicoru';
import type { WatchContext } from '@/lib/nico/session';
import { NicoApiError } from '@/lib/nico/watch';
import { commentListSettings } from '@/lib/settings';
import { icon } from './icons';

const BLOCK_TEXT: Record<NicoruBlock, string> = {
  notLoggedIn: 'ログインするとニコれます',
  owner: '投稿者コメントはニコれません',
  restricted: 'このアカウントではニコれません',
};

interface Row {
  comment: NvComment;
  threadId: string;
  fork: CommentFork;
  element: HTMLElement;
}

export interface CommentListHooks {
  log(msg: string): void;
  notify(msg: string): void;
  onCount(count: number): void;
}

export interface CommentList {
  readonly element: HTMLElement;
  /** 再生位置への追従を切り替えるチェックボックス */
  readonly followToggle: HTMLElement;
  setThreads(threads: NvThread[]): void;
  /** 表示中で、追従がオンのときだけ再生位置に合わせてスクロールする */
  setActive(active: boolean): void;
}

const formatVpos = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const formatPostedAt = (iso: string) =>
  new Date(iso).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

function errorText(e: unknown): string {
  if (e instanceof NicoApiError && (e.code === 'FORBIDDEN' || e.code === 'PREMIUM_ONLY')) return 'プレミアム会員のみニコれます';
  if (e instanceof NicoApiError) return `ニコるに失敗しました (${e.code ?? e.status})`;
  return 'ニコるに失敗しました';
}

/** 右パネルのコメント一覧。再生位置に追従してスクロールし、ニコる・取り消しができる。 */
export function mountCommentList(video: HTMLVideoElement, context: Promise<WatchContext>, hooks: CommentListHooks): CommentList {
  const { log } = hooks;
  const root = document.createElement('div');
  root.className = 'clist';
  const empty = document.createElement('p');
  empty.className = 'clist-empty';
  empty.textContent = '読み込み中…';
  root.append(empty);

  const followToggle = document.createElement('label');
  followToggle.className = 'follow';
  followToggle.title = '再生位置に合わせて一覧をスクロールする';
  const followInput = document.createElement('input');
  followInput.type = 'checkbox';
  followInput.checked = true;
  followToggle.append(followInput, '自動スクロール');

  let ctx: WatchContext | undefined;
  let rows: Row[] = [];
  const rowByElement = new WeakMap<Element, Row>();
  let active = false;
  let hovering = false;
  let current: HTMLElement | undefined;
  const busy = new Set<NvComment>();
  context.then(
    (c) => {
      ctx = c;
      rows.forEach(renderNicoru);
    },
    () => (empty.textContent = ''),
  );

  function renderNicoru(row: Row) {
    const button = row.element.querySelector<HTMLButtonElement>('.nicoru')!;
    const { comment } = row;
    const block = ctx && nicoruBlockOf(ctx.data, row.threadId, row.fork);
    button.disabled = !ctx || !!block || busy.has(comment);
    button.setAttribute('aria-pressed', String(!!comment.nicoruId));
    button.classList.toggle('zero', !comment.nicoruCount);
    button.title = block ? BLOCK_TEXT[block] : comment.nicoruId ? 'ニコるを取り消す' : 'ニコる';
    button.replaceChildren(icon('nicoru'), comment.nicoruCount ? String(comment.nicoruCount) : '');
  }

  function rowOf(c: NvComment, threadId: string, fork: CommentFork): Row {
    const e = document.createElement('div');
    e.className = `crow${fork === 'owner' ? ' owner' : ''}${c.isMyPost ? ' mine' : ''}`;
    const vpos = document.createElement('button');
    vpos.className = 'vpos';
    vpos.textContent = formatVpos(c.vposMs);
    vpos.title = 'この位置へ移動';
    const body = document.createElement('span');
    body.className = 'cbody';
    body.textContent = c.body;
    body.title = `${c.body}\n${formatPostedAt(c.postedAt)}${fork === 'owner' ? '（投稿者）' : ''}`;
    const button = document.createElement('button');
    button.className = 'nicoru';
    e.append(vpos, body, button);
    const row = { comment: c, threadId, fork, element: e };
    rowByElement.set(e, row);
    renderNicoru(row);
    return row;
  }

  /** 再生位置より前の最後のコメントを一覧の下端に合わせる */
  const follow = () => {
    if (!rows.length) return;
    const t = video.currentTime * 1000;
    let lo = 0;
    let hi = rows.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (rows[mid]!.comment.vposMs <= t) lo = mid + 1;
      else hi = mid;
    }
    const row = rows[Math.max(0, lo - 1)]!.element;
    if (row !== current) {
      current?.classList.remove('current');
      row.classList.add('current');
      current = row;
    }
    if (active && followInput.checked && !hovering) root.scrollTop = row.offsetTop + row.offsetHeight - root.clientHeight;
  };

  const toggleNicoru = async (row: Row) => {
    const { comment } = row;
    if (!ctx || busy.has(comment)) return;
    busy.add(comment);
    renderNicoru(row);
    try {
      if (comment.nicoruId) {
        await cancelNicoru(comment.nicoruId);
        comment.nicoruId = null;
        comment.nicoruCount = Math.max(0, comment.nicoruCount - 1);
      } else {
        const r = await nicoru(ctx.data, row.threadId, row.fork, comment);
        log(`nicoru: ${JSON.stringify(r)}`);
        comment.nicoruId = r.nicoruId;
        comment.nicoruCount = r.nicoruCount;
      }
    } catch (e) {
      log(`nicoru failed: ${e instanceof NicoApiError ? `${e.status} ${e.code}` : e}`);
      hooks.notify(errorText(e));
    } finally {
      busy.delete(comment);
      renderNicoru(row);
    }
  };

  root.addEventListener('click', (e) => {
    const target = e.target as Element;
    const crow = target.closest('.crow');
    const row = crow && rowByElement.get(crow);
    if (!row) return;
    if (target.closest('.vpos')) video.currentTime = row.comment.vposMs / 1000;
    else if (target.closest('.nicoru')) toggleNicoru(row);
  });
  root.addEventListener('pointerenter', () => (hovering = true));
  root.addEventListener('pointerleave', () => {
    hovering = false;
    follow();
  });
  followInput.addEventListener('change', () => {
    commentListSettings.setValue({ follow: followInput.checked });
    follow();
  });
  commentListSettings.getValue().then((v) => {
    followInput.checked = v.follow;
    follow();
  });
  video.addEventListener('timeupdate', follow);
  video.addEventListener('seeked', follow);

  return {
    element: root,
    followToggle,
    setThreads(threads) {
      rows = threads
        .flatMap((t) => t.comments.map((c) => rowOf(c, t.id, t.fork)))
        .sort((a, b) => a.comment.vposMs - b.comment.vposMs || a.comment.no - b.comment.no);
      current = undefined;
      empty.textContent = 'コメントはありません';
      root.replaceChildren(...(rows.length ? rows.map((r) => r.element) : [empty]));
      hooks.onCount(rows.length);
      follow();
    },
    setActive(a) {
      active = a;
      follow();
    },
  };
}
