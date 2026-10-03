import { FRONTEND_HEADERS, NicoApiError, nicoFetch } from './api';
import { NVAPI } from './urls';

export type CommentKeyKind = 'post' | 'nicoru';

const keys = new Map<string, Promise<unknown>>();

const cacheKey = (kind: CommentKeyKind, query: Record<string, string>) => `${kind}?${new URLSearchParams(query)}`;

/** `GET nvapi /v1/comment/keys/{kind}` の `data`。同じ引数の鍵は使い回す。 */
function commentKey<K>(kind: CommentKeyKind, query: Record<string, string>): Promise<K> {
  const k = cacheKey(kind, query);
  let key = keys.get(k);
  if (!key) {
    key = nicoFetch(`comment/keys/${kind}`, `${NVAPI}/v1/comment/keys/${kind}?${new URLSearchParams({ ...query, pc: '1' })}`, {
      credentials: 'include',
      headers: FRONTEND_HEADERS,
    });
    key.catch(() => keys.delete(k));
    keys.set(k, key);
  }
  return key as Promise<K>;
}

export function dropCommentKey(kind: CommentKeyKind, query: Record<string, string>) {
  keys.delete(cacheKey(kind, query));
}

/** 鍵を渡して `send` を呼ぶ。失敗したら鍵を捨て、鍵の期限切れ（`EXPIRED_TOKEN`）なら鍵を取り直して 1 回だけ再送する。 */
export async function withCommentKey<K, T>(kind: CommentKeyKind, query: Record<string, string>, send: (key: K) => Promise<T>): Promise<T> {
  for (let retried = false; ; retried = true) {
    try {
      return await send(await commentKey<K>(kind, query));
    } catch (e) {
      dropCommentKey(kind, query);
      if (retried || !(e instanceof NicoApiError) || e.code !== 'EXPIRED_TOKEN') throw e;
    }
  }
}
