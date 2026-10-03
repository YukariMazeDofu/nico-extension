import type { VideoInfo, VideoSummary, WatchData } from '@/lib/nico/watch';
import { ORIGIN, tagUrl, watchUrl } from '@/lib/nico/urls';
import { el, link } from './dom';
import { formatCount, formatDateTime } from './format';
import { type IconName, icon } from './icons';

const ALLOWED_TAGS = new Set(['A', 'B', 'BR', 'DIV', 'EM', 'FONT', 'I', 'P', 'S', 'SPAN', 'STRONG', 'U']);
const COLOR = /^(#[0-9a-f]{3,8}|[a-z]+)$/i;

function watchLink(v: VideoSummary, label: string) {
  const a = link(watchUrl(v.id), '', 'series-video');
  a.title = v.title;
  a.append(el('small', '', label), el('span', '', v.title));
  return a;
}

/** 説明文の HTML を、許可した要素と属性（`a` の http(s) の `href`、`font` の `color`）だけで組み直す。 */
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
        if (n.tagName === 'A') {
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

/** 上段: タイトル・投稿日時と各カウント・タグ */
export function renderHeader(root: HTMLElement, w: WatchData) {
  const { info } = w;
  const meta = el('div', 'meta');
  meta.append(
    el('span', 'date', formatDateTime(info.registeredAt)),
    stat('view', '再生', info.count.view),
    stat('comment', 'コメント', info.count.comment),
    stat('mylist', 'マイリスト', info.count.mylist),
    stat('like', 'いいね', info.count.like),
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

/** 右側: 投稿者・ジャンル・シリーズ・説明文 */
export function renderPanel(root: HTMLElement, info: VideoInfo) {
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
  children.push(description);
  root.replaceChildren(...children);
}
