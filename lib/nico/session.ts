import { jwtExpiresAt } from './jwt';
import { fetchWatchData, type WatchData } from './watch';

const EXPIRY_MARGIN_MS = 30_000;

export type WatchToken = 'accessRightKey' | 'threadKey';

const tokenOf = (w: WatchData, t: WatchToken) => (t === 'accessRightKey' ? w.accessRightKey : w.nvComment.threadKey);

/** watch ページの値を保持し、期限が近いトークンを要求されたら watch ページを取り直す。 */
export class WatchContext {
  private refreshing?: Promise<WatchData>;

  private constructor(private latest: WatchData) {}

  static async load(videoId: string): Promise<WatchContext> {
    return new WatchContext(await fetchWatchData(videoId));
  }

  get data(): WatchData {
    return this.latest;
  }

  isFresh(token: WatchToken): boolean {
    return jwtExpiresAt(tokenOf(this.latest, token)) - EXPIRY_MARGIN_MS > Date.now();
  }

  async fresh(token: WatchToken): Promise<WatchData> {
    return this.isFresh(token) ? this.latest : this.refresh();
  }

  refresh(): Promise<WatchData> {
    this.refreshing ??= fetchWatchData(this.latest.videoId)
      .then((d) => (this.latest = d))
      .finally(() => {
        this.refreshing = undefined;
      });
    return this.refreshing;
  }
}
