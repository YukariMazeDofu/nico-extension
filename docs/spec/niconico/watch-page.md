# watch ページ

再生とコメントに要る値は、watch ページの HTML だけから得る。`/api/watch/v3` などの API は使わない。

## 取得

- `GET https://www.nicovideo.jp/watch/{動画 ID}` を `credentials: 'include'` で取得する（content script の isolated world の `fetch`）。JS の実行は要らない。
- HTML の `<meta name="server-response" content="…">`（HTML エスケープされた JSON）を読む。値は `data.response` にあり、`meta.code` に結果のコードが入る。
- ログインしていると `viewer` に値が入る。それ以外の使う値はログインの有無で変わらない。

- **確認**: 2026-10-01（未ログイン）・2026-10-02（一般会員）、`sm9`。
- **コード**: `lib/nico/watch.ts`（`fetchWatchData`）。
- **確かめ方**: どのプローブでもオーバーレイが開き、console に `[nico-ext] watch data: N videos, M audios` が出る。
- **壊れたとき**: 「読み込めませんでした（server-response not found）」。

## 使う値

`data.response` のパスと `WatchData` の対応。**必須**のパスは `assertServerResponse` で型を確かめ、欠けると `server-response: data.response.{パス} is not {型}` のエラーでオーバーレイに「読み込めませんでした（…）」と出る。

