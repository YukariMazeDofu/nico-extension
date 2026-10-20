# 視聴イベント（ハートビート）

公式プレイヤーと同じ順序と条件で、`POST nvapi /v4/watch/{id}` に視聴イベントを送る。送らなくても再生はできる。視聴履歴（`/my/history/video`）には視聴イベントでは載らず、[lazy](watch-page.md#lazy) で載る。

## イベント

| `eventType` | 送るとき | `watchMilliseconds`・`endCount` | `additionalParameters` に足す値 |
| --- | --- | --- | --- |
| `start` | watch ページの値を得たとき。失敗したら 1 秒おきに 3 回まで再送 | 0 | |
| `play` | 最初の `play` イベント | 0 | |
| `impression` | 最初に再生中（`playing`）になったとき。同時に視聴時間の計測を始め、`pause` で止める | 0 | |
| `end` | オーバーレイを閉じたとき、ページを離れるとき（`pagehide`、`keepalive` 付き） | 再生中だった時間の合計（ms）、`ended` の回数 | `end_position_milliseconds`（終了位置） |

- 各イベントは 1 回だけ送る。`end` は `start` を送ったあとだけ送る。
- 公式には `switch` もある。拡張は送らない。

## リクエスト

- URL: `nvapi /v4/watch/{id}?__retry={再送の回数}`。
- ヘッダ: `X-Frontend-Id: 6`、`X-Frontend-Version: 0`、`X-Niconico-Language: ja-jp`、`X-Request-With: https://www.nicovideo.jp/watch/{id}`、`Content-Type: application/json`、`Accept: application/json;charset=utf-8`。`X-Access-Right-Key` は付けない。`credentials: 'include'`。
- ボディ:

```json
{
  "actionTrackId": "{watchTrackId}",
  "heartbeat": {
    "method": "guest | regular | premium",
    "params": {
      "eventType": "start",
      "eventOccurredAt": "2026-10-20T12:00:00+09:00",
      "watchMilliseconds": 0,
      "endCount": 0,
      "additionalParameters": { "___pc_v": 1, "nicosid": "…" }
    }
  }
}
```

- `actionTrackId` は最初の watch ページの `client.watchTrackId` を使い続ける。
- `method` は `viewer.isPremium` なら `premium`、ログイン時は `regular`、未ログインは `guest`。
- `additionalParameters` は公式では解析用の値（OS、広告ブロックの有無、画質の履歴など）を入れるが、`___pc_v`・`nicosid` だけで受理される。

## 受理の判定

応答は 200 で、`data` は `{responseType: "heartbeat", media: {hls: {url, outputs: [], createdAt, expiredAt}}}`。`responseType` が `heartbeat` で、`media.hls.url`（`?accepted=true&videoId=…&actionTrackId=…&data=…` の相対形式）のクエリの `accepted` が `true`、`data` が `btoa("6:{videoId}:{actionTrackId}")` に一致すれば受理。console に `[nico-ext] watch event {type} accepted`、それ以外は `[nico-ext] watch event {type} failed: …` を出す。

- 不正な `actionTrackId` でも `accepted=true` が返る。

- **確認**: 2026-10-20、`watch-v4-*.js`・`PlayerVolumeBar-*.js`・`PlayerCurrentTime-*.js`、`sm9`・`sm27201969`（未ログインの `guest`、一般会員の `regular`）。
- **コード**: `lib/nico/heartbeat.ts`（`WatchEventTracker`・`sendWatchEvent`）、`entrypoints/overlay.content/player.ts`（動画のイベントとの対応、`pagehide`）。
- **確かめ方**: `ext_probe.py` の console に `watch event start accepted`・`play`・`impression`・`end` の 4 つ。`cmp_probes.sh` がイベントごとの件数を出す。ページを離れるときの `end` は、`--log-net-log` で `/v4/watch/{id}` の POST を数える（Playwright の `request` イベントには出ない）。
- **壊れたとき**: console に `watch event … failed`。再生には影響しない。
