# -*- coding: utf-8 -*-
"""Chay kho: ve thu TUNG KHUNG cua moi B-roll (720p, khong dung video) de bat loi ve truoc khi dung that.
   python thu_broll.py <thu muc du an>"""
import sys, time, traceback
from pathlib import Path
D = sys.argv[1]
sys.argv = [sys.argv[0], "--du-an", D, "--draft"]
sys.path.insert(0, str(Path(__file__).resolve().parent))
import reel_engine as E
E.BG = E.dark_bg()
plan = E.manual_plan()
cst = {c["ci"]: c["t0"] for c in plan}; cen = {c["ci"]: c["t1"] for c in plan}
bad = 0
for a, b, o in E.BROLL:
    d = cen[b] - max(0.0, cst[a]); t0 = time.time(); n = 0
    if getattr(o, "me_ci", None) is not None: o.me_at = cst[o.me_ci] - cst[a]
    for k in range(int(d * E.FPS) + 1):
        t = k / E.FPS
        try:
            if o.layout == "user": o.render(E.Image.new("RGB", (E.W, E.H), (90, 90, 90)), t, d); n += 1; continue
            cv = E.bg_img() if o.layout != "lower" else E.Image.new("RGBA", (E.W, E.H), (0, 0, 0, 0))
            o.draw(cv, t, d); n += 1
        except Exception:
            bad += 1; print("!! LOI %s (cum %d-%d) o giay %.2f:" % (type(o).__name__, a, b, t)); traceback.print_exc(limit=3); break
    print("  %-11s cum %2d-%2d  %4.1fs  %3d khung  %.1fs" % (type(o).__name__, a, b, d, n, time.time() - t0))
print("XONG - %s" % ("KHONG LOI" if not bad else "%d B-roll LOI" % bad))
