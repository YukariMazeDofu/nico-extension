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

/** JSON のボディを `credentials: 'include'` で POST し、応答の `data` を返す。`headers` は `FRONTEND_HEADERS` と `Content-Type` に足す。 */
export function postNvapi<T>(
  what: string,
  url: string,
  body: unknown,
  { headers = {}, keepalive = false }: { headers?: Record<string, string>; keepalive?: boolean } = {},
): Promise<T> {
  return nicoFetch<T>(what, url, {
    method: 'POST',
    credentials: 'include',
    keepalive,
    headers: { ...FRONTEND_HEADERS, 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}
