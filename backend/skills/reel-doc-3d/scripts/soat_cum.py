# -*- coding: utf-8 -*-
"""Soat MANUAL voi ban go bang: di tung dong, so so tu, in ra ngay cho lech dau tien (thay vi chi bao 'lech').
Khong co MANUAL thi in cac tu duoc giu (theo WRANGES/WIDX) de soan.   python soat_cum.py <thu muc du an>"""
import json, re, sys
from pathlib import Path
sys.stdout.reconfigure(encoding="utf-8")
P = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
sys.path.insert(0, str(P))
import du_an as DA
TL = [w for w in json.load(open(P / "tj.json", encoding="utf-8"))["timeline"] if w["t"] == "w"]
if hasattr(DA, "WRANGES"): WIDX = [i for a, b in DA.WRANGES for i in range(a, b + 1)]
else: WIDX = DA.WIDX
toks = [TL[i]["x"] for i in WIDX]
def norm(x): return re.sub(r"[^\w%]", "", x.lower())
if not getattr(DA, "MANUAL", None) or "--tu" in sys.argv:
    if hasattr(DA, "WRANGES"):
        for a, b in DA.WRANGES: print("(%d-%d) %s" % (a, b, " ".join(TL[i]["x"] for i in range(a, b + 1))))
    sys.exit()
k = 0; bad = 0
for ci, c in enumerate(DA.MANUAL):
    for raw in c:
        txt = raw[1:] if raw[:1] in "*!" else raw
        if "|" in txt: txt, n = txt.split("|"); n = int(n); exp = None
        else: n = len(txt.split()); exp = txt.split()
        got = toks[k:k + n]
        if exp and [norm(x) for x in exp] != [norm(x) for x in got] and bad < 15:
            print("[cum %d] '%s'  <>  ban go: '%s'" % (ci, txt, " ".join(got))); bad += 1
        k += n
print("tong tu MANUAL %d / ban go %d %s" % (k, len(toks), "OK" if k == len(toks) else "LECH"))
