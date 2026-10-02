# /// script
# requires-python = ">=3.12"
# dependencies = ["playwright==1.62.0"]
# ///
"""拡張を読み込んだ headless Chromium で動画を開き、コメント描画の 3 方式を比べる。
各方式で一時停止中の同じ時刻の画面を保存し（--shots）、計測パネルの「計測」で 3 方式を順に 10 秒ずつ計測する。
usage: PLAYWRIGHT_BROWSERS_PATH=<dir> uv run scripts/bench_probe.py .output/chrome-mv3 <video_id> [--at 秒] [--stress 1|3|10] [--rate 1] [--clock currentTime|videoFrame|smooth] [--shots dir] [--gpu]"""
import argparse
import asyncio
import json
import os
import tempfile
from urllib.parse import urlparse

from playwright.async_api import async_playwright

SHADOW = "document.querySelector('nico-ext-overlay')?.shadowRoot"


async def main(a):
    u = urlparse(os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy") or "")
    px = None
    if u.hostname:
        px = {"server": f"{u.scheme}://{u.hostname}:{u.port}"}
        if u.username:
            px.update(username=u.username, password=u.password or "")
    ext = os.path.abspath(a.ext)
    args = [f"--disable-extensions-except={ext}", f"--load-extension={ext}"]
    if a.gpu:
        args += ["--enable-unsafe-webgpu", "--enable-features=Vulkan", "--use-vulkan=swiftshader", "--use-angle=swiftshader"]
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(
            tempfile.mkdtemp(), channel="chromium", headless=True, proxy=px, args=args,
            viewport={"width": 1280, "height": 720})
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        bench = asyncio.get_running_loop().create_future()

        def on_console(m):
            if not m.text.startswith("[nico-ext]") or m.text.startswith("[nico-ext] frag loaded"):
                return
            if m.text.startswith("[nico-ext] bench "):
                bench.done() or bench.set_result(json.loads(m.text.removeprefix("[nico-ext] bench ")))
                return
            print("console", m.text)
        page.on("console", on_console)
        page.on("pageerror", lambda e: print("pageerror", e))

        await page.goto("https://www.nicovideo.jp/", wait_until="domcontentloaded")
        await page.wait_for_timeout(2000)
        print("gpu:", await page.evaluate("""async () => { const a = await navigator.gpu?.requestAdapter();
            const gl = document.createElement('canvas').getContext('webgl2'); const d = gl?.getExtension('WEBGL_debug_renderer_info');
            return {webgpu: !!a, adapter: a?.info?.description || a?.info?.vendor, webgl: d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : !!gl}; }"""))
        await page.evaluate(f"""() => {{ const a = document.createElement('a'); a.id='probe'; a.href='/watch/{a.video_id}';
            a.textContent='probe'; a.style.cssText='position:fixed;top:0;left:0;z-index:2147483646'; document.body.append(a); }}""")
        await page.click("#probe")
        await page.wait_for_function(f"() => {SHADOW}?.querySelector('video')?.readyState >= 3", timeout=30000)
        await page.wait_for_timeout(3000)
        await page.keyboard.press("b")

        async def select(cls, value):
            await page.evaluate(f"""v => {{ const s = {SHADOW}.querySelector('select.{cls}'); s.value = v;
                s.dispatchEvent(new Event('change')); }}""", value)
            await page.wait_for_timeout(1500)

        if a.stress != 1:
            await select("bench-stress", str(a.stress))
        if a.clock != "currentTime":
            await select("bench-clock", a.clock)
        await page.evaluate(f"r => {{ const v = {SHADOW}.querySelector('video'); v.playbackRate = r; }}", a.rate)
        await page.evaluate(f"t => {{ const v = {SHADOW}.querySelector('video'); v.currentTime = t; }}", a.at)
        await page.wait_for_timeout(2000)

        if a.shots:
            os.makedirs(a.shots, exist_ok=True)
            await page.keyboard.press("Space")
            await page.evaluate(f"t => {{ const v = {SHADOW}.querySelector('video'); v.pause(); v.currentTime = t; }}", a.at + 2)
            await page.wait_for_timeout(1500)
            for kind in ("css", "webgl", "webgpu"):
                await select("bench-renderer", kind)
                box = await page.evaluate(f"() => {{ const b = {SHADOW}.querySelector('.comments').getBoundingClientRect(); return [b.x, b.y, b.width, b.height]; }}")
                await page.screenshot(path=f"{a.shots}/{kind}.png", clip=dict(zip(("x", "y", "width", "height"), box)))
                print("shot", kind, await page.evaluate(f"() => {SHADOW}.querySelector('select.bench-renderer').value"))
            await page.evaluate(f"t => {{ const v = {SHADOW}.querySelector('video'); v.currentTime = t; }}", a.at)
            await page.wait_for_timeout(1500)

        await page.evaluate(f"() => {SHADOW}.querySelector('.bench-run').click()")
        results = await asyncio.wait_for(bench, 120)
        for r in results:
            print(json.dumps(r, ensure_ascii=False))
        await ctx.close()


ap = argparse.ArgumentParser()
ap.add_argument("ext")
ap.add_argument("video_id")
ap.add_argument("--at", type=float, default=30)
ap.add_argument("--stress", type=int, default=1)
ap.add_argument("--rate", type=float, default=1)
ap.add_argument("--clock", choices=["currentTime", "videoFrame", "smooth"], default="currentTime")
ap.add_argument("--shots")
ap.add_argument("--gpu", action="store_true")
asyncio.run(main(ap.parse_args()))
