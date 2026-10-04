# 仕様書

拡張が何をするかと、拡張が使うニコニコ動画の仕組みを定める。実装は仕様書に合わせる。

| 種類 | 文書 | 内容 |
| --- | --- | --- |
| 要件 | [extension/requirements.md](extension/requirements.md) | 前提・機能と状態・対象外 |
| 動作 | [extension/behavior.md](extension/behavior.md) | 起動・画面・操作・`storage.local` のキー・制約と、それぞれの確かめ方 |
| 設計 | [extension/architecture.md](extension/architecture.md) | マニフェスト・層とモジュールの対応・データの流れ・コメントの描画 |
| 検証 | [extension/testing.md](extension/testing.md) | 型チェック・ビルド・プローブ |
| ニコニコの仕組み | [niconico/watch-page.md](niconico/watch-page.md) | watch ページの `server-response` のうち使う値と `WatchData` の対応、トークンの期限 |
| ニコニコの仕組み | [niconico/domand-hls.md](niconico/domand-hls.md) | `access-rights/hls`・Cookie・鍵・セグメント・有効期限 |
| ニコニコの仕組み | [niconico/heartbeat.md](niconico/heartbeat.md) | 視聴イベント（`eventType`・`method`・受理の判定） |
| ニコニコの仕組み | [niconico/nvcomment.md](niconico/nvcomment.md) | コメントの取得・投稿・ニコる・鍵・エラーコード・共有 NG レベル・`voltageZone` |
| ニコニコの仕組み | [niconico/comment-render.md](niconico/comment-render.md) | コマンド・配置の基準値・ニコスクリプト |
| ニコニコの仕組み | [niconico/like.md](niconico/like.md) | いいね！・取り消しと開いたときの状態、お礼メッセージ |
| ニコニコの仕組み | [niconico/web-ui.md](niconico/web-ui.md) | 公式の配色のトークン・訪問済み（`:visited`）の見た目 |

`niconico/` には、実測と公式の JS バンドルで確かめた事実と、拡張がそれをどう使うかを書く。各節の末尾には次を書く。

- **確認**: 確認した日と取得元（公式の JS バンドルのファイル名、`server-response` のパス、実測の条件）。
- **コード**: その仕組みを使っているファイル。
- **確かめ方**: 使うプローブと見る値。
- **壊れたとき**: 仕組みが変わったときに出る症状。

## 変更の流れ

機能の追加・変更は、仕様書を先に直してから実装する。仕様書と実装は同じ PR に入れる。

1. `feature/*` ブランチの最初のコミットで仕様書を直す。
    - 作るものが変わるなら `extension/requirements.md` の機能の表を直す。
    - 動作を `extension/behavior.md` に書き、節の末尾に **確かめ方**（プローブと見る値、または実機の Chrome で見ること）を書く。
    - 設計が変わるなら `extension/architecture.md` を直す。
    - 使うニコニコの仕組みが `niconico/` にないときは、調べて `niconico/` に書く。
1. 仕様書の差分をユーザーが確認する。
1. 仕様書に合わせて実装する。実装中に仕様を変えるときは、仕様書を先に直してユーザーが確認する。
1. 各節の確かめ方で確かめる。

機能の状態は `extension/requirements.md` の機能の表で示す。

| 状態 | 意味 |
| --- | --- |
| 実装済み | 仕様書どおりに動く |
| 未実装 | 仕様書に書いたが、まだ動かない。`behavior.md` の該当する節の見出しに「（未実装）」を付ける |
| 保留 | 着手しない。着手の条件を表に書く |

## 用語

| 用語 | 意味 |
| --- | --- |
| 動画 ID | `sm`・`nm`・`so` に数字が続く ID（`sm9` など）。拡張はこの形だけを扱う |
| watch ページ | `https://www.nicovideo.jp/watch/{動画 ID}`。公式プレイヤーのページ |
| `server-response` | watch ページの HTML の `<meta name="server-response">`。再生とコメントに要る値がすべて入る JSON |
| domand | 動画の配信の仕組み。HLS（fMP4・AES-128）で配る |
| `accessRightKey` | `access-rights/hls` に送る JWT。約 10 分で切れる |
| `threadKey` | コメントの取得に送る JWT。約 8 分で切れる |
| nvcomment | コメントのサーバー（`public.nvcomment.nicovideo.jp`） |
| nvapi | `nvapi.nicovideo.jp`。`access-rights/hls`・コメントの鍵・ニコるの取り消し・いいね！の API |
| fork | コメントのスレッドの種類。`owner`（投稿者コメント）・`main`（通常）・`easy`（かんたんコメント） |
| `vposMs` | コメントの動画上の時刻（ミリ秒） |
| 視聴イベント | `access-rights/hls` に送るハートビート（`start`・`play`・`impression`・`end`） |
| ニコスクリプト | 投稿者コメントのうち `@`・`＠` で始まる命令（`＠置換` など） |
| 共有 NG レベル | コメントの `score` で、ほかの視聴者の NG 登録が多いコメントを隠す設定 |
| `voltageZone` | コメントの取得の応答に入る、動画を 20 等分した区間ごとの盛り上がりの値 |
| オーバーレイ | 拡張が `www.nicovideo.jp` のページに重ねて出すプレイヤー（Shadow DOM） |
| 直接開く | `/watch/{動画 ID}` をページ遷移で開くこと（アドレスバー・外部サイトのリンク・新しいタブなど） |
| プローブ | 拡張を読み込んだ headless Chromium で動作を確かめるスクリプト（`scripts/*_probe.py`） |
| 実機の Chrome | 拡張を読み込み、ニコニコ動画にログインした Chrome。GPU で描画する |

## 調べ直す手順

### 公式の JS バンドルを取得する

