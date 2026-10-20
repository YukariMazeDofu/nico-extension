import { log } from '@/lib/log';
import { FRONTEND_ID, postNvapi } from './api';
import { watchApiUrl, watchUrl } from './urls';
import type { WatchData } from './watch';

export type WatchEventType = 'start' | 'play' | 'impression' | 'end';

interface WatchEvent {
  eventType: WatchEventType;
  watchMilliseconds: number;
  endCount: number;
  additionalParameters: Record<string, unknown>;
}

const RETRY_DELAY_MS = 1000;

function isoWithOffset(d: Date): string {
  const offset = -d.getTimezoneOffset();
  const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, '0');
  const local = new Date(d.getTime() + offset * 60_000).toISOString().slice(0, 19);
  return `${local}${offset >= 0 ? '+' : '-'}${pad(offset / 60)}:${pad(offset % 60)}`;
}

function heartbeatBody(w: WatchData, e: WatchEvent) {
  const method = w.viewer?.isPremium ? 'premium' : w.viewer ? 'regular' : 'guest';
  return {
    actionTrackId: w.watchTrackId,
    heartbeat: { method, params: { ...e, eventOccurredAt: isoWithOffset(new Date()) } },
  };
}

/** `/v4/watch/{id}` に視聴イベントを送る。受理の確認は応答の `responseType` と `media.hls.url` の `accepted`・`data` で行う。 */
export async function sendWatchEvent(w: WatchData, e: WatchEvent, { retries = 0, keepalive = false } = {}): Promise<void> {
  const body = heartbeatBody(w, e);
  const accepted = btoa(`${FRONTEND_ID}:${w.videoId}:${w.watchTrackId}`);
  for (let retry = 0; ; retry++) {
    try {
      const data = await postNvapi<{ responseType?: string; media?: { hls?: { url?: string } | null } | null }>(
        `watch event ${e.eventType}`,
        `${watchApiUrl(w.videoId)}?__retry=${retry}`,
        body,
        {
          keepalive,
          headers: { Accept: 'application/json;charset=utf-8', 'X-Niconico-Language': 'ja-jp', 'X-Request-With': watchUrl(w.videoId) },
        },
      );
      const q = new URLSearchParams(data?.media?.hls?.url?.split('?')[1] ?? '');
      if (data?.responseType === 'heartbeat' && q.get('accepted') === 'true' && q.get('data') === accepted) return;
      throw new Error(`watch event ${e.eventType} rejected`);
    } catch (err) {
      if (retry >= retries) throw err;
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }
}

/** 公式プレイヤーと同じ順序（start → play → impression → end）で各イベントを 1 回ずつ送る。 */
export class WatchEventTracker {
  private readonly sent = new Set<WatchEventType>();
  private queue = Promise.resolve();
  private watchMilliseconds = 0;
  private watchingSince?: number;
  private endCount = 0;

  constructor(private readonly watch: WatchData) {}

  start() {
    this.send('start', {}, { retries: 3 });
  }

  play() {
    this.send('play');
  }

  setWatching(watching: boolean) {
    if (watching) {
      this.watchingSince ??= Date.now();
      this.send('impression');
    } else {
      this.stopWatching();
    }
  }

  countEnd() {
    this.endCount++;
  }

  end(positionMs: number, keepalive = false) {
    if (!this.sent.has('start')) return;
    this.stopWatching();
    this.send('end', { end_position_milliseconds: Math.round(positionMs) }, { keepalive });
  }

  private stopWatching() {
    if (this.watchingSince === undefined) return;
    this.watchMilliseconds += Date.now() - this.watchingSince;
    this.watchingSince = undefined;
  }

  private send(type: WatchEventType, extra: Record<string, unknown> = {}, opts: { retries?: number; keepalive?: boolean } = {}) {
    if (this.sent.has(type)) return;
    this.sent.add(type);
    const e: WatchEvent = {
      eventType: type,
      watchMilliseconds: type === 'end' ? this.watchMilliseconds : 0,
      endCount: type === 'end' ? this.endCount : 0,
      additionalParameters: { ___pc_v: 1, nicosid: this.watch.nicosid, ...extra },
    };
    this.queue = this.queue
      .then(() => sendWatchEvent(this.watch, e, opts))
      .then(() => log.debug(`watch event ${type} accepted`))
      .catch((err) => log.warn(`watch event ${type} failed: ${err}`));
  }
}
