# -*- coding: utf-8 -*-
"""MONTAGE THEO NHAC cho video KHONG LOI (canh quay, phong canh, hanh trinh...) - them 09/11/2026.
Doc <du an>\\montage.json, cat canh DUNG NHIP nhac nen (nhac\\<ten>_nhip.json tu nhip_nhac.py), moi canh 1-8 nhip,
day vao / keo ra nhe luan phien, cham lai (speed < 1) cho canh dep, mau tuoi, tieu de "POV" (tuy chon, font DT Phudu),
mo dau/cuoi mem, nhac -14 LUFS. Tham khao: cac video trekking/du lich chi co nhac - cat thang dung phach.
   python montage_engine.py --du-an <du an> [--draft]
montage.json:
  {"src": "<video nguon>", "music": "<ten nhac>", "start_beat": 0,
   "shots": [{"start": 12.4, "beats": 2, "speed": 1.0, "reason": "..."}, ...],
   "title": "",               # (tuy chon) chu phia tren suot video — web app de "" (video chill khong chen chu)
   "size": [1080, 1920],      # (tuy chon) khung ban chinh; video ngang = [1920, 1080]
   "fps": 30,                 # (tuy chon) 60 = ban chinh 60fps (nen dung khi nguon quay 60fps)
   "ambient": 0.0}            # 0..0.3: giu chut tieng goc (gio, nuoc) duoi nhac
Ra: <du an>\\montage.mp4 (ban nhap: montage_nhap720.mp4).
Moi canh la 1 dau vao rieng (-ss tua thang toi canh) -> nhanh, it ton RAM du canh xep khong theo thu tu nguon."""
import json, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
NHAC = HERE.parent / "nhac"
FD = HERE.parent / "fonts"
PROJ = Path(sys.argv[sys.argv.index("--du-an") + 1]).resolve() if "--du-an" in sys.argv else Path.cwd()
DRAFT = "--draft" in sys.argv
GRADE = "eq=contrast=1.06:saturation=1.16:gamma=1.02,colorbalance=rs=0.02:gs=0.01:bs=-0.025:rh=0.015:bh=-0.015"

M = json.load(open(PROJ / "montage.json", encoding="utf-8"))
_SZ = M.get("size") or [1080, 1920]                    # [rong, cao] ban chinh - video ngang giu khung ngang
W, H = (int(_SZ[0]), int(_SZ[1])) if not DRAFT else ((1280, 720) if _SZ[0] > _SZ[1] else (720, 1280))
FPS = 30 if DRAFT else (60 if int(M.get("fps", 30)) >= 60 else 30)   # ban chinh 60fps khi nguon co khung that 60fps
if M.get("grade"): GRADE = M["grade"]                 # bo mau do web app chon ("null" = giu mau goc)
SRC = M["src"]
nhip = json.load(open(NHAC / (M["music"] + "_nhip.json"), encoding="utf-8"))
grid = json.load(open(NHAC / (M["music"] + "_grid.json"), encoding="utf-8"))
WORK = PROJ / ("work_draft" if DRAFT else "work"); WORK.mkdir(exist_ok=True)


def probe_dur(p):
    o = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(p)],
                       capture_output=True, text=True).stdout.strip()
    return float(o or 0)


SRC_DUR = probe_dur(SRC)

# ---- moc cat theo nhip: bat dau tu nhip manh dau o gan "diem vao" cua bai
beats = nhip["beats"]
downs = set(nhip.get("downbeats", []))
entry = float(grid.get("entry", 0))
cand = [i for i, b in enumerate(beats) if b >= entry - 0.05 and b in downs] or [i for i, b in enumerate(beats) if b >= entry - 0.05] or [0]
b0 = cand[0] + int(M.get("start_beat", 0))
if b0 >= len(beats) - 2: b0 = 0

