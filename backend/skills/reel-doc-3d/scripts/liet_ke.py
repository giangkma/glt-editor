# -*- coding: utf-8 -*-
"""In ban go bang tj.json thanh tung cau, moi tu kem (chi so:giay) + khoang nghi + de xuat cat (noi vap, cau thua)
de soan SEGS / WIDX / MANUAL trong du_an.py.   python liet_ke.py <thu muc du an>"""
import json, sys
from pathlib import Path
sys.stdout.reconfigure(encoding="utf-8")
P = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
d = json.load(open(P / "tj.json", encoding="utf-8"))
ws = [w for w in d["timeline"] if w["t"] == "w"]
cur, line = None, []
for i, w in enumerate(ws):
    if w["seg"] != cur:
        if line: print(" ".join(line))
        cur = w["seg"]; line = ["[%d]" % cur]
    line.append("%s(%d:%.2f)" % (w["x"], i, w["s"]))
print(" ".join(line))
print("--- de xuat cat:")
for g in d.get("suggestions", []):
    if g["kind"] != "silence": print(" ", g["kind"], round(g["start"], 2), round(g["end"], 2), g.get("phrase"), "|", g.get("reason"))
print("--- khoang nghi:", [(round(p["s"], 2), p["d"]) for p in d["timeline"] if p["t"] == "p"])
