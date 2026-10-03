/** 秒を `m:ss`（1 時間以上は `h:mm:ss`）にする。 */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '0:00';
  const t = Math.floor(seconds);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const ss = String(t % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** ISO 8601 の日時を `YYYY/MM/DD hh:mm` にする。 */
export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

export const formatCount = (n: number) => n.toLocaleString('ja-JP');