shots, k = [], b0
for sh in M["shots"]:
    nb = max(1, int(sh.get("beats", 2)))
    if k + nb >= len(beats): break                     # het nhac
    shots.append({**sh, "b0": k, "b1": k + nb}); k += nb
if not shots: sys.exit("!! khong du nhip nhac cho canh nao")
t0 = beats[b0]
frames = [round((beats[s["b1"]] - t0) * FPS) for s in shots]   # moc cat (khung) roi DUNG nhip
lens = [frames[0]] + [frames[i] - frames[i - 1] for i in range(1, len(frames))]
TOTAL_F = frames[-1]; T = TOTAL_F / FPS


# ---- tieu de (PIL + DT Phudu, in hoa, trang vien den, bong mem) - giong kieu "POV: ..." cua video tham khao
def title_png(text, path):
    from PIL import Image, ImageDraw, ImageFont, ImageFilter
    fpath = FD / "Phudu-VF.ttf"
    if not fpath.exists(): fpath = FD / "InterTight-VF.ttf"
    size = int(W * 0.058)
    f = ImageFont.truetype(str(fpath), size)
    try: f.set_variation_by_axes([800])
    except Exception:
        try: f.set_variation_by_name("ExtraBold")
        except Exception: pass
    d0 = ImageDraw.Draw(Image.new("RGBA", (4, 4)))
    lines = []
    for raw in text.upper().split("\n"):
        cur = ""
        for word in raw.split():
            test = (cur + " " + word).strip()
            if d0.textlength(test, font=f) > W * 0.88 and cur: lines.append(cur); cur = word
            else: cur = test
        if cur: lines.append(cur)
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0)); dr = ImageDraw.Draw(im)
    y = int(H * 0.085); lh = int(size * 1.18); stroke = max(2, size // 14)
    for ln in lines[:3]:
        tw = d0.textlength(ln, font=f)
        dr.text(((W - tw) / 2, y), ln, font=f, fill=(255, 255, 255, 255), stroke_width=stroke, stroke_fill=(12, 12, 12, 255))
        y += lh
    sh = im.getchannel("A").filter(ImageFilter.GaussianBlur(size // 6)).point(lambda v: int(v * 0.55))
    out = Image.new("RGBA", (W, H), (0, 0, 0, 0)); shl = Image.new("RGBA", (W, H), (0, 0, 0, 255)); shl.putalpha(sh)
    out.alpha_composite(shl, (0, max(2, size // 12))); out.alpha_composite(im)
    out.save(path)


# ---- moi canh 1 dau vao: -ss tua thang toi canh (nhanh, khong giu khung trong RAM)
inputs, parts, labels, aparts, alabels = [], [], [], [], []
amb = min(0.3, max(0.0, float(M.get("ambient", 0))))
for i, (s, n) in enumerate(zip(shots, lens)):
    sp = min(2.0, max(0.5, float(s.get("speed", 1.0))))
    st = max(0.0, min(float(s["start"]), SRC_DUR - 0.2))
    need = n / FPS * sp + 0.2
    if st + need > SRC_DUR:                            # canh sat cuoi nguon -> lui diem vao / cham lai
        st = max(0.0, SRC_DUR - need)
        if st == 0.0 and need > SRC_DUR: sp = max(0.5, (SRC_DUR - 0.2) / (n / FPS))
    inputs += ["-ss", "%.3f" % st, "-t", "%.3f" % (need + 0.1), "-i", SRC]
    D = n / FPS
    z0, z1 = (1.0, 1.06) if i % 2 == 0 else (1.06, 1.0)  # day vao / keo ra luan phien (nhe)
    zexpr = "%.4f+(%.4f)*min(t/%.3f,1)" % (z0, z1 - z0, max(D, 0.05))
    parts.append(
        "[%d:v]setpts=(PTS-STARTPTS)/%.3f,fps=%d,"
        "scale=%d:%d:force_original_aspect_ratio=increase:flags=bicubic,crop=%d:%d,"
        "scale=w='trunc(%d*(%s)/2)*2':h='trunc(%d*(%s)/2)*2':eval=frame:flags=bicubic,crop=%d:%d,"
        "trim=end_frame=%d,setpts=PTS-STARTPTS,setsar=1,format=yuv420p[v%d]"
        % (i, sp, FPS, W, H, W, H, W, zexpr, H, zexpr, W, H, n, i))
    labels.append("[v%d]" % i)
    if amb > 0:
        aparts.append("[%d:a]aresample=48000,aformat=channel_layouts=stereo,asetpts=PTS-STARTPTS,atempo=%.3f,apad,atrim=0:%.3f,"
                      "afade=t=in:d=0.05,afade=t=out:st=%.3f:d=0.05[a%d]" % (i, sp, D, max(0, D - 0.05), i))
        alabels.append("[a%d]" % i)
n_src = len(shots)

fg = ";".join(parts)
fg += ";%sconcat=n=%d:v=1:a=0,%s,fade=t=in:st=0:d=0.3,fade=t=out:st=%.3f:d=0.8[vb]" % ("".join(labels), n_src, GRADE, max(0, T - 0.8))
vlast = "vb"
extra = []
title = str(M.get("title") or "").strip()
idx = n_src
if title:
    tp = WORK / "tieu_de.png"; title_png(title, tp)
    extra += ["-loop", "1", "-t", "%.3f" % T, "-i", str(tp)]
    fg += ";[%d:v]format=rgba,fade=t=in:st=0.2:d=0.4:alpha=1,fade=t=out:st=%.3f:d=0.8:alpha=1[tt]" % (idx, max(0, T - 0.8))
    fg += ";[vb][tt]overlay=0:0:format=auto,format=yuv420p[vt]"; vlast = "vt"
    idx += 1
music = NHAC / (M["music"] + "_full.wav")
extra += ["-ss", "%.3f" % t0, "-i", str(music)]
fg += ";[%d:a]atrim=0:%.3f,asetpts=PTS-STARTPTS,afade=t=in:d=0.05,afade=t=out:st=%.3f:d=1.5[mu]" % (idx, T, max(0, T - 1.5))
if amb > 0:
    fg += ";" + ";".join(aparts) + ";%sconcat=n=%d:v=0:a=1,volume=%.2f[amb];[mu][amb]amix=inputs=2:duration=first:normalize=0[mx]" % ("".join(alabels), len(alabels), amb)
    fg += ";[mx]loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000,asetpts=N/SR/TB[a]"
else:
    fg += ";[mu]loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000,asetpts=N/SR/TB[a]"

out = PROJ / ("montage_nhap720.mp4" if DRAFT else "montage.mp4")
cmd = ["ffmpeg", "-y", "-v", "error", "-nostats", "-progress", "pipe:1"] + inputs + extra + [
       "-filter_complex", fg, "-map", "[%s]" % vlast, "-map", "[a]", "-r", str(FPS),
       "-c:v", "libx264", "-crf", "23" if DRAFT else "17", "-preset", "veryfast" if DRAFT else "slow", "-pix_fmt", "yuv420p",
       "-c:a", "aac", "-b:a", "256k", "-movflags", "+faststart", "-t", "%.3f" % T, str(out)]
print("%dx%d | %.2fs | %d canh | nhac %s %.1f BPM tu giay %.2f" % (W, H, T, len(shots), M["music"], nhip["tempo"], t0), flush=True)
p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
last = -1
for line in p.stdout:
    if line.startswith("out_time_us="):
        try: f = int(int(line.split("=")[1]) / 1e6 * FPS)
        except ValueError: continue
        if f - last >= 30: print("  khung %d/%d" % (min(f, TOTAL_F), TOTAL_F), flush=True); last = f
err = p.stderr.read(); p.wait()
if p.returncode != 0: sys.exit("!! ffmpeg loi: " + err[-800:])
print("XONG ->", out)
