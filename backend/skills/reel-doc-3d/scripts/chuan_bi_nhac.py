# -*- coding: utf-8 -*-
"""Chuan bi 1 bai nhac nen cho mix_engine: doi sang wav 48k stereo + tim 'diem vao' (cho nhac bat dau day/manh).
   python chuan_bi_nhac.py <bai.mp3> <ten_ngan>        (vd: python chuan_bi_nhac.py "D:\\nhac\\chill.mp3" chill)
Ket qua: <skill>\\nhac\\<ten>_full.wav + <ten>_grid.json. Trong du_an.py dat MUSIC = ["<ten>"] (toi da 3 bai)."""
import json, subprocess, sys, wave
from pathlib import Path
import numpy as np

src, name = sys.argv[1], sys.argv[2]
OUT = Path(__file__).resolve().parent.parent / "nhac"; OUT.mkdir(exist_ok=True)
full = OUT / (name + "_full.wav")
subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src, "-vn", "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", str(full)], check=True)
with wave.open(str(full), "rb") as f:
    x = np.frombuffer(f.readframes(f.getnframes()), "<i2").astype(np.float64).reshape(-1, 2).mean(1) / 32768
SR = 48000; w = 2 * SR
rms = np.array([np.sqrt((x[i:i + w] ** 2).mean()) for i in range(0, max(1, len(x) - w), SR // 2)])
hi = np.percentile(rms, 90) if len(rms) else 0
entry = float(np.argmax(rms >= 0.78 * hi) * 0.5) if hi > 0 else 0.0
if len(x) / SR - entry < 60: entry = 0.0                 # bai ngan -> vao tu dau
json.dump({"entry": entry, "name": name, "src": src, "length": len(x) / SR}, open(OUT / (name + "_grid.json"), "w"), indent=1)
print("xong: %s, diem vao %.1fs, dai %.0fs" % (full, entry, len(x) / SR))
