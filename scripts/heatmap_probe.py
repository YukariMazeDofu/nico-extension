# /// script
# requires-python = ">=3.12"
# dependencies = ["playwright==1.62.0"]
# ///
"""拡張を読み込んだ headless Chromium（未ログイン）で、シークバーの盛り上がりの帯を確かめる。
`/v1/threads` の応答の `voltageZone.heatmap` と、シークバーの `--heat` の明るさ（20 区間ごとの平均）を比べる。
キャッシュ済みの範囲のマスクと、つまみの大きさも出す。
設定タブでの表示・非表示の切り替え、強調のスライダー（キーで動かし、動画の操作にならないこと）、開き直したときの復元も試す。
usage: PLAYWRIGHT_BROWSERS_PATH=<dir> uv run scripts/heatmap_probe.py .output/chrome-mv3 <video_id> [--shot out.png]"""
import argparse
import asyncio
import json
import re

from probe_common import SHADOW, launch

STATE = f"""() => {{ const r = {SHADOW}; const seek = r.querySelector('.seek');
    const group = r.querySelectorAll('.segmented')[1];
    const input = r.querySelector('.seek-input');
    return {{heat: seek.style.getPropertyValue('--heat'), heatClass: seek.classList.contains('heat'), unbufferedHeight: r.querySelector('.seek-track').getBoundingClientRect().height, bufferedHeight: r.querySelector('.seek-buffered').getBoundingClientRect().height, played: seek.style.getPropertyValue('--played'),
      mask: r.querySelector('.seek-buffered').style.maskImage,
      track: r.querySelector('.seek-track').getBoundingClientRect().toJSON(), input: input.getBoundingClientRect().toJSON(),
      pressed: group?.querySelector('[aria-pressed=true]')?.textContent ?? null,
      gamma: r.querySelector('.setting-value')?.textContent ?? null,
      video: (v => ({{t: v.currentTime, vol: v.volume}}))(r.querySelector('video'))}}; }}"""
HUES = [262, 215, 145, 100, 55, 27]
GAMMA = 2


def levels(gradient: str, gamma: float = GAMMA) -> list[float]:
    """各色の色相から盛り上がりの値（0〜1）に戻す"""
    def back(h: float) -> float:
        for i in range(len(HUES) - 1):
            if HUES[i + 1] <= h <= HUES[i]:
                return (i + (HUES[i] - h) / (HUES[i] - HUES[i + 1])) / (len(HUES) - 1)
        return 0.0 if h > HUES[0] else 1.0
    return [back(float(x)) ** (1 / gamma) for x in re.findall(r"oklch\([0-9.]+ [0-9.]+ ([0-9.]+)\)", gradient)]


async def main(a):
    async with launch(a.ext, viewport={"width": 1280, "height": 720}) as ctx:
        page = await ctx.new_page()
        heatmap: list[float] = []

        async def on_response(res):
            if res.request.method == "POST" and res.url.endswith("/v1/threads"):
                heatmap[:] = (json.loads(await res.body())["data"].get("voltageZone") or {}).get("heatmap") or []

        page.on("response", on_response)
        page.on("pageerror", lambda e: print("pageerror", e))
        page.on("console", lambda m: m.type == "error" and print("console error", m.text))
        await page.goto(f"https://www.nicovideo.jp/watch/{a.video_id}", wait_until="domcontentloaded")
        await page.wait_for_timeout(5000)
        await page.wait_for_function(f"() => {SHADOW}?.querySelector('.seek.heat')", timeout=20000)
        print("voltageZone.heatmap", heatmap)
        st = await page.evaluate(STATE)
        t = levels(st["heat"])
        n = len(heatmap)
        coarse = [round(sum(t[i * len(t) // n:(i + 1) * len(t) // n]) / (len(t) // n), 2) for i in range(n)] if t else []
        print("stops", len(t), "class heat", st["heatClass"], "height buffered/unbuffered", st["bufferedHeight"], st["unbufferedHeight"])
        print("coarse mean", coarse)
        print("heatmap/max ", [round(v / max(heatmap), 2) for v in heatmap])
        rank = lambda xs: sorted(range(len(xs)), key=lambda i: xs[i])
        print("argmax same", rank(coarse)[-1] == rank(heatmap)[-1], "argmin same", rank(coarse)[0] == rank(heatmap)[0])
        print("mask", st["mask"][:160])
        print("track", {k: round(st["track"][k]) for k in ("x", "y", "width", "height")},
              "input", {k: round(st["input"][k]) for k in ("x", "y", "width", "height")})

        overlay = page.locator("nico-ext-overlay")
        await overlay.locator(".tab").nth(2).click()
        for label in ["隠す", "表示", "隠す"]:
            await overlay.locator(".segmented button", has_text=label).click()
            await page.wait_for_timeout(300)
            st = await page.evaluate(STATE)
            shown = bool(st["heat"])
            print(label, "pressed", st["pressed"], "shown", shown, "ok" if shown == (label == "表示") else "NG",
                  "height buffered/unbuffered", st["bufferedHeight"], st["unbufferedHeight"])

        await overlay.locator(".segmented button", has_text="表示").click()
        slider = overlay.locator(".setting-range")
        before = await page.evaluate(STATE)
        await slider.focus()
        await page.keyboard.press("Home")
        await page.keyboard.press("ArrowRight")
        await page.wait_for_timeout(300)
        st = await page.evaluate(STATE)
        t1 = levels(st["heat"], 1.1)
        coarse1 = [round(sum(t1[i * len(t1) // n:(i + 1) * len(t1) // n]) / (len(t1) // n), 2) for i in range(n)]
        print("gamma", st["gamma"], "video unchanged", st["video"] == before["video"], "coarse at 1.1", coarse1)
        await page.keyboard.press("End")
        await page.wait_for_timeout(300)
        print("gamma End", (await page.evaluate(STATE))["gamma"])
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(200)
        print("escape keeps overlay", await page.evaluate(f"() => !!{SHADOW}"))
        await page.reload(wait_until="domcontentloaded")
        await page.wait_for_timeout(5000)
        st = await page.evaluate(STATE)
        print("reopen", "shown", bool(st["heat"]), "gamma", st["gamma"])
        await overlay.locator(".tab").nth(2).click()
        await overlay.locator(".segmented button", has_text="隠す").click()
        await page.reload(wait_until="domcontentloaded")
        await page.wait_for_timeout(5000)
        st = await page.evaluate(STATE)
        print("reopen (隠す)", "shown", bool(st["heat"]), "ok" if not st["heat"] else "NG")
        await overlay.locator(".tab").nth(2).click()
        await overlay.locator(".segmented button", has_text="表示").click()
        await page.wait_for_timeout(300)
        print("show again", "shown", bool((await page.evaluate(STATE))["heat"]))
        if a.shot:
            await page.evaluate(f"() => {{ const v = {SHADOW}.querySelector('video'); v.currentTime = 120; }}")
            await page.wait_for_timeout(3000)
            await page.screenshot(path=a.shot)
            await overlay.locator(".segmented button", has_text="隠す").click()
            await page.wait_for_timeout(300)
            await page.screenshot(path=a.shot.removesuffix(".png") + "-off.png")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("ext")
    ap.add_argument("video_id")
    ap.add_argument("--shot")
    asyncio.run(main(ap.parse_args()))
