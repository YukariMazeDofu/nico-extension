# /// script
# requires-python = ">=3.12"
# dependencies = ["playwright==1.62.0"]
# ///
"""拡張を読み込んだ headless Chromium で nicovideo.jp のリンククリック→オーバーレイ再生を確かめる。
video_id を渡すとそのリンクを差し込んでクリックし、省略するとページ内の最初の動画リンクをクリックする。
usage: PLAYWRIGHT_BROWSERS_PATH=<dir> uv run scripts/ext_probe.py .output/chrome-mv3 <page_url> <seconds> [video_id]"""
import asyncio
import os
from urllib.parse import urlparse
import re
import sys
import tempfile

from playwright.async_api import async_playwright

MASK = re.compile(r"\?.*$")


async def main(ext, url, secs, vid):
    u = urlparse(os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy") or "")
    px = None
    if u.hostname:
        px = {"server": f"{u.scheme}://{u.hostname}:{u.port}"}
        if u.username:
            px.update(username=u.username, password=u.password or "")
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(
            tempfile.mkdtemp(), channel="chromium", headless=True, proxy=px,
            args=[f"--disable-extensions-except={os.path.abspath(ext)}", f"--load-extension={os.path.abspath(ext)}"])
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        page.on("console", lambda m: m.text.startswith("[nico-ext]") and print("console", m.text))
        page.on("pageerror", lambda e: print("pageerror", e))

        def on_resp(r):
            u = r.url
            if "domand" in u or "access-rights" in u:
                kind = u.rsplit("/", 1)[-1].split("?")[0]
                print("resp", r.status, r.request.method, MASK.sub("", u).split("nicovideo.jp")[0] + "…/" + kind)
        page.on("response", on_resp)
        page.on("requestfailed", lambda r: ("domand" in r.url or "nvapi" in r.url) and print("reqfailed", MASK.sub("", r.url), r.failure))

        await page.goto(url, wait_until="domcontentloaded")
        await page.wait_for_timeout(3000)
        print("mse avc1:", await page.evaluate("MediaSource.isTypeSupported('video/mp4; codecs=\"avc1.64001f\"')"),
              "aac:", await page.evaluate("MediaSource.isTypeSupported('audio/mp4; codecs=\"mp4a.40.2\"')"))
        if vid:
            await page.evaluate(f"""() => {{ const a = document.createElement('a'); a.id='probe'; a.href='/watch/{vid}';
                a.textContent='probe'; a.style.cssText='position:fixed;top:0;left:0;z-index:2147483646';
                document.body.append(a); }}""")
            sel = "#probe"
        else:
            sel = "a[href*='/watch/sm']"
            print("real link:", await page.eval_on_selector(sel, "a => a.href"))
        before = page.url
        await page.click(sel)
        await page.wait_for_timeout(secs * 1000)
        print("workers:", [w.url[:40] for w in page.workers])
        print("url unchanged:", page.url == before)
        print("overlay host:", await page.evaluate("!!document.querySelector('nico-ext-overlay')"))
        st = await page.evaluate("""() => { const v = document.querySelector('nico-ext-overlay')?.shadowRoot?.querySelector('video');
            return v && {t: v.currentTime, paused: v.paused, rs: v.readyState, err: v.error && v.error.code, w: v.videoWidth}; }""")
        print("video:", st)
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(500)
        print("closed:", not await page.evaluate("!!document.querySelector('nico-ext-overlay')"))
        await ctx.close()


asyncio.run(main(sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4] if len(sys.argv) > 4 else None))
