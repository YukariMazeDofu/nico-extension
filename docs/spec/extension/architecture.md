# 構成

Chrome 専用の Manifest V3 拡張。WXT（TypeScript・Vite）でビルドし、`www.nicovideo.jp` の content script（isolated world）だけで動く。service worker は持たない。

## マニフェスト

| 項目 | 値 |
| --- | --- |
| `permissions` | `storage`・`declarativeNetRequest` |
| `host_permissions` | `https://www.nicovideo.jp/*` |
| `declarative_net_request` | `public/rules.json`（静的な規則 2 つ） |
| `minimum_chrome_version` | 123 |
| content script | `entrypoints/overlay.content/`、`matches: https://www.nicovideo.jp/*`、`cssInjectionMode: 'ui'` |

- CSS は `light-dark()` とネイティブの nesting をそのまま出力する（`vite.build.cssTarget: 'chrome123'`）。変換先を指定しないと、lightningcss が `light-dark()` を空白 1 文字を値にする変数（space toggle）に変換し、Dark Reader が有効な Chrome でオーバーレイの背景色と文字色が消える。
- 通信はすべて content script の `fetch` と hls.js の XHR で、`www.nicovideo.jp` のオリジンから行う。Cookie と CORS の条件は公式プレイヤーと同じ。

## 層とモジュール

| 層 | ファイル | 役割 |
| --- | --- | --- |
| API | `lib/nico/api.ts` | `X-Frontend-Id`・`X-Frontend-Version`、`nicoFetch`（応答の `data` を返し、失敗は `meta.errorCode` 付きの `NicoApiError`） |
| API | `lib/nico/urls.ts` | URL の組み立て |
| API | `lib/nico/watch.ts` | watch ページの取得（`WatchData`）、`access-rights/hls` |
| API | `lib/nico/session.ts`・`jwt.ts` | `WatchContext`（トークンの期限が近ければ watch ページを取り直す） |
| API | `lib/nico/heartbeat.ts` | 視聴イベント |
| API | `lib/nico/comment.ts` | コメントの取得、nvcomment への書き込み |
| API | `lib/nico/keys.ts` | `comment/keys/*` の鍵の使い回しと再送 |
| API | `lib/nico/post.ts`・`nicoru.ts` | 投稿、ニコる・取り消し、それぞれの可否 |
| API | `lib/nico/like.ts` | いいね！・取り消し・お礼メッセージの取得 |
| API | `lib/nico/link.ts` | リンク・パスから動画 ID を取る |
| コメント | `lib/comment/spec.ts` | コマンドの解釈 |
| コメント | `lib/comment/layout.ts` | 配置（1920×1080 の座標系） |
| コメント | `lib/comment/timeline.ts` | `CommentRenderer` と、時刻に応じた出し入れ（`CommentTimeline`） |
| コメント | `lib/comment/raster.ts`・`webgl-renderer.ts` | ビットマップ化と WebGL2 での描画 |
| コメント | `lib/comment/ng.ts`・`heatmap.ts` | 共有 NG レベル、盛り上がりの振り分け |
| 共通 | `lib/settings.ts` | `storage.local` の設定と `bindSetting` |
| 共通 | `lib/log.ts` | `[nico-ext]` 付きのログ |
| UI | `entrypoints/overlay.content/index.ts` | リンクのクリック・直接開いたときの起動、オーバーレイの生成と片付け、Esc、訪問済み |
| UI | `controls.ts` | 上段・動画とコントロール・右パネルの組み立て、コントロールのバー |
| UI | `player.ts` | hls.js・画質・エラーからの復帰・視聴イベントの送信 |
| UI | `comments.ts`・`clock.ts` | コメント層（表示域への追従、`requestAnimationFrame`、表示 ON/OFF、共有 NG レベル） |
| UI | `seekbar.ts`・`heatmap.ts` | シークバーと盛り上がりの帯 |
| UI | `fit.ts` | 動画の枠を縦横比に合わせる配置 |
| UI | `shortcuts.ts` | キーボードショートカットの表とホイール |
| UI | `info.ts` | 上段と「動画の詳細」、説明文のサニタイズ |
| UI | `panel.ts`・`comment-list.ts`・`settings-panel.ts`・`setting-controls.ts` | 右パネル（タブの上の欄とタブ）、コメント一覧、設定 |
| UI | `like.ts` | 右パネルのいいね！の欄（ボタンとお礼メッセージ） |
| UI | `post.ts` | コメントの投稿欄 |
| UI | `theme.ts` | テーマの切り替え |
| UI | `dom.ts`・`format.ts`・`icons.ts` | 要素の生成、時刻・日時・件数の書式、アイコン |
| UI | `style.css` | オーバーレイの CSS |

