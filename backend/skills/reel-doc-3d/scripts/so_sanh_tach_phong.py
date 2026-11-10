# -*- coding: utf-8 -*-
"""So sanh cach tach phong tren cung 1 doan video: u2net_human_seg (cu) vs RobustVideoMatting mobilenet / resnet50.
   python so_sanh_tach_phong.py <video> <giay_bat_dau> <so_giay> <thu_muc_ra>
Ra: anh ghep canh nhau (toan khung + phong to vung toc/vai) + thoi gian moi khung + do nhap nhay mep."""
import subprocess, sys, time
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
import onnxruntime as ort
sys.path.insert(0, str(Path(__file__).resolve().parent))
from skin import guided
from rembg import new_session, remove

src, t0, dur, out = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), Path(sys.argv[4]); out.mkdir(parents=True, exist_ok=True)
W, H = 1080, 1920
MODELS = Path(__file__).resolve().parent.parent / "models"
p = subprocess.run(["ffmpeg", "-v", "error", "-ss", str(t0), "-t", str(dur), "-i", src, "-vf", "scale=%d:%d,fps=30" % (W, H),
                    "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True)
frames = np.frombuffer(p.stdout, np.uint8).reshape(-1, H, W, 3)
print("%d khung" % len(frames))

SESS = new_session("u2net_human_seg", providers=["CPUExecutionProvider"])
def u2net(fr, prev):
    img = Image.fromarray(fr); MW, MH = 432, 768; sm = img.resize((MW, MH), Image.BILINEAR)
    m = np.asarray(remove(sm, session=SESS, only_mask=True), dtype=np.float32) / 255.0
    g = np.asarray(sm.convert("L"), dtype=np.float32) / 255.0
    m = np.clip(guided(g, m, 4, 2e-3), 0, 1); m = np.clip((m - 0.28) / 0.44, 0, 1); m = m * m * (3 - 2 * m)
    if prev is not None: m = 0.68 * m + 0.32 * prev
    return m, np.asarray(Image.fromarray((m * 255).astype(np.uint8)).resize((W, H), Image.BILINEAR), dtype=np.float32) / 255.0

class RVM:
    def __init__(self, name, ratio):
        self.s = ort.InferenceSession(str(MODELS / name), providers=["CPUExecutionProvider"]); self.ratio = ratio; self.reset()
    def reset(self): self.rec = [np.zeros((1, 1, 1, 1), np.float32)] * 4
    def __call__(self, fr, prev=None):
        x = (fr.astype(np.float32) / 255.0).transpose(2, 0, 1)[None]
        o = self.s.run(None, {"src": x, "r1i": self.rec[0], "r2i": self.rec[1], "r3i": self.rec[2], "r4i": self.rec[3],
                              "downsample_ratio": np.array([self.ratio], np.float32)})
        self.rec = o[2:6]
        a = o[1][0, 0]
        return a, a

res = {}
bg = np.zeros((H, W, 3), np.float32) + np.array([12, 12, 12], np.float32)
for name, fn in (("u2net (cu)", None), ("RVM nhe", RVM("rvm_mobilenetv3_fp32.onnx", 0.25)), ("RVM net", RVM("rvm_resnet50_fp32.onnx", 0.25))):
    prev = None; alphas = []; tt = time.time()
    for i, fr in enumerate(frames):
        if fn is None: prev, a = u2net(fr, prev)
        else:
            if i == 0:
                for _ in range(3): fn(fr)                   # ham nong trang thai hoi quy
            _, a = fn(fr)
        alphas.append(a)
    sec = (time.time() - tt) / len(frames)
    A = np.stack(alphas)
    edge = (A[1:] > 0.05) & (A[1:] < 0.95)
    flick = float(np.abs(A[1:] - A[:-1])[edge].mean()) if edge.any() else 0
    res[name] = (A[-1], sec, flick)
    print("%-11s %.2f giay/khung | nhap nhay mep %.3f" % (name, sec, flick))

def comp(a, fr):
    return Image.fromarray(np.clip(bg * (1 - a[..., None]) + fr.astype(np.float32) * a[..., None], 0, 255).astype(np.uint8))
fr = frames[-1]
full = [comp(r[0], fr) for r in res.values()]
box = (int(W * 0.18), int(H * 0.05), int(W * 0.82), int(H * 0.42))          # vung toc + vai
crops = [im.crop(box) for im in full]
cw, ch = crops[0].size; tw = 360
sheet = Image.new("RGB", (tw * 3 + cw * 3 // 2 * 0, 0 + 640 + ch * 1080 // cw // 2), (0, 0, 0))
sheet = Image.new("RGB", (3 * 540, 960 + int(ch * 540 / cw) + 50), (0, 0, 0)); d = ImageDraw.Draw(sheet)
for i, (name, im, cr) in enumerate(zip(res.keys(), full, crops)):
    sheet.paste(im.resize((540, 960)), (i * 540, 50))
    sheet.paste(cr.resize((540, int(ch * 540 / cw))), (i * 540, 1010))
    d.text((i * 540 + 12, 8), "%s  %.2fs/khung" % (name, res[name][1]), fill=(255, 196, 0))
sheet.save(out / "so-sanh-tach-phong.png"); print("->", out / "so-sanh-tach-phong.png")
