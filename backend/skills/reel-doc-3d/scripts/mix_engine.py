# -*- coding: utf-8 -*-
"""(skill reel-doc-3d) Ghep tieng: giong (da x1.1 trong cut.mov) + nhac nen -15 dB (ha khi noi, nho dan cuoi)
+ hieu ung am thanh tong hop bang code dat vao cac doan B-roll (meta.json "SFX"),
nen + limiter roi loudnorm 2 luot -14 LUFS.  Chay bang venv-photo.  python mix_engine.py --du-an <thu muc du an> [--draft]"""
import json, subprocess, sys, wave
from pathlib import Path
import numpy as np

PROJ = Path(sys.argv[sys.argv.index("--du-an") + 1]).resolve() if "--du-an" in sys.argv else Path.cwd()
sys.path.insert(0, str(PROJ))
import du_an as DA
DRAFT = "--draft" in sys.argv
WORK = PROJ / ("work_draft" if DRAFT else "work")
MUSIC = getattr(DA, "MUSIC", [])
PREP = Path(getattr(DA, "MUSIC_DIR", Path(__file__).resolve().parent.parent / "nhac"))   # nhac da chuan bi bang chuan_bi_nhac.py
SR = 48000
rng = np.random.default_rng(7)

def run(c): subprocess.run(c, check=True, capture_output=True)
def rd(p):
    with wave.open(str(p), "rb") as w:
        a = np.frombuffer(w.readframes(w.getnframes()), "<i2").astype(np.float64) / 32768
        return a.reshape(-1, w.getnchannels())
def wr(p, a):
    with wave.open(str(p), "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(a, -1, 1) * 32767).astype("<i2").tobytes())
def smooth(x, n):
    c = np.concatenate([[0.0], np.cumsum(x)]); i = np.arange(len(x)); lo = np.clip(i - n // 2, 0, len(x)); hi = np.clip(i + n // 2 + 1, 0, len(x))
    return (c[hi] - c[lo]) / (hi - lo)
def lp(x, fc):                                    # loc thong thap 1 cuc, fc co the thay doi theo mau
    fc = np.broadcast_to(np.asarray(fc, float), x.shape); a = 1 - np.exp(-2 * np.pi * fc / SR); y = np.empty_like(x); s = 0.0
    for i in range(len(x)): s += a[i] * (x[i] - s); y[i] = s
    return y
def T(d): return np.arange(int(d * SR)) / SR

# ---------------- thu vien hieu ung am thanh (nhe, tong hop) ----------------
def whoosh(up=True):
    d = 0.38; t = T(d); x = rng.standard_normal(len(t))
    y = lp(x, np.geomspace(400 if up else 4500, 4500 if up else 400, len(t)))
    y = y / (np.abs(y).max() + 1e-9) * np.sin(np.pi * t / d) ** 1.6
    return y
def pop():
    t = T(0.09); f = 320 + 700 * np.exp(-t * 60)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 38)
def tick():
    t = T(0.025); return np.sin(2 * np.pi * 2600 * t) * np.exp(-t * 260)
def ding():
    t = T(1.1); y = sum(a * np.sin(2 * np.pi * f * t) * np.exp(-t * dcy) for f, a, dcy in ((1318.5, 1.0, 4.0), (2637, 0.35, 6), (3955, 0.12, 9)))
    return y * np.minimum(1, t / 0.004)
def snip():
    y = np.zeros(int(0.06 * SR))
    for o in (0, int(0.028 * SR)):
        n = rng.standard_normal(int(0.012 * SR)); n = np.diff(n, prepend=0) * np.exp(-np.arange(len(n)) / (0.003 * SR))
        y[o:o + len(n)] += n
    return y / (np.abs(y).max() + 1e-9)
def boom():
    t = T(0.9); f = 45 + 45 * np.exp(-t * 9)
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 4.5)
    y += 0.3 * lp(rng.standard_normal(len(t)), 180) * np.exp(-t * 6) * 6
    return y / (np.abs(y).max() + 1e-9)
def riser():
    d = 0.9; t = T(d); y = lp(rng.standard_normal(len(t)), np.geomspace(300, 6000, len(t)))
    return y / (np.abs(y).max() + 1e-9) * (t / d) ** 2
def pop_soft():                                   # bop nhe cho chu day bat ra
    t = T(0.07); f = 260 + 420 * np.exp(-t * 70)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 45)