| `data.response` のパス | 必須 | `WatchData` | 使い道 |
| --- | --- | --- | --- |
| `video.title` | ○ | `title` | 上段のタイトル、直接開いたときのタブのタイトル |
| `video.description` | ○ | `info.description` | 説明文（HTML） |
| `video.registeredAt` | ○ | `info.registeredAt` | 投稿日時 |
| `video.count`（`view`・`comment`・`mylist`・`like`） | ○ | `info.count` | 上段の各カウント（`like` は[いいね！の欄](../extension/behavior.md#いいね)） |
| `video.viewer.like.isLiked` | | `liked` | いいね！の状態（[like.md](like.md)）。ないときは `false` |
| `tag.items[]`（`name`・`isLocked`） | ○ | `info.tags` | タグ |
| `genre`（`label`・`isNotSet`） | | `info.genre` | `isNotSet` なら出さない |
| `owner`（`id`・`nickname`・`iconUrl`） | | `info.owner`（`kind: 'user'`） | 投稿者 |
| `channel`（`id`・`name`・`thumbnail.smallUrl`） | | `info.owner`（`kind: 'channel'`） | `owner` がないときのチャンネル |
| `series`（`id`・`title`・`video.prev`・`video.next`） | | `info.series` | シリーズと前後の動画 |
| `client.watchTrackId` | ○ | `watchTrackId` | `access-rights/hls` の `actionTrackId` |
| `client.nicosid` | ○ | `nicosid` | 視聴イベントの `additionalParameters.nicosid` |
| `viewer`（`id`・`isPremium`） | | `viewer` | ログインの有無、視聴イベントの `method` |
| `media.domand.accessRightKey` | ○ | `accessRightKey` | [domand-hls.md](domand-hls.md) |
| `media.domand.videos[]`・`audios[]` | ○ | `videos`・`audios` | variant の一覧（`id`・`isAvailable`・`bitRate`・`qualityLevel`・`label`・`width`・`height`）。高画質順 |
| `comment.nvComment`（`server`・`threadKey`・`params`） | ○（`server`・`threadKey`） | `nvComment` | [nvcomment.md](nvcomment.md#取得) |
| `comment.threads[]` | ○ | `commentThreads` | 投稿先・ニコるの可否（下の表） |
| `comment.ng.ngScore.isDisabled` | | `ngScoreDisabled` | [nvcomment.md](nvcomment.md#共有-ng-レベル) |

`comment.threads[]` の各要素:

| キー | `CommentThreadInfo` | 意味 |
| --- | --- | --- |
| `id` | `id`（文字列にする） | スレッド ID。fork が違っても同じ値のことがある |
| `forkLabel` | `fork` | `owner`・`main`・`easy` |
| `isDefaultPostTarget` | 同名 | 通常の投稿先 |
| `isEasyCommentPostTarget` | 同名 | かんたんコメントの投稿先 |
| `isThreadkeyRequired` | 同名 | チャンネル・コミュニティの動画のスレッド。`184` を付けると投稿できない |
| `postkeyStatus` | 同名 | `0` 通常、`4` 投稿できない、`5` 公式は投稿もニコるも送らない |

- **確認**: 2026-10-03、`sm9`・`sm46871555`・`sm27201969`、`server-response`。`comment.threads` の意味は `PlayerSeekBar-*.js`。`video.viewer.like.isLiked` は 2026-10-04、`PlayerCurrentTime-*.js`。
- **コード**: `lib/nico/watch.ts`（`ServerResponse`・`REQUIRED_PATHS`・`videoInfoOf`）。
- **確かめ方**: `ext_probe.py`（再生とコメント）、`layout_probe.py`（上段とパネル）、`post_probe.py`（投稿欄の状態）。必須のパスの検査は、存在しないパスを `REQUIRED_PATHS` に一時的に足したビルドで、オーバーレイにそのパスが出ることを見る。
- **壊れたとき**: 必須のパスが変わると「読み込めませんでした（server-response: data.response.… is not …）」。任意のパスが変わると、上段・右パネルの項目が出なくなる。

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

## 取得できない動画

| 動画 | HTTP | `meta.code` | `data.response` |
| --- | --- | --- | --- |
| 削除済み（`sm1`） | 400 | `FORBIDDEN` | `null`（`reasonCode: ADMINISTRATOR_DELETE_VIDEO`） |
| 存在しない ID | 404 | `NOT_FOUND` | `null` |

どちらも `server-response` は返る。HTTP が `ok` でないか `media.domand` がないときは `watch data unavailable` のエラーにし、`meta.code` をオーバーレイに出す（「読み込めませんでした（FORBIDDEN）」）。

年齢制限・チャンネル限定・プレミアム限定の動画の応答は未確認。

- **確認**: 2026-10-01、`sm1`、未ログイン。
- **コード**: `lib/nico/watch.ts`（`fetchWatchData`）、`entrypoints/overlay.content/player.ts`（`onError`）。
- **確かめ方**: 読み込めない動画のリンクをページに差し込んでクリックし、`.message` の文字を読む。`ext_probe.py` に読み込めない動画を渡すと終わらない。

## v4

`server-response` の値が `data.response.$watchV4.data` に入る形を v4 と呼ぶ。拡張は v4 を読まない。`data.response.$watchV4` があれば v4 と判定し、[v4 の検知](../extension/behavior.md#v4-の検知)の表示を出す。

v3（`data.response`）との主な違い:

| v3 | v4 |
| --- | --- |
| `media.domand`（`accessRightKey`・`videos`・`audios`） | `media`（`accessRightKey`・`contents.videos`・`contents.audios`・`hls`）。`hls.url` が master playlist で、`hls.createdAt`・`hls.expiredAt` が付く |
| `video.viewer.like.isLiked` | `video.isLikedByViewer` |
| `tag.items` | `tags.items` |
| `owner`・`channel`・`series` | ない。`POST nvapi /v4/watch/lazy/{id}`（`{actionTrackId, keyToken: lazy.authKey}`）の応答に入る |
| `comment.threads[].isDefaultPostTarget` | `comment.threads[].isPostTarget` |
| 視聴イベント（`access-rights/hls`、[heartbeat.md](heartbeat.md)） | `POST nvapi /v4/watch/{id}`（`{actionTrackId, heartbeat: {method, params: {eventType, …}}}`） |

`comment.nvComment` と `client.watchTrackId` は v3 と同じ。

未確認: 実測していない。`media.contents` の形（オブジェクトか配列か）、`hls.url` の期限切れのあとの取り直し、v4 の視聴イベントの間隔。

- **確認**: 2026-10-04、他の実装のコード（[kphrx/ZenzaWatch](https://github.com/kphrx/ZenzaWatch) `feb1617` の `src/initializer.js`、[castella-cake/mintwatch](https://github.com/castella-cake/mintwatch) の `change/v4watch` ブランチ `1a1af3ea` の `types/watch/Base.ts`・`Lazy.ts`・`HeartBeat.ts`）。v4 の応答は 2026-09-30〜10-01 に返った。2026-10-04 の公式の JS バンドルには v4 のコードがない。
- **コード**: `lib/nico/watch.ts`（`fetchWatchData`）。
- **確かめ方**: [v4 の検知](../extension/behavior.md#v4-の検知)。
- **壊れたとき**: 判定のキーが違うと、v4 の動画で「読み込めませんでした（…）」と出る。

## トークンの期限

| トークン | 期限（取得直後の残り） | ペイロードの主なキー |
| --- | --- | --- |
| `accessRightKey` | 約 10 分 | `vid`・`fid`（6）・`v[]`・`a[]`（使える variant）・`exp` |
| `nvComment.threadKey` | 約 8 分 | `tids`（スレッド ID）・`exp` |

- 期限は JWT の `exp` で判断する。`exp` まで 30 秒を切ったトークンが要るときは、watch ページを取り直す（`WatchContext.fresh`）。同時に要求されても取り直しは 1 回にまとめる。
- 取り直しが要る処理: `access-rights/hls` の再取得（[エラーからの復帰](domand-hls.md#エラーからの復帰)）、コメントの取得（[取得](nvcomment.md#取得)）。視聴イベントは期限内のときだけ `X-Access-Right-Key` を付け、取り直さない。

- **確認**: 2026-10-01、`sm9`、未ログイン。
- **コード**: `lib/nico/session.ts`（`WatchContext`）、`lib/nico/jwt.ts`。
- **確かめ方**: `ext_probe.py` の秒数を 640 にして `--recover` を付けて流し、`access right key expired, refetching watch data` のあとに `session recreated at …` が出て、`after recover` で再生が続くこと。
- **壊れたとき**: 長く開いたあとのエラーからの復帰で `access-rights/hls` が失敗し、「再生できなくなりました」。投稿のあとのコメントの取り直しが失敗する。

## 使っていない API

| API | 内容 |
| --- | --- |
| `GET www.nicovideo.jp/api/watch/v3/{id}?actionTrackId=…`（ログイン時）・`/api/watch/v3_guest/{id}`（未ログイン） | 公式の JS バンドルにある。[yt-dlp](https://github.com/yt-dlp/yt-dlp) の `extractor/niconico.py` が `accessRightKey` などの取得に使う。拡張からの呼び出しは未検証 |
| `nvapi /v1/playlist/{mylist,random-play,ranking/teiban,…}` | 連続再生の一覧。公式の JS バンドルにある |
| `PUT nvapi /v2/users/me/watch/history/playback-position`（`{videoId, seconds}`） | 視聴履歴の再生位置を書く。公式は一時停止・動画の切り替え・ページを離れるときに送る。視聴イベントの `end_position_milliseconds` では書かれない |
| `GET nvapi /v2/users/me/watch/history` | 視聴履歴（20 件ずつ、`nextCursor`）。`items[].video.playbackPosition` は書いた秒数を 100 秒単位に切り上げ、動画の長さで頭打ちにした値 |
| `player.initialPlayback`（`server-response`） | `{type, positionSec}`。公式は `type` が `from` か、続きから再生の設定がオンのときに `positionSec` から再生する。一般会員では `type: 'resume'`・`positionSec: null` |

- **確認**: 2026-10-01、公式の JS バンドル。視聴履歴と `initialPlayback` は 2026-10-04、`PlayerCurrentTime-*.js`・`PlayerSeekBar-*.js` と一般会員での実測。
