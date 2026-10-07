import { HOST, ORIGIN } from './urls';

const WATCH_PATH = /^\/watch\/((?:sm|nm|so)\d+)\/?$/;
const FROM = /^\d+(?:\.\d+)?$/;
/** `/watch/{id}` のページ遷移のリダイレクト先（`public/rules.json`） */
const DIRECT_PATH = /^\/nico-ext\/watch\/((?:sm|nm|so)\d+)\/?$/;

export function watchIdFromAnchor(a: HTMLAnchorElement): string | undefined {
  if (a.hostname !== HOST) return undefined;
  return WATCH_PATH.exec(a.pathname)?.[1];
}

export function watchIdFromDirectPath(pathname: string): string | undefined {
  return DIRECT_PATH.exec(pathname)?.[1];
}

/** URL のクエリの `from`（秒、整数）。0 以上の数でなければ `undefined` */
export function fromSecOf(href: string): number | undefined {
  const value = new URL(href, ORIGIN).searchParams.get('from');
  return value !== null && FROM.test(value) ? Math.floor(Number(value)) : undefined;
}
