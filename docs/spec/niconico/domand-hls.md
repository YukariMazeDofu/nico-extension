# domand（HLS の配信）

## 流れ

| 順 | 通信 | 内容 |
| --- | --- | --- |
| 1 | `GET www.nicovideo.jp/watch/{id}` | `accessRightKey`・variant の一覧・`watchTrackId`（[watch-page.md](watch-page.md)） |
| 2 | `POST nvapi.nicovideo.jp/v1/watch/{id}/access-rights/hls?actionTrackId={watchTrackId}` | 再生用セッション。master playlist の URL と `domand_bid` の Cookie |
| 3 | `GET delivery.domand.nicovideo.jp/hlsbid/{id}/playlists/variants/….m3u8?session=…&Policy=…&Signature=…&Key-Pair-Id=…` | master playlist |
| 4 | `GET …/playlists/media/{video,audio}-….m3u8`、`GET …/keys/{variant}.key` | media playlist と AES-128 の鍵（16 バイト、variant ごとに別 URL） |
| 5 | `GET asset.domand.nicovideo.jp/…/init01.cmfv`・`NN.cmfv`・`NN.cmfa` | セグメント（fMP4・CMAF）。動画と音声は別 |

認証のパスは `/hlsbid/`（`domand_bid` だけを Cookie、残りはクエリ）。未ログインと一般会員で同じ。

- **確認**: 2026-10-01（未ログイン）・2026-10-02（一般会員）、`sm9`、公式プレイヤーの通信の記録。
- **未確認**: プレミアム会員での画質の候補と認証のパス（`/hls/`・`/hlsext/` に変わるか）、チャンネル動画の鍵（アクセスごとに変わる `/shls…/`）。

## 再生用セッション

`access-rights/hls` を次で呼ぶ。

- ヘッダ: `X-Access-Right-Key: {accessRightKey}`、`X-Frontend-Id: 6`、`X-Frontend-Version: 0`、`X-Request-With: https://www.nicovideo.jp/watch/{id}`、`Content-Type: application/json`。`credentials: 'include'`。
- ボディ: `{"outputs": [[videoId, audioId], …]}`。`isAvailable` な動画の variant すべてに、`isAvailable` な音声のうち `bitRate` の最も高いものを組み合わせる。
- 応答: 201。`data.contentUrl` が署名付きの master playlist の URL、`data.expireTime` が発行から 24 時間後。`Set-Cookie: domand_bid=…`（`HttpOnly`・`Secure`）。

`X-Access-Right-Key`・`X-Frontend-Id`・`X-Request-With` のどれかが欠けると 400 `INVALID_PARAMETER`。`X-Request-With` は `nicovideo` でも watch の URL でも通る。`Origin`・`Referer` は要らない。

- **確認**: 2026-10-01、`sm9`、未ログイン（Python の urllib から直接呼んで 201）。
- **コード**: `lib/nico/watch.ts`（`fetchHlsContentUrl`）、`lib/nico/urls.ts`（`accessRightsHlsUrl`）。
- **確かめ方**: `ext_probe.py` の `resp 201 POST …/hls`、console の `[nico-ext] content url acquired`。
- **壊れたとき**: オーバーレイに「読み込めませんでした（INVALID_PARAMETER）」などのエラーコード。console に `[nico-ext] load failed: Error: access-rights/hls failed`。

## Cookie と認証

| 取得するもの | `domand_bid` | 署名付きクエリ |
| --- | --- | --- |
| master・media playlist | 付ける（なしでは 403 のことがある） | URL に含まれる |
| 鍵（`keys/*.key`） | 必須（なしは 403） | URL に含まれる |
| セグメント（`asset.domand`） | なくても 200 | URL に含まれる |

- 署名（`Policy` の `DateLessThan`）は 24 時間。視聴イベントを送らなくても、セッションの取得から 200 秒後も playlist・鍵・セグメントを取得できる。

- **確認**: 2026-10-01、`sm9`、未ログイン。
- **コード**: `entrypoints/overlay.content/player.ts`（`attach`）。
- **確かめ方**: `ext_probe.py` の `resp 200 GET …/{variant}.key` と `resp 200 GET …/….m3u8`。
- **壊れたとき**: 鍵が 403 になり、hls.js の `keyLoadError` で再生が始まらない。

## hls.js の設定

