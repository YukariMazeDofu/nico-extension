# /// script
# requires-python = ">=3.12"
# dependencies = ["playwright==1.62.0"]
# ///
"""拡張を読み込んだ headless Chromium で、`/watch/{id}` を直接開いたときの動作を確かめる。
新しいタブ・ページ内の遷移・外部ページからの遷移・Ctrl+クリックで開いたときに自作プレイヤーで再生されること、
アドレスバーの URL、再読み込み、閉じたときの戻り先、「公式で開く」を順に試す。
usage: PLAYWRIGHT_BROWSERS_PATH=<dir> uv run scripts/direct_probe.py .output/chrome-mv3 <video_id>"""
import argparse
import asyncio
import os
import tempfile
from urllib.parse import urlparse

from playwright.async_api import async_playwright

TOP = "https://www.nicovideo.jp/"
SHADOW = "document.querySelector('nico-ext-overlay')?.shadowRoot"
STATE = f"""() => {{ const v = {SHADOW}?.querySelector('video');
    return {{url: location.href, title: document.title, overlay: !!v, t: v ? +v.currentTime.toFixed(1) : null,
      officialVideo: !!document.querySelector('video')}}; }}"""


async def state(page, wait=4000):
    await page.wait_for_timeout(wait)
    return await page.evaluate(STATE)


async def main(a):
    u = urlparse(os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy") or "")
    px = None
    if u.hostname:
        px = {"server": f"{u.scheme}://{u.hostname}:{u.port}"}
        if u.username:
            px.update(username=u.username, password=u.password or "")
    watch = f"https://www.nicovideo.jp/watch/{a.video_id}"
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(
            tempfile.mkdtemp(), channel="chromium", headless=True, proxy=px, locale="ja-JP",
            args=[f"--disable-extensions-except={os.path.abspath(a.ext)}", f"--load-extension={os.path.abspath(a.ext)}"])

        page = await ctx.new_page()
        page.on("pageerror", lambda e: print("pageerror", e))

        async def ctrl_click_tab():
            await page.goto(TOP, wait_until="domcontentloaded")
            await page.wait_for_timeout(3000)
            async with ctx.expect_page() as info:
                await page.locator("a[href*='/watch/']").first.click(modifiers=["Control"])
            tab = await info.value
            await tab.wait_for_load_state("domcontentloaded")
            return tab

        print("== トップページのリンクを Ctrl+クリックした新しいタブ → 再読み込み → 再生 → 閉じるとトップページ")
        tab = await ctrl_click_tab()
        print("open   ", await state(tab), "history", await tab.evaluate("history.length"))
        await tab.reload(wait_until="domcontentloaded")
        print("reload ", await state(tab))
        await tab.keyboard.press("Space")
        print("play   ", await state(tab))
        await tab.keyboard.press("Escape")
        print("close  ", await state(tab, 2000))

        print("== トップページから遷移 → 閉じると戻る")
        await tab.goto(watch + "?ref=probe", wait_until="domcontentloaded")
        print("open   ", await state(tab))
        await tab.keyboard.press("Escape")
        print("close  ", await state(tab, 2000))

        print("== 戻る先がない位置（新しいタブで開き、別の URL へ移ってから戻った） → 閉じるとトップページ")
        await tab.close()
        tab = await ctrl_click_tab()
        await tab.goto(TOP + "ranking", wait_until="domcontentloaded")
        await tab.go_back(wait_until="domcontentloaded")
        print("open   ", await state(tab))
        await tab.keyboard.press("Escape")
        print("close  ", await state(tab, 2000))
        await tab.close()

        print("== 外部ページから遷移 → 閉じると戻る")
        await page.goto(f"data:text/html,<a href='{watch}'>link</a>")
        await page.click("a")
        print("open   ", await state(page))
        await page.keyboard.press("Escape")
        print("close  ", await state(page, 2000))

        print("== 「公式で開く」 → 戻ると外部ページ")
        await page.click("a")
        await page.wait_for_timeout(3000)
        await page.locator("nico-ext-overlay").locator("button.official").click()
        print("official", await state(page))
        await page.go_back(wait_until="domcontentloaded")
        print("back   ", await state(page, 2000))
        await ctx.close()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("ext")
    ap.add_argument("video_id")
    asyncio.run(main(ap.parse_args()))
