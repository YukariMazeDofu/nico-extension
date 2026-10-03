# 公式の画面

## 配色

- watch ページは `body[data-color-scheme]`（`auto`・`light`・`dark`）でテーマを切り替える。`auto` は `@media (prefers-color-scheme)` に従う。
- `[data-color-scheme=light]`・`[data-color-scheme=dark]` に約 145 個の `--colors-*` がある。拡張が合わせるトークン:

| 公式のトークン | ライト | ダーク | 拡張の変数 |
| --- | --- | --- | --- |
| `layer.background` | `#f2f2f2` | `#0d0d0d` | `--bg` |
| `layer.surfaceHighEm` | `#fff` | `#252525` | `--surface` |
| `textOnLayer.highEm` | `#1a1a1a` | `#f2f2f2` | `--fg` |
| `textOnLayer.mediumEm` | `#1a1a1a` の 0.8 | `#f2f2f2` の 0.8 | `--fg-2` |
| `textOnLayer.lowEm` | `#1a1a1a` の 0.6 | `#f2f2f2` の 0.6 | `--fg-3` |
| `action.base` | `#1a1a1a` の 0.05 | `#f2f2f2` の 0.1 | `--fill` |
| `action.baseHover` | `#1a1a1a` の 0.1 | `#f2f2f2` の 0.2 | `--fill-hover` |
| `border.base` | `#1a1a1a` の 0.1 | `#f2f2f2` の 0.1 | `--border` |
| `action.primaryAzure` | `#1a80e6` | `#1a80e6` | `--accent` |
| `textOnLayer.accentAzure` | `#1a80e6` | `#1a80e6` | `--link`（ダークは `#5aa7f2`） |
| `icon.lock` | `#b88f14` | `#b88f14` | `--lock` |
| `icon.watchControllerBase` / `Hover` | `#ccc` / `#fff` | `#ccc` / `#fff` | `--ctrl` / `--ctrl-hover` |
| `textOnLayer.visited` | `#b3b3b3` | `#666` | |

- フォントは `--fonts-default`（`-apple-system, BlinkMacSystemFont, "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif`）と、数字用の `--fonts-meta-number`（`"Avenir Next", "Arial", sans-serif`）。角の丸みは 4・8・16px。
- 動画とコントロールは、テーマによらず黒。

- **確認**: 2026-10-03、`root-*.css`。
- **コード**: `entrypoints/overlay.content/style.css`（`.backdrop` の変数）。
- **確かめ方**: `root-*.css` を取得して `[data-color-scheme=light]`・`[data-color-scheme=dark]` の値を比べる。`layout_probe.py` の `== テーマ` で背景が `rgb(242, 242, 242)` / `rgb(13, 13, 13)`。

## 訪問済みの見た目

- ランキング・タグ・検索・watch ページの関連動画のタイトルのリンクは、クラス `visited:text-layer_visited`（`color: var(--colors-text-on-layer-visited)`）を持つ。href は `/watch/{id}`（クエリなし）。
- トップページ（`pages_index_TopPage.css`）とユーザーページには訪問済みの見た目がない。トップページのリンクは `?ref=nicotop_…` 付き。
- `:visited` はクエリまで一致した URL にだけ付く。

- **確認**: 2026-10-03、ランキングのページ、headless Chromium。
- **コード**: `entrypoints/overlay.content/index.ts`（`markVisited`）。
- **確かめ方**: `visited_probe.py`。開いた動画のリンクの文字色が `(70, 70, 70)` → `(192, 192, 192)`、開いていない動画は変わらない。文字色はスクリーンショットの画素で比べる（`getComputedStyle` は `:visited` の色を返さない）。
- **壊れたとき**: `visited_probe.py` で文字色が変わらない。ランキングのリンクのクラスが変わると `visited_probe.py` がリンクを見つけられない。
