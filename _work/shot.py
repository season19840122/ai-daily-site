#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""给某一期日报出长图。

用法:
  /Users/Season/.workbuddy/binaries/python/envs/default/bin/python3 _work/shot.py 2026-08-30
  python3 _work/shot.py 2026-08-30 --only grid     # 只出 3:4 分页图
  python3 _work/shot.py 2026-08-30 --only long     # 只出超长图

流程：生成二维码 -> 起 http.server -> agent-browser 截图 -> 写 index.json.shots
      -> 生成预览页 -> 关服务。

注意：必须用带 qrcode 的那个 venv 跑（默认 python3 没装）。
"""
import argparse
import json
import os
import socket
import subprocess
import sys
import time
import urllib.parse

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORK = os.path.join(BASE, "_work")
IMG = os.path.join(BASE, "img")
DATA = os.path.join(BASE, "data")
PORT = 8778                      # 与预览用的 8777 错开，避免打架
AB = "/usr/local/bin/agent-browser"


def gen_qr(url, path):
    """生成二维码 SVG。走纯 SVG 工厂，不需要 Pillow，且任意尺寸都锐利。"""
    import qrcode
    from qrcode.image.svg import SvgPathImage
    qr = qrcode.QRCode(version=None, box_size=10, border=2,
                       error_correction=qrcode.constants.ERROR_CORRECT_M)
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(image_factory=SvgPathImage)
    with open(path, "wb") as f:
        img.save(f)


def wait_port(port, timeout=15):
    end = time.time() + timeout
    while time.time() < end:
        try:
            with socket.create_connection(("127.0.0.1", port), 0.5):
                return True
        except OSError:
            time.sleep(0.3)
    return False


def ab(args, retries=1):
    """调 agent-browser。返回 stdout。"""
    for i in range(retries + 1):
        p = subprocess.run([AB] + args, capture_output=True, text=True, cwd=BASE)
        if p.returncode == 0:
            return p.stdout.strip()
        if i == retries:
            raise RuntimeError(f"agent-browser {' '.join(args)} 失败：{p.stderr.strip()[:300]}")
        time.sleep(1)


def ab_json(js, tries=20, gap=0.5):
    """反复 eval 直到拿到非空且非 0 的结果。"""
    for _ in range(tries):
        out = ab(["eval", js])
        try:
            v = json.loads(out)
        except Exception:
            v = out
        if v not in ("", None, 0, "0"):
            return v
        time.sleep(gap)
    raise RuntimeError(f"等待渲染超时：{js}")


def page_url(date, mode, qr_on, cfg):
    q = {
        "date": date,
        "mode": mode,
        "qr": "1" if qr_on else "0",
        "name": cfg["site_name"],
        "site": cfg["site_url"].replace("{date}", date),
    }
    return f"http://127.0.0.1:{PORT}/longimg.html?" + urllib.parse.urlencode(q)


def shot_grid(date, qr_on, cfg):
    ab(["set", "viewport", "1080", "1440"])
    # 先渲染全部页面，拿到总页数
    ab(["open", page_url(date, "grid", qr_on, cfg)])
    n = int(ab_json("document.querySelectorAll('.page').length"))
    files = []
    for i in range(1, n + 1):
        # 每次只渲染一页，避免 screenshot <selector> 在堆叠分页上的定位问题
        ab(["open", page_url(date, "grid", qr_on, cfg) + "&page=" + str(i)])
        ab_json("document.body.getAttribute('data-pages')")  # 确认该页已渲染
        name = f"{date}-grid-{i}.png"
        # 必须绝对路径：agent-browser 守护进程的 CWD 不是站点目录，相对路径存不进去
        ab(["screenshot", os.path.join(IMG, name)])
        files.append(f"img/{name}")
    return files


def shot_long(date, qr_on, cfg):
    ab(["set", "viewport", "1080", "1440"])
    ab(["open", page_url(date, "long", qr_on, cfg)])
    ab_json("document.querySelectorAll('.page').length")
    if qr_on:
        ab_json("(function(){var i=document.querySelector('.qr img');"
                "return i&&i.complete&&i.naturalWidth>0?1:0})()")
    name = f"{date}-long.png"
    ab(["screenshot", "--full", os.path.join(IMG, name)])
    return f"img/{name}"


PREVIEW = """<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title}</title>
<style>
*{{box-sizing:border-box}}
body{{margin:0;background:#f5f6f8;color:#14161a;
font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;padding:24px 16px 60px}}
.wrap{{max-width:760px;margin:0 auto}}
h1{{font-size:22px;margin:0 0 6px}}
.tip{{color:#5b6472;font-size:14px;margin:0 0 24px;line-height:1.7}}
h2{{font-size:16px;margin:32px 0 12px;padding-top:20px;border-top:1px solid #e4e7ec}}
img{{width:100%;height:auto;display:block;border-radius:12px;
border:1px solid #e4e7ec;background:#fff;margin-bottom:14px}}
a{{color:#4f46e5}}
</style></head><body><div class="wrap">
<h1>{title}</h1>
<p class="tip">手机长按图片即可保存。3:4 分页图适合小红书，超长图适合公众号。</p>
{body}
</div></body></html>
"""


def write_preview(date, grid, long_img, cfg):
    parts = []
    if grid:
        parts.append("<h2>3:4 分页图（小红书 / 头条）</h2>")
        parts += [f'<img src="../{p}" alt="第 {i+1} 页">' for i, p in enumerate(grid)]
    if long_img:
        parts.append("<h2>超长图（公众号 / 知乎）</h2>")
        parts.append(f'<img src="../{long_img}" alt="超长图">')
    html = PREVIEW.format(title=f"{cfg['site_name']} · {date} 长图", body="".join(parts))
    with open(os.path.join(IMG, f"{date}.html"), "w", encoding="utf-8") as f:
        f.write(html)
    return f"img/{date}.html"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("date")
    ap.add_argument("--only", choices=["grid", "long"], help="只出一种")
    a = ap.parse_args()
    date = a.date

    cfg = json.load(open(os.path.join(WORK, "config.json"), encoding="utf-8"))
    os.makedirs(IMG, exist_ok=True)
    qr_on = bool(cfg.get("qr_enabled", True))

    if qr_on:
        gen_qr(cfg["site_url"].replace("{date}", date),
               os.path.join(IMG, f"qr-{date}.svg"))
        print("  二维码", f"img/qr-{date}.svg")

    srv = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(PORT), "--bind", "127.0.0.1"],
        cwd=BASE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        if not wait_port(PORT):
            raise RuntimeError("http.server 没起来")
        grid, long_img = [], None
        if a.only in (None, "grid"):
            grid = shot_grid(date, qr_on, cfg)
            print("  3:4 分页", len(grid), "张")
        if a.only in (None, "long"):
            long_img = shot_long(date, qr_on, cfg)
            print("  超长图", long_img)
    finally:
        srv.terminate()
        srv.wait(timeout=5)

    preview = write_preview(date, grid, long_img, cfg)

    # 写回 index.json 的 shots 字段
    ipath = os.path.join(DATA, "index.json")
    idx = json.load(open(ipath, encoding="utf-8"))
    for d in idx["days"]:
        if d["date"] == date:
            d["shots"] = {"grid": grid, "long": long_img, "preview": preview}
    with open(ipath, "w", encoding="utf-8") as f:
        json.dump(idx, f, ensure_ascii=False, separators=(",", ":"))
    print("  已写 index.json.shots |", preview)


if __name__ == "__main__":
    main()
