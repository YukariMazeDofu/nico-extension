export const FRONTEND_ID = '6';

export const FRONTEND_HEADERS = {
  'X-Frontend-Id': FRONTEND_ID,
  'X-Frontend-Version': '0',
};

export class NicoApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

/** JSON を返す API を呼び、応答の `data` を返す。`res.ok` でなければ `meta.errorCode` を持つ `NicoApiError` を投げる。 */
export async function nicoFetch<T>(what: string, url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const json = await res.json().catch(() => undefined);
  if (!res.ok) throw new NicoApiError(`${what} failed`, res.status, json?.meta?.errorCode);
  return json?.data;
}
