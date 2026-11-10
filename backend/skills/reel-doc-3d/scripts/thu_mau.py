# -*- coding: utf-8 -*-
"""Chay kho TAT CA mau B-roll trong thu vien voi tham so mac dinh (moi khung 0..4.5s) - kiem tra sau khi them mau moi.
   python thu_mau.py <thu muc du an bat ky>"""
import sys, inspect, time, traceback
from pathlib import Path
D = sys.argv[1]
sys.argv = [sys.argv[0], "--du-an", D, "--draft"]
sys.path.insert(0, str(Path(__file__).resolve().parent))
import reel_engine as E
E.BG = E.dark_bg()
bad = 0
for n, c in inspect.getmembers(E, inspect.isclass):
    if not (n.startswith("B") and hasattr(c, "draw") and hasattr(c, "layout")): continue
    o = c(); t0 = time.time()
    if hasattr(o, "me_at"): o.me_at = 1.0
    try:
        for k in range(int(4.5 * 30)):
            o.draw(E.bg_img(), k / 30, 4.5)
        o.sfx(4.5)
        print("  OK  %-13s %.1fs" % (n, time.time() - t0))
    except Exception:
        bad += 1; print("!! LOI %s o giay %.2f" % (n, k / 30)); traceback.print_exc(limit=4)
print("XONG - %s" % ("KHONG LOI" if not bad else "%d mau LOI" % bad))