def sparkle():                                    # lap lanh cho chu manh (3 not cao rai nhanh)
    y = np.zeros(int(0.5 * SR))
    for k, f in enumerate((2093.0, 2637.0, 3136.0)):
        t = T(0.4); o = int(k * 0.045 * SR)
        y[o:o + len(t)] += np.sin(2 * np.pi * f * t) * np.exp(-t * 11) * (0.8 - 0.2 * k)
    return y / (np.abs(y).max() + 1e-9)
def swish():                                      # vut ngan, sang
    d = 0.2; t = T(d); y = lp(rng.standard_normal(len(t)), np.geomspace(1500, 7000, len(t)))
    y = y - lp(y, 800)
    return y / (np.abs(y).max() + 1e-9) * np.sin(np.pi * t / d) ** 2
def thud():                                       # tieng cham nang, tram (chu to dap xuong)
    t = T(0.35); f = 55 + 70 * np.exp(-t * 25)
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 12)
    return y / (np.abs(y).max() + 1e-9)
def click():                                      # go phim
    n = rng.standard_normal(int(0.012 * SR)); n = np.diff(n, prepend=0) * np.exp(-np.arange(len(n)) / (0.0018 * SR))
    return n / (np.abs(n).max() + 1e-9)
def notif():                                      # thong bao tin nhan (2 not)
    y = np.zeros(int(0.45 * SR))
    for k, f in enumerate((1046.5, 1568.0)):
        t = T(0.3); o = int(k * 0.11 * SR)
        y[o:o + len(t)] += np.sin(2 * np.pi * f * t) * np.exp(-t * 14) * np.minimum(1, t / 0.003)
    return y / (np.abs(y).max() + 1e-9)
LIB = {"whoosh": lambda: whoosh(True), "whoosh_out": lambda: whoosh(False), "pop": pop, "tick": tick, "ding": ding,
       "snip": snip, "boom": boom, "riser": riser, "pop_soft": pop_soft, "sparkle": sparkle, "swish": swish,
       "thud": thud, "click": click, "notif": notif}

run(["ffmpeg", "-y", "-i", str(WORK / "cut.mov"), "-vn", "-ac", "2", "-ar", str(SR), "-c:a", "pcm_s16le", str(WORK / "voice.wav")])
v = rd(WORK / "voice.wav"); n = len(v)
meta = json.load(open(WORK / "meta.json"))
vr = np.sqrt((v ** 2).mean())
# MUSIC: 1 ten hoac danh sach <=3 bai; bai sau noi vao khi bai truoc het (cross-fade 2s, vao dung diem 'entry' cua bai sau)
names = [MUSIC] if isinstance(MUSIC, str) else list(MUSIC)[:3]
m = np.zeros((0, 2)); xf = int(2.0 * SR)
for k, nm in enumerate(names):
    g = json.load(open(PREP / (nm + "_grid.json")))
    tr = rd(PREP / (nm + "_full.wav"))[int(g["entry"] * SR):]
    tr = tr * (vr / (np.sqrt((tr ** 2).mean()) + 1e-9) * 10 ** (-15 / 20))   # moi bai -15 dB so voi giong
    if len(m) == 0: m = tr
    else:
        ramp = np.linspace(0, 1, xf)[:, None]
        m = np.vstack([m[:-xf], m[-xf:] * (1 - ramp) + tr[:xf] * ramp, tr[xf:]])
    print("nhac %d: %s (%.0fs)" % (k + 1, nm, len(tr) / SR))
    if len(m) >= n: break
m = m[:n]
if len(m) < n:
    print("!! nhac ngan hon video %.0fs - them bai vao MUSIC" % ((n - len(m)) / SR))
    m = np.vstack([m, np.zeros((n - len(m), 2))])
