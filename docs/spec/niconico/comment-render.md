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

基準値は [niconicomments](https://github.com/xpadev-net/niconicomments)（MIT）の HTML5 用の定義（`src/definition/initConfig.ts`・`src/utils/comment.ts`）に準拠する。

- 座標系は 1920×1080。倍率 `SCALE` は 1920 / 683。

| 大きさ | フォントサイズ（通常 / 改行で縮小） | 行の高さ = 1080 / 行数（通常 / 縮小） | 縮小する行数 |
| --- | --- | --- | --- |
| big | 39 / 19.5 × `SCALE` | 8.4 / 16 | 3 行以上 |
| medium | 27 / 14 × `SCALE` | 13.1 / 25.4 | 5 行以上 |
| small | 18 / 10 × `SCALE` | 21 / 38 | 7 行以上 |

- フォント:

| 指定 | `font-family` | 太さ |
| --- | --- | --- |
| `defont` | `Arial, "ＭＳ Ｐゴシック", "MS PGothic", MSPGothic, "Hiragino Sans", sans-serif` | 600 |
| `gothic` | `"游ゴシック体", "游ゴシック", "Yu Gothic", YuGothic, SimSun, Arial, sans-serif` | 400 |
| `mincho` | `"游明朝体", "游明朝", "Yu Mincho", YuMincho, SimSun, Arial, serif` | 400 |

- 流れるコメント（`naka`）
    - 速さは `(1530 + 幅 × 0.95) / (表示時間 + 1000ms)`（px/ms）。
    - x = 1920（右端の外）から出て、x = −幅（左端の外）で消える。`vposMs` の 1 秒前に x = 1725 にある。
    - 当たり判定は x が 235〜1685 の範囲だけで行い、横の余白は 5。
- 固定コメント（`ue`・`shita`）
    - `vposMs` から表示時間だけ、横の中央に出す。
    - 幅が 512 × `SCALE`（`full` は 1920）を超えると、フォントサイズと行の高さを縮めて収める。`ender` では縮めない。
- 縦の位置
    - 当たり判定は、投稿者コメントとそれ以外でレイヤーを分け、さらに `naka`・`ue`・`shita` ごとに分ける。
    - `naka`・`ue` は上から、`shita` は下から、重なるコメントを避けた位置を探す。
    - 収まらないコメントは、コメントの `id` から決めた乱数の位置に置く。高さが 1080 以上のコメントは縦の中央に置く。

- **確認**: 2026-10-02、niconicomments の `master`。
- **コード**: `lib/comment/layout.ts`（`layoutComments`）。
- **確かめ方**: ランダムな 600 件・10 分の入力で、同じ種類のコメント同士の重なりと画面外へのはみ出しが 0 件になること（`layout.ts` は型を除けば Node で直接実行できる）。`ext_probe.py` の `comments drawn: True`。
- **壊れたとき**: コメント同士が重なる、画面外にはみ出す。

## ニコスクリプト

- 投稿者コメントのうち `@`・`＠` で始まるものは表示しない。ニコスクリプトは解釈しない。
- 公式の現行プレイヤーが解釈するのは `ピザ`・`デフォルト`・`置換`・`逆`・`ジャンプ`・`シーク禁止`・`コメント禁止` の 7 つ。`＠ボタン` はない。
- 投稿者のスレッドが `hasNicoscript: true` の動画: `sm27201969`。

- **確認**: 2026-10-03、`PlayerSeekBar-*.js`。
- **コード**: `lib/comment/spec.ts`（`NICOSCRIPT`）。
