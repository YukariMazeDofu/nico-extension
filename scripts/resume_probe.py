# /// script
# requires-python = ">=3.12"
# dependencies = ["playwright==1.62.0"]
# ///
"""拡張を読み込んだ headless Chromium（未ログイン）で、前回の再生位置を確かめる。
記録（`storage.local` の `resume`）は、CDP で content script の isolated world から読み書きする。
usage: PLAYWRIGHT_BROWSERS_PATH=<dir> uv run scripts/resume_probe.py .output/chrome-mv3 <video_id>"""
import argparse
import asyncio
import json

from probe_common import SHADOW, launch

LIMIT = 1000
STATE = f"""() => {{ const r = {SHADOW}; const v = r?.querySelector('video'); const m = r?.querySelector('.seek-resume');
    const track = r?.querySelector('.seek-track')?.getBoundingClientRect();
    const box = m && !m.hidden ? m.getBoundingClientRect() : null;
    return {{t: v?.currentTime, d: v?.duration, paused: v?.paused, ended: v?.ended,
      marker: box && {{center: box.x + box.width / 2, top: box.y, bottom: box.bottom, title: m.title}},
      expected: track && {{x: track.x, width: track.width, y: track.y}}}}; }}"""


async def ext_eval(page, expression):
    """content script の isolated world で `expression` を評価し、値を返す。"""
    cdp = await page.context.new_cdp_session(page)
    contexts = []
    cdp.on("Runtime.executionContextCreated", lambda e: contexts.append(e["context"]))
    await cdp.send("Runtime.enable")
    ctx = next(c for c in contexts if c["auxData"].get("type") == "isolated" and c["origin"].startswith("chrome-extension://"))
    res = await cdp.send("Runtime.evaluate", {"expression": expression, "contextId": ctx["id"], "awaitPromise": True, "returnByValue": True})
    await cdp.detach()
    return res["result"].get("value")


async def records(page):
    return json.loads(await ext_eval(page, "chrome.storage.local.get('resume').then(r => JSON.stringify(r.resume ?? {}))"))


async def set_records(page, value):
    await ext_eval(page, f"chrome.storage.local.set({{resume: {json.dumps(value)}}}).then(() => 1)")


