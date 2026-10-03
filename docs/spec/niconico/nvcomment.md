# nvcomment（コメント）

## 取得

- `POST {nvComment.server}/v1/threads`。`server` は watch ページの値（`https://public.nvcomment.nicovideo.jp`）。
- ヘッダ: `X-Frontend-Id: 6`、`X-Frontend-Version: 0`、`X-Client-Os-Type: others`、`Content-Type: text/plain;charset=UTF-8`。Cookie は送らない。`X-Frontend-Id` がないと 400。
- ボディ: `{"params": nvComment.params, "threadKey": nvComment.threadKey, "additionals": {}}`。`params` は watch ページの値をそのまま使う（`targets: [{id, fork}]`・`language: "ja-jp"`）。
- 応答の `data.threads[]` は `id`・`fork`・`commentCount`・`comments[]`。各コメントのキー:

| キー | 使い道 |
| --- | --- |
| `id` | 配置の乱数の種 |
| `no` | ニコるのボディ、一覧の並びの第 2 キー |
| `vposMs` | 動画上の時刻 |
| `body` | 本文 |
| `commands[]` | コマンド（[comment-render.md](comment-render.md#コマンド)） |
| `score` | [共有 NG レベル](#共有-ng-レベル) |
| `postedAt` | 一覧の行の `title` |
| `nicoruCount` | ニコるの件数 |
| `nicoruId` | 自分がニコったコメントなら取り消しに使う ID、それ以外は `null` |
| `isMyPost` | 自分の投稿（ログイン時の `threadKey` なら Cookie なしでも true になる） |
| `userId`・`isPremium`・`source` | 使わない |

- 応答にはほかに `data.globalComments` と `data.voltageZone`（[voltageZone](#voltagezone)）がある。
- 返るのはスレッドごとの最新の約 1,000 件。easy のスレッドは返らない動画がある。
- `threadKey` の期限が近ければ watch ページを取り直してから送る。4xx が返ったら watch ページを取り直して 1 回だけ再試行する。

- **確認**: 2026-10-01、`sm9`、未ログイン・一般会員（ヘッダとボディの構造は同じ）。[otya128 の nvcomment の仕様](https://gist.github.com/otya128/9c7499cf667e75964b43d46c8c567e37)（`/v1/threads`・`comment/keys/thread`、旧 API との差分）と一致する。
- **コード**: `lib/nico/comment.ts`（`fetchCommentThreads`）。
- **確かめ方**: `ext_probe.py`・`ng_probe.py` の console に `[nico-ext] comments: owner=N main=M …, placed K in Nms`。`cmp_probes.sh` がその行の件数を出す。
- **壊れたとき**: コメントが流れず、一覧が「読み込み中…」のまま。console に `[nico-ext] comments failed: Error: nvcomment threads failed`。

## 鍵

書き込み（投稿・ニコる）は、nvapi から鍵を取ってから nvcomment に送る。

- 鍵: `GET nvapi.nicovideo.jp/v1/comment/keys/{種類}?{引数}&pc=1`。`credentials: 'include'`、ヘッダは `X-Frontend-Id`・`X-Frontend-Version`。応答の `data` が鍵。
- 鍵は種類と引数ごとにメモリに持って使い回す。書き込みが失敗したら鍵を捨て、`meta.errorCode` が `EXPIRED_TOKEN` なら鍵を取り直して 1 回だけ再送する。
- 未ログインでは `keys/post`・`keys/nicoru` が 401 `UNAUTHORIZED`、`keys/post-easy` が 404 `NOT_FOUND`。

| 操作 | 鍵の種類と引数 | 鍵の応答 |
| --- | --- | --- |
| 投稿 | `post?threadId` | `postKey`・`challenge` |
| かんたんコメント（拡張は使わない） | `post-easy?threadId` | `postEasyKey`・`challenge` |
| ニコる | `nicoru?threadId&fork` | `nicoruKey` |
| コメントの編集・削除（拡張は使わない） | `update`・`delete` | 未確認 |

nvcomment への書き込みは `{server}/v1/threads/{threadId}/…?pc=1`。ヘッダは `X-Frontend-Id`・`X-Frontend-Version`・`X-Client-Os-Type: others`、`credentials: 'omit'`、ボディは JSON の文字列で `Content-Type` を付けない。

- **確認**: 2026-10-03、`PlayerSeekBar-*.js`（nvcomment）・`enum-*.js`（nvapi）。
- **コード**: `lib/nico/keys.ts`（`withCommentKey`）、`lib/nico/comment.ts`（`sendToThread`）。

## 投稿

- 投稿先は `comment.threads` の `isDefaultPostTarget` のスレッド。
- `POST …/{threadId}/comments`、ボディは `videoId`・`commands`・`body`・`vposMs`・`postKey`。
- `vposMs` は `Math.floor(video.currentTime * 1000)`。
- `commands` に `184` がなければ足す。`isThreadkeyRequired` のスレッドでは足さず、`184` があれば送らずにエラーにする（「この動画では 184 を使えません」）。
- 応答は `data.id`・`data.no`・`data.shouldRefreshKey`。`shouldRefreshKey` が true なら鍵を捨てる。投稿のあとはコメントを取り直す。

投稿させない条件（投稿欄を無効にして理由を出す）:

| 条件 | 表示 |
| --- | --- |
| 未ログイン | ログインするとコメントできます |
| 投稿先のスレッドがない | この動画にはコメントできません |
| `postkeyStatus` 4 | コメントの投稿が制限されています |
| `postkeyStatus` 5 | このアカウントではコメントを送れません。公式で開いて投稿してください |

`postkeyStatus` 5 では、公式は投稿を送らず `localStorage`（`@nvweb-packages/comments:htrzm`）に保存して自分の画面にだけ出す。

- **確認**: 2026-10-03、`PlayerSeekBar-*.js`。一般会員で `sm27201969` に投稿し、チャレンジは求められなかった。
- **コード**: `lib/nico/post.ts`（`postBlockOf`・`postComment`）、`entrypoints/overlay.content/post.ts`。
- **確かめ方**: `post_probe.py`（未ログインで無効と理由の表示）。投稿そのものは実機の Chromeで `sm27201969` に送り、console の `[nico-ext] comment posted: {"id":…,"no":…}` と黄色の枠を見る。
- **壊れたとき**: OSD に「投稿に失敗しました ({errorCode か HTTP の状態})」。ボディの形が変わると 400 `INVALID_PARAMETER`。

テスト用の動画は `sm27201969`「【ご自由に】コメント練習用【お使いください】」。予備は `sm44148397`。

## チャレンジ

- 鍵の応答の `challenge.isRequired` が true のとき、公式は `challenge.siteKey` で Cloudflare Turnstile（`challenges.cloudflare.com/turnstile/v0/api.js?render=explicit`）を非対話で出し、得たトークンを `challengeToken` に入れて送る。
- 拡張は Turnstile を出さず、送らずにエラーにする（「確認が必要です。公式で開いて投稿してください」）。
- `isRequired` が true になる条件は未確認。

- **確認**: 2026-10-03、`PlayerSeekBar-*.js`。
- **コード**: `lib/nico/post.ts`（`ChallengeRequiredError`）。

## ニコる

| 操作 | 通信 | ボディ | 応答 |
| --- | --- | --- | --- |
| ニコる | `POST nvcomment …/{threadId}/nicorus` | `videoId`・`fork`・`no`・`content`（コメントの本文）・`nicoruKey` | `data.nicoruId`・`data.nicoruCount` |
| 取り消し | `DELETE nvapi /v1/users/me/nicoru/send/{nicoruId}`（`credentials: 'include'`、`X-Request-With: nicovideo`） | なし | |

- 取り消したときは件数を拡張の側で 1 減らす。
- 一般会員もニコれる。

ニコらせない条件（ボタンを無効にして `title` に理由を出す）:

| 条件 | 表示 |
| --- | --- |
| 未ログイン | ログインするとニコれます |
| 投稿者コメント（`owner`） | 投稿者コメントはニコれません |
| `postkeyStatus` 5 | このアカウントではニコれません |

エラーの `FORBIDDEN`・`PREMIUM_ONLY` は「プレミアム会員のみニコれます」、それ以外は「ニコるに失敗しました ({errorCode か HTTP の状態})」と OSD に出す。

自分の投稿にもニコるのボタンが押せる状態で出る。サーバーが受け付けるかは未確認。

- **確認**: 2026-10-03、`PlayerSeekBar-*.js`・`enum-*.js`。一般会員でニコると取り消しを確認。
- **コード**: `lib/nico/nicoru.ts`、`entrypoints/overlay.content/comment-list.ts`（`toggleNicoru`）。
- **確かめ方**: `list_probe.py`（未ログインで無効と `title`）。ニコる・取り消しは実機の Chromeで行い、console の `[nico-ext] nicoru: {"nicoruId":…,"nicoruCount":…}` を見る。
- **壊れたとき**: OSD に「ニコるに失敗しました (…)」。

## 共有 NG レベル

- `score` がしきい値以下のコメントを隠す。投稿者コメントも区別しない。

| レベル | しきい値 |
| --- | --- |
| 無 | 隠さない |
| 弱 | `-10000` |
| 中（既定） | `-4800` |
| 強 | `-1000` |

- watch ページの `comment.ng.ngScore.isDisabled` が true の動画では隠さない。
- 隠したコメントは、流すコメントとコメント一覧の両方から除く。
- 公式プレイヤーのレベルは `localStorage` の `nvpc:watch` の `ngScoreThreshold`（既定 `'middle'`）。

- **確認**: 2026-10-03、`PlayerSeekBar-*.js`（`filteredComments`）。
- **コード**: `lib/comment/ng.ts`、`entrypoints/overlay.content/comments.ts`（`apply`）。
- **確かめ方**: `ng_probe.py`。`/v1/threads` の応答の `score` から数えた件数と、一覧の件数・タブの `title`・console の `ng(…) hidden N` がレベルごとに一致する（`ok`）。
- **壊れたとき**: `ng_probe.py` が `NG expected N`。公式と隠れる件数が違う。

## voltageZone

- 取得の応答の `data.voltageZone.heatmap`。動画を 20 等分した区間ごとの値で、範囲はおよそ 1〜20、端数（`5.5` など）も混じる。ない動画では拡張は帯を色付けしない。
- 取得できるコメント（最新の約 1,000 件）の `vposMs` の分布とは一致しない。
- 公式はシークバーにマウスを乗せている間とシーク中だけ、20 点をベジェ曲線でつないだ白の半透明の波形を出し、最大の区間で「盛り上がりシーン」と出す。設定 `isVoltageZoneVisible`（既定 true）で隠せる。
- 拡張の表示は [behavior.md](../extension/behavior.md#シークバー)。

- **確認**: 2026-10-03、`PlayerSeekBar-*.js`、`sm9`（`[9, 14, 17, 20, 19, 5, 10, 6, 8, 13, 2, 9, 7, 15, 16, 3, 12, 1, 4, 5.5]`）。
- **コード**: `lib/nico/comment.ts`（`heatmap`）、`lib/comment/heatmap.ts`、`entrypoints/overlay.content/heatmap.ts`。
- **確かめ方**: `heatmap_probe.py`。`voltageZone.heatmap` と、帯の色の 20 区間ごとの平均（`coarse mean`）が対応し、`argmax same True`・`argmin same True`。
- **壊れたとき**: シークバーの帯が色付けされず、再生済みが青・キャッシュ済みが灰の表示になる。
