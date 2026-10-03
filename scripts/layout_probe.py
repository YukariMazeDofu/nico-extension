# /// script
# requires-python = ">=3.12"
# dependencies = ["playwright==1.62.0"]
# ///
"""拡張を読み込んだ headless Chromium で、オーバーレイの配置とテーマを確かめる。
画面の大きさごとに、動画の枠が動画の縦横比に合うこと（黒い帯がないこと）、パネルの幅、ページ全体がはみ出さないことを測る。
テーマはライト・ダーク・OS の設定に合わせるを切り替え、背景色と、開き直したときに設定が残ることを確かめる。
usage: PLAYWRIGHT_BROWSERS_PATH=<dir> uv run scripts/layout_probe.py .output/chrome-mv3 <video_id> [--shots dir]"""
import argparse
import asyncio
import os

from probe_common import SHADOW, launch

SIZES = [(1280, 720), (1920, 1080), (2560, 1440), (3440, 1440), (1280, 1024), (860, 900)]
MEASURE = f"""() => {{
  const r = {SHADOW}; const q = (s) => r.querySelector(s).getBoundingClientRect();
  const v = r.querySelector('video'); const stage = q('.stage'), win = q('.window'), panel = q('.panel'), player = q('.player');
  const aspect = v.videoWidth / v.videoHeight;
  const shown = Math.min(stage.width, stage.height * aspect);
  return {{video: [v.videoWidth, v.videoHeight], player: [Math.round(player.width), Math.round(player.height)],
    barsX: Math.round((stage.width - shown) / 2), barsY: Math.round((stage.height - shown / aspect) / 2),
    panel: Math.round(panel.width), marginX: Math.round(player.left - win.left),
    overflow: Math.round(Math.max(player.bottom, panel.bottom) - win.bottom),
    narrow: r.querySelector('.window').classList.contains('narrow')}}; }}"""
THEME = f"""() => {{ const b = {SHADOW}.querySelector('.backdrop');
  return {{attr: b.dataset.theme ?? null, bg: getComputedStyle(b).backgroundColor,
    pressed: [...b.querySelectorAll('.theme button')].find(x => x.getAttribute('aria-pressed') === 'true')?.title}}; }}"""


async def main(a):
    watch = f"https://www.nicovideo.jp/watch/{a.video_id}"
    async with launch(a.ext, color_scheme="light") as ctx:
        page = await ctx.new_page()
        page.on("pageerror", lambda e: print("pageerror", e))

        async def open_overlay():
            await page.goto(watch, wait_until="domcontentloaded")
            await page.wait_for_function(f"() => {SHADOW}?.querySelector('video')?.videoWidth > 0", timeout=30000)
            await page.wait_for_timeout(1500)

        async def shot(name):
            if a.shots:
                await page.screenshot(path=os.path.join(a.shots, f"{name}.png"))

        print("== 画面の大きさと動画の枠")
        await open_overlay()
        for w, h in SIZES:
            await page.set_viewport_size({"width": w, "height": h})
            await page.wait_for_timeout(500)
            print(f"{w}x{h}".ljust(10), await page.evaluate(MEASURE))
            await shot(f"size-{w}x{h}")
        await page.set_viewport_size({"width": 1280, "height": 720})
        await page.keyboard.press("h")
        await page.wait_for_timeout(500)
        print("overlay controls (h)", await page.evaluate(MEASURE))
        await page.keyboard.press("h")

        print("== テーマ")
        print("auto, OS light  ", await page.evaluate(THEME))
        await page.emulate_media(color_scheme="dark")
        print("auto, OS dark   ", await page.evaluate(THEME))
        await shot("theme-auto-dark")
        await page.evaluate(f"() => {SHADOW}.querySelector('.theme button[title=\"ライト\"]').click()")
        print("light, OS dark  ", await page.evaluate(THEME))
        await shot("theme-light")
        await open_overlay()
        print("reopened        ", await page.evaluate(THEME))
        await page.evaluate(f"() => {SHADOW}.querySelector('.theme button[title=\"ダーク\"]').click()")
        await page.emulate_media(color_scheme="light")
        print("dark, OS light  ", await page.evaluate(THEME))
        await page.evaluate(f"() => {SHADOW}.querySelector('.theme button[title=\"OS の設定に合わせる\"]').click()")
        print("auto, OS light  ", await page.evaluate(THEME))


ap = argparse.ArgumentParser()
ap.add_argument("ext")
ap.add_argument("video_id")
ap.add_argument("--shots")
asyncio.run(main(ap.parse_args()))
