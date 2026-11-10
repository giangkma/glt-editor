# -*- coding: utf-8 -*-
"""Ve anh xem truoc cho MOI mau B-roll trong reel_engine.py -> mau-broll\<Ten>.png + bang tong mau-broll\_tat-ca.png.
Chay lai moi khi them mau moi de thu vien luon du.   python anh_mau_broll.py <thu muc du an bat ky (de nap engine)>"""
import sys, inspect
from pathlib import Path
D = sys.argv[1]
sys.argv = [sys.argv[0], "--du-an", D, "--draft"]
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import reel_engine as E
E.BG = E.dark_bg()
OUT = HERE.parent / "mau-broll"; OUT.mkdir(exist_ok=True)
names = [n for n, c in inspect.getmembers(E, inspect.isclass) if n.startswith("B") and hasattr(c, "draw") and hasattr(c, "layout")]
thumbs = []
for n in names:
    o = getattr(E, n)()
    if hasattr(o, "me_at"): o.me_at = 0.8
    d = 4.0; cv = E.bg_img()
    o.draw(cv, 3.2, d)
    im = cv.convert("RGB"); im.save(OUT / (n + ".png"))
    th = im.resize((240, 427)); dr = E.ImageDraw.Draw(th)
    dr.rectangle([0, 395, 240, 427], fill=(0, 0, 0)); dr.text((8, 400), n, font=E.BOLD(30), fill=(255, 196, 0))
    thumbs.append(th); print("  ", n)
cols = 6; rows = (len(thumbs) + cols - 1) // cols
sheet = E.Image.new("RGB", (240 * cols, 427 * rows), (0, 0, 0))
for i, th in enumerate(thumbs): sheet.paste(th, ((i % cols) * 240, (i // cols) * 427))
sheet.save(OUT / "_tat-ca.png"); print("xong %d mau -> %s" % (len(thumbs), OUT))
