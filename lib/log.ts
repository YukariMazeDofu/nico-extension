const PREFIX = '[nico-ext]';

/** console の同じ名前のメソッドに `[nico-ext]` を付けて出す。 */
export const log = {
  debug: (msg: string) => console.debug(`${PREFIX} ${msg}`),
  info: (msg: string) => console.info(`${PREFIX} ${msg}`),
  warn: (msg: string) => console.warn(`${PREFIX} ${msg}`),
  error: (msg: string) => console.error(`${PREFIX} ${msg}`),
};
