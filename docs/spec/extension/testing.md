# 検証

単体テストは持たない。型チェック・ビルドと、拡張を読み込んだ headless Chromium で動作を確かめるプローブで検証し、最後に実機の Chromeで確かめる。

## 型チェックとビルド

```sh
mise exec -- pnpm install
mise exec -- pnpm compile   # tsc --noEmit
mise exec -- pnpm build     # 出力は .output/chrome-mv3
```

## プローブ

`scripts/*_probe.py`（PEP 723）。`uv run` で依存（Playwright 1.62.0 など）を解決し、`.output/chrome-mv3` のビルドを読み込んだ headless Chromium（未ログイン）で動かす。投稿とニコるは送らない。

| プローブ | 引数（`run_probes.sh` の値） | 確かめること |
| --- | --- | --- |
| `ext_probe.py` | `<ページの URL> <秒> [動画 ID] [--recover] [--shot out.png]`（`https://www.nicovideo.jp/ 20 sm46871555 --recover`） | リンクのクリックでのオーバーレイ再生、URL が変わらない、コメントの描画と C での表示・非表示、H での重ねる表示と 2.5 秒後の非表示、パネル上のホイール、ページ要素との重なり、未ログインでいいね！のボタンが無効、ショートカット、ホイール、画質の切り替え、`--recover` でセグメントを 403 にしたときの復帰、閉じて開き直したときの設定、視聴イベント |
| `direct_probe.py` | `<動画 ID>`（`sm9`） | 直接開いたとき（Ctrl+クリックの新しいタブ、トップからの遷移、戻る先がない位置、外部ページからの遷移）の再生・アドレスバー・再読み込み・閉じたときの戻り先、「公式で開く」 |
| `visited_probe.py` | なし | ランキングのリンクから開いた動画と直接開いた動画が訪問済みの色になる |
| `layout_probe.py` | `<動画 ID> [--shots dir]`（`sm46871555`） | 画面の大きさ 6 種での動画の枠・黒い帯・パネルの幅・はみ出し、テーマ 6 状態の背景色と復元 |
| `post_probe.py` | `<動画 ID>`（`sm27201969`） | 投稿欄が無効で理由が出る、入力欄のキーがショートカットにならない、Esc・Enter、重ねる表示で入力中は隠れない |
| `list_probe.py` | `<動画 ID> [--shot out.png]`（`sm27201969`） | コメント一覧の件数・順序・再生位置への追従・時刻のクリック・ホバー中は追従しない・自動スクロールの復元・ニコるが無効・タブ |
| `ng_probe.py` | `<動画 ID> [--shot out.png]`（`sm9`） | 共有 NG レベルごとの件数（`score` から数えた件数と一覧・タブの `title`・流すコメント）、復元 |
| `heatmap_probe.py` | `<動画 ID> [--shot out.png]`（`sm9`） | 帯の色と `voltageZone` の対応、帯の太さ、表示・隠す、強調のスライダー、復元 |
| `resume_probe.py` | `<動画 ID>`（`sm9`） | 前回の再生位置の印・先頭からの再生・印のクリック・3 秒未満で書かない・`ended` で消す・1,000 件の上限・すべて消す・前回の位置から再生する設定 |

1 本だけ流すとき:

```sh
PLAYWRIGHT_BROWSERS_PATH=<dir> uv run scripts/ext_probe.py .output/chrome-mv3 https://www.nicovideo.jp/ 20 sm46871555 --recover
```

- `PLAYWRIGHT_BROWSERS_PATH` は Playwright の Chromium を置くディレクトリ。
- 共通部分は `scripts/probe_common.py`。`launch(ext, **options)` は拡張をプローブごとに一時ディレクトリへ複製して読み込み、静的な規則（`/watch/` のリダイレクト）が有効になるまで最大 30 秒待つ。ロケールは `ja-JP`、プロキシは環境変数 `HTTPS_PROXY` を渡す。
- ネットワークの許可が要る環境では `*.nicovideo.jp`・`*.nimg.jp` を許可する。

## 変更の前後で比べる

1. 変更前の main をビルドし、`PLAYWRIGHT_BROWSERS_PATH=<dir> sh scripts/run_probes.sh <基準の出力先>` を流す（9 本を同時に、約 5 分）。各プローブの出力は `<出力先>/<名前>.txt`、最後の行が `exit {終了コード}`。
1. 変更後にビルドして `run_probes.sh <変更後の出力先>` を流す。
1. `sh scripts/cmp_probes.sh <基準> <変更後>` で差を見る。時刻・動画 ID・タイトル・処理時間を伏せて比べ、最後に視聴イベントとコメントの取得の件数を並べる。
1. 差が期待どおりの変更だけなら一致とみなす。

- プローブの実行中はビルドしない。
- 一部だけ流すときは名前を並べる（`run_probes.sh <出力先> ext ng`）。

差が出ても拡張の不具合ではないもの:

- コメント数の増減、トップページのリンクの `ref`。
- `ext_probe.py` の出力の、トップページの公式のプレビュー再生（`/hlsext/`）の `ERR_ABORTED` と `pageerror`。
- 同時に流したときの読み込みの遅れ。`heatmap_probe.py` が動画の読み込み前に測る（枠が 16:9、キャッシュ済みが 0、`video unchanged False`）、`post_probe.py` で再生・一時停止が逆になる、など。その本だけ流し直して比べる。

## 注意

- `ext_probe.py` に読み込めない動画（`sm1` など）を渡すと終わらない。エラー表示は、リンクを差し込んでクリックし `.message` の文字を読む使い捨てのスクリプトで確かめる（差し込むリンクは共通ヘッダーに隠れない位置に置く）。
- `ext_probe.py` に `/ranking` と動画 ID を渡すと、差し込んだリンクのクリックで公式の watch ページへ移って失敗する。ランキングの実際のリンク（動画 ID なし）とトップページでは通る。
- headless では、ユーザー操作のない遷移（`page.goto`）で開くと自動再生が止められ、一時停止のまま開く。
- headless では WebGL が SwiftShader（ソフトウェア）で動く。描画の性能は実機の Chrome で測る。
- ページを離れるときの `keepalive` の fetch は Playwright の `request` イベントに出ない。数えるときは Chromium の `--log-net-log` を使う。

## 実機の Chrome での確認

- ログイン状態での投稿・ニコる・取り消し・いいね！・自分の投稿の見た目、見た目全般、ホイールとキーの操作感は実機の Chrome で確かめる。
- 投稿の確認には `sm27201969`（コメント練習用の動画）を使う。
- 拡張を更新したら、`chrome://extensions` で拡張を再読み込みし、nicovideo.jp のタブも再読み込みする。
