# -*- coding: utf-8 -*-
"""REFRAME: clip QUAY NGANG -> khung doc 9:16 DI THEO NGUOI (them 09/11/2026).
Dung mo hinh tach nguoi RVM (da tai san trong models/) tren khung thu nho ~4 khung/giay:
tim vi tri nguoi (uu tien dau + than tren), lam muot nhu nguoi quay (vung chet + tang toc em) -> quy dao khung cat.
   python reframe.py <video> --size 480x270 [--fps 4]
In ra: REFRAME {"fps": 4, "cw": <be rong khung cat / be rong video>, "x": [mep trai 0..1 tung mau]}
Khong co mo hinh / khong thay nguoi -> REFRAME null (web app cat giua nhu cu)."""
import json, subprocess, sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
MODELS = HERE.parent / "models"


def out(v):
    print("REFRAME " + json.dumps(v), flush=True)
    sys.exit(0)


src = sys.argv[1]
w, h = (int(v) for v in sys.argv[sys.argv.index("--size") + 1].split("x")) if "--size" in sys.argv else (480, 270)
FPS = float(sys.argv[sys.argv.index("--fps") + 1]) if "--fps" in sys.argv else 4.0
cw = min(1.0, (h * 9 / 16) / w)                       # be rong khung doc / be rong video
if cw >= 0.98: out(None)

model = next((MODELS / n for n in ("rvm_mobilenetv3_fp32.onnx", "rvm_resnet50_fp32.onnx") if (MODELS / n).exists()), None)
try:
    import onnxruntime as ort
except Exception:
    ort = None
if model is None or ort is None: out(None)

sess = ort.InferenceSession(str(model), providers=["CPUExecutionProvider"])
rec = [np.zeros((1, 1, 1, 1), np.float32)] * 4
ratio = np.array([min(1.0, 384.0 / max(w, h))], np.float32)


def alpha(arr):
    global rec
    x = (arr.astype(np.float32) / 255.0).transpose(2, 0, 1)[None]
    o = sess.run(None, {"src": x, "r1i": rec[0], "r2i": rec[1], "r3i": rec[2], "r4i": rec[3], "downsample_ratio": ratio})
    rec = list(o[2:6])
    return o[1][0, 0]


proc = subprocess.Popen(["ffmpeg", "-v", "error", "-i", src, "-vf", "fps=%g,scale=%d:%d" % (FPS, w, h),
                         "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE)
centers, first = [], True
fs = w * h * 3
while True:
    buf = proc.stdout.read(fs)
    if len(buf) < fs: break
    arr = np.frombuffer(buf, np.uint8).reshape(h, w, 3)
    if first:                                          # ham nong bo nho cua RVM
        for _ in range(2): alpha(arr)
        first = False
    a = alpha(arr)
    m = a > 0.5
    if m.sum() < 0.01 * w * h:
        centers.append(None); continue
    rows = np.where(m.any(axis=1))[0]
    y0, y1 = rows[0], rows[-1]
    top = m[y0:y0 + max(2, int((y1 - y0) * 0.45))]      # dau + than tren: nguoi xem nhin vao mat
    cols = np.where(top)[1]
    centers.append(float(cols.mean() / w) if cols.size else float(np.where(m)[1].mean() / w))
proc.wait()

if not centers or all(c is None for c in centers): out(None)
# lap cho trong (khung khong thay nguoi) bang gia tri gan nhat
idx = [i for i, c in enumerate(centers) if c is not None]
c = np.interp(np.arange(len(centers)), idx, [centers[i] for i in idx])
# loc trung vi (bo nhay vot 1 khung) roi "nguoi quay": chi lia khi lech khoi vung chet, lia em
k = 2
med = np.array([np.median(c[max(0, i - k):i + k + 1]) for i in range(len(c))])
pos, cam = [], med[0]
dead, ease = cw * 0.12, 0.3
for t in med:
    d = t - cam
    if abs(d) > dead: cam += (d - np.sign(d) * dead) * ease
    pos.append(cam)
pos = np.convolve(np.pad(pos, 2, mode="edge"), np.ones(5) / 5, mode="valid")
left = np.clip(pos - cw / 2, 0, 1 - cw)
out({"fps": FPS, "cw": round(cw, 5), "x": [round(float(v), 4) for v in left]})
