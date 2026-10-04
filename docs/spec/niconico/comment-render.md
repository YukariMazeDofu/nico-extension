# コメントのコマンドと配置

コメントのコマンドの解釈と、1920×1080 の座標系での配置を定める。配置は描画方式に依存しない純粋な関数で行う。描画は [architecture.md](../extension/architecture.md#コメントの描画)。

## コマンド

`commands[]` を先頭から読む。位置・大きさ・フォント・色・表示時間は、最初に現れたものだけが効く。大文字・小文字は区別しない。

| 種類 | コマンド | 既定 |
| --- | --- | --- |
| 位置 | `ue`・`shita`・`naka` | `naka` |
| 大きさ | `big`・`medium`・`small` | `medium` |
| フォント | `defont`・`mincho`・`gothic` | `defont` |
| 色 | 色名（下の表）、`#RRGGBB` | `white` |
| 表示時間 | `@秒数`・`＠秒数`（小数可、上限 120 秒） | 3 秒 |
| 半透明 | `_live`（不透明度 0.5） | |
| 縮小幅 | `full`（固定コメントの縮小の幅を全幅にする） | |
| 縮小しない | `ender`（改行による縮小と幅の縮小をしない） | |
| 表示しない | `invisible` | |

| 色名 | 値 | 色名 | 値 |
| --- | --- | --- | --- |
| `white` | `#FFFFFF` | `white2`・`niconicowhite` | `#CCCC99` |
| `red` | `#FF0000` | `red2`・`truered` | `#CC0033` |
| `pink` | `#FF8080` | `pink2` | `#FF33CC` |
| `orange` | `#FFC000` | `orange2`・`passionorange` | `#FF6600` |
| `yellow` | `#FFFF00` | `yellow2`・`madyellow` | `#999900` |
| `green` | `#00FF00` | `green2`・`elementalgreen` | `#00CC66` |
| `cyan` | `#00FFFF` | `cyan2` | `#00CCCC` |
| `blue` | `#0000FF` | `blue2`・`marinblue` | `#3399FF` |
| `purple` | `#C000FF` | `purple2`・`nobleviolet` | `#6633CC` |
| `black` | `#000000` | `black2` | `#666666` |

それ以外のコマンド（`184`・`device:…` など）は無視する。

- **コード**: `lib/comment/spec.ts`（`toSpec`）。
- **壊れたとき**: 色・大きさ・位置が公式と違う。

## 配置

基準値は公式の現行プレイヤーの定義に合わせる。

- 座標系は 1920×1080。動画の枠（全画面では画面）を内側に含む最小の 16:9 の矩形に当たる。
- 基準の枠は、座標系の横の中央に置いた 1440×1080（高さ × 4/3）。

| 大きさ | 文字の大きさ = 1080 / 値 | 行の高さの値 | 改行で縮小したときの行の高さの値 | 縮小する行数 |
| --- | --- | --- | --- | --- |
| big | 7.8 | 8.4 | 16 | 3 行以上 |
| medium | 11.3 | 13.1 | 25.4 | 5 行以上 |
| small | 16.6 | 21 | 38 | 7 行以上 |

- 文字の大きさを `s`、行の高さの値を `n`、縮小したときの値を `m` とする。
    - 行の高さは `(1080 − s) / (n − 1)`。
    - 改行で縮小したときの行の高さは `(1080 − s × n / m) / (m − 1)`、文字の大きさは `s` × 縮小した行の高さ / 行の高さ。
    - フォントサイズは文字の大きさの 0.8 倍。
    - コメントの高さは `行の高さ × (行数 − 1) + 文字の大きさ`。
- フォント:

| 指定 | `font-family` | 太さ |
| --- | --- | --- |
| `defont` | `Arial, "ＭＳ Ｐゴシック", "MS PGothic", MSPGothic, "Hiragino Sans", sans-serif` | 600 |
| `gothic` | `"游ゴシック体", "游ゴシック", "Yu Gothic", YuGothic, SimSun, Arial, sans-serif` | 400 |
| `mincho` | `"游明朝体", "游明朝", "Yu Mincho", YuMincho, SimSun, Arial, serif` | 400 |

- 流れるコメント（`naka`）
    - `vposMs` − 1000ms に左端が基準の枠の右端（x = 1680）にあり、`vposMs` + 表示時間に右端が基準の枠の左端（x = 240）に着く。速さは `(1440 + 幅) / (表示時間 + 1000ms)`（px/ms）。
    - 表示するのは `vposMs` − 2000ms から `vposMs` + 表示時間 + 1000ms まで。
    - 当たり判定は、両方が基準の枠に掛かっている時間の両端で前後関係を比べる。
- 固定コメント（`ue`・`shita`）
    - `vposMs` から表示時間だけ、横の中央に出す。
    - 幅が 1440（`full` は 1920）を超えると、文字の大きさと行の高さを同じ割合で縮めて収める。`ender` では縮めない。
- 縦の位置
    - 当たり判定は、投稿者コメントとそれ以外でレイヤーを分け、さらに `naka`・`ue`・`shita` ごとに分ける。
    - `naka`・`ue` は上から、`shita` は下から、重なるコメントを避けた位置を探す。
    - 収まらないコメントは、コメントの `id` から決めた乱数の位置に置く。高さが 1080 以上のコメントは縦の中央に置く。

- **確認**: 2026-10-04、`PlayerSeekBar-*.js`（`LINE_COUNT_FOR_CHARACTER_SIZE`・`LINE_COUNT_FOR_LINE_HEIGHT`・`LINE_COUNT_FOR_LINE_HEIGHT_AT_RESIZE`・`getBaseSize`・`getVposInfoForMoving`・`getStagingXInfoForMoving`・`resizeSlotIfNeed`・`measureHeight`・`updateAspectRatio`、文字の大きさに掛ける 0.8）。
- **コード**: `lib/comment/layout.ts`（`layoutComments`）。
- **確かめ方**: ランダムな 600 件・10 分の入力で、同じ種類のコメント同士の重なりと画面外へのはみ出しが 0 件になること（`layout.ts` は型を除けば Node で直接実行できる）。`ext_probe.py` の `comments drawn: True`。
- **壊れたとき**: コメント同士が重なる、画面外にはみ出す。4:3 の動画でコメントが小さく、中央の帯にしか流れない。

## ニコスクリプト

- 投稿者コメントのうち `@`・`＠` で始まるものは表示しない。ニコスクリプトは解釈しない。
- 公式の現行プレイヤーが解釈するのは `ピザ`・`デフォルト`・`置換`・`逆`・`ジャンプ`・`シーク禁止`・`コメント禁止` の 7 つ。`＠ボタン` はない。
- 投稿者のスレッドが `hasNicoscript: true` の動画: `sm27201969`。

- **確認**: 2026-10-03、`PlayerSeekBar-*.js`。
- **コード**: `lib/comment/spec.ts`（`NICOSCRIPT`）。
