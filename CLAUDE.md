# nico-extension

ニコニコ動画の動画を、`nicovideo.jp` のページの上のオーバーレイで再生する Chrome 専用の Manifest V3 拡張（WXT・TypeScript）。仕様書は `docs/spec/`。

## 変更の進め方

- 機能の追加・変更は、実装の前に `docs/spec/` を直す。
    1. `feature/*` ブランチの最初のコミットで、`docs/spec/extension/requirements.md`（機能の表と状態）・`behavior.md`（動作と各節の **確かめ方**）・必要なら `architecture.md` と `niconico/` を直す。
    1. 仕様書の差分をユーザーに見せ、確認を取ってから実装に進む。
    1. 仕様書に合わせて実装し、各節の確かめ方で確かめる。
    1. 実装のコミットで、`requirements.md` の状態を「実装済み」にし、`behavior.md` の見出しから「（未実装）」を外す。
- 実装が仕様書と食い違ったら、実装を仕様書に合わせる。仕様を変えるときは、仕様書を先に直してユーザーの確認を取る。
- 仕様書と実装は同じ PR に入れる。
- 型チェック・ビルド・プローブは `docs/spec/extension/testing.md` のとおりに行う。
- コードのコメントと仕様書には、完成状態の断定だけを書く（経緯・理由づけを書かない）。