1. `curl --compressed -H 'Accept-Language: ja-JP' https://www.nicovideo.jp/watch/sm9` の HTML から `https://resource.video.nimg.jp/web/scripts/nvpc_next/….js` を抜き出して取得する（約 40 本）。
1. 取得したファイルに含まれる `assets/{名前}-{hash}.js` を `https://resource.video.nimg.jp/web/scripts/nvpc_next/assets/…` から取得する（動的 import のチャンク。合わせて約 100 本）。
1. CSS（`root-{hash}.css` など）も同じ `assets/` から取得する。

ファイル名のハッシュは公式の更新で変わる。各節の「確認」は名前の部分（`PlayerSeekBar-*.js` など）で書く。

| 探すもの | ファイル |
| --- | --- |
| コメントの取得・投稿・ニコる・共有 NG レベル・ニコスクリプト・`voltageZone` の表示 | `PlayerSeekBar-*.js` |
| nvapi のクライアント（`comment/keys/*`・ニコるの取り消し・いいね！） | `enum-*.js` |
| 視聴イベント | `PlayerVolumeBar-*.js`・`PlayerCurrentTime-*.js` |
| 配色（`--colors-*`） | `root-*.css` |

### 公式プレイヤーの通信を記録する

1. Playwright で headless Chromium を `locale="ja-JP"` で起動し、watch ページを開いて再生する。既定のロケール（`en-US`）では英語版のページになり、`nvComment.params.language` が `en-us`、タグが空、コメントが 0 件になることがある。
1. `request`・`response` で `nvapi.nicovideo.jp`・`*.domand.nicovideo.jp`・`*.nvcomment.nicovideo.jp` の URL・ヘッダ・JSON の構造を記録する。セグメントの本体は保存しない。
1. ログイン状態で記録するときは、ログインしたブラウザから `user_session`（と `user_session_secure`）の Cookie を取り、Playwright の `storage_state`（権限 0600 のファイル）に入れる。
1. 記録には URL・ヘッダ・JSON の構造を残し、Cookie・JWT・署名（`Policy`・`Signature`）の値は伏せる。未ログインとログインの差は、伏せた記録どうしで比べる。
1. ネットワークの許可が要る環境では `*.nicovideo.jp`・`*.nimg.jp` を許可する。

## 未確認の点

1. プレミアム会員での差（画質の候補、認証のパスが `/hls/`・`/hlsext/` に変わるか）。
1. `actionTrackId` に `client.watchTrackId` 以外の値を使えるか。`X-Request-With` の値の制約。
1. 投稿のチャレンジ（Cloudflare Turnstile）が求められる条件。
1. 年齢制限・チャンネル限定・プレミアム限定の動画の `server-response` と `access-rights/hls` の応答。
1. 自分の投稿をニコれるか。
1. いいね！していない動画で、お礼メッセージの取得（`GET /v1/users/me/likes/items`）が何を返すか。
1. コメント描画に関するドワンゴの特許の扱い。[niconicomments](https://github.com/xpadev-net/niconicomments) の README に、抵触しうる旨の注意書きがある。

## 症状から節への逆引き

| 症状 | 見る節 |
| --- | --- |
| オーバーレイに「読み込めませんでした（server-response: data.response.… is not …）」 | [watch-page.md](niconico/watch-page.md#使う値) |
| オーバーレイに「読み込めませんでした（FORBIDDEN）」「（NOT_FOUND）」 | [watch-page.md](niconico/watch-page.md#取得できない動画) |
| オーバーレイに「読み込めませんでした（INVALID_PARAMETER）」など、`access-rights/hls failed` | [domand-hls.md](niconico/domand-hls.md#再生用セッション) |
| 再生中に「再生できなくなりました」 | [domand-hls.md](niconico/domand-hls.md#エラーからの復帰) |
| 鍵（`keys/*.key`）が 403 | [domand-hls.md](niconico/domand-hls.md#cookie-と認証) |
| console に `[nico-ext] watch event … failed` | [heartbeat.md](niconico/heartbeat.md) |
| コメントが流れず、console に `[nico-ext] comments failed` | [nvcomment.md](niconico/nvcomment.md#取得) |
| コメントが流れず、console に `[nico-ext] comment renderer failed` | [behavior.md](extension/behavior.md#制約) |
| コメントの位置・大きさ・色が公式と違う | [comment-render.md](niconico/comment-render.md) |
| 投稿で「投稿に失敗しました (…)」 | [nvcomment.md](niconico/nvcomment.md#投稿) |
| 投稿で「確認が必要です。公式で開いて投稿してください」 | [nvcomment.md](niconico/nvcomment.md#チャレンジ) |
| ニコるで「ニコるに失敗しました (…)」 | [nvcomment.md](niconico/nvcomment.md#ニコる) |
| OSD に「「いいね！」に失敗しました (…)」、いいね！の状態が公式と違う | [like.md](niconico/like.md#送る) |
| 「お礼メッセージを読み込めませんでした」 | [like.md](niconico/like.md#お礼メッセージ) |
| 共有 NG レベルで隠れる件数が公式と違う | [nvcomment.md](niconico/nvcomment.md#共有-ng-レベル) |
| シークバーの帯に色が付かない | [nvcomment.md](niconico/nvcomment.md#voltagezone) |
| 配色が公式と合わない | [web-ui.md](niconico/web-ui.md#配色) |
| 開いた動画のリンクが訪問済みの見た目にならない | [web-ui.md](niconico/web-ui.md#訪問済みの見た目) |
| `/watch/` を直接開くと公式プレイヤーになる | [behavior.md](extension/behavior.md#直接開く) |
| オーバーレイの上にページの要素が出る | [behavior.md](extension/behavior.md#オーバーレイ) |
| プローブが失敗する | [testing.md](extension/testing.md) |
