# /// script
# requires-python = ">=3.12"
# dependencies = ["playwright==1.62.0"]
# ///
"""拡張を読み込んだ headless Chromium（未ログイン）で、コメントの投稿欄を確かめる。
投稿欄の状態（無効と理由の表示）、入力欄でのキー入力がショートカットにならないこと、Esc で入力欄から抜けること、
Enter で入力欄に移ること、投稿欄を足したあとのコントロールの位置と動画に重ねたときの隠れ方を試す。
未ログインでは投稿欄が無効なので、キー入力の確認では無効を外す。投稿はしない。
usage: PLAYWRIGHT_BROWSERS_PATH=<dir> uv run scripts/post_probe.py .output/chrome-mv3 <video_id>"""
import argparse
import asyncio
import os
import tempfile
from urllib.parse import urlparse

from playwright.async_api import async_playwright

SHADOW = "document.querySelector('nico-ext-overlay')?.shadowRoot"
STATE = f"""() => {{ const r = {SHADOW}; const v = r.querySelector('video'); const b = r.querySelector('.post-body');
    const stage = r.querySelector('.stage').getBoundingClientRect(), controls = r.querySelector('.controls').getBoundingClientRect();
    return {{overlay: !!r.querySelector('.backdrop'), paused: v.paused, t: +v.currentTime.toFixed(1),
      disabled: b.disabled, placeholder: b.placeholder, value: b.value, commands: r.querySelector('.post-commands').value,
      focused: r.activeElement?.className ?? null, controlsBelowVideo: controls.top >= stage.bottom - 1,
      controlsOpacity: getComputedStyle(r.querySelector('.controls')).opacity}}; }}"""


async def main(a):
    u = urlparse(os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy") or "")
    px = None
    if u.hostname:
        px = {"server": f"{u.scheme}://{u.hostname}:{u.port}"}
        if u.username:
            px.update(username=u.username, password=u.password or "")
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(
            tempfile.mkdtemp(), channel="chromium", headless=True, proxy=px, locale="ja-JP",
            viewport={"width": 1280, "height": 720},
            args=[f"--disable-extensions-except={os.path.abspath(a.ext)}", f"--load-extension={os.path.abspath(a.ext)}"])
        page = await ctx.new_page()
        page.on("pageerror", lambda e: print("pageerror", e))
        page.on("console", lambda m: "[nico-ext] comment" in m.text and print("console", m.text))
        await page.goto(f"https://www.nicovideo.jp/watch/{a.video_id}", wait_until="domcontentloaded")
        await page.wait_for_timeout(5000)
        print("open      ", await page.evaluate(STATE))

        await page.evaluate(f"() => {SHADOW}.querySelectorAll('.post :disabled').forEach(e => e.disabled = false)")
        await page.keyboard.press("Enter")
        await page.wait_for_timeout(200)
        print("enter     ", await page.evaluate(STATE))
        await page.keyboard.type("kj m f 0")
        await page.wait_for_timeout(500)
        print("typed     ", await page.evaluate(STATE))
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(200)
        print("escape    ", await page.evaluate(STATE))
        await page.keyboard.press("Space")
        await page.wait_for_timeout(1000)
        print("space     ", await page.evaluate(STATE))

        await page.keyboard.press("h")
        await page.locator("nico-ext-overlay").locator(".post-commands").click()
        await page.keyboard.type("ue red")
        await page.mouse.move(400, 300)
        await page.wait_for_timeout(3500)
        print("unpinned, focused, idle", await page.evaluate(STATE))
        await page.keyboard.press("Escape")
        await page.mouse.move(410, 300)
        await page.wait_for_timeout(3500)
        print("unpinned, blurred, idle", await page.evaluate(STATE))
        if a.shot:
            await page.mouse.move(420, 300)
            await page.keyboard.press("h")
            await page.wait_for_timeout(500)
            await page.screenshot(path=a.shot)
        await ctx.close()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("ext")
    ap.add_argument("video_id")
    ap.add_argument("--shot")
    asyncio.run(main(ap.parse_args()))