| 設定 | 値 | 内容 |
| --- | --- | --- |
| `workerPath` | `hls.js/dist/hls.worker.js?raw` から作った blob URL | transmux を Worker（`blob:https://www.nicovideo.jp/…`）で動かす。ESM 版の hls.js は Worker を同梱しない |
| `maxMaxBufferLength` | 60 | 先読みを約 60 秒先までにする |
| `xhrSetup` | `withCredentials = true` | `domand_bid` を送る |
| `startPosition` | 初回 `-1`、復帰時は直前の位置 | |

- 画質は master playlist の level を切り替える（`hls.currentLevel`）。`access-rights/hls` は呼び直さない。level と variant は playlist の URI に含まれる `/{variantId}.m3u8` で対応付け、表示名は variant の `label`（なければ `{高さ}p`）。
- 画質の設定は `auto` か高さの上限。上限以下で最も高い level を選ぶ（なければ最も低い level）。

- **確認**: 2026-10-02、`sm46871555`（720p〜144p の 4 画質）、headless Chromium。ページの CSP は `frame-ancestors 'none'` だけで Worker を止めない。
- **コード**: `entrypoints/overlay.content/player.ts`。
- **確かめ方**: `ext_probe.py` の `quality lowest:` で `h` が 144、`qualities` に `自動 (720p)` と各画質。
- **壊れたとき**: 画質の一覧が `{高さ}p` だけになる（variant の対応付けが外れた）。

## エラーからの復帰

- hls.js の fatal なネットワークエラーでは、`access-rights/hls` を呼び直して hls.js を作り直し、同じ位置から再生する。`accessRightKey` の期限が近ければ watch ページを取り直す。30 秒に 1 回まで。
- fatal なメディアエラーは `recoverMediaError()`。
- 30 秒以内に 2 回目の fatal なネットワークエラーが起きたときと、呼び直しが失敗したときは、オーバーレイに「再生できなくなりました」と出す。

- **確認**: 2026-10-02、`sm46871555`、headless Chromium（セグメントを 403 にする）。
- **コード**: `entrypoints/overlay.content/player.ts`（`recover`）。
- **確かめ方**: `ext_probe.py --recover`。`fragLoadError` の fatal のあとに `session recreated at …`、`after recover` で `t` が進む。
- **壊れたとき**: 「再生できなくなりました」。

## 使っていない API

### 認証のパス

| パス | 方式 | frontendId |
| --- | --- | --- |
| `/hls/` | Policy・署名をすべて Cookie に入れる | 92 |
| `/hlsbid/` | `domand_bid` だけを Cookie、残りはクエリ（拡張が使う） | 6 |
| `/hlsext/` | Cookie なし、すべてクエリ（埋め込み用） | 70 |

- トップページの公式のプレビュー再生は `/hlsext/` の media playlist を取得する。
- 一部のチャンネル動画（`/shls…/`）はアクセスごとに鍵が変わる。

- **確認**: `/hlsbid/` は 2026-10-01 の実測。表のほかの行は [2023 年の資料](https://scrapbox.io/rinsuki/%E3%83%8B%E3%82%B3%E3%83%8B%E3%82%B3%E5%8B%95%E7%94%BB%E3%81%AE2023%E5%B9%B4%E6%96%B0%E9%85%8D%E4%BF%A1%E3%82%B5%E3%83%BC%E3%83%90%E3%83%BC%E3%80%8Cdomand%E3%80%8D%E3%83%A1%E3%83%A2) で、現行の動作は未確認。`/hlsext/` のプレビュー再生は 2026-10-02（未ログイン）。

### ストーリーボード

シークバーのサムネイルの画像。公式はログイン時だけ取得する。

1. `POST nvapi.nicovideo.jp/v1/watch/{id}/access-rights/storyboard`。ボディは空で `Content-Type` なし。ヘッダは `X-Access-Right-Key`・`X-Frontend-Id: 6`・`X-Frontend-Version: 0`・`X-Niconico-Language: ja-jp`・`X-Request-With: nicovideo`。
1. `asset.domand.nicovideo.jp/…/storyboard/1/storyboard/storyboard.json` と `0001.jpg`・`0002.jpg` … を取得する。

`storyboard.json` の構造と、未ログインで取得できるかは未確認。

- **確認**: 2026-10-02、`sm9`、一般会員、公式プレイヤーの通信の記録。
