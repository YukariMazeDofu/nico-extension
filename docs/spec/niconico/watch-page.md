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
| `video.count`（`view`・`comment`・`mylist`・`like`） | ○ | `info.count` | 上段の各カウント |
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

- **確認**: 2026-10-03、`sm9`・`sm46871555`・`sm27201969`、`server-response`。`comment.threads` の意味は `PlayerSeekBar-*.js`。
- **コード**: `lib/nico/watch.ts`（`ServerResponse`・`REQUIRED_PATHS`・`videoInfoOf`）。
- **確かめ方**: `ext_probe.py`（再生とコメント）、`layout_probe.py`（上段とパネル）、`post_probe.py`（投稿欄の状態）。必須のパスの検査は、存在しないパスを `REQUIRED_PATHS` に一時的に足したビルドで、オーバーレイにそのパスが出ることを見る。
- **壊れたとき**: 必須のパスが変わると「読み込めませんでした（server-response: data.response.… is not …）」。任意のパスが変わると、上段・右パネルの項目が出なくなる。

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

- **確認**: 2026-10-01、公式の JS バンドル。
