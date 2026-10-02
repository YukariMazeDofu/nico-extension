# /// script
# requires-python = ">=3.12"
# dependencies = ["playwright==1.62.0"]
# ///
"""拡張を読み込んだ headless Chromium で nicovideo.jp のリンククリック→オーバーレイ再生を確かめる。
video_id を渡すとそのリンクを差し込んでクリックし、省略するとページ内の最初の動画リンクをクリックする。
再生後にページ要素との重なり、コメントの表示、キーボードショートカット、ホイール操作、画質の切り替えを試し、--recover ではセグメントを一時的に 403 にして復帰を確かめる。
--shot には再生後の画面を保存する。
usage: PLAYWRIGHT_BROWSERS_PATH=<dir> uv run scripts/ext_probe.py .output/chrome-mv3 <page_url> <seconds> [video_id] [--recover] [--shot out.png]"""
import argparse
import asyncio
import json
import os
from urllib.parse import urlparse
import re
import tempfile

from playwright.async_api import async_playwright

MASK = re.compile(r"\?.*$")
SHADOW = "document.querySelector('nico-ext-overlay')?.shadowRoot"
STATE = f"""() => {{ const r = {SHADOW}; const v = r?.querySelector('video'); const q = r?.querySelector('select.quality');
    return v && {{t: +v.currentTime.toFixed(1), paused: v.paused, rs: v.readyState, err: v.error && v.error.code, h: v.videoHeight,
      vol: +v.volume.toFixed(2), muted: v.muted, rate: v.playbackRate, quality: q.value,
      qualities: [...q.options].map(o => o.textContent), message: r.querySelector('.message').textContent,
      comments: r.querySelector('.comments').hidden ? 'hidden' : r.querySelectorAll('.comment').length}}; }}"""


