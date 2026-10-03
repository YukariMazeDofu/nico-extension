"""プローブの共通部分。拡張を読み込んだ headless Chromium を起動する。
`uv run scripts/<name>_probe.py` で実行したプローブから `from probe_common import ...` で読み込む。"""
import os
import shutil
import tempfile
from contextlib import asynccontextmanager
from urllib.parse import urlparse

from playwright.async_api import async_playwright

SHADOW = "document.querySelector('nico-ext-overlay')?.shadowRoot"
# 静的な規則で `/nico-ext/watch/` へリダイレクトされる、存在しない動画の URL
RULE_CHECK_URL = "https://www.nicovideo.jp/watch/sm0"


def proxy():
    """環境変数 `HTTPS_PROXY` を Playwright の `proxy` の形にする。なければ None。"""
    u = urlparse(os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy") or "")
    if not u.hostname:
        return None
    px = {"server": f"{u.scheme}://{u.hostname}:{u.port}"}
    if u.username:
        px.update(username=u.username, password=u.password or "")
    return px


async def wait_for_rules(ctx, timeout_ms=30000):
    """拡張の静的な規則（`/watch/` のリダイレクト）が有効になるまで待つ。2 回目以降で有効になったら回数を出力する。"""
    page = await ctx.new_page()
    for tries in range(1, timeout_ms // 500 + 1):
        await page.goto(f"{RULE_CHECK_URL}?try={tries}", wait_until="commit")
        if "/nico-ext/watch/" in page.url:
            break
        await page.wait_for_timeout(500)
    else:
        raise TimeoutError(f"redirect rule not active: {page.url}")
    if tries > 1:
        print("redirect rule active after", tries, "tries")
    await page.close()


@asynccontextmanager
async def launch(ext, **options):
    """`ext` の拡張の複製を読み込んだ持続コンテキストを開き、静的な規則が有効になってから渡す。
    複製はプローブごとに作る。Chromium は読み込んだ拡張のディレクトリに `_metadata/` を書き込む。
    `options` は `launch_persistent_context` に渡す（`viewport`・`color_scheme` など）。"""
    path = shutil.copytree(ext, os.path.join(tempfile.mkdtemp(), "ext"), ignore=shutil.ignore_patterns("_metadata"))
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(
            tempfile.mkdtemp(), channel="chromium", headless=True, proxy=proxy(), locale="ja-JP",
            args=[f"--disable-extensions-except={path}", f"--load-extension={path}"], **options)
        try:
            await wait_for_rules(ctx)
            yield ctx
        finally:
            await ctx.close()
