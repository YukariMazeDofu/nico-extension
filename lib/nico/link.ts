const WATCH_PATH = /^\/watch\/((?:sm|nm|so)\d+)\/?$/;

export function watchIdFromAnchor(a: HTMLAnchorElement): string | undefined {
  if (a.hostname !== 'www.nicovideo.jp') return undefined;
  return WATCH_PATH.exec(a.pathname)?.[1];
}
