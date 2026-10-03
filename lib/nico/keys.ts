import { FRONTEND_HEADERS, NicoApiError, NVAPI } from './watch';

export type CommentKeyKind = 'post' | 'nicoru';

const keys = new Map<string, Promise<unknown>>();

const cacheKey = (kind: CommentKeyKind, query: Record<string, string>) => `${kind}?${new URLSearchParams(query)}`;

/** `GET nvapi /v1/comment/keys/{kind}` の `data`。同じ引数の鍵は使い回す。 */
export function commentKey<T>(kind: CommentKeyKind, query: Record<string, string>): Promise<T> {
  const k = cacheKey(kind, query);
  let key = keys.get(k);
  if (!key) {
    key = (async () => {
      const res = await fetch(`${NVAPI}/v1/comment/keys/${kind}?${new URLSearchParams({ ...query, pc: '1' })}`, {
        credentials: 'include',
        headers: FRONTEND_HEADERS,
      });
      const json = await res.json();
      if (!res.ok) throw new NicoApiError(`comment/keys/${kind} failed`, res.status, json.meta?.errorCode);
      return json.data;
    })();
    key.catch(() => keys.delete(k));
    keys.set(k, key);
  }
  return key as Promise<T>;
}

export function dropCommentKey(kind: CommentKeyKind, query: Record<string, string>) {
  keys.delete(cacheKey(kind, query));
}