e = np.sqrt(smooth((v ** 2).mean(1), 2400)); e /= np.percentile(e, 95) + 1e-9
m *= smooth(1 - 0.28 * np.clip(e, 0, 1), 4800)[:, None]
fi, fo = int(0.4 * SR), int(2.0 * SR)
m[:fi] *= np.linspace(0, 1, fi)[:, None]; m[-fo:] *= np.linspace(1, 0, fo)[:, None]
mix = v + m
cnt = {}
for t0, src, inp, dur, vol in meta.get("BAUDIO", []):      # giu tieng nen nho cua canh quay nguoi dung
    tmp = WORK / "baudio.wav"
    run(["ffmpeg", "-y", "-ss", str(inp), "-t", str(dur), "-i", src, "-vn", "-ac", "2", "-ar", str(SR), "-c:a", "pcm_s16le", str(tmp)])
    try: y = rd(tmp)
    except Exception: continue
    k = len(y); fdl = min(k // 2, int(0.15 * SR))
    if fdl > 0: y[:fdl] *= np.linspace(0, 1, fdl)[:, None]; y[-fdl:] *= np.linspace(1, 0, fdl)[:, None]
    y = y / (np.sqrt((y ** 2).mean()) + 1e-9) * vr * vol * 0.5
    i0 = int(t0 * SR); k = min(k, n - i0)
    if k > 0: mix[i0:i0 + k] += y[:k]
nb = 0
for t0, kind, amp in sorted(meta["SFX"]):
    if kind == "boom":                            # quy tac: boom toi da 3 lan, du thi doi thanh thud nhe
        nb += 1
        if nb > 3: kind, amp = "thud", amp * 0.7
    y = LIB[kind]() * amp
    i0 = int(max(0, t0 - (0.18 if kind.startswith("whoosh") else 0)) * SR)
    k = min(len(y), n - i0)
    if k > 0: mix[i0:i0 + k] += y[:k, None]; cnt[kind] = cnt.get(kind, 0) + 1
print("SFX:", cnt)
wr(WORK / "mix_raw.wav", mix / max(1.0, np.abs(mix).max() / 0.98))
run(["ffmpeg", "-y", "-i", str(WORK / "mix_raw.wav"), "-af",
     "acompressor=threshold=0.16:ratio=3.2:attack=5:release=120:makeup=1.6,alimiter=limit=0.60:attack=3:release=60:level=disabled",
     "-c:a", "pcm_s16le", str(WORK / "mix.wav")])
# Can am cuoi (tu lam, khong phu thuoc thu vien ngoai): loudnorm 2 luot ve -14 LUFS, roi CHAN DINH -1.5 dB
# (tieng go phim / lap lanh rat sac -> sau khi nang do to dinh tung vuot 0 dB; 16/10/2026)
import re
def loud_measure(src):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(src), "-af", "loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"],
                       capture_output=True, text=True)
    return json.loads(re.findall(r"\{[^{}]*\}", r.stderr)[-1])
m1 = loud_measure(WORK / "mix.wav")
print("    measured: I=%s LUFS  TP=%s  LRA=%s" % (m1["input_i"], m1["input_tp"], m1["input_lra"]))
af = ("loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=%s:measured_TP=%s:measured_LRA=%s:measured_thresh=%s:offset=%s:linear=true,"
      "aresample=192000,alimiter=limit=0.84:attack=1:release=60:level=disabled,aresample=48000"
      % (m1["input_i"], m1["input_tp"], m1["input_lra"], m1["input_thresh"], m1["target_offset"]))
run(["ffmpeg", "-y", "-i", str(WORK / "mix.wav"), "-af", af, "-ar", str(SR), "-c:a", "pcm_s16le", str(WORK / "mix_final.wav")])
name = getattr(DA, "OUT_NAME", "reel")
out = PROJ / ((name + "_nhap720.mp4") if DRAFT else (name + ".mp4"))
run(["ffmpeg", "-y", "-i", str(WORK / "video.mp4"), "-i", str(WORK / "mix_final.wav"), "-map", "0:v", "-map", "1:a", "-c:v", "copy",
     "-c:a", "aac", "-b:a", "256k", "-shortest", "-movflags", "+faststart", str(out)])
m2 = loud_measure(out)
print("    ket qua: I=%s LUFS  TP=%s dBTP" % (m2["input_i"], m2["input_tp"]))
print("XONG ->", out)
# Ban chinh -> chep them vao thu muc thanh pham cho de tim: "<ngay-thang> <TEN_GIAO>.mp4"
FINAL_DIR = getattr(DA, "FINAL_DIR", None)
if not DRAFT and FINAL_DIR and Path(FINAL_DIR).exists():
    import shutil, datetime
    ten = getattr(DA, "TEN_GIAO", name)
    ngay = datetime.date.today().strftime("%d-%m")
    dich = Path(FINAL_DIR) / ("%s %s.mp4" % (ngay, ten))
    shutil.copy2(out, dich)
    print("DA CHEP ->", dich)
