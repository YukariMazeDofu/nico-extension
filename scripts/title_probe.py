# /// script
# requires-python = ">=3.12"
# dependencies = ["playwright==1.62.0"]
# ///
"""拡張を読み込んだ headless Chromium（未ログイン）で、動画名のコピーを確かめる。
クリップボードの書き込みを許可してタイトルを押したときのクリップボードの文字と OSD、書き込みを拒んで押したときの OSD を見る。
usage: PLAYWRIGHT_BROWSERS_PATH=<dir> uv run scripts/title_probe.py .output/chrome-mv3 <video_id>"""
import argparse
import asyncio
import re

from probe_common import SHADOW, launch

ORIGIN = "https://www.nicovideo.jp"
# watch ページの `server-response` の動画名
EXPECTED_TITLE = """async (id) => {
    const html = await (await fetch(`https://www.nicovideo.jp/watch/${id}?nico-ext=off`, {credentials: 'include'})).text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const res = JSON.parse(doc.querySelector('meta[name="server-response"]').content);
    return res.data.response.video.title; }"""
TITLE = f"""() => {{ const t = {SHADOW}.querySelector('.title');
    return {{text: t.textContent, title: t.title, cursor: getComputedStyle(t).cursor}}; }}"""
OSD = f"() => {SHADOW}.querySelector('.osd').textContent"


async def set_clipboard_write(ctx, page, setting):
    cdp = await ctx.new_cdp_session(page)
    await cdp.send("Browser.setPermission", {
        "permission": {"name": "clipboard-write", "allowWithoutSanitization": False},
        "setting": setting, "origin": ORIGIN})


async def click_title(page):
    await page.evaluate("() => navigator.clipboard.writeText('').catch(() => {})")
    await page.locator("nico-ext-overlay").locator(".title").click()
    await page.wait_for_timeout(300)
    return await page.evaluate(OSD)


async def main(a):
    async with launch(a.ext, viewport={"width": 1280, "height": 720}) as ctx:
        await ctx.grant_permissions(["clipboard-read", "clipboard-write"], origin=ORIGIN)
        page = await ctx.new_page()
        page.on("pageerror", lambda e: print("pageerror", e))
        await page.goto(f"{ORIGIN}/watch/{a.video_id}", wait_until="domcontentloaded")
        await page.wait_for_timeout(5000)
        title = await page.evaluate(EXPECTED_TITLE, a.video_id)
        escaped = re.sub(r"[\\\[\]]", lambda m: "\\" + m[0], title)
        expected = f"[{escaped}]({ORIGIN}/watch/{a.video_id})"
        print("title     ", await page.evaluate(TITLE))

        osd = await click_title(page)
        clip = await page.evaluate("() => navigator.clipboard.readText()")
        print("allowed   ", {"clipboard": clip, "osd": osd})
        print("matches   ", clip == expected, expected)

        await set_clipboard_write(ctx, page, "denied")
        osd = await click_title(page)
        print("denied    ", {"osd": osd})


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("ext")
    ap.add_argument("video_id")
    asyncio.run(main(ap.parse_args()))
