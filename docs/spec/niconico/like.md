# いいね

## 送る

| 操作 | 通信 | 応答 |
| --- | --- | --- |
| いいね！ | `POST nvapi /v1/users/me/likes/items?videoId={動画 ID}` | `data.thanksMessage`（投稿者のお礼メッセージ） |
| 取り消し | `DELETE nvapi /v1/users/me/likes/items?videoId={動画 ID}` | |

- どちらもボディはなく、`credentials: 'include'`、`X-Frontend-Id`・`X-Frontend-Version`、`X-Request-With: https://www.nicovideo.jp`（`location.origin`）を付ける。
- 公式は成功したときに数を 1 増やす・減らし、取り直さない。
- 公式は失敗の `meta.errorCode` が `NEED_LOGIN`・`MAINTENANCE` 以外なら「「いいね！」に失敗しました」（取り消しは「「いいね！」の解除に失敗しました」）と出す。

開いたときの状態は `server-response` の `video.viewer.like.isLiked`（ログインしているときだけ入る）と `video.count.like`（[watch-page.md](watch-page.md#使う値)）。

- **確認**: 2026-10-04、`enum-*.js`（`/v1/users/me/likes/items` のクライアント）、`PlayerCurrentTime-*.js`（いいね！・取り消しの状態の更新とエラーの文言）、`nvapi-*.js`（エラーの分類）。未ログインの `sm9` で `video.viewer` が `null`。
- **コード**: `lib/nico/like.ts`、`entrypoints/overlay.content/like.ts`（`mountLikeBox`）。
- **確かめ方**: `ext_probe.py` の `layout:` の `like`（未ログインで無効）。いいね！・取り消しは実機の Chrome で行い、console の `[nico-ext] like: …` と、公式の watch ページ（`?nico-ext=off`）での状態と数を見る。
- **壊れたとき**: OSD に「「いいね！」に失敗しました (…)」。開いたときの状態が公式と食い違う。

## お礼メッセージ

- `GET nvapi /v1/users/me/likes/items?videoId={動画 ID}`（`credentials: 'include'`、`X-Frontend-Id`・`X-Frontend-Version`）の `data.thanksMessage`。いいね！の `POST` の応答にも同じものが入る。
- 公式は、投稿者がユーザー（`owner` がある）のいいね！済みの動画で、いいね！のボタンにマウスを 300ms 載せたときに取得する。取得はページの読み込みごとに 1 回。チャンネルの動画では取得しない。
- 公式は、いいね！した直後の数秒と、いいね！済みの動画でボタンにマウスを載せている間（お礼メッセージがあるとき）に「いいね！へのお礼メッセージ」の吹き出しを出す。
- 拡張は、投稿者がユーザーのいいね！済みの動画を開いたときに取得する。チャンネルの動画では取得せず、いいね！の `POST` の応答だけを使う。
- 未ログインでは 401 `UNAUTHORIZED`。いいね！していない動画での応答は未確認。

- **確認**: 2026-10-04、`PlayerCurrentTime-*.js`（取得）、`_web.watch._id._-main-*.js`（取得と表示の条件）。未ログインで 401 `UNAUTHORIZED`。
- **コード**: `lib/nico/like.ts`、`entrypoints/overlay.content/like.ts`（`mountLikeBox`）。
- **確かめ方**: 実機の Chrome で、お礼メッセージのある動画にいいね！して欄に出ること、開き直して同じものが出ること、公式の watch ページ（`?nico-ext=off`）のお礼メッセージと一致することを見る。
- **壊れたとき**: 投稿者がユーザーのいいね！済みの動画で「お礼メッセージを読み込めませんでした」。
