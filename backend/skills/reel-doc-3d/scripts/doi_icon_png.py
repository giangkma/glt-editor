# -*- coding: utf-8 -*-
"""Doi icon SVG -> PNG 512x512 nen trong suot bang Microsoft Edge headless (khong can cai them gi tren Windows).
   python doi_icon_png.py <thu muc icons>     (SVG de trong <thu muc icons>\\svg, PNG ra <thu muc icons>)
   Icon dang net (lucide, arcticons) thi them ten vao NET de lam net day hon."""
import subprocess, sys
from pathlib import Path
D = Path(sys.argv[1]).resolve()
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
NET = {"capcut": 2.6, "video": 2.6, "check": 3.2, "type": 2.6, "palette": 2.4, "volume-2": 2.6, "music": 2.6, "link": 2.6, "sparkles": 2.2}
for f in sorted((D / "svg").glob("*.svg")):
    n = f.stem
    svg = f.read_text(encoding="utf-8-sig")
    css = "svg *{stroke-width:%s !important}" % NET[n] if n in NET else ""
    html = D / "_tam.html"
    html.write_text("<!doctype html><meta charset=utf-8><style>html,body{margin:0;background:transparent}svg{width:512px;height:512px;display:block;color:#000}%s</style>%s" % (css, svg), encoding="utf-8")
    out = D / (n + ".png")
    subprocess.run([EDGE, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--default-background-color=00000000", "--window-size=512,512",
                    "--screenshot=" + str(out), html.as_uri()], capture_output=True, timeout=60)
    print(n, out.exists() and out.stat().st_size)
(D / "_tam.html").unlink(missing_ok=True)