- API 層は DOM の UI に依存しない（`watch.ts` の `DOMParser` を除く）。コメント層の `spec.ts`・`layout.ts`・`ng.ts`・`heatmap.ts` は純粋な関数。
- 描画器は `CommentRenderer`（`setScale`・`show`・`hide`・`frame`・`clear`・`destroy`）を実装すれば差し替えられる。

## データの流れ

1. `index.ts` がリンクのクリック（または直接開いたパス）から動画 ID を得て、`createShadowRootUi` でオーバーレイを作る。オーバーレイごとに `AbortController` を 1 つ作る。
1. `controls.ts` の `mountPlayerUi` が各モジュールを組み立て、`player.ts` が `WatchContext.load(videoId)`（watch ページの取得）を始める。この `Promise<WatchContext>` を各モジュールが受け取る。
1. `player.ts`: 視聴イベントの `start` → `access-rights/hls` → hls.js で再生。
1. `comments.ts`: コメントの表示と共有 NG レベルの設定を読んだあと、`/v1/threads` を取得する。取得したスレッドを次に渡す。
    - 共有 NG レベルで絞ったスレッド → コメント一覧（`comment-list.ts`）、`toSpec` → `layoutComments` → `CommentTimeline` → WebGL の描画器。
    - 絞る前のスレッドと `voltageZone.heatmap` → シークバー（`heatmap.ts`）。
1. 投稿のあとは `comments.ts` の `reload` でコメントを取り直し、上の流れをやり直す。共有 NG レベルの変更では取り直さずに並べ直す。
1. 閉じると `onRemove` で `abort()` する。`signal` に登録した動画のイベント・設定の追従・`ResizeObserver` が外れ、hls.js を止め、視聴イベントの `end` を送り、WebGL の資源を捨てる。

## コメントの描画

コマンドの解釈（`spec.ts`）→ 配置（`layout.ts`、[comment-render.md](../niconico/comment-render.md)）→ 描画の 3 段で流す。

- コメント 1 件を、表示の開始時に 1 回だけ `OffscreenCanvas` の 2D でビットマップにする（縁取り → 塗り）。毎フレームは位置だけを計算する。
    - 縁取りは黒（文字が黒なら白）の不透明度 0.4、文字の外側に 2.8。フォントの ascent + descent を行の高さの中央に置く。
    - 自分の投稿（`isMyPost`）は、配置の矩形の外側を黄色（`#FFFF00`、幅 2）の枠で囲む。
- WebGL2 で重ねる。コメント 1 件につき 1 テクスチャ・1 draw call、頂点バッファは使わず `gl_VertexID` で矩形を作る。premultiplied alpha で重ね、投稿者のレイヤーを上にする。
- canvas は表示域（動画の枠の中で最大の 16:9）の `devicePixelRatio` 倍の解像度にする。大きさが変わったら並べ直す。
- 表示の 500ms 前に出し、表示の終わりで捨てる。シーク・表示の切り替え・大きさの変更では、表示中のものをすべて捨てて並べ直す。

時刻は平滑化した動画の時刻を使う。実時間 × 再生速度で進め、`currentTime` との差を 1 フレームあたり 5% ずつ詰める。250ms を超えて離れたら `currentTime` に合わせ直し、停止中・シーク中は `currentTime` をそのまま使う。

- **コード**: `lib/comment/raster.ts`、`lib/comment/webgl-renderer.ts`、`lib/comment/timeline.ts`（`CommentTimeline`）、`entrypoints/overlay.content/clock.ts`（`createMediaClock`）、`entrypoints/overlay.content/comments.ts`。
- **確かめ方**: `ext_probe.py` の `comments drawn: True  redrawn after toggle: True`（一時停止中のコメント層の画面が C で消え、もう一度 C で同じ画面に戻る）。

## 設定

- 設定は `storage.local`（WXT の `storage.defineItem`）。キーの一覧は [behavior.md](behavior.md#storagelocal-のキー)。
- `bindSetting(setting, apply, signal)` は保存された値を `apply` に渡し、以後の変更（ほかのタブと同じタブ）にも追従する。`signal` の abort で追従をやめる。
- `local:player`（音量・ミュート・再生速度・画質）は開いたときに読み、変えたら保存する。ほかのタブでの変更には追従しない。
