import type { VideoInfo, VideoSummary, WatchData } from '@/lib/nico/watch';
import { ORIGIN, tagUrl, watchUrl } from '@/lib/nico/urls';
import { el, link } from './dom';
import { formatCount, formatDateTime } from './format';
import { type IconName, icon } from './icons';

const ALLOWED_TAGS = new Set(['A', 'B', 'BR', 'DIV', 'EM', 'FONT', 'I', 'P', 'S', 'SPAN', 'STRONG', 'U']);
const COLOR = /^(#[0-9a-f]{3,8}|[a-z]+)$/i;
const SEEK_TIME = /^(?:(\d+):)?(\d+):(\d{2})$/;

/** `m:ss`・`h:mm:ss` を秒にする。形が違えば `undefined`。 */
function parseSeekTime(text: string): number | undefined {
  const m = SEEK_TIME.exec(text);
  if (!m) return undefined;
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

function seekTimeButton(seconds: number) {
  const b = el('button', 'seek-time');
  b.type = 'button';
  b.title = 'この位置へ移動';
  b.dataset.seconds = String(seconds);
  return b;
}

function watchLink(v: VideoSummary, label: string) {
  const a = link(watchUrl(v.id), '', 'series-video');
  a.title = v.title;
  a.append(el('small', '', label), el('span', '', v.title));
  return a;
}

/**
 * 説明文の HTML を、許可した要素と属性（`a` の http(s) の `href`、`font` の `color`）だけで組み直す。
 * `a.seekTime` は `data-seektime` の秒数を `data-seconds` に持つ `button.seek-time` にする。
 */
export function sanitizeDescription(html: string): DocumentFragment {
  const src = new DOMParser().parseFromString(html, 'text/html').body;
  const copy = (from: Node, to: Node) => {
    for (const n of from.childNodes) {
      if (n.nodeType === Node.TEXT_NODE) {
        to.appendChild(document.createTextNode(n.textContent ?? ''));
      } else if (n instanceof Element) {
        if (!ALLOWED_TAGS.has(n.tagName)) {
          copy(n, to);
          continue;
        }
        let e: HTMLElement;
        if (n.tagName === 'A' && n.classList.contains('seekTime')) {
          const seconds = parseSeekTime(n.getAttribute('data-seektime') ?? '');
          if (seconds === undefined) {
            copy(n, to);
            continue;
          }
          e = seekTimeButton(seconds);
        } else if (n.tagName === 'A') {
          const href = URL.parse(n.getAttribute('href') ?? '', ORIGIN);
          if (!href || !/^https?:$/.test(href.protocol)) {
            copy(n, to);
            continue;
          }
          e = link(href.href, '');
        } else {
          e = document.createElement(n.tagName.toLowerCase());
          const color = n.tagName === 'FONT' ? n.getAttribute('color') : null;
          if (color && COLOR.test(color)) e.style.color = color;
        }
        copy(n, e);
        to.appendChild(e);
      }
    }
  };
  const out = document.createDocumentFragment();
  copy(src, out);
  return out;
}

function stat(name: IconName, label: string, value: number) {
  const e = el('span', 'stat');
  e.title = label;
  e.append(icon(name), formatCount(value));
  return e;
}

/** 上段: タイトル・投稿日時と各カウント（いいね！を除く）・タグ */
export function renderHeader(root: HTMLElement, w: WatchData) {
  const { info } = w;
  const meta = el('div', 'meta');
  meta.append(
    el('span', 'date', formatDateTime(info.registeredAt)),
    stat('view', '再生', info.count.view),
    stat('comment', 'コメント', info.count.comment),
    stat('mylist', 'マイリスト', info.count.mylist),
  );
  const tags = el('div', 'tags');
  for (const t of info.tags) {
    const a = link(tagUrl(t.name), t.name, t.isLocked ? 'tag locked' : 'tag');
    if (t.isLocked) {
      a.title = 'ロックされたタグ';
      a.prepend(icon('lock'));
    }
    tags.append(a);
  }
  const title = el('h1', 'title', w.title);
  title.title = w.title;
  root.replaceChildren(title, meta, tags);
}

/** 右側: 投稿者・ジャンル・シリーズ・説明文。説明文の再生位置を押すと `seekTo` を呼ぶ。 */
export function renderPanel(root: HTMLElement, info: VideoInfo, seekTo: (seconds: number) => void) {
  const children: Node[] = [];
  if (info.owner) {
    const owner = link(info.owner.url, '', 'owner');
    const avatar = el('img', 'owner-icon');
    avatar.src = info.owner.iconUrl;
    avatar.alt = '';
    const name = el('span', 'owner-name', info.owner.name);
    name.append(el('small', '', info.owner.kind === 'channel' ? 'チャンネル' : '投稿者'));
    owner.append(avatar, name);
    children.push(owner);
  }
  const facts = el('dl', 'facts');
  if (info.genre) facts.append(el('dt', '', 'ジャンル'), el('dd', '', info.genre));
  if (info.series) {
    const series = el('dd', 'series');
    series.append(link(info.series.url, info.series.title, 'series-title'));
    const nav = el('div', 'series-nav');
    if (info.series.prev) nav.append(watchLink(info.series.prev, '前'));
    if (info.series.next) nav.append(watchLink(info.series.next, '次'));
    if (nav.childElementCount) series.append(nav);
    facts.append(el('dt', '', 'シリーズ'), series);
  }
  if (facts.childElementCount) children.push(facts);
  const description = el('div', 'description');
  description.append(sanitizeDescription(info.description));
  description.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('.seek-time');
    if (b) seekTo(Number(b.dataset.seconds));
  });
  children.push(description);
  root.replaceChildren(...children);
}
