import { log } from '@/lib/log';
import { FRONTEND_HEADERS, FRONTEND_ID, nicoFetch } from './api';
import type { WatchContext } from './session';
import { accessRightsHlsUrl, watchUrl } from './urls';
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

function heartbeatBody(w: WatchData, e: WatchEvent): string {
  const video = w.videos.find((v) => v.isAvailable);
  const audio = w.audios.find((a) => a.isAvailable);
  const method = w.viewer?.isPremium ? 'premium' : w.viewer ? 'regular' : 'guest';
  return JSON.stringify({
    outputs: [[video?.id, audio?.id].filter(Boolean)],
    heartbeat: { method, params: { ...e, eventOccurredAt: isoWithOffset(new Date()) } },
  });
}

/** access-rights/hls に視聴イベントを送る。受理の確認は応答の `contentUrl` の `accepted` と `data` で行う。 */
export async function sendWatchEvent(
  w: WatchData,
  accessRightKey: string | undefined,
  e: WatchEvent,
  { retries = 0, keepalive = false } = {},
): Promise<void> {
  const body = heartbeatBody(w, e);
  const accepted = btoa(`${FRONTEND_ID}:${w.videoId}:${w.watchTrackId}`);
  for (let retry = 0; ; retry++) {
    try {
      const data = await nicoFetch<{ contentUrl?: string }>(
        `watch event ${e.eventType}`,
        `${accessRightsHlsUrl(w.videoId, w.watchTrackId)}&__retry=${retry}`,
        {
          method: 'POST',
          credentials: 'include',
          keepalive,
          headers: {
            ...FRONTEND_HEADERS,
            'Content-Type': 'application/json',
            'X-Request-With': watchUrl(w.videoId),
            ...(accessRightKey ? { 'X-Access-Right-Key': accessRightKey } : {}),
          },
          body,
        },
      );
      const q = new URLSearchParams(data?.contentUrl ?? '');
      if (q.get('accepted') === 'true' && q.get('data') === accepted) return;
      throw new Error(`watch event ${e.eventType} rejected`);
    } catch (err) {
      if (retry >= retries) throw err;
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }
}

/** 公式プレイヤーと同じ順序（start → play → impression → end）で各イベントを 1 回ずつ送る。 */
export class WatchEventTracker {
  private readonly watch: WatchData;
  private readonly sent = new Set<WatchEventType>();
  private queue = Promise.resolve();
  private watchMilliseconds = 0;
  private watchingSince?: number;
  private endCount = 0;

  constructor(private readonly ctx: WatchContext) {
    this.watch = ctx.data;
  }

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
    const key = this.ctx.isFresh('accessRightKey') ? this.ctx.data.accessRightKey : undefined;
    this.queue = this.queue
      .then(() => sendWatchEvent(this.watch, key, e, opts))
      .then(() => log.debug(`watch event ${type} accepted`))
      .catch((err) => log.warn(`watch event ${type} failed: ${err}`));
  }
}
