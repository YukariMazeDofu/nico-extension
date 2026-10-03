# /// script
# requires-python = ">=3.12"
# dependencies = ["playwright==1.62.0"]
# ///
"""拡張を読み込んだ headless Chromium（未ログイン）で、右パネルのコメント一覧を確かめる。
件数、並び順、再生位置への追従、時刻のクリックでの移動、ホバー中に追従しないこと、一覧の上のホイールで音量が変わらないこと、
自動スクロールのオフと開き直したときの復元、未ログインでニコるが無効なこと、タブの切り替えと、開き直すと動画の詳細に戻ることを試す。ニコるは送らない。
usage: PLAYWRIGHT_BROWSERS_PATH=<dir> uv run scripts/list_probe.py .output/chrome-mv3 <video_id> [--shot out.png]"""
import argparse
import asyncio

from probe_common import SHADOW, launch

STATE = f"""() => {{ const r = {SHADOW}; const v = r.querySelector('video'); const l = r.querySelector('.clist');
    const rows = [...r.querySelectorAll('.crow')]; const cur = r.querySelector('.crow.current');
    const vpos = rows.map(e => e.querySelector('.vpos').textContent.split(':').reduce((a, b) => a * 60 + +b, 0));
    const lr = l.getBoundingClientRect(), cr = cur?.getBoundingClientRect();
    const n = r.querySelector('.crow:not(.owner) .nicoru');
    return {{t: +v.currentTime.toFixed(1), paused: v.paused, volume: +v.volume.toFixed(2),
      tab: r.querySelector('.tab[aria-selected=true]')?.textContent, listHidden: l.hidden, detailsHidden: r.querySelector('.details').hidden,
      rows: rows.length, sorted: vpos.every((x, i) => !i || vpos[i - 1] <= x), owner: r.querySelectorAll('.crow.owner').length,
      current: cur?.querySelector('.vpos').textContent ?? null, currentVisible: !!cr && cr.bottom <= lr.bottom + 1 && cr.top >= lr.top - 1,
      scrollTop: Math.round(l.scrollTop), follow: r.querySelector('.follow input').checked, followHidden: r.querySelector('.follow').hidden,
      nicoru: n && {{disabled: n.disabled, title: n.title, pressed: n.getAttribute('aria-pressed')}}}}; }}"""


async def main(a):
    async with launch(a.ext, viewport={"width": 1280, "height": 720}) as ctx:
        page = await ctx.new_page()
        page.on("pageerror", lambda e: print("pageerror", e))
        page.on("console", lambda m: "[nico-ext] comments" in m.text and print("console", m.text))
        await page.goto(f"https://www.nicovideo.jp/watch/{a.video_id}", wait_until="domcontentloaded")
        await page.wait_for_timeout(5000)
        print("open      ", await page.evaluate(STATE))

        overlay = page.locator("nico-ext-overlay")
        await overlay.locator(".tab").nth(1).click()
        await page.keyboard.press("Space")
        await page.keyboard.press("5")
        await page.wait_for_timeout(2000)
        print("play @50% ", await page.evaluate(STATE))

        await overlay.locator(".crow").nth(3).locator(".vpos").click()
        await page.wait_for_timeout(500)
        print("click vpos", await page.evaluate(STATE))

        box = await overlay.locator(".clist").bounding_box()
        await page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
        before = await page.evaluate(STATE)
        await page.mouse.wheel(0, 300)
        await page.keyboard.press("7")
        await page.wait_for_timeout(1500)
        print("hover+wheel", before["scrollTop"], "->", await page.evaluate(STATE))
        await page.mouse.move(100, 100)
        await page.wait_for_timeout(500)
        print("leave     ", await page.evaluate(STATE))

        await overlay.locator(".follow input").uncheck()
        await page.keyboard.press("3")
        await page.wait_for_timeout(1500)
        print("follow off", await page.evaluate(STATE))

        await overlay.locator(".tab").nth(0).click()
        await page.wait_for_timeout(300)
        print("details   ", await page.evaluate(STATE))
        await page.reload(wait_until="domcontentloaded")
        await page.wait_for_timeout(5000)
        print("reopen    ", await page.evaluate(STATE))
        await overlay.locator(".tab").nth(1).click()
        await page.wait_for_timeout(300)
        if a.shot:
            await page.screenshot(path=a.shot)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("ext")
    ap.add_argument("video_id")
    ap.add_argument("--shot")
    asyncio.run(main(ap.parse_args()))
