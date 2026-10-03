import { type IconName, icon } from './icons';

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text) e.textContent = text;
  return e;
}

export function iconButton(className: string, name: IconName): HTMLButtonElement {
  const b = el('button', className);
  b.type = 'button';
  b.append(icon(name));
  return b;
}

export const setIcon = (b: HTMLButtonElement, name: IconName) => b.replaceChildren(icon(name));

/** 新しいタブで開くリンク */
export function link(href: string, text: string, className = ''): HTMLAnchorElement {
  const a = el('a', className, text);
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener';
  return a;
}