# 各コメントのアニメーション時刻と動画の時刻の差を 100ms ごとに 3 秒間追い、最大の振れ幅を返す
DRIFT = f"""async () => {{ const r = {SHADOW}, v = r.querySelector('video'), seen = new Map();
    for (let i = 0; i < 30; i++) {{
      await new Promise(f => requestAnimationFrame(f));
      const vt = v.currentTime * 1000;
      for (const e of r.querySelectorAll('.comment')) {{ const t = e.getAnimations()[0]?.currentTime; if (t == null) continue;
        if (!seen.has(e)) seen.set(e, []); seen.get(e).push(t - vt); }}
      await new Promise(f => setTimeout(f, 100));
    }}
    const spread = [...seen.values()].filter(x => x.length > 5).map(x => Math.max(...x) - Math.min(...x));
    return {{n: spread.length, max_spread_ms: Math.round(Math.max(0, ...spread))}}; }}"""


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
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        fatal = asyncio.Event()

        def on_console(m):
            if not m.text.startswith("[nico-ext]") or m.text.startswith("[nico-ext] frag loaded"):
                return
            print("console", m.text)
            if "fatal=true" in m.text:
                fatal.set()
        page.on("console", on_console)
        page.on("pageerror", lambda e: print("pageerror", e))

        def on_req(r):
            if "access-rights/hls" in r.url and r.method == "POST":
                ev = (json.loads(r.post_data or "{}").get("heartbeat") or {}).get("params", {}).get("eventType")
                print("req  access-rights", ev or "session")
        page.on("request", on_req)

        def on_resp(r):
            u = r.url
            if ("domand" in u and "/keys/" in u or "/playlists/" in u) or "access-rights" in u:
                kind = u.rsplit("/", 1)[-1].split("?")[0]
                print("resp", r.status, r.request.method, MASK.sub("", u).split("nicovideo.jp")[0] + "…/" + kind)
        page.on("response", on_resp)
        page.on("requestfailed", lambda r: ("domand" in r.url or "nvapi" in r.url) and print("reqfailed", MASK.sub("", r.url), r.failure))

        await page.goto(a.url, wait_until="domcontentloaded")
        await page.wait_for_timeout(3000)
        if a.video_id:
            await page.evaluate(f"""() => {{ const a = document.createElement('a'); a.id='probe'; a.href='/watch/{a.video_id}';
                a.textContent='probe'; a.style.cssText='position:fixed;top:0;left:0;z-index:2147483646';
                document.body.append(a); }}""")
            sel = "#probe"
        else:
            sel = "a[href*='/watch/sm']"
            print("real link:", await page.eval_on_selector(sel, "a => a.href"))
        before = page.url
        await page.click(sel)
        await page.wait_for_timeout(a.seconds * 1000)
        print("url unchanged:", page.url == before)
        print("video:", await page.evaluate(STATE))
        if a.shot:
            await page.screenshot(path=a.shot)
        print("comments on screen:", await page.evaluate(f"""() => {{ const r = {SHADOW}, box = r.querySelector('.comments').getBoundingClientRect();
            return [...r.querySelectorAll('.comment')].map(e => e.getBoundingClientRect())
              .filter(b => b.right > box.left && b.left < box.right).length + ' in ' + Math.round(box.width) + 'x' + Math.round(box.height); }}"""))
        print("comment drift:", await page.evaluate(DRIFT))
        print("covered by others:", await page.evaluate("""() => { const host = document.querySelector('nico-ext-overlay'), other = new Set();
            for (let x = 5; x < innerWidth; x += 40) for (let y = 5; y < innerHeight; y += 40) {
              const e = document.elementFromPoint(x, y); if (e !== host) other.add(e.tagName + '.' + String(e.className).slice(0, 40)); }
            return [...other]; }"""))

        for keys in (["c"], ["c"], ["ArrowRight", "ArrowRight"], ["m"], ["Shift+Period"], ["ArrowDown"], ["Space"], ["Space"]):
            for k in keys:
                await page.keyboard.press(k)
            await page.wait_for_timeout(500)
            print(f"keys {'+'.join(keys):<22}", await page.evaluate(STATE))
        await page.keyboard.press("m")

        await page.mouse.move(400, 300)
        for mod, dy in ((None, 100), (None, -100), ("Shift", -100), ("Shift", 100), ("Control", -100), ("Control", 100)):
            if mod:
                await page.keyboard.down(mod)
            await page.mouse.wheel(0, dy)
            if mod:
                await page.keyboard.up(mod)
            await page.wait_for_timeout(300)
            osd = await page.evaluate(f"() => {SHADOW}.querySelector('.osd').textContent")
            print(f"wheel {mod or '':<7} {dy:>4}  osd={osd!r:<22}", await page.evaluate(STATE))

        print("comment drift (rate 1.25):", await page.evaluate(DRIFT))
        await page.keyboard.press("Space")
        await page.wait_for_timeout(300)
        print("comment drift (paused):", await page.evaluate(DRIFT))
        await page.keyboard.press("Space")

        lowest = await page.evaluate(f"() => {{ const o = [...{SHADOW}.querySelector('select.quality').options]; return o.at(-1).value; }}")
        await page.evaluate(f"""v => {{ const s = {SHADOW}.querySelector('select.quality'); s.value = v;
            s.dispatchEvent(new Event('change')); }}""", lowest)
        await page.wait_for_timeout(5000)
        print("quality lowest:", await page.evaluate(STATE))

        if a.recover:
            blocked = True

            async def deny(route):
                if blocked:
                    await route.fulfill(status=403, body="")
                else:
                    await route.continue_()
            await page.route(re.compile(r"https://asset\.domand\.nicovideo\.jp/.*\.cmf[va]"), deny)
            await page.evaluate(f"() => {{ const v = {SHADOW}.querySelector('video'); v.currentTime = v.duration * 0.6; }}")
            try:
                await asyncio.wait_for(fatal.wait(), 30)
            except TimeoutError:
                print("no fatal error within 30s")
            blocked = False
            await page.wait_for_timeout(8000)
            print("after recover:", await page.evaluate(STATE))

        await page.keyboard.press("Escape")
        await page.wait_for_timeout(1500)
        print("closed:", not await page.evaluate("!!document.querySelector('nico-ext-overlay')"))

        await page.click(sel)
        await page.wait_for_timeout(5000)
        print("reopened:", await page.evaluate(STATE))
        await ctx.close()


ap = argparse.ArgumentParser()
ap.add_argument("ext")
ap.add_argument("url")
ap.add_argument("seconds", type=int)
ap.add_argument("video_id", nargs="?")
ap.add_argument("--recover", action="store_true")
ap.add_argument("--shot")
asyncio.run(main(ap.parse_args()))
