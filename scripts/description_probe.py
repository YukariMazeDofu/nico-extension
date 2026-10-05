# /// script
# requires-python = ">=3.12"
# dependencies = ["playwright==1.62.0"]
# ///
"""拡張を読み込んだ headless Chromium（未ログイン）で、説明文の再生位置を確かめる。
ボタンの数と秒数を watch ページの説明文の `a.seekTime` と比べ、`href` が `#` のリンクが残らないこと、一時停止中と再生中にボタンを押したときの位置と状態を見る。
usage: PLAYWRIGHT_BROWSERS_PATH=<dir> uv run scripts/description_probe.py .output/chrome-mv3 <video_id>"""
import argparse
import asyncio

from probe_common import SHADOW, launch

# watch ページの説明文の `a.seekTime` の `data-seektime` と文字
EXPECTED = """async (id) => {
    const html = await (await fetch(`https://www.nicovideo.jp/watch/${id}?nico-ext=off`, {credentials: 'include'})).text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const res = JSON.parse(doc.querySelector('meta[name="server-response"]').content);
    const desc = new DOMParser().parseFromString(res.data.response.video.description, 'text/html');
    return [...desc.querySelectorAll('a.seekTime')].map(a => [a.dataset.seektime, a.textContent]); }"""
STATE = f"""() => {{ const r = {SHADOW}; const v = r.querySelector('video'); const d = r.querySelector('.description');
    const buttons = [...d.querySelectorAll('.seek-time')];
    return {{t: +v.currentTime.toFixed(1), paused: v.paused,
      buttons: buttons.map(b => [+b.dataset.seconds, b.textContent, b.title]),
      hashLinks: [...d.querySelectorAll('a')].filter(a => a.getAttribute('href').endsWith('#')).length}}; }}"""


def seconds(text):
    t = 0
    for part in text.split(":"):
        t = t * 60 + int(part)
    return t


async def main(a):
    async with launch(a.ext, viewport={"width": 1280, "height": 720}) as ctx:
        page = await ctx.new_page()
        page.on("pageerror", lambda e: print("pageerror", e))
        await page.goto(f"https://www.nicovideo.jp/watch/{a.video_id}", wait_until="domcontentloaded")
        await page.wait_for_timeout(5000)
        expected = await page.evaluate(EXPECTED, a.video_id)
        state = await page.evaluate(STATE)
        print("open      ", {k: v for k, v in state.items() if k != "buttons"})
        print("buttons   ", len(state["buttons"]), state["buttons"])
        print("matches   ", [[seconds(s), text, "この位置へ移動"] for s, text in expected] == state["buttons"] and len(expected) > 0)

        overlay = page.locator("nico-ext-overlay")
        target = state["buttons"][min(3, len(state["buttons"]) - 1)][0]
        await overlay.locator(".seek-time").nth(min(3, len(state["buttons"]) - 1)).click()
        await page.wait_for_timeout(500)
        state = await page.evaluate(STATE)
        print("paused    ", target, {"t": state["t"], "paused": state["paused"]})

        await page.keyboard.press("Space")
        await page.wait_for_timeout(1000)
        target = state["buttons"][min(1, len(state["buttons"]) - 1)][0]
        await overlay.locator(".seek-time").nth(min(1, len(state["buttons"]) - 1)).click()
        await page.wait_for_timeout(1500)
        state = await page.evaluate(STATE)
        print("playing   ", target, {"t": state["t"], "paused": state["paused"]})


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("ext")
    ap.add_argument("video_id")
    asyncio.run(main(ap.parse_args()))
