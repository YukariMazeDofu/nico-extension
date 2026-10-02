# /// script
# requires-python = ">=3.12"
# dependencies = ["playwright==1.62.0", "pillow==12.1.0"]
# ///
"""拡張を読み込んだ headless Chromium で、自作プレイヤーで開いた動画のリンクが訪問済みの見た目になることを確かめる。
ランキングのページで動画タイトルのリンク（訪問済みで灰色になるもの）をクリックしてオーバーレイを開いて閉じ、リンクの文字色（最も暗い画素）を開く前と比べる。
`/watch/{id}` を直接開いた動画も、ランキングのページに戻ってから同じように比べる。
usage: PLAYWRIGHT_BROWSERS_PATH=<dir> uv run scripts/visited_probe.py .output/chrome-mv3"""
import argparse
import asyncio
import io
import os
import tempfile
from urllib.parse import urlparse

from PIL import Image
from playwright.async_api import async_playwright

RANKING = "https://www.nicovideo.jp/ranking"
TITLE_LINK = "a[href^='/watch/'][class*='visited']"


async def visited_pixels(locator):
    """リンクの中で最も暗い画素（文字色）を返す。"""
    await locator.page.mouse.move(0, 0)
    await locator.page.evaluate("document.activeElement?.blur()")
    await locator.page.wait_for_timeout(300)
    im = Image.open(io.BytesIO(await locator.screenshot())).convert("RGB")
    return min(im.getdata(), key=sum)


async def main(a):
    u = urlparse(os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy") or "")
    px = None
    if u.hostname:
        px = {"server": f"{u.scheme}://{u.hostname}:{u.port}"}
        if u.username:
            px.update(username=u.username, password=u.password or "")
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(
            tempfile.mkdtemp(), channel="chromium", headless=True, proxy=px,
            args=[f"--disable-extensions-except={os.path.abspath(a.ext)}", f"--load-extension={os.path.abspath(a.ext)}"])
        page = await ctx.new_page()
        await page.goto(RANKING, wait_until="load")
        await page.wait_for_timeout(3000)
        links = page.locator(TITLE_LINK)

        print("== リンクのクリックで開く")
        link = links.nth(0)
        href = await link.get_attribute("href")
        before = await visited_pixels(link)
        hist = await page.evaluate("history.length")
        await link.click()
        await page.wait_for_timeout(3000)
        print("url unchanged:", page.url == RANKING, " history unchanged:", await page.evaluate("history.length") == hist)
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(1000)
        print(href, "text color:", before, "->", await visited_pixels(link))

        print("== 直接開く")
        link = links.nth(1)
        href = await link.get_attribute("href")
        before = await visited_pixels(link)
        await page.goto(f"https://www.nicovideo.jp{href}?ref=probe", wait_until="domcontentloaded")
        await page.wait_for_timeout(3000)
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(3000)
        print("back at:", page.url)
        print(href, "text color:", before, "->", await visited_pixels(page.locator(f"{TITLE_LINK}[href='{href}']").first))

        print("== 開いていない動画")
        link = links.nth(2)
        print(await link.get_attribute("href"), "text color:", await visited_pixels(link))
        await ctx.close()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("ext")
    asyncio.run(main(ap.parse_args()))
