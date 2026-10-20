# watch ページ

再生とコメントに要る値は、watch ページの HTML と、nvapi の lazy・common から得る。

## 取得

- `GET https://www.nicovideo.jp/watch/{動画 ID}` を `credentials: 'include'` で取得する（content script の isolated world の `fetch`）。JS の実行は要らない。
- HTML の `<meta name="server-response" content="…">`（HTML エスケープされた JSON）を読む。値は `data.response.$watchV4.data` にあり、`meta.code` に結果のコードが入る。`data.response.pcweb`（広告用）は使わない。
- ログインしていると `viewer` に値が入り、`comment.ng.viewer` にユーザーの NG 設定が入る（拡張は使わない）。それ以外の使う値はログインの有無で変わらない。
- HTML を読んだ直後に [lazy](#lazy) を呼び、その応答を待ってから `WatchData` を返す。

- **確認**: 2026-10-20、`sm9`・`so38016254`・`sm27201969`・`sm46871555`・`sm46878133`（未ログイン・一般会員）。
- **コード**: `lib/nico/watch.ts`（`fetchWatchData`）。
- **確かめ方**: どのプローブでもオーバーレイが開き、console に `[nico-ext] watch data: N videos, M audios` が出る。
- **壊れたとき**: 「読み込めませんでした（server-response not found）」。

## 使う値

`data.response.$watchV4.data` のパスと `WatchData` の対応。**必須**のパスは `assertServerResponse` で型を確かめ、欠けると `server-response: data.response.$watchV4.data.{パス} is not {型}` のエラーでオーバーレイに「読み込めませんでした（…）」と出る。

| `data.response.$watchV4.data` のパス | 必須 | `WatchData` | 使い道 |
| --- | --- | --- | --- |
| `video.title` | ○ | `title` | 上段のタイトル、直接開いたときのタブのタイトル |
| `video.description` | ○ | `info.description` | 説明文（HTML） |
| `video.registeredAt` | ○ | `info.registeredAt` | 投稿日時 |
| `video.duration` | | `duration` | 動画の長さ（秒）。[URL の再生位置](../extension/behavior.md#url-の再生位置)の上限。ないときは上限を設けない |
| `video.count`（`view`・`comment`・`mylist`・`like`） | ○ | `info.count` | 上段の各カウント（`like` は[いいね！の欄](../extension/behavior.md#いいね)） |
| `video.isLikedByViewer` | | `liked` | いいね！の状態（[like.md](like.md)）。ないときは `false` |
| `tags.items[]`（`name`・`isLocked`） | ○ | `info.tags` | タグ |
| `genre`（`label`・`isNotSet`） | | `info.genre` | `isNotSet` なら出さない |
| `client.watchTrackId` | ○ | `watchTrackId` | `access-rights/hls`・lazy・common・視聴イベントの `actionTrackId` |
| `client.nicosid` | ○ | `nicosid` | 視聴イベントの `additionalParameters.nicosid` |
| `viewer`（`id`・`isPremium`） | | `viewer` | ログインの有無、視聴イベントの `method`。未ログインは `null` |
| `media.accessRightKey` | ○ | `accessRightKey` | [domand-hls.md](domand-hls.md) |
| `media.contents.videos[]`・`media.contents.audios[]` | ○ | `videos`・`audios` | variant の一覧（`id`・`isAvailable`・`bitRate`・`qualityLevel`・`width`・`height`、動画は `label`）。高画質順 |
| `comment.nvComment`（`server`・`threadKey`・`params`） | ○（`server`・`threadKey`） | `nvComment` | [nvcomment.md](nvcomment.md#取得) |
| `comment.threads[]` | ○ | `commentThreads` | 投稿先・ニコるの可否（下の表） |
| `comment.ng.ngScore.isDisabled` | | `ngScoreDisabled` | [nvcomment.md](nvcomment.md#共有-ng-レベル) |
| `lazy.authKey` | | | [lazy](#lazy) の `keyToken`。ないときは lazy の失敗と同じ扱い |

- `media.contents` はオブジェクトで、`videos`・`audios` が配列。音声の `label` はオブジェクト（`quality`・`bitrate`）で、拡張は使わない。
- `media.hls` は HTML では `null`。拡張は使わない。
- `owner`・`channel`・`series` はない。[lazy](#lazy) の応答から得る。

`comment.threads[]` の各要素:

| キー | `CommentThreadInfo` | 意味 |
| --- | --- | --- |
| `id` | `id`（文字列にする） | スレッド ID。fork が違っても同じ値のことがある |
| `forkLabel` | `fork` | `owner`・`main`・`easy` |
| `isPostTarget` | 同名 | 投稿先 |
| `is184Forced` | 同名 | `184` を付けずに投稿するスレッド。`184` を付けると投稿できない |
| `postNgReason` | 同名 | 投稿できない理由。`null` は投稿できる。`userBanned`・`videoUnavailable`・`channelRestriction` |
| `syncBufferTime` | 同名 | `400` のスレッドには公式は投稿もニコるも送らない（通常は `300`） |

- `forkLabel` が `easy` のスレッドがかんたんコメント。`label`（`default`・`community` など）・`isOwnerThread`・`fork`（数値）は使わない。
- チャンネル動画（`so38016254`）は `owner`・`main`（`label: default`）・`main`（`label: community`、`isPostTarget`・`is184Forced`）・`easy`（`is184Forced`）の 4 本。`sm9` は `owner`・`main`（`isPostTarget`）・`easy` の 3 本。

- **確認**: 2026-10-20、`sm9`・`so38016254`・`sm27201969`、`server-response`（未ログイン・一般会員）。`comment.threads` の意味は `watch-v4-*.js`。`video.isLikedByViewer` は `PlayerCurrentTime-*.js`。
- **コード**: `lib/nico/watch.ts`（`ServerResponse`・`REQUIRED_PATHS`・`videoInfoOf`）。
- **確かめ方**: `ext_probe.py`（再生とコメント）、`layout_probe.py`（上段とパネル）、`post_probe.py`（投稿欄の状態）。必須のパスの検査は、存在しないパスを `REQUIRED_PATHS` に一時的に足したビルドで、オーバーレイにそのパスが出ることを見る。
- **壊れたとき**: 必須のパスが変わると「読み込めませんでした（server-response: data.response.$watchV4.data.… is not …）」。任意のパスが変わると、上段・右パネルの項目が出なくなる。

## lazy

投稿者とシリーズは lazy の応答から得る。

- `POST nvapi /v4/watch/lazy/{id}?actionTrackId={watchTrackId}`、ボディ `{"actionTrackId": watchTrackId, "keyToken": lazy.authKey}`。
- ヘッダ: `Content-Type: application/json`、`X-Frontend-Id: 6`、`X-Frontend-Version: 0`、`X-Request-With: https://www.nicovideo.jp`。`credentials: 'include'`。
- 応答の `data` は `{owner, series, ranking, waku}`。`ranking`・`waku` は使わない。

| 応答の `data` のパス | `VideoInfo` |
| --- | --- |
| `owner`（`type: "user"`、`id`（数値）・`nickname`・`icon.url`） | `owner`: `{kind: 'user', name: nickname, iconUrl: icon.url, url: /user/{id}}` |
| `owner`（`type: "channel"`、`id`（`ch2647028` など）・`name`・`thumbnail.smallUrl`） | `owner`: `{kind: 'channel', name, iconUrl: thumbnail.smallUrl, url: ch.nicovideo.jp/{id}}` |
| `series`（`id`・`title`・`video.prev`・`video.next`） | `series`: `{title, url: /series/{id}, prev, next}`。`prev`・`next` は `{id, title}`。シリーズのない動画は `null` |

- `owner.visibility` が `visible` でないときは `owner` なし。
- 応答が 400 `meta.errorCode: KEY_EXPIRED`（`lazy.authKey` の期限切れ）なら、[common](#取り直しcommon) で取り直し、その `lazy.authKey` で 1 回だけ再送する。それ以外の失敗では `owner`・`series` なしで続け、console に `[nico-ext] watch lazy failed` を出す。
- 取り直し（common）では lazy を呼ばず、前の `info` を保つ。
- ログイン時、lazy を呼んだ動画が視聴履歴（`/my/history/video`）に載る。HTML の取得・common・`access-rights/hls`・視聴イベントでは載らない。

- **確認**: 2026-10-20、`sm27201969`（ユーザー）・`so38016254`（チャンネル）・`sm46878133`、未ログイン・一般会員。視聴履歴は一般会員で各 API を単独で呼んで確かめた。判定は `watch-v4-*.js`。
- **コード**: `lib/nico/watch.ts`（`fetchWatchLazy`）。
- **確かめ方**: `layout_probe.py`（右パネルの投稿者）。シリーズの前後は実機の Chrome で見る。視聴履歴はログインした実機の Chrome で開いて `/my/history/video` を見る。
- **壊れたとき**: 右パネルに投稿者・シリーズが出ない。console に `[nico-ext] watch lazy failed`。ログイン時に視聴履歴に載らない。

## 取り直し（common）

トークンの期限が近いときは、common で watch データを取り直す。

- `POST nvapi /v4/watch/{id}`、ボディ `{"actionTrackId": watchTrackId, "heartbeat": {"method": "common"}}`。ヘッダと `credentials` は [lazy](#lazy) と同じ。
- 応答の `data` は `responseType: "normal"` の watch データ全体（`data.response.$watchV4.data` と同じ形）。新しい `media.accessRightKey`・`comment.nvComment.threadKey`・`lazy.authKey` が入る。`client.watchTrackId` は変わらない。
- `responseType` が `normal` でなければ `NicoApiError` にする。
- 応答の `media.hls.url`（master playlist、期限 24 時間）は使わず、HLS は `access-rights/hls` で取る（[domand-hls.md](domand-hls.md#再生用セッション)）。

- **確認**: 2026-10-20、`sm27201969`・`sm9`、未ログイン。公式が呼ぶ条件（キーの期限切れの 400 `KEY_EXPIRED`、HLS のエラーからの復帰）は `watch-v4-*.js`。
- **コード**: `lib/nico/watch.ts`（`fetchWatchCommon`）、`lib/nico/session.ts`（`WatchContext.refresh`）。
- **確かめ方**: [トークンの期限](#トークンの期限)。
- **壊れたとき**: [トークンの期限](#トークンの期限)。

## 説明文の再生位置

`video.description` の HTML では、投稿者が書いた再生位置が次の `a` になっている。

```html
<a href="#" class="seekTime" data-seekTime="00:21" onclick="seekNicoPlayer('#00:21'); return false;">#00:21</a>
```

- `data-seekTime` は `mm:ss`。HTML として読むと属性名は `data-seektime` になる。
- 1 時間以上の位置の形（`h:mm:ss` か）は未確認。

- **確認**: 2026-10-05、`sm46878133`、未ログイン。
- **コード**: `entrypoints/overlay.content/info.ts`（`sanitizeDescription`）。
- **確かめ方**: [説明文の再生位置](../extension/behavior.md#説明文の再生位置)。
- **壊れたとき**: 説明文の再生位置がボタンにならず、文字か新しいタブで開くリンクになる。

## URL の再生位置

`/watch/{id}?from={秒}` を開くと、公式プレイヤーはその秒数から再生する。ニコられた一覧のリンクがこの形になっている（`?from=400&ref=my_nicoru_passive`）。

- watch ページの `server-response` の `player.initialPlayback` が `{type: 'from', positionSec}` になる。`positionSec` は値の先頭の整数で、`12.5` は 12、`1:23` は 1、`400s` は 400、`-5` は -5、`abc` は 0。動画の長さを超える値もそのまま入る。
- `from` がないとき、未ログインでは `initialPlayback` が `null`。

- **確認**: 2026-10-07、`sm39244189`、未ログイン。
- **コード**: `lib/nico/link.ts`。
- **確かめ方**: [URL の再生位置](../extension/behavior.md#url-の再生位置)。
- **壊れたとき**: ニコられた一覧などのリンクから開いても、その位置から再生しない。

## 取得できない動画

| 動画 | HTTP | `meta.code` | `data.response` |
| --- | --- | --- | --- |
| 削除済み（`sm1`） | 403 | `FORBIDDEN` | `{statusCode: 403, errorCode: "FORBIDDEN", reasonCode: "ADMINISTRATOR_DELETE_VIDEO", deletedMessage, publishScheduledAt, dataSet}` |
| 存在しない ID（`sm999999999`） | 404 | `NOT_FOUND` | `$watchV4` なし |

どちらも `server-response` は返り、`$watchV4` はない。[v3 の検知](#v3-の検知)に当たらず、HTTP が `ok` でないか `$watchV4` がないときは `watch data unavailable` のエラーにし、`meta.code` をオーバーレイに出す（「読み込めませんでした（FORBIDDEN）」）。

年齢制限・チャンネル限定・プレミアム限定の動画の応答は未確認。

- **確認**: 2026-10-20、`sm1`・`sm999999999`、未ログイン。
- **コード**: `lib/nico/watch.ts`（`fetchWatchData`）、`entrypoints/overlay.content/player.ts`（`onError`）。
- **確かめ方**: 読み込めない動画のリンクをページに差し込んでクリックし、`.message` の文字を読む。`ext_probe.py` に読み込めない動画を渡すと終わらない。

## v3 の検知

`data.response` に `$watchV4` がなく `media.domand` があるものを v3 と呼ぶ。拡張は v3 を読まない。最初の HTML が v3 なら、[v3 の検知](../extension/behavior.md#v3-の検知)の表示を出す。

公式の JS バンドル（`nvpc_next`）は `$watchV4` だけを読み、`media.domand`・`/api/watch/v3`・`postkeyStatus` を読むコードはない。

- **確認**: 2026-10-20、`nvpc_next/assets/*.js`（`watch-v4-*.js`・`enum-*.js`・`PlayerCurrentTime-*.js`・`PlayerVolumeBar-*.js`）。
- **コード**: `lib/nico/watch.ts`（`fetchWatchData`）。
- **確かめ方**: [v3 の検知](../extension/behavior.md#v3-の検知)。
- **壊れたとき**: 判定のキーが違うと、v3 の動画で「読み込めませんでした（…）」と出る。

## トークンの期限

| トークン | 期限（取得直後の残り） | ペイロードの主なキー |
| --- | --- | --- |
| `media.accessRightKey` | 約 10 分 | `vid`・`fid`（6）・`v[]`・`a[]`（使える variant）・`exp` |
| `comment.nvComment.threadKey` | 約 8 分 | `tids`（スレッド ID）・`exp` |
| `lazy.authKey` | 約 30 秒 | |

- `accessRightKey`・`threadKey` の期限は JWT の `exp` で判断する。`exp` まで 30 秒を切ったトークンが要るときは、[common](#取り直しcommon) で取り直す（`WatchContext.fresh`）。同時に要求されても取り直しは 1 回にまとめる。
- 取り直しが要る処理: `access-rights/hls` の再取得（[エラーからの復帰](domand-hls.md#エラーからの復帰)）、コメントの取得（[取得](nvcomment.md#取得)）。
- `lazy.authKey` は HTML を読んだ直後に使う（[lazy](#lazy)）。

- **確認**: 2026-10-20、`sm27201969`、未ログイン。
- **コード**: `lib/nico/session.ts`（`WatchContext`）、`lib/nico/jwt.ts`。
- **確かめ方**: `ext_probe.py` の秒数を 640 にして `--recover` を付けて流し、`access right key expired, refetching watch data` のあとに `session recreated at …` が出て、`after recover` で再生が続くこと。
- **壊れたとき**: 長く開いたあとのエラーからの復帰で `access-rights/hls` が失敗し、「再生できなくなりました」。投稿のあとのコメントの取り直しが失敗する。

## 使っていない API

| API | 内容 |
| --- | --- |
| `nvapi /v1/playlist/{mylist,random-play,ranking/teiban,…}` | 連続再生の一覧。公式の JS バンドルにある |
| `PUT nvapi /v2/users/me/watch/history/playback-position`（`{videoId, seconds}`） | 視聴履歴の再生位置を書く。公式は一時停止・動画の切り替え・ページを離れるときに送る。視聴イベントの `end_position_milliseconds` では書かれない |
| `GET nvapi /v2/users/me/watch/history` | 視聴履歴（20 件ずつ、`nextCursor`）。`items[].video.playbackPosition` は書いた秒数を 100 秒単位に切り上げ、動画の長さで頭打ちにした値 |
| `player.initialPlayback`（`server-response`） | `{type, positionSec}`。公式は `type` が `from` か、続きから再生の設定がオンのときに `positionSec` から再生する。一般会員では `type: 'resume'`・`positionSec: null` |

- **確認**: 2026-10-01、公式の JS バンドル。視聴履歴と `initialPlayback` は 2026-10-04、`PlayerCurrentTime-*.js`・`PlayerSeekBar-*.js` と一般会員での実測。