async def main(a):
    async with launch(a.ext, viewport={"width": 1280, "height": 720}) as ctx:
        page = await ctx.new_page()
        page.on("pageerror", lambda e: print("pageerror", e))
        overlay = page.locator("nico-ext-overlay")
        vid = a.video_id

        async def open_(goto=False):
            if goto:
                await page.goto(f"https://www.nicovideo.jp/watch/{vid}", wait_until="domcontentloaded")
            else:
                await page.reload(wait_until="domcontentloaded")
            await page.wait_for_function(f"() => {SHADOW}?.querySelector('video')?.duration > 0", timeout=30000)
            st = await page.evaluate(STATE)
            await pause()
            await page.wait_for_timeout(1000)
            return st

        async def play(seconds, at=None):
            if at is not None:
                await page.evaluate(f"() => {{ const v = {SHADOW}.querySelector('video'); v.currentTime = {at}; }}")
            if (await page.evaluate(STATE))["paused"]:
                await page.keyboard.press("Space")
            await page.wait_for_function(f"() => !{SHADOW}.querySelector('video').paused", timeout=10000)
            await page.wait_for_timeout(seconds * 1000)

        async def pause():
            """再生中なら Space で止める"""
            if not (await page.evaluate(STATE))["paused"]:
                await page.keyboard.press("Space")
            await page.wait_for_timeout(500)

        st = await open_(goto=True)
        print("first open", "marker", st["marker"], "record", (await records(page)).get(vid))
        await play(11, at=60)
        await pause()
        sec = (await records(page)).get(vid, {}).get("sec")
        print("after 11s from 60 and pause", "record sec", sec, "ok" if sec and 70 <= sec <= 73 else "NG")

        st = await open_()
        m, e = st["marker"], st["expected"]
        want = e["x"] + e["width"] * sec / st["d"] if m else None
        print("reopen", "t", round(st["t"], 2), "starts at head", st["t"] < 1, "title", m and m["title"],
              "center", m and round(m["center"], 1), "expected", want and round(want, 1),
              "ok" if m and abs(m["center"] - want) < 1.5 else "NG",
              "line top", m and round(m["top"] - e["y"] + 7, 1), "below seek", m and round(m["bottom"] - (e["y"] - 7 + 18), 1))
        await overlay.locator(".seek-resume").click()
        await page.wait_for_timeout(300)
        st = await page.evaluate(STATE)
        print("marker click", "t", round(st["t"], 2), "ok" if abs(st["t"] - sec) < 0.5 else "NG")

        await play(2)
        await pause()
        after = (await records(page)).get(vid, {}).get("sec")
        print("2s play keeps record", after == sec, after)

        await play(11)
        moved = round((await page.evaluate(STATE))["t"])
        await open_()
        after = (await records(page)).get(vid, {}).get("sec")
        print("pagehide write", "position", moved, "record", after)

        await page.goto("https://www.nicovideo.jp/", wait_until="domcontentloaded")
        await page.wait_for_timeout(3000)
        await page.evaluate(f"""() => {{ const a = document.createElement('a'); a.id = 'probe'; a.href = '/watch/{vid}'; a.textContent = 'probe';
            a.style.cssText = 'position:fixed;top:200px;left:0;z-index:2147483646'; document.body.append(a); }}""")
        await page.click("#probe")
        await page.wait_for_function(f"() => {SHADOW}?.querySelector('video')?.duration > 0", timeout=30000)
        await pause()
        await play(11, at=150)
        opened_at = page.url
        await overlay.locator("button.close").click()
        await page.wait_for_function("() => !document.querySelector('nico-ext-overlay')", timeout=10000)
        await page.wait_for_timeout(500)
        after = (await records(page)).get(vid, {}).get("sec")
        print("link open, close", "url kept", page.url == opened_at == "https://www.nicovideo.jp/", "record", after,
              "ok" if after and 158 <= after <= 163 else "NG")

        st = await open_(goto=True)
        await play(1, at=st["d"] - 2)
        await page.wait_for_function(f"() => {SHADOW}.querySelector('video').ended", timeout=10000)
        await page.wait_for_timeout(500)
        print("after ended", "record", (await records(page)).get(vid))
        st = await open_()
        print("reopen after ended", "marker", st["marker"], "ok" if not st["marker"] else "NG")

        await set_records(page, {f"sm{100000 + i}": {"sec": 10, "at": i + 1} for i in range(LIMIT)})
        await open_()
        await play(11, at=30)
        await pause()
        r = await records(page)
        print("limit", "count", len(r), "has", vid, vid in r, "oldest removed", "sm100000" not in r, "next kept", "sm100001" in r,
              "ok" if len(r) == LIMIT and vid in r and "sm100000" not in r else "NG")

        st = await open_()
        await overlay.locator(".tab").nth(2).click()
        count = overlay.locator(".setting-value").last
        print("settings", "count", await count.text_content(), "marker shown", bool(st["marker"]))
        await overlay.locator(".setting-button", has_text="すべて消す").click()
        await page.wait_for_timeout(300)
        st = await page.evaluate(STATE)
        r = await records(page)
        print("clear", "count", await count.text_content(), "records", len(r), "marker", st["marker"],
              "ok" if not r and not st["marker"] else "NG")

        await set_records(page, {vid: {"sec": 100, "at": 1}})
        await overlay.locator(".resume-start button", has_text="前回の位置から").click()
        await page.reload(wait_until="domcontentloaded")
        await page.wait_for_function(f"() => {SHADOW}?.querySelector('video')?.currentTime >= 99", timeout=30000)
        st = await page.evaluate(STATE)
        await overlay.locator(".tab").nth(2).click()
        pressed = await overlay.locator(".resume-start [aria-pressed=true]").text_content()
        print("start from resume", "t", round(st["t"], 1), "marker", st["marker"] and st["marker"]["title"], "pressed", pressed,
              "ok" if st["t"] < 110 and st["marker"] and pressed == "前回の位置から" else "NG")

        async def start_at(url=None, link=None):
            """`url` を直接開くか、トップページに差し込んだ `link` をクリックして開き、開いた直後の `currentTime` を返す"""
            await set_records(page, {vid: {"sec": 70, "at": 1}})
            await page.goto(url or "https://www.nicovideo.jp/", wait_until="domcontentloaded")
            if link:
                await page.wait_for_timeout(3000)
                await page.evaluate(f"""() => {{ const a = document.createElement('a'); a.id = 'probe'; a.href = '{link}'; a.textContent = 'probe';
                    a.style.cssText = 'position:fixed;top:200px;left:0;z-index:2147483646'; document.body.append(a); }}""")
                await page.click("#probe")
            await page.wait_for_function(f"() => {SHADOW}?.querySelector('video')?.duration > 0", timeout=30000)
            await page.wait_for_timeout(1500)
            st = await page.evaluate(STATE)
            await pause()
            return st

        def check(label, st, want):
            m = st["marker"]
            print("from", label, "t", round(st["t"], 1), "marker", m and m["title"], "ok" if want <= st["t"] < want + 3 and m else "NG")

        watch = f"https://www.nicovideo.jp/watch/{vid}"
        check("link ?from=30 resume", await start_at(link=f"/watch/{vid}?from=30&ref=my_nicoru_passive"), 30)
        check("direct ?from=30 resume", await start_at(f"{watch}?from=30"), 30)
        check("direct ?from=12.5", await start_at(f"{watch}?from=12.5"), 12)
        check("direct ?from=0 resume", await start_at(f"{watch}?from=0"), 0)
        check("direct ?from=1:23 resume", await start_at(f"{watch}?from=1:23"), 70)
        check("direct ?from=99999 resume", await start_at(f"{watch}?from=99999"), 70)
        await overlay.locator(".tab").nth(2).click()
        await overlay.locator(".resume-start button", has_text="先頭から").click()
        check("link ?from=30 head", await start_at(link=f"/watch/{vid}?from=30&ref=my_nicoru_passive"), 30)
        check("direct ?from=1:23 head", await start_at(f"{watch}?from=1:23"), 0)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("ext")
    ap.add_argument("video_id")
    asyncio.run(main(ap.parse_args()))
