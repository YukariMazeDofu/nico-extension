# /// script
# requires-python = ">=3.12"
# dependencies = ["playwright==1.62.0"]
# ///
"""拡張を読み込んだ headless Chromium（未ログイン）で、共有 NG レベルを確かめる。
`/v1/threads` の応答の `score` から数えた件数と、一覧の件数・タブの title・流すコメントの件数（console のログ）を
レベルごとに比べる。設定タブの選択の表示と、開き直したときの復元も試す。
usage: PLAYWRIGHT_BROWSERS_PATH=<dir> uv run scripts/ng_probe.py .output/chrome-mv3 <video_id> [--shot out.png]"""
import argparse
import asyncio
import json

from probe_common import SHADOW, launch

STATE = f"""() => {{ const r = {SHADOW}; const tab = r.querySelectorAll('.tab')[1];
    return {{rows: r.querySelectorAll('.crow').length, tabTitle: tab.title,
      pressed: r.querySelector('.segmented [aria-pressed=true]')?.textContent ?? null,
      settingsHidden: r.querySelector('.settings').hidden}}; }}"""
THRESHOLDS = {"無": None, "弱": -10000, "中": -4800, "強": -1000}


async def main(a):
    async with launch(a.ext, viewport={"width": 1280, "height": 720}) as ctx:
        page = await ctx.new_page()
        scores: list[int] = []
        logs: list[str] = []

        async def on_response(res):
            if res.request.method == "POST" and res.url.endswith("/v1/threads"):
                data = json.loads(await res.body())["data"]
                scores[:] = [c["score"] for t in data["threads"] for c in t["comments"]]

        page.on("response", on_response)
        page.on("pageerror", lambda e: print("pageerror", e))
        page.on("console", lambda m: "[nico-ext] comments" in m.text and logs.append(m.text))
        await page.goto(f"https://www.nicovideo.jp/watch/{a.video_id}", wait_until="domcontentloaded")
        await page.wait_for_timeout(5000)
        expected = {k: sum(1 for s in scores if t is None or s > t) for k, t in THRESHOLDS.items()}
        print("total", len(scores), "expected rows", expected, "min score", min(scores, default=None))
        print("open (中)", await page.evaluate(STATE), logs[-1:])

        overlay = page.locator("nico-ext-overlay")
        await overlay.locator(".tab").nth(2).click()
        for label in ["無", "弱", "強", "中", "強"]:
            await overlay.locator(".segmented button", has_text=label).click()
            await page.wait_for_timeout(500)
            st = await page.evaluate(STATE)
            print(f"{label}", st, "ok" if st["rows"] == expected[label] else f"NG expected {expected[label]}", logs[-1:])

        await page.reload(wait_until="domcontentloaded")
        await page.wait_for_timeout(5000)
        st = await page.evaluate(STATE)
        print("reopen", st, "ok" if st["rows"] == expected["強"] else f"NG expected {expected['強']}", logs[-1:])
        await overlay.locator(".tab").nth(2).click()
        await page.wait_for_timeout(300)
        print("settings tab", await page.evaluate(STATE))
        if a.shot:
            await page.screenshot(path=a.shot)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("ext")
    ap.add_argument("video_id")
    ap.add_argument("--shot")
    asyncio.run(main(ap.parse_args()))
