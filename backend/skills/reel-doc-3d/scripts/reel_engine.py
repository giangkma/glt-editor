# -*- coding: utf-8 -*-
"""BO MAY REEL DOC 3D (skill reel-doc-3d).
Moi video chi can 1 tep du_an.py trong thu muc du an (xem du_an_mau.py).
Quy tac: 2 font (Inter Tight + Playfair Display Italic), 3 mau (trang / den / vang #FFC400),
chu manh-nghieng (Playfair) -> hieu ung sang (mo-hien, gach chan manh, sao lap lanh),
chu day (Inter Tight Black) -> hieu ung nang dong (hop vang quet, bat phong, rung),
B-roll mo ta don vao doan co y can minh hoa / con so lon (phan dau video), sau do la hieu ung chu.
Toc do x1.1, chinh mau + lam min da, nen xen ke: phong that / xoa phong / chu sau dau.
Chay bang python venv xoaphong-speed:
  python reel_engine.py --du-an <thu muc du an> [--draft] [--png <giay> <anh.png>] [--list]
  --list: in danh sach cum chu kem SO THU TU de gan B-roll/nen (lam truoc khi gan!)"""
import json, math, subprocess, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from rembg import new_session, remove
sys.path.insert(0, str(Path(__file__).resolve().parent))
from skin import Skin, guided

HERE = Path(__file__).resolve().parent
PROJ = Path(sys.argv[sys.argv.index("--du-an") + 1]).resolve() if "--du-an" in sys.argv else Path.cwd()
sys.path.insert(0, str(PROJ))
import du_an as DA
SRC = DA.SRC
DRAFT = "--draft" in sys.argv
def _probe(p):
    o = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:stream_side_data=rotation",
                        "-of", "json", p], capture_output=True, text=True).stdout
    st = json.loads(o)["streams"][0]; w, h = st["width"], st["height"]
    rot = abs(int(float((st.get("side_data_list") or [{}])[0].get("rotation", 0) or 0)))
    if rot in (90, 270): w, h = h, w
    return w // 2 * 2, h // 2 * 2
SW, SH = getattr(DA, "OUT_RES", None) or _probe(SRC)        # GIU NGUYEN do phan giai nguon
LANDSCAPE = SW > SH                                    # video NGANG: giu khung ngang, chi doi bo cuc chu (them 09/11/2026)
W, H = ((1280, 720) if LANDSCAPE else (720, 1280)) if DRAFT else (SW, SH)
FPS, SPEED = 30, getattr(DA, "SPEED", 1.1)
# Chuyen canh (them 09/11/2026): "muot" (mac dinh) = may quay doi zoom tu tu, khong chop trang, hoa tan khi doi nen /
# het B-roll / cho cat, it cat khoang nghi ngan. "manh" = kieu cu (zoom nhay theo cum, giat nhan, chop trang).
SMOOTH = getattr(DA, "CHUYEN_CANH", "muot") != "manh"
PAUSE_CUT = getattr(DA, "PAUSE_CUT", 0.30 if SMOOTH else 0.22)   # khoang nghi trong cau dai hon muc nay moi bi cat
AFADE = 0.05 if SMOOTH else 0.03                                  # fade tieng moi cho cat (giay)
K = (H / 1080.0 * 0.8) if LANDSCAPE else W / 1080.0     # ngang: chu theo chieu cao, nho hon chut cho khoi che hinh
CAP_W = W * 0.78 if LANDSCAPE else int(round(900 * K))   # be rong toi da 1 dong chu
def s(v): return int(round(v * K))
WORK = PROJ / ("work_draft" if DRAFT else "work")
FD = HERE.parent / "fonts"                           # font kem theo skill (SIL Open Font License)
if not (FD / "InterTight-VF.ttf").exists(): sys.exit("!! chua co font trong %s - chay cai-dat.ps1 truoc (buoc tai font Google Fonts)" % FD)
SANS, SANS_I, SERIF_I = str(FD / "InterTight-VF.ttf"), str(FD / "InterTight-Italic-VF.ttf"), str(FD / "PlayfairDisplay-Italic-VF.ttf")
# Phong cach (sua 09/11/2026): mac dinh phu de font DT Phudu (Duong Tran, OFL), KHONG B-roll 3D, KHONG tach phong.
# Muon quay lai kieu cu: trong du_an.py dat FONT_CHU = "inter", BROLL_3D = True, TACH_PHONG = True.
PHUDU = str(FD / "Phudu-VF.ttf")
FONT_CHU = getattr(DA, "FONT_CHU", "phudu")
if FONT_CHU == "phudu" and not Path(PHUDU).exists():
    print("!! chua co font Phudu (%s) - chay lai buoc cai dat font; tam dung Inter Tight" % PHUDU); FONT_CHU = "inter"
USE_PHUDU = FONT_CHU == "phudu"
BROLL_3D = getattr(DA, "BROLL_3D", False)              # mau minh hoa khoi 3D (BCount, BRevenue...) - mac dinh TAT
TACH_PHONG = getattr(DA, "TACH_PHONG", False)          # nen toi xoa phong (DARK) + chu to sau dau (BEHIND) - mac dinh TAT
_WGHT = {"Light": 300, "Regular": 400, "Medium": 500, "SemiBold": 600, "Bold": 700, "ExtraBold": 800, "Black": 900, "Italic": 800}
WHITE, BLACK, YEL = (255, 255, 255), (12, 12, 12), (255, 196, 0)
# Phu de (them 09/11/2026): PHU_DE = "tung-tu" (kieu TikTok: chu hien TUNG TU dung luc noi, nay nhe) | "cum" (kieu cu)
# MAU_NHAN = mau chu nhan / hop nhan (mac dinh vang cu; web app dat cam (255, 122, 26))
PHU_DE = getattr(DA, "PHU_DE", "cum")
YEL = tuple(getattr(DA, "MAU_NHAN", YEL))
GREY = (40, 40, 40)                                   # chi la sac do cua den, khong tinh la mau moi

def clamp(x, a=0.0, b=1.0): return max(a, min(b, x))
def e_out(x): x = clamp(x); return 1 - (1 - x) ** 3
def e_io(x): x = clamp(x); return x * x * (3 - 2 * x)
def e_back(x, k=1.7): x = clamp(x); return 1 + (k + 1) * (x - 1) ** 3 + k * (x - 1) ** 2
def lerp(a, b, u): return a + (b - a) * u

_fc = {}
def font(path, size, var=None):
    key = (path, int(size), var)
    if key not in _fc:
        f = ImageFont.truetype(path, max(6, int(size)))
        if var and path == PHUDU:                     # Phudu: dat do dam theo truc wght (on dinh hon ten instance)
            try: f.set_variation_by_axes([_WGHT.get(var, 700)])
            except Exception: pass
        elif var:
            try: f.set_variation_by_name(var)
            except Exception: f.set_variation_by_name(var.encode())
        _fc[key] = f
    return _fc[key]
def BLK(sz): return font(SANS, s(sz), "Black")
def BOLD(sz): return font(SANS, s(sz), "Bold")
def SEMI(sz): return font(SANS, s(sz), "SemiBold")
def SERIF(sz): return font(SERIF_I, s(sz), "Italic")

_tc = {}
def timg(txt, f, fill=WHITE, shadow=True, track=0, stroke=0):
    """Anh chu RGBA cat sat (kem bong mem, vien den tuy chon). Tra (img, pad)."""
    key = (txt, id(f), fill, shadow, track, stroke)
    if key in _tc: return _tc[key]
    d0 = ImageDraw.Draw(Image.new("RGBA", (4, 4)))
    if track:
        ws = [d0.textlength(ch, font=f) for ch in txt]; tw = sum(ws) + track * (len(txt) - 1)
        l, t, r, b = d0.textbbox((0, 0), txt, font=f, stroke_width=stroke); r = l + tw + 2 * stroke
    else:
        l, t, r, b = d0.textbbox((0, 0), txt, font=f, stroke_width=stroke)
    pad = s(30)
    im = Image.new("RGBA", (int(r - l) + 2 * pad, int(b - t) + 2 * pad), (0, 0, 0, 0)); dr = ImageDraw.Draw(im)
    if track:
        x = pad - l
        for ch, w_ in zip(txt, ws): dr.text((x, pad - t), ch, font=f, fill=fill + (255,), stroke_width=stroke, stroke_fill=BLACK + (255,)); x += w_ + track
    else:
        dr.text((pad - l, pad - t), txt, font=f, fill=fill + (255,), stroke_width=stroke, stroke_fill=BLACK + (255,))
    if shadow:
        sh = im.getchannel("A").filter(ImageFilter.GaussianBlur(s(12))).point(lambda v: int(v * 0.6))
        out = Image.new("RGBA", im.size, (0, 0, 0, 0)); shl = Image.new("RGBA", im.size, (0, 0, 0, 255)); shl.putalpha(sh)
        out.alpha_composite(shl, (0, s(5))); out.alpha_composite(im); im = out
    if len(_tc) > 250: _tc.clear()
    _tc[key] = (im, pad)
    return im, pad

def put(canvas, im, cx, cy, sc=1.0, a=1.0, anchor="mm"):
    """Dan anh vao canvas theo tam (cx,cy) voi ti le va do mo."""
    if sc <= 0.01 or a <= 0.01: return
    if abs(sc - 1) > 1e-3: im = im.resize((max(1, int(im.width * sc)), max(1, int(im.height * sc))), Image.BILINEAR)
    if a < 0.999:
        im = im.copy(); im.putalpha(im.getchannel("A").point(lambda v: int(v * a)))
    x = cx - im.width / 2 if anchor[0] == "m" else (cx if anchor[0] == "l" else cx - im.width)
    y = cy - im.height / 2
    canvas.alpha_composite(im, (int(x), int(y)))

def text(canvas, txt, f, cx, cy, fill=WHITE, sc=1.0, a=1.0, anchor="mm", shadow=True, track=0):
    im, pad = timg(txt, f, fill, shadow, track)
    if anchor[0] == "l": cx -= pad * sc
    elif anchor[0] == "r": cx += pad * sc
    put(canvas, im, cx, cy, sc, a, anchor)

def star(d, cx, cy, r, fill=YEL):
    d.polygon([(cx, cy - r), (cx + r * 0.2, cy - r * 0.2), (cx + r, cy), (cx + r * 0.2, cy + r * 0.2), (cx, cy + r),
               (cx - r * 0.2, cy + r * 0.2), (cx - r, cy), (cx - r * 0.2, cy - r * 0.2)], fill=fill)

# ------------------------------------------------------------------ 1. doan giu + toc do
TJ = json.load(open(PROJ / "tj.json", encoding="utf-8"))
TL = [w for w in TJ["timeline"] if w["t"] == "w"]
PAUSES = [(p["s"], p["d"]) for p in TJ["timeline"] if p["t"] == "p"]
if hasattr(DA, "WRANGES"):                           # khai bao doan giu theo CHI SO TU (a, b) - de hon, it sai hon giay
    SEGS, WIDX = [], []
    for a, b in DA.WRANGES:
        s0, s1 = TL[a]["s"] - 0.06, TL[b]["e"] + 0.10
        for ps, pd in PAUSES:
            if ps <= TL[a]["s"] < ps + pd: s0 = ps + pd - 0.06          # tu dau roi vao khoang lang -> bat dau cuoi khoang lang
            if TL[b]["e"] - 0.05 <= ps <= s1: s1 = min(s1, ps + 0.08)   # cat ngay khi im lang bat dau
        if SEGS and s0 < SEGS[-1][1]: s0 = SEGS[-1][1]
        SEGS.append((round(s0, 3), round(max(s1, s0 + 0.1), 3))); WIDX += list(range(a, b + 1))
else:
    SEGS = DA.SEGS                                   # cac doan nguon giu lai (giay)
    WIDX = DA.WIDX                                   # chi so tu trong ban go bang tuong ung
CUTS = []
for a, b in SEGS:
    for ps, pd in PAUSES:
        if pd >= PAUSE_CUT and a < ps and ps + pd < b: CUTS.append((round(ps + 0.05, 3), round(ps + pd - 0.05, 3)))
KEEP = []
for a, b in SEGS:
    pos = a
    for c0, c1 in CUTS:
        if a < c0 < b: KEEP.append((pos, c0)); pos = c1
    KEEP.append((pos, b))
# Canh KHONG LOI can giu (them 09/11/2026): SCENES = [(giay dau, giay cuoi, "ly do"), ...] theo thoi gian nguon.
# Doan khong co tieng noi nhung hinh dep / co y nghia (phong canh, hanh dong...) -> giu nguyen, KHONG cat khoang lang ben trong.
SCENES = sorted((float(x[0]), float(x[1])) for x in getattr(DA, "SCENES", []) if float(x[1]) - float(x[0]) >= 0.3)
if SCENES:
    _m = []
    for a, b in sorted(KEEP + SCENES):
        if _m and a <= _m[-1][1] + 0.04: _m[-1] = (_m[-1][0], max(_m[-1][1], b))
        else: _m.append((a, b))
    KEEP = _m
KEEP = [(round(round(a * FPS) / FPS, 4), round(round(b * FPS) / FPS, 4)) for a, b in KEEP]
def mp(t):                                            # giay nguon -> giay ban dung (da tang toc)
    acc = 0.0
    for a, b in KEEP:
        if t < a: return acc / SPEED
        if t <= b: return (acc + t - a) / SPEED
        acc += b - a
    return acc / SPEED
DUR = sum(b - a for a, b in KEEP) / SPEED
SCENE_OUT = [(mp(a), mp(b)) for a, b in SCENES]          # canh khong loi tren timeline ban dung
def in_scene(t): return any(a <= t < b for a, b in SCENE_OUT)
# Cau "moc" (them 09/11/2026): HOOK = (tu dau, tu cuoi) theo so thu tu tu -> ghi moc giay tren ban dung de web app
# chep doan nay len DAU video (cold open: nghe cau gay to mo truoc, roi moi vao video).
_HK = getattr(DA, "HOOK", None)
if _HK and "--list" not in sys.argv:
    _a, _b = int(_HK[0]), int(_HK[1])
    if 0 <= _a <= _b < len(TL) and _a in WIDX and _b in WIDX:
        WORK.mkdir(exist_ok=True)
        json.dump({"s": round(max(0.0, mp(TL[_a]["s"]) - 0.06), 3), "e": round(min(DUR, mp(TL[_b]["e"]) + 0.22), 3)},
                  open(WORK / "hook.json", "w", encoding="utf-8"))
    else: print("!! HOOK nam ngoai doan giu - bo qua")

def make_cut(out):
    parts, ins = [], []
    for i, (a, b) in enumerate(KEEP):
        d = b - a
        parts.append("[0:v]trim=%.4f:%.4f,setpts=PTS-STARTPTS[v%d];[0:a]atrim=%.4f:%.4f,asetpts=PTS-STARTPTS,afade=t=in:d=%.3f,afade=t=out:st=%.4f:d=%.3f[a%d]"
                     % (a, b, i, a, b, AFADE, max(0, d - AFADE), AFADE, i))
        ins.append("[v%d][a%d]" % (i, i))
    grade = getattr(DA, "GRADE", "eq=contrast=1.05:saturation=1.07:gamma=1.03,colorbalance=rm=0.025:bm=-0.02:rh=0.01:bh=-0.015")
    fg = (";".join(parts) + ";" + "".join(ins) + "concat=n=%d:v=1:a=1[vc][ac];" % len(KEEP) +
          "[vc]setpts=PTS/%.3f,fps=%d,scale=%d:%d:flags=lanczos,%s,format=yuv420p[v];[ac]atempo=%.3f[a]" % (SPEED, FPS, W, H, grade, SPEED))
    (WORK / "fg.txt").write_text(fg, encoding="utf-8")
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", SRC, "-filter_complex_script", str(WORK / "fg.txt"), "-map", "[v]", "-map", "[a]",
                    "-c:v", "libx264", "-crf", "10", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "pcm_s16le", "-ar", "48000", str(out)], check=True)

# ------------------------------------------------------------------ 2. chu theo cum (chia tay)
# '*' = Playfair nghieng (manh) -> hieu ung SANG: mo-hien + troi len cham + gach chan vang manh + sao lap lanh
# '!' = Inter Tight Black (day) -> hieu ung NANG DONG: hop vang quet ngang, chu den bat phong, rung nhe
MANUAL = DA.MANUAL

def manual_plan():
    ws = [{"x": TL[i]["x"], "s": mp(TL[i]["s"]), "e": mp(TL[i]["e"])} for i in WIDX]
    k, plan = 0, []
    for ci, c in enumerate(MANUAL):
        lines, first_plain = [], True
        for li, raw in enumerate(c):
            mark = raw[0] if raw[0] in "*!" else ""
            txt = raw[1:] if mark else raw
            if "|" in txt: txt, n = txt.split("|"); n = int(n)
            else: n = len(txt.split())
            seg = ws[k:k + n]; k += n
            if not seg: continue
            if li == 0: txt = txt[0].upper() + txt[1:]
            if mark == "*": kind = "thin"
            elif mark == "!": kind = "bold"
            elif first_plain: kind = "lead"; first_plain = False
            else: kind = "sub"
            if USE_PHUDU:                                # DT Phudu: chu day, vien den, nhan = vang
                fpath, size, var = {"thin": (PHUDU, 118, "Black"), "bold": (PHUDU, 100, "Black"),
                                    "lead": (PHUDU, 88, "ExtraBold"), "sub": (PHUDU, 66, "Bold")}[kind]
                fill = BLACK if kind == "bold" else (YEL if kind == "thin" else WHITE)
                stroke = 0 if kind == "bold" else s(6)
            else:                                        # kieu cu: Inter Tight + Playfair nghieng
                fpath, size, var = {"thin": (SERIF_I, 146, "Italic"), "bold": (SANS, 96, "Black"),
                                    "lead": (SANS, 80, "Bold"), "sub": (SANS, 58, "SemiBold")}[kind]
                fill = BLACK if kind == "bold" else WHITE
                stroke = 0
            if PHU_DE == "tung-tu" and kind == "bold": fill = WHITE        # hop mau nhan + chu trang
            f = font(fpath, s(size), var)
            im, pad = timg(txt, f, fill, shadow=kind != "bold", stroke=stroke)
            while im.width - 2 * pad > CAP_W:
                f = font(f.path, int(f.size * 0.9), var)
                im, pad = timg(txt, f, fill, shadow=kind != "bold", stroke=stroke)
            th = im.height - 2 * pad
            L = {"x": txt, "s": seg[0]["s"], "e": seg[-1]["e"], "kind": kind, "img": im, "pad": pad, "th": th,
                 "w": im.width - 2 * pad, "boxpad": s(18) if kind == "bold" else 0}
            if PHU_DE == "tung-tu":                      # tach tung tu, moi tu hien dung luc duoc noi
                dws = txt.split() or [txt]
                gap = f.getlength(" ")
                ws_, off = [], 0.0
                for j, wd in enumerate(dws):
                    wim, wpad = timg(wd, f, fill, shadow=kind != "bold", stroke=stroke)
                    ww = f.getlength(wd) + 2 * stroke
                    st = seg[min(len(seg) - 1, j * len(seg) // len(dws))]["s"]
                    ws_.append({"img": wim, "pad": wpad, "w": ww, "off": off, "s": st})
                    off += ww + gap
                L["words"] = ws_; L["w"] = int(max(1, off - gap))
            lines.append(L)
        y = 0; offs = []
        for li, L in enumerate(lines):
            dx = (li % 2) * s(46) - (li // 2) * s(18)
            offs.append((dx, y + L["boxpad"])); y += int(L["th"] + s(10) + 2 * L["boxpad"])
        bw = max(L["w"] + dx for L, (dx, _) in zip(lines, offs))
        cx = W / 2 + s((-40, 30, 50)[ci % 3]); x0 = cx - bw / 2
        y0 = (H - s(150) if LANDSCAPE else H - s(280)) - y          # doc: s(1640) nhu cu
        plan.append({"t0": lines[0]["s"] - 0.05, "t1": None, "ci": ci, "end": lines[-1]["e"],
                     "lines": [(L, x0 + dx, y0 + yy) for L, (dx, yy) in zip(lines, offs)]})
    if k != len(ws): print("!! so tu khop MANUAL %d / transcript %d" % (k, len(ws)))
    for i, c in enumerate(plan):
        nxt = plan[i + 1]["t0"] - 0.02 if i + 1 < len(plan) else DUR
        c["t1"] = min(nxt, c["end"] + 0.8)
    return plan

def draw_captions(canvas, plan, t):
    d = ImageDraw.Draw(canvas)
    for c in plan:
        if not (c["t0"] <= t < c["t1"]): continue
        style = c["ci"] % 3                                  # chu thuong (Inter): noi len / truot trai / truot phai
        for L, x, y in c["lines"]:
            lt = t - (L["s"] - 0.04)
            if lt <= 0: continue
            im, pad, kind = L["img"], L["pad"], L["kind"]
            if "words" in L:                                 # KIEU TIKTOK: tung tu bat ra dung luc noi
                if kind == "bold":                           # hop mau nhan quet ngang truoc
                    bp = s(18); u = e_out(lt / 0.16)
                    d.rounded_rectangle([x - bp, y - bp, x - bp + (L["w"] + 2 * bp) * u, y + L["th"] + bp], radius=s(10), fill=YEL + (255,))
                for wd in L["words"]:
                    wt = t - (wd["s"] - 0.03)
                    if wt <= 0: continue
                    p = clamp(wt / 0.14)
                    sc = 0.72 + 0.28 * e_back(p, 2.2) if p < 1 else 1.0
                    wcx = x + wd["off"] + wd["w"] / 2
                    wcy = y + L["th"] / 2 - (1 - e_out(p)) * s(10)
                    put(canvas, wd["img"], wcx, wcy, sc, clamp(p * 2.5))
                continue
            if kind == "thin":                               # SANG: mo-hien cham + troi len, gach chan manh + sao
                p = clamp(lt / 0.45); a = e_io(p)
                put(canvas, im, x + L["w"] / 2, y + L["th"] / 2 + (1 - e_out(p)) * s(22), 1.0 + 0.04 * (1 - e_out(p)), a)
                u = e_io((lt - 0.15) / 0.5)
                if u > 0:
                    yl = y + L["th"] + s(16)
                    d.line([(x + s(6), yl), (x + s(6) + (L["w"] - s(12)) * u, yl)], fill=YEL + (255,), width=max(1, s(3)))
                tw = (lt - 0.35)
                if tw > 0:
                    r = s(16) * (0.6 + 0.4 * abs(math.sin(tw * 4.0))) * e_out(tw / 0.25)
                    star(d, x + L["w"] + s(22), y + s(6), r)
            elif kind == "bold":                             # NANG DONG: hop vang quet, chu bat phong + rung
                bp = s(18); u = e_out(lt / 0.16)
                d.rounded_rectangle([x - bp, y - bp, x - bp + (L["w"] + 2 * bp) * u, y + L["th"] + bp], radius=s(10), fill=YEL + (255,))
                p = (lt - 0.06) / 0.22
                if p > 0:
                    sc = e_back(p, 2.4) * 0.35 + 0.65 if p < 1 else 1.0
                    jx = s(5) * math.sin(lt * 70) * math.exp(-lt * 9) if lt < 0.6 else 0
                    put(canvas, im, x + L["w"] / 2 + jx, y + L["th"] / 2, sc, clamp(p * 3))
            else:
                p = clamp(lt / 0.16); a = e_out(p); dx = dy = 0
                if style == 0: dy = (1 - a) * s(26)
                elif style == 1: dx = -(1 - a) * s(80)
                else: dx = (1 - a) * s(80)
                put(canvas, im, x + L["w"] / 2 + dx, y + L["th"] / 2 + dy, 1.0, a)

# ------------------------------------------------------------------ 3. B-roll mo ta kieu 3D (nen den, trang + vang)
import fx3d as F3
GOLD = F3.shade(YEL, 0.62)                            # mat ben cua khoi vang (sac toi cua vang, khong phai mau moi)
SILV = (150, 150, 150)                                # mat ben cua khoi trang
PANEL, PANEL_SIDE = (30, 30, 30), (8, 8, 8)

def dark_bg():
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    dd = np.sqrt((xx - W / 2) ** 2 + ((yy - H * 0.38) * 0.75) ** 2) / (W * 0.95)
    glow = np.clip(1 - dd, 0, 1) ** 2
    bg = np.zeros((H, W, 3), np.float32) + np.array(BLACK, np.float32)
    bg += glow[..., None] * np.array([26, 21, 6], np.float32)
    return bg
BG = None
_bgi = None
def bg_img():
    global _bgi
    if _bgi is None: _bgi = Image.fromarray(np.clip(BG, 0, 255).astype(np.uint8)).convert("RGBA")
    return _bgi.copy()

def rr(d, box, r, **kw): d.rounded_rectangle([int(v) for v in box], radius=int(r), **kw)
def counter(n): return "{:,}".format(int(n)).replace(",", ".")

_t3 = {}
def t3d(txt, f, fill=YEL, depth=22):
    """Chu khoi 3D: mat truoc mau 'fill' + bong mat nhua, than dun xuong-phai, bong do mem."""
    key = (txt, id(f), fill, depth)
    if key not in _t3:
        im, pad = timg(txt, f, fill, shadow=False)
        if len(_t3) > 40: _t3.clear()
        ex = F3.extrude(im, s(depth), GOLD if fill == YEL else SILV, dx=0.45, dy=1.0)
        if ex.width > s(1010): ex = ex.resize((s(1010), int(ex.height * s(1010) / ex.width)), Image.LANCZOS)   # chu dai -> co cho vua khung
        _t3[key] = ex
    return _t3[key]

def put3(cv, im, cx, cy, sc=1.0, a=1.0, ay=0.0, ax=0.0):
    if ay or ax: im = F3.tilt(im, ay, ax)
    put(cv, im, cx, cy, sc, a)

def check_coin(r):
    r = max(float(r), 6.0)
    im = Image.new("RGBA", (int(2 * r), int(2 * r)), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.line([(r * 0.55, r), (r * 0.88, r * 1.32), (r * 1.48, r * 0.68)], fill=BLACK + (255,), width=max(2, int(r * 0.22)))
    return im

class BCount:                                         # bo dem so khoi 3D (follow, doanh thu, khach...)
    layout = "lower"
    def __init__(self, target=50000, top="Cảm ơn", label="NGƯỜI THEO DÕI", suffix=""):
        self.target, self.top, self.label, self.suffix = target, top, label, suffix
    def sfx(self, d):
        return [(0.0, "whoosh", 0.05)] + [(0.25 + i * 0.07, "tick", 0.035) for i in range(13)] + [(1.2, "ding", 0.09)]
    def draw(self, cv, t, d):
        dr = ImageDraw.Draw(cv)
        u = e_out((t - 0.2) / 0.95); y = s(1380)
        text(cv, self.top, SERIF(90), s(540), y - s(200), WHITE, a=e_io(t / 0.3))
        bump = 0.12 * (1 - e_out((t - 1.15) / 0.3)) if t > 1.15 else 0
        put3(cv, t3d(counter(self.target * u) + self.suffix, BLK(190), YEL, 24), s(540), y, 0.75 + 0.25 * e_back(t / 0.35) + bump,
             ay=10 * math.sin(t * 2.2), ax=-8)
        text(cv, self.label, SEMI(46), s(540), y + s(165), WHITE, a=e_io((t - 0.3) / 0.3), track=s(8))
        if t > 1.15:
            for i, (dx, dy) in enumerate(((-400, -130), (400, -100), (-330, 130), (350, 150))):
                r = s(24) * e_back((t - 1.15 - i * 0.05) / 0.3) * (0.7 + 0.3 * math.sin(t * 6 + i))
                if r > 0: star(dr, s(540 + dx), y + s(dy), r)

class BTimeline:                                      # bang timeline 3D nghieng tu xep clip + dong xu xoay
    layout = "full"
    CL = [(0, 0.05, 0.36), (0, 0.38, 0.70), (0, 0.72, 0.97), (1, 0.10, 0.40), (1, 0.55, 0.85), (2, 0.0, 1.0)]
    def __init__(self, title="Hệ thống", big="AI TỰ EDIT VIDEO", chip="AI", foot="tự cắt · tự ghép · tự thêm hiệu ứng",
                 tracks=("VIDEO", "CHỮ", "NHẠC")):
        self.title, self.big, self.chip, self.foot, self.tracks = title, big, chip, foot, list(tracks)
    def sfx(self, d):
        return [(0.0, "whoosh", 0.06), (0.25, "boom", 0.10)] + [(0.7 + i * 0.28, "pop", 0.05) for i in range(len(self.CL))]
    def draw(self, cv, t, d):
        text(cv, self.title, SERIF(116), s(540), s(270), WHITE, a=e_io(t / 0.4))
        put3(cv, t3d(self.big, BLK(100), YEL, 18), s(540), s(420), 0.6 + 0.4 * e_back((t - 0.15) / 0.35), clamp((t - 0.15) * 5))
        pw, ph = s(900), s(560)
        face = Image.new("RGBA", (pw, ph), (0, 0, 0, 0)); fd = ImageDraw.Draw(face)
        rr(fd, (0, 0, pw - 1, ph - 1), s(30), fill=PANEL + (255,), outline=(70, 70, 70, 255), width=s(3))
        x0, x1, y0 = s(40), pw - s(40), s(40)
        labels = self.tracks
        for k in range(3):
            yy = y0 + k * s(170)
            fd.text((x0, yy + s(36)), labels[k], font=SEMI(28), fill=(150, 150, 150, 255))
            rr(fd, (x0 + s(130), yy, x1, yy + s(120)), s(14), fill=(42, 42, 42, 255))
        tx0, tw = x0 + s(130), x1 - x0 - s(130)
        for i, (k, a, b) in enumerate(self.CL):
            p = e_back((t - 0.7 - i * 0.28) / 0.3, 1.2)
            if p <= 0: continue
            yy = y0 + k * s(170); off = (1 - p) * s(500)
            bx0, bx1 = tx0 + tw * a + off, min(x1, tx0 + tw * b + off)
            if bx1 - bx0 < s(10): continue
            col = YEL if k == 0 else (WHITE if k == 1 else (90, 90, 90))
            clip = F3.block(int(bx1 - bx0), s(84), s(12), col, s(10), GOLD if k == 0 else (SILV if k == 1 else (40, 40, 40)))
            cd = ImageDraw.Draw(clip)
            if k == 1: cd.text((clip.width / 2 - s(30), s(30)), "Aa", font=BOLD(40), fill=BLACK + (255,))
            if k == 2:
                for j in range(int((bx1 - bx0) / s(14)) - 1):
                    hg = s(30) * (0.25 + 0.75 * abs(math.sin(j * 0.9) * math.cos(j * 0.37)))
                    xx = clip.width * 0 + s(16) + j * s(14)
                    cd.line([(xx, s(50) - hg), (xx, s(50) + hg)], fill=WHITE + (255,), width=s(5))
            face.alpha_composite(clip, (int(bx0 - s(10)), int(yy + s(8) - s(10))))
        ph_ = tx0 + tw * clamp((t - 0.6) / max(0.5, d - 0.8))
        fd.line([(ph_, s(10)), (ph_, ph - s(10))], fill=WHITE + (255,), width=s(4))
        panel = F3.extrude(face, s(26), PANEL_SIDE, dx=0.0, dy=1.0, gl=False)
        ay = lerp(48, 14, e_out(t / 0.7)) + 2.5 * math.sin(t * 1.6)
        put3(cv, panel, s(540), s(930), a=clamp(t / 0.2), ay=ay, ax=16)
        cp = e_back((t - 0.3) / 0.4)
        if cp > 0:
            cv.alpha_composite(F3.soft_shadow(s(240) * cp, s(50) * cp, 120, s(16)), (int(s(540) - s(120) * cp - s(32)), int(s(1640) - s(32))))
            lab, _ = timg(self.chip, BLK(110 if len(self.chip) <= 2 else 70), BLACK, shadow=False)
            c = F3.coin(s(125) * cp, t * 2.4, YEL, GOLD, lab)
            put(cv, c, s(540), s(1500) + s(14) * math.sin(t * 3))
            text(cv, self.foot, SERIF(52), s(540), s(1760), WHITE, a=e_io((t - 0.9) / 0.4))

class BProgress:                                      # phan tram khoi 3D + thanh ong 3D (nguoi trong the bo goc)
    layout = "card"
    def __init__(self, top="Video này do", big="AI EDIT", pct=100):
        self.top, self.big, self.pct = top, big, pct
    def sfx(self, d):
        return [(0.0, "whoosh", 0.05)] + [(0.2 + i * 0.09, "tick", 0.03) for i in range(12)] + [(1.3, "ding", 0.1)]
    def draw(self, cv, t, d):
        dr = ImageDraw.Draw(cv)
        text(cv, self.top, SERIF(84), s(540), s(230), WHITE, a=e_io(t / 0.3))
        put3(cv, t3d(self.big, BLK(116), YEL, 18), s(540), s(370), 0.7 + 0.3 * e_back((t - 0.1) / 0.3), clamp((t - 0.1) * 5))
        u = e_io((t - 0.2) / 1.1) * self.pct / 100.0
        bump = 0.12 * (1 - e_out((t - 1.3) / 0.3)) if t > 1.3 else 0
        put3(cv, t3d("%d%%" % round(100 * u), BLK(220), WHITE, 26), s(540), s(640), 1 + bump, ay=-12 + 6 * math.sin(t * 2), ax=-6)
        x0, x1, y, hh = s(150), s(930), s(860), s(64)
        rr(dr, (x0, y + s(10), x1, y + hh + s(10)), hh // 2, fill=(5, 5, 5, 255))           # than ong
        rr(dr, (x0, y, x1, y + hh), hh // 2, fill=(45, 45, 45, 255))
        if u > 0.03:
            xe = x0 + (x1 - x0) * u
            rr(dr, (x0, y + s(10), xe, y + hh + s(10)), hh // 2, fill=GOLD + (255,))
            rr(dr, (x0, y, xe, y + hh), hh // 2, fill=YEL + (255,))
            rr(dr, (x0 + s(16), y + s(10), max(x0 + s(20), xe - s(16)), y + s(22)), s(6), fill=(255, 236, 160, 255))   # vet sang
        if t > 1.3:
            k = e_back((t - 1.3) / 0.3)
            c = F3.coin(s(56) * k, 0.25 + 0.15 * math.sin(t * 3), WHITE, SILV, check_coin(s(56) * k))
            put(cv, c, x1, y + hh / 2)

class BWave:                                          # song am khoi 3D bi cat roi khep lai (cat ghep, bo thua)
    layout = "lower"
    def __init__(self, big="CẮT GHÉP LỜI NÓI", sub="khớp từng chữ"): self.big, self.sub = big, sub
    def sfx(self, d):
        return [(0.0, "whoosh", 0.05), (0.55, "snip", 0.08), (0.85, "snip", 0.08), (1.35, "pop", 0.06)]
    def draw(self, cv, t, d):
        dr = ImageDraw.Draw(cv)
        put3(cv, t3d(self.big, BLK(82), WHITE, 14), s(540), s(1230), 0.8 + 0.2 * e_back(t / 0.3), e_io(t / 0.25))
        text(cv, self.sub, SERIF(76), s(540), s(1350), YEL, a=e_io((t - 0.2) / 0.4))
        y, x0, x1 = s(1610), s(90), s(990)
        ca, cb = s(470), s(610)
        join = e_io((t - 1.05) / 0.35); gapw = (cb - ca) * join
        n = int((x1 - x0) / s(18)); dep = s(9)
        cv.alpha_composite(F3.soft_shadow(x1 - x0, s(40), 90, s(14)), (int(x0 - s(28)), int(y + s(70))))
        for j in range(n):
            xx = x0 + j * s(18); inside = ca <= xx < cb
            hg = s(80) * (0.15 + 0.85 * abs(math.sin(j * 0.7) * math.cos(j * 0.23 + 1)))
            reveal = clamp((t - 0.1) * 3 - j / n)
            if reveal <= 0: continue
            if inside:
                a = 1 - e_io((t - 0.9) / 0.2)
                if a <= 0: continue
                front, side_, top = (90, 90, 90), (50, 50, 50), (120, 120, 120); hg *= 0.3
            else:
                front, side_, top = WHITE, SILV, (230, 230, 230)
            xx2 = xx + (0 if inside else (gapw / 2 if xx < ca else -gapw / 2))
            h_ = hg * reveal; bw = s(11)
            dr.polygon([(xx2 + bw, y - h_), (xx2 + bw + dep, y - h_ - dep * 0.6), (xx2 + bw + dep, y + h_ - dep * 0.6), (xx2 + bw, y + h_)], fill=side_ + (255,))
            dr.polygon([(xx2, y - h_), (xx2 + dep, y - h_ - dep * 0.6), (xx2 + bw + dep, y - h_ - dep * 0.6), (xx2 + bw, y - h_)], fill=top + (255,))
            dr.rectangle([xx2, y - h_, xx2 + bw, y + h_], fill=front + (255,))
        for i, cxp in enumerate((ca - s(10), cb - s(10))):
            p = e_out((t - 0.5 - i * 0.3) / 0.2)
            if p > 0 and join < 1:
                xx = cxp + ((gapw / 2) if i == 0 else -(gapw / 2))
                sl = F3.block(s(16), int(s(280) * p) + 2, s(6), YEL, s(10), GOLD)
                put(cv, sl, xx, y)

class BFx:                                            # luoi 6 o khoi 3D lat vao (danh sach tinh nang/hieu ung)
    layout = "full"
    ITEMS = ["ZOOM", "CHỮ", "B-ROLL", "CHUYỂN CẢNH", "NHẠC", "ÂM THANH"]
    def __init__(self, title="Hiệu ứng", big="RẤT NHIỀU", items=None, icons=None):
        self.title, self.big = title, big
        self.ITEMS = list(items or BFx.ITEMS)[:6]
        self.icons = list(icons) if icons else list(range(6))   # 0 kinh lup,1 Aa,2 phim,3 chuyen canh,4 not nhac,5 loa
    def sfx(self, d):
        return [(0.0, "whoosh", 0.06)] + [(0.45 + i * 0.22, "pop", 0.05) for i in range(6)]
    icon = None
    def draw(self, cv, t, d):
        text(cv, self.title, SERIF(116), s(540), s(260), WHITE, a=e_io(t / 0.4))
        put3(cv, t3d(self.big, BLK(120), YEL, 20), s(540), s(410), 0.6 + 0.4 * e_back((t - 0.15) / 0.3), clamp((t - 0.15) * 5))
        for i, lab in enumerate(self.ITEMS):
            p = e_out((t - 0.45 - i * 0.22) / 0.35)
            if p <= 0: continue
            col_, row = i % 2, i // 2
            cx, cy = s(310 + col_ * 460), s(760 + row * 390)
            hl = (int(t * 1.6) % 6) == i and t > 1.9
            tile = F3.block(s(380), s(310), s(28), YEL if hl else PANEL, s(22), GOLD if hl else PANEL_SIDE,
                            outline=None if hl else YEL, ow=s(4))
            td = ImageDraw.Draw(tile); col = BLACK + (255,) if hl else WHITE + (255,)
            BFx_icon(td, self.icons[i], tile.width / 2 - s(11), s(120), s(64), col)
            l, tt, r, b = td.textbbox((0, 0), lab, font=BOLD(38))
            td.text((tile.width / 2 - s(11) - (r - l) / 2 - l, s(225)), lab, font=BOLD(38), fill=col)
            put3(cv, tile, cx, cy, a=clamp(p * 2), ax=lerp(-75, 0, p) + (6 * math.sin(t * 2 + i) if p >= 1 else 0),
                 ay=(8 if col_ == 0 else -8))

def BFx_icon(dr, i, cx, cy, r, col):
    w_ = max(2, s(7))
    if i == 0:
        dr.ellipse([cx - r * 0.6, cy - r * 0.6, cx + r * 0.3, cy + r * 0.3], outline=col, width=w_)
        dr.line([(cx + r * 0.2, cy + r * 0.2), (cx + r * 0.65, cy + r * 0.65)], fill=col, width=w_ + s(3))
    elif i == 1:
        f = BLK(int(r * 1.2 / K)); l, tt, rr_, b = dr.textbbox((0, 0), "Aa", font=f)
        dr.text((cx - (rr_ - l) / 2 - l, cy - (b - tt) / 2 - tt), "Aa", font=f, fill=col)
    elif i == 2:
        dr.rectangle([cx - r * 0.7, cy - r * 0.5, cx + r * 0.7, cy + r * 0.5], outline=col, width=w_)
        for k in range(4):
            xx = cx - r * 0.55 + k * r * 0.37
            dr.rectangle([xx, cy - r * 0.42, xx + r * 0.14, cy - r * 0.3], fill=col); dr.rectangle([xx, cy + r * 0.3, xx + r * 0.14, cy + r * 0.42], fill=col)
    elif i == 3:
        dr.rectangle([cx - r * 0.7, cy - r * 0.45, cx + r * 0.1, cy + r * 0.25], outline=col, width=w_)
        dr.rectangle([cx - r * 0.2, cy - r * 0.15, cx + r * 0.7, cy + r * 0.55], fill=col)
    elif i == 4:
        dr.ellipse([cx - r * 0.55, cy + r * 0.15, cx - r * 0.1, cy + r * 0.55], fill=col)
        dr.ellipse([cx + r * 0.15, cy + r * 0.0, cx + r * 0.6, cy + r * 0.4], fill=col)
        dr.line([(cx - r * 0.12, cy + r * 0.35), (cx - r * 0.12, cy - r * 0.55), (cx + r * 0.58, cy - r * 0.7), (cx + r * 0.58, cy + r * 0.2)], fill=col, width=w_)
    else:
        dr.polygon([(cx - r * 0.65, cy - r * 0.2), (cx - r * 0.35, cy - r * 0.2), (cx, cy - r * 0.55), (cx, cy + r * 0.55), (cx - r * 0.35, cy + r * 0.2), (cx - r * 0.65, cy + r * 0.2)], fill=col)
        for k in (1, 2):
            dr.arc([cx - r * 0.25 * k + r * 0.05, cy - r * 0.3 * k, cx + r * 0.3 * k + r * 0.1, cy + r * 0.3 * k], -50, 50, fill=col, width=w_)

class BSplit:                                         # so sanh 2 cot: 2 bang 3D nghieng vao giua, cot phai hien khi noi toi (me_ci)
    layout = "full"
    def __init__(self, title="Ai lo phần nào?", left="AI LO", left_items=("Hiệu ứng", "B-roll", "Chữ chạy", "Nhạc nền"),
                 right="MÌNH LO", right_items=("Kịch bản", "Cắt ghép"), me_ci=None, me_at=1.6):
        self.title, self.left, self.right = title, left, right
        self.AI, self.ME = list(left_items)[:4], list(right_items)[:4]
        self.me_ci = me_ci; self.me_at = me_at
    def sfx(self, d):
        ev = [(0.0, "whoosh", 0.06)] + [(0.35 + i * 0.22, "tick", 0.06) for i in range(4)]
        return ev + [(self.me_at, "boom", 0.09)] + [(self.me_at + 0.4 + i * 0.5, "tick", 0.07) for i in range(2)]
    def panel(self, side, t):
        pw, ph = s(450), s(820)
        face = Image.new("RGBA", (pw, ph), (0, 0, 0, 0)); fd = ImageDraw.Draw(face)
        rr(fd, (0, 0, pw - 1, ph - 1), s(28), fill=PANEL + (255,), outline=((YEL if side == 0 else WHITE) + (255,)), width=s(4))
        hdr = F3.block(pw - s(60), s(110), s(18), YEL if side == 0 else WHITE, s(12), GOLD if side == 0 else SILV)
        hd = ImageDraw.Draw(hdr); lab = self.left if side == 0 else self.right
        hz = 70
        while True:
            l, tt, r, b = hd.textbbox((0, 0), lab, font=BLK(hz))
            if r - l <= pw - s(110) or hz <= 36: break
            hz -= 4
        hd.text(((pw - s(60)) / 2 - (r - l) / 2 - l + s(4), s(55) + s(16) - (b - tt) / 2 - tt), lab, font=BLK(hz), fill=BLACK + (255,))
        face.alpha_composite(hdr, (s(30) - s(16), s(30) - s(16)))
        t0 = 0.15 if side == 0 else self.me_at
        items = self.AI if side == 0 else self.ME
        for i, it in enumerate(items):
            ti = t0 + 0.2 + i * (0.22 if side == 0 else 0.5)
            q = e_out((t - ti) / 0.25)
            if q <= 0: continue
            yy = s(230) + i * s(140)
            c = F3.coin(s(30), 0.2, YEL if side == 0 else WHITE, GOLD if side == 0 else SILV, check_coin(s(30)))
            put(face, c, s(70), yy, sc=e_back((t - ti) / 0.3))
            fz = 52
            while True:                                       # chu dai -> co cho vua bang
                l, tt, r, b = fd.textbbox((0, 0), it, font=BOLD(fz))
                if r - l <= pw - s(150) or fz <= 30: break
                fz -= 3
            fd.text((s(120) - (1 - q) * s(40) - l, yy - (b - tt) / 2 - tt), it, font=BOLD(fz), fill=WHITE + (int(255 * q),))
        return F3.extrude(face, s(22), PANEL_SIDE, dx=0.0, dy=1.0, gl=False)
    def draw(self, cv, t, d):
        text(cv, self.title, SERIF(100), s(540), s(250), WHITE, a=e_io(t / 0.35))
        for side in (0, 1):
            t0 = 0.15 if side == 0 else self.me_at
            p = e_out((t - t0) / 0.45)
            if p <= 0: continue
            ay = (1 if side == 0 else -1) * lerp(75, 16, p) + 1.5 * math.sin(t * 1.8 + side)
            put3(cv, self.panel(side, t), s(285 if side == 0 else 795), s(900), a=clamp(p * 2.5), ay=ay, ax=6)

class BDonut:                                         # ti le %: vong tron 3D nam nghieng co do day + so khoi 3D
    layout = "full"
    def __init__(self, title="Công thức edit nhanh nhất", pct=90, center="AI EDIT", rest="mình cắt ghép"):
        self.title, self.pct, self.center, self.rest = title, pct, center, rest
    def sfx(self, d):
        return [(-0.9, "riser", 0.05), (0.0, "boom", 0.11), (1.25, "ding", 0.09)]
    def draw(self, cv, t, d):
        text(cv, self.title, SERIF(80), s(540), s(240), WHITE, a=e_io(t / 0.35))
        R, w_ = s(330), s(110)
        ring = Image.new("RGBA", (2 * R + 8, 2 * R + 8), (0, 0, 0, 0)); rd_ = ImageDraw.Draw(ring)
        bb = [4, 4, 4 + 2 * R, 4 + 2 * R]
        rd_.ellipse(bb, outline=(48, 48, 48, 255), width=w_)
        u = e_io((t - 0.1) / 1.1)
        P = self.pct / 100.0
        if u > 0: rd_.arc(bb, -90, -90 + 360 * P * u, fill=YEL + (255,), width=w_)
        v = e_io((t - 1.15) / 0.35)
        if v > 0 and P < 1: rd_.arc(bb, -90 + 360 * P, -90 + 360 * P + 360 * (1 - P) * v, fill=WHITE + (255,), width=w_)
        flat = F3.tilt(ring, ay=0, ax=lerp(20, 58, e_out(t / 0.8)) + 3 * math.sin(t * 1.5))
        thick = F3.extrude(flat, s(34), None, dx=0.0, dy=1.0)
        cv.alpha_composite(F3.soft_shadow(thick.width * 0.9, s(90), 120, s(24)), (int(s(540) - thick.width * 0.45 - s(48)), int(s(1040) + thick.height * 0.32)))
        put(cv, thick, s(540), s(1000))
        put3(cv, t3d("%d%%" % round(self.pct * u), BLK(210), YEL, 26), s(540), s(560) + s(18) * math.sin(t * 2.4), ay=8 * math.sin(t * 1.7), ax=-6)
        text(cv, self.center, BOLD(50), s(540), s(980), WHITE, track=s(6))
        q = e_back((t - 1.3) / 0.35)
        if q > 0 and self.rest:
            card = F3.block(s(760), s(190), s(24), PANEL, s(20), PANEL_SIDE, outline=WHITE, ow=s(4))
            cd = ImageDraw.Draw(card)
            n3 = t3d("%d%%" % (100 - self.pct), BLK(104), WHITE, 14); card.alpha_composite(n3, (s(20), int(s(88) - n3.height / 2 + s(14))))
            cd.text((s(320), s(55)), self.rest, font=SERIF(70), fill=WHITE + (255,))
            put3(cv, card, s(540), s(1560), sc=q, ax=lerp(-60, 0, clamp(q)))

class BGift:                                          # hop qua 3D dang canh, nap nay len (qua tang, phan sau, CTA)
    layout = "lower"
    def __init__(self, big="QUÀ #2", sub="ở video tiếp theo"): self.big, self.sub = big, sub
    def sfx(self, d):
        return [(0.0, "whoosh", 0.05), (0.3, "pop", 0.06), (0.9, "ding", 0.08)]
    def draw(self, cv, t, d):
        dr = ImageDraw.Draw(cv)
        p = e_back(t / 0.35)
        if p > 0:
            sz = s(150) * p
            box, (bx, by, w, szz, hh) = F3.iso_box(sz, YEL, F3.shade(YEL, 0.85), GOLD, 0.95)
            bd = ImageDraw.Draw(box)
            bd.line([(bx - w / 2, by + sz / 4), (bx - w / 2, by + sz / 4 + hh)], fill=WHITE + (255,), width=s(14))     # ruy bang
            bd.line([(bx + w / 2, by + sz / 4), (bx + w / 2, by + sz / 4 + hh)], fill=(225, 225, 225, 255), width=s(14))
            cx, cy = s(250), s(1500)
            cv.alpha_composite(F3.soft_shadow(box.width * 0.9, s(50), 120, s(14)), (int(cx - box.width * 0.45 - s(28)), int(cy + box.height * 0.42)))
            put(cv, box, cx, cy)
            hop = abs(math.sin(t * 7)) * s(36) * (1 if 0.4 < t < 1.2 else 0)
            lid, (lx, ly, lw, lsz, lhh) = F3.iso_box(sz * 1.12, (255, 225, 120), F3.shade(YEL, 0.9), F3.shade(YEL, 0.7), 0.22)
            ld = ImageDraw.Draw(lid)
            ld.line([(lx - lw / 2, ly - lsz / 4), (lx + lw / 2, ly + lsz / 4)], fill=WHITE + (255,), width=s(14))
            ld.line([(lx + lw / 2, ly - lsz / 4), (lx - lw / 2, ly + lsz / 4)], fill=WHITE + (255,), width=s(14))
            for sg in (-1, 1):
                ld.ellipse([lx + sg * lw * 0.28 - s(40) * p, ly - s(70) * p, lx + sg * lw * 0.28 + s(40) * p, ly - s(10) * p], outline=WHITE + (255,), width=s(12))
            put(cv, lid, cx, cy - box.height / 2 + lid.height * 0.25 - hop)
        big = t3d(self.big, BLK(130), YEL, 20); fitk = min(1.0, s(700) / big.width)          # chu dai -> co cho vua ben phai hop qua
        put3(cv, big, s(700), s(1420), (0.7 + 0.3 * e_back((t - 0.15) / 0.3)) * fitk, clamp((t - 0.15) * 5),
             ay=-10 + 4 * math.sin(t * 2))
        text(cv, self.sub, fit_font(SERIF, 70, self.sub, s(700)), s(700), s(1560), WHITE, a=e_io((t - 0.35) / 0.35))
        u = e_out((t - 0.6) / 0.4)
        if u > 0:
            ax_ = s(480) + s(420) * u
            dr.line([(s(480), s(1650)), (ax_, s(1650))], fill=WHITE + (255,), width=s(5))
            dr.polygon([(ax_, s(1630)), (ax_ + s(30), s(1650)), (ax_, s(1670))], fill=WHITE + (255,))

# B-roll gan theo cum chu (cum dau, cum cuoi). Doan mo ta/con so lon dat o PHAN DAU video, sau do de hieu ung chu.
# ------------------------------------------------------------------ B-roll 3D cho noi dung AI AGENT / tu dong hoa (them 15/10/2026)
_rb = {}
def robot(r, face=WHITE, eyes=1.0, label=None):
    """Dau robot khoi 3D: than bo goc, kinh den, 2 mat vang phat sang, ang-ten. eyes = do mo mat (0..1, nhay mat)."""
    r = max(float(r), 12.0)                           # luc moi bat ra r rat nho -> hinh am, PIL bao loi
    key = (int(r), face, round(eyes, 1), label)
    if key in _rb: return _rb[key]
    w, h = int(2.0 * r), int(1.6 * r)
    im = Image.new("RGBA", (w + int(0.5 * r), h + int(0.9 * r)), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    ox, oy = int(0.25 * r), int(0.6 * r)
    d.line([(ox + w / 2, oy), (ox + w / 2, oy - 0.42 * r)], fill=F3.shade(face, 0.7) + (255,), width=max(2, int(r * 0.09)))
    d.ellipse([ox + w / 2 - 0.16 * r, oy - 0.6 * r, ox + w / 2 + 0.16 * r, oy - 0.28 * r], fill=YEL + (255,))
    d.rounded_rectangle([ox - 0.18 * r, oy + 0.45 * r, ox + 0.05 * r, oy + 1.05 * r], radius=int(0.08 * r), fill=F3.shade(face, 0.75) + (255,))
    d.rounded_rectangle([ox + w - 0.05 * r, oy + 0.45 * r, ox + w + 0.18 * r, oy + 1.05 * r], radius=int(0.08 * r), fill=F3.shade(face, 0.75) + (255,))
    d.rounded_rectangle([ox, oy, ox + w, oy + h], radius=int(0.42 * r), fill=face + (255,))
    d.rounded_rectangle([ox + 0.22 * r, oy + 0.3 * r, ox + w - 0.22 * r, oy + h - 0.32 * r], radius=int(0.3 * r), fill=(14, 14, 14, 255))
    eh = max(2, 0.36 * r * eyes)
    for ex in (ox + w * 0.33, ox + w * 0.67):
        cy = oy + h * 0.47
        d.rounded_rectangle([ex - 0.17 * r, cy - eh / 2, ex + 0.17 * r, cy + eh / 2], radius=int(min(eh / 2, 0.17 * r)), fill=YEL + (255,))
    glow = im.getchannel("A").point(lambda v: 0)
    out = F3.extrude(im, max(3, int(r * 0.16)), F3.shade(face, 0.55), dx=0.3, dy=1.0)
    _rb[key] = out
    if len(_rb) > 60: _rb.clear()
    return out

def fit_font(fn, sz, txt, maxw):
    while sz > 18:
        f = fn(sz); l, t, r, b = ImageDraw.Draw(Image.new("RGBA", (4, 4))).textbbox((0, 0), txt, font=f)
        if r - l <= maxw: return f
        sz -= 2
    return fn(sz)

def wrap(txt, f, maxw):
    d0 = ImageDraw.Draw(Image.new("RGBA", (4, 4))); lines, cur = [], ""
    for wd in txt.split():
        t2 = (cur + " " + wd).strip()
        if d0.textlength(t2, font=f) <= maxw: cur = t2
        else: lines.append(cur); cur = wd
    if cur: lines.append(cur)
    return lines

class BAgentTeam:                                     # cong ty AI agent: robot sep + doi robot nhan vien, viec chay theo duong noi
    layout = "full"
    def __init__(self, title="Công ty AI agent", big="1 NGƯỜI + 4 AI", boss="BẠN", agents=("CONTENT", "BÁN HÀNG", "CSKH", "KẾ TOÁN")):
        self.title, self.big, self.boss, self.agents = title, big, boss, list(agents)[:4]
    def sfx(self, d):
        return [(0.0, "whoosh", 0.06), (0.35, "pop", 0.06)] + [(0.8 + i * 0.18, "pop", 0.05) for i in range(len(self.agents))] + \
               [(1.7 + i * 0.35, "tick", 0.05) for i in range(len(self.agents))] + [(1.7 + 0.35 * len(self.agents) + 0.1, "ding", 0.08)]
    def draw(self, cv, t, d):
        dr = ImageDraw.Draw(cv)
        text(cv, self.title, SERIF(104), s(540), s(250), WHITE, a=e_io(t / 0.4))
        put3(cv, t3d(self.big, BLK(104), YEL, 18), s(540), s(395), 0.6 + 0.4 * e_back((t - 0.15) / 0.35), clamp((t - 0.15) * 5))
        bx, by = s(540), s(760)
        n = len(self.agents); xs = [s(540 + (i - (n - 1) / 2) * 245) for i in range(n)]; ay_ = s(1300)
        for i, x in enumerate(xs):                                  # duong noi sep -> nhan vien
            u = e_io((t - 0.6 - i * 0.12) / 0.4)
            if u <= 0: continue
            mid = by + s(260)
            pts = [(bx, by + s(130)), (bx, mid), (x, mid), (x, ay_ - s(150))]
            dr.line(pts[:2] + [(lerp(bx, x, u), mid)] + ([(x, lerp(mid, ay_ - s(150), clamp(u * 2 - 1)))] if u > 0.5 else []), fill=(90, 90, 90, 255), width=s(6))
        for i, x in enumerate(xs):                                  # viec (cham vang) chay toi tung robot
            tt = t - 1.4 - i * 0.35
            if 0 < tt < 0.35:
                k = tt / 0.35; mid = by + s(260)
                if k < 0.5: px, py = lerp(bx, x, k * 2), mid
                else: px, py = x, lerp(mid, ay_ - s(150), (k - 0.5) * 2)
                dr.ellipse([px - s(16), py - s(16), px + s(16), py + s(16)], fill=YEL + (255,))
        p = e_back((t - 0.3) / 0.4)
        if p > 0:
            blink = 0.15 if (t % 2.6) < 0.12 else 1.0
            put(cv, F3.soft_shadow(s(260), s(40), 110, s(14)), bx, by + s(175))
            put(cv, robot(s(110) * p, YEL, blink), bx, by + s(6) * math.sin(t * 2.5))
            text(cv, self.boss, BLK(46), bx, by - s(225), WHITE, a=clamp((t - 0.5) * 4))
        for i, (x, lab) in enumerate(zip(xs, self.agents)):
            q = e_back((t - 0.8 - i * 0.18) / 0.35)
            if q <= 0: continue
            done = t > 1.75 + i * 0.35
            put(cv, F3.soft_shadow(s(170), s(30), 100, s(10)), x, ay_ + s(110))
            put(cv, robot(s(72) * q, WHITE, 1.0 if done or (t * 3 + i) % 2 > 0.2 else 0.2), x, ay_ + s(4) * math.sin(t * 3 + i))
            text(cv, lab, fit_font(BOLD, 34, lab, s(220)), x, ay_ + s(150), WHITE, a=clamp(q))
            if done:
                k = e_back((t - 1.75 - i * 0.35) / 0.3)
                put(cv, F3.coin(s(30) * k, 0.2, YEL, GOLD, check_coin(s(30) * k)), x + s(70), ay_ - s(90))

class BChatTask:                                      # giao viec qua chat: tin nhan cua minh -> AI dang go -> bao xong
    layout = "full"
    def __init__(self, title="Giao việc là xong", user="Viết giúp mình 5 bài đăng tuần này", items=("Bài 1", "Bài 2", "Bài 3", "Bài 4", "Bài 5"),
                 done="XONG", agent="AI AGENT"):
        self.title, self.user, self.items, self.done, self.agent = title, user, list(items)[:5], done, agent
    def sfx(self, d):
        ev = [(0.0, "whoosh", 0.06), (0.4, "notif", 0.07)] + [(0.95 + k * 0.075, "click", 0.03) for k in range(9)]
        ev += [(1.6 + i * 0.22, "pop", 0.045) for i in range(len(self.items))]
        return ev + [(1.75 + 0.22 * len(self.items), "ding", 0.1)]
    def draw(self, cv, t, d):
        text(cv, self.title, SERIF(104), s(540), s(220), WHITE, a=e_io(t / 0.4))
        pw, ph = s(720), s(1180)
        face = Image.new("RGBA", (pw, ph), (0, 0, 0, 0)); fd = ImageDraw.Draw(face)
        rr(fd, (0, 0, pw - 1, ph - 1), s(60), fill=(24, 24, 24, 255), outline=(80, 80, 80, 255), width=s(5))
        rr(fd, (s(18), s(18), pw - s(18), s(170)), s(44), fill=(36, 36, 36, 255))
        face.alpha_composite(robot(s(40), YEL, 1.0), (s(40), s(38)))
        fd.text((s(170), s(52)), self.agent, font=BLK(46), fill=WHITE + (255,))
        fd.text((s(172), s(112)), "● đang hoạt động", font=SEMI(28), fill=YEL + (255,))
        y = s(230)
        p = e_back((t - 0.4) / 0.3)                                 # tin nhan cua minh (phai, vang)
        if p > 0:
            f = BOLD(42); ls = wrap(self.user, f, s(440)); bh = s(40) + len(ls) * s(54)
            bw = max(fd.textlength(l_, font=f) for l_ in ls) + s(60)
            b = Image.new("RGBA", (int(bw), int(bh)), (0, 0, 0, 0)); bd = ImageDraw.Draw(b)
            bd.rounded_rectangle([0, 0, bw - 1, bh - 1], radius=s(34), fill=YEL + (255,))
            for k, l_ in enumerate(ls): bd.text((s(30), s(18) + k * s(54)), l_, font=f, fill=BLACK + (255,))
            put(face, b, pw - s(40) - bw / 2, y + bh / 2, sc=p); y += bh + s(40)
        if 0.95 < t < 1.6:                                          # dang go ...
            rr(fd, (s(40), y, s(220), y + s(90)), s(40), fill=(60, 60, 60, 255))
            for k in range(3):
                a = 0.4 + 0.6 * abs(math.sin((t * 6 - k * 0.6)))
                c = int(255 * a); fd.ellipse([s(80 + k * 45) - s(12), y + s(45) - s(12), s(80 + k * 45) + s(12), y + s(45) + s(12)], fill=(c, c, c, 255))
        if t >= 1.6:                                                # tra loi: danh sach tick dan
            n = len(self.items); bh = s(50) + n * s(70)
            fi = BOLD(42)
            if max(fd.textlength(x_, font=fi) for x_ in self.items) > pw - s(220): fi = fit_font(BOLD, 42, max(self.items, key=len), pw - s(220))
            bw = min(pw - s(80), max(fd.textlength(x_, font=fi) for x_ in self.items) + s(130))
            rr(fd, (s(40), y, s(40) + bw, y + bh), s(34), fill=WHITE + (255,))
            for k, it in enumerate(self.items):
                q = e_out((t - 1.6 - k * 0.22) / 0.2)
                if q <= 0: continue
                yy = y + s(55) + k * s(70)
                fd.ellipse([s(80) - s(20), yy - s(20), s(80) + s(20), yy + s(20)], fill=YEL + (255,))
                fd.line([(s(70), yy), (s(78), yy + s(9)), (s(92), yy - s(9))], fill=BLACK + (255,), width=s(5))
                fd.text((s(118), yy - s(26)), it, font=fi, fill=BLACK + (int(255 * q),))
        panel = F3.extrude(face, s(26), (8, 8, 8), dx=0.0, dy=1.0, gl=False)
        put3(cv, panel, s(540), s(1060), a=clamp(t / 0.2), ay=lerp(-40, -12, e_out(t / 0.6)) + 2 * math.sin(t * 1.5), ax=8)
        tt = t - 1.75 - 0.22 * len(self.items)
        if tt > 0:                                                  # dau XONG dong xuong
            k = e_back(tt / 0.3, 2.5); sc = 2.2 - 1.2 * k
            put3(cv, t3d(self.done, BLK(150), YEL, 22), s(760), s(1500), sc=max(0.6, sc), a=clamp(tt * 6), ay=-10, ax=-8)

class BBugFix:                                        # loi tum lum: bang dieu khien 3D bi bao loi khap noi + bo dem loi + co le
    layout = "full"
    SPOTS = [(0.18, 0.25), (0.72, 0.18), (0.45, 0.55), (0.85, 0.62), (0.25, 0.78), (0.6, 0.85), (0.1, 0.5), (0.9, 0.35)]
    def __init__(self, title="Mấy tháng liền", big="LỖI TÙM LUM", sub="chỉ ngồi sửa", count=127):
        self.title, self.big, self.sub, self.count = title, big, sub, count
    def sfx(self, d):
        return [(0.0, "whoosh", 0.06)] + [(0.5 + i * 0.2, "pop", 0.05) for i in range(len(self.SPOTS))] + [(2.3, "boom", 0.08)]
    def warn(self, r):
        im = Image.new("RGBA", (int(2.2 * r), int(2 * r)), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
        d.polygon([(1.1 * r, 0.1 * r), (2.1 * r, 1.85 * r), (0.1 * r, 1.85 * r)], fill=YEL + (255,))
        d.rectangle([1.0 * r, 0.65 * r, 1.2 * r, 1.3 * r], fill=BLACK + (255,)); d.ellipse([0.98 * r, 1.42 * r, 1.22 * r, 1.66 * r], fill=BLACK + (255,))
        return F3.extrude(im, max(3, int(r * 0.2)), GOLD, dx=0.3, dy=1.0)
    def draw(self, cv, t, d):
        text(cv, self.title, SERIF(100), s(540), s(230), WHITE, a=e_io(t / 0.4))
        sh = s(8) * math.sin(t * 40) * (1 if 2.3 < t < 2.6 else 0)
        put3(cv, t3d(self.big, BLK(110), YEL, 20), s(540) + sh, s(380), 0.6 + 0.4 * e_back((t - 0.15) / 0.35), clamp((t - 0.15) * 5))
        pw, ph = s(860), s(760)
        face = Image.new("RGBA", (pw, ph), (0, 0, 0, 0)); fd = ImageDraw.Draw(face)
        rr(fd, (0, 0, pw - 1, ph - 1), s(34), fill=(26, 26, 26, 255), outline=(70, 70, 70, 255), width=s(4))
        for k in range(5):                                          # cac dong "he thong" xam
            yy = s(60) + k * s(130)
            rr(fd, (s(40), yy, s(40) + s(160), yy + s(80)), s(16), fill=(50, 50, 50, 255))
            rr(fd, (s(230), yy + s(20), pw - s(60) - (k * 37 % 5) * s(60), yy + s(60)), s(14), fill=(44, 44, 44, 255))
        for i, (fx, fy) in enumerate(self.SPOTS):
            q = e_back((t - 0.5 - i * 0.2) / 0.25, 2.2)
            if q <= 0: continue
            w_ = self.warn(s(46) * q); jx = s(4) * math.sin(t * 30 + i) if (t - 0.5 - i * 0.2) < 0.5 else 0
            face.alpha_composite(w_, (int(fx * pw - w_.width / 2 + jx), int(fy * ph - w_.height / 2)))
        panel = F3.extrude(face, s(24), (8, 8, 8), dx=0.0, dy=1.0, gl=False)
        put3(cv, panel, s(540) + sh, s(1000), a=clamp(t / 0.2), ay=lerp(35, 10, e_out(t / 0.6)), ax=14)
        n = int(self.count * e_io((t - 0.5) / 1.8))
        text(cv, "LỖI: %d" % n, BLK(70), s(330), s(1560), WHITE, anchor="mm")
        text(cv, self.sub, SERIF(66), s(700), s(1570), YEL, a=e_io((t - 1.0) / 0.4))
        # co le xoay
        ang = 25 * math.sin(t * 5)
        wr_ = Image.new("RGBA", (s(220), s(220)), (0, 0, 0, 0)); wd = ImageDraw.Draw(wr_)
        wd.rounded_rectangle([s(95), s(60), s(125), s(210)], radius=s(12), fill=WHITE + (255,))
        wd.ellipse([s(60), s(10), s(160), s(110)], fill=WHITE + (255,)); wd.rectangle([s(95), s(5), s(125), s(55)], fill=(0, 0, 0, 0))
        wr_ = F3.extrude(wr_.rotate(ang, resample=Image.BICUBIC), s(10), SILV, dx=0.3, dy=1.0)
        put(cv, wr_, s(900), s(1520), a=clamp((t - 0.8) * 3))

class BStairs:                                        # cac buoc tien bo: bac thang khoi 3D leo dan, bac cuoi vang + sao
    layout = "full"
    def __init__(self, title="Sau 1 tháng", big="HORMOZI OS", steps=("LỖI", "SỬA", "TỐI ƯU", "GIÁO ÁN"), foot=""):
        self.title, self.big, self.steps, self.foot = title, big, list(steps)[:5], foot
    def sfx(self, d):
        n = len(self.steps)
        return [(0.0, "whoosh", 0.06)] + [(0.5 + i * 0.35, "pop", 0.055) for i in range(n)] + [(0.5 + n * 0.35 + 0.1, "ding", 0.09)]
    def draw(self, cv, t, d):
        dr = ImageDraw.Draw(cv)
        text(cv, self.title, SERIF(104), s(540), s(250), WHITE, a=e_io(t / 0.4))
        put3(cv, t3d(self.big, BLK(110), YEL, 18), s(540), s(400), 0.6 + 0.4 * e_back((t - 0.15) / 0.35), clamp((t - 0.15) * 5))
        n = len(self.steps); base = s(1580)
        cv.alpha_composite(F3.soft_shadow(s(900), s(70), 110, s(20)), (s(70), base + s(80)))
        for i, lab in enumerate(self.steps):
            q = e_back((t - 0.5 - i * 0.35) / 0.35)
            if q <= 0: continue
            last = i == n - 1
            hgt = int(s(130 + i * 150) * q)
            x = s(160 + i * (760 / max(1, n - 1)))
            col = YEL if last else (WHITE if i % 2 == 0 else (200, 200, 200))
            blk = F3.block(s(190), max(4, hgt), s(16), col, s(30), GOLD if last else SILV)
            cv.alpha_composite(blk, (int(x - blk.width / 2 + s(15)), int(base - hgt)))
            text(cv, lab, fit_font(BLK, 50, lab, s(230)), x, base - hgt - s(55), YEL if last else WHITE, a=clamp(q))
        u = clamp((t - 0.5) / (0.35 * n + 0.1))
        if u > 0:                                                    # mui ten leo
            pts = [(s(160 + i * (760 / max(1, n - 1))), base - s(130 + i * 150) - s(120)) for i in range(n)]
            k = u * (n - 1); i0 = min(n - 2, int(k)); f = k - i0
            px = lerp(pts[i0][0], pts[i0 + 1][0], f); py = lerp(pts[i0][1], pts[i0 + 1][1], f)
            dr.line(pts[:i0 + 1] + [(px, py)], fill=YEL + (255,), width=s(8))
        if t > 0.5 + n * 0.35:
            r = s(34) * e_back((t - 0.5 - n * 0.35) / 0.3)
            star(dr, s(920), base - s(130 + (n - 1) * 150) - s(200), r)
        if self.foot: text(cv, self.foot, SERIF(60), s(540), s(1790), WHITE, a=e_io((t - 1.0) / 0.4))

class BAutomate:                                      # tu dong hoa: viec chay qua banh rang AI -> ra "xong"
    layout = "full"
    def __init__(self, title="Tự động hoá", big="1 CÔNG VIỆC", inp="VIỆC LẶP LẠI", out="XONG", foot=""):
        self.title, self.big, self.inp, self.out, self.foot = title, big, inp, out, foot
    def sfx(self, d):
        return [(0.0, "whoosh", 0.06), (0.4, "boom", 0.06)] + [(0.9 + i * 0.5, "tick", 0.05) for i in range(4)] + [(2.9, "ding", 0.09)]
    def gear(self, r, ang, col, side):
        im = Image.new("RGBA", (int(2.4 * r), int(2.4 * r)), (0, 0, 0, 0)); d = ImageDraw.Draw(im); c = 1.2 * r
        pts = []
        for k in range(48):
            a = math.radians(ang) + k * 2 * math.pi / 48
            rr_ = r * (1.0 if (k // 3) % 2 == 0 else 0.82)
            pts.append((c + rr_ * math.cos(a), c + rr_ * math.sin(a)))
        d.polygon(pts, fill=col + (255,)); d.ellipse([c - 0.35 * r, c - 0.35 * r, c + 0.35 * r, c + 0.35 * r], fill=(20, 20, 20, 255))
        return F3.extrude(im, max(3, int(r * 0.18)), side, dx=0.3, dy=1.0)
    def draw(self, cv, t, d):
        dr = ImageDraw.Draw(cv)
        text(cv, self.title, SERIF(104), s(540), s(250), WHITE, a=e_io(t / 0.4))
        put3(cv, t3d(self.big, BLK(110), YEL, 18), s(540), s(400), 0.6 + 0.4 * e_back((t - 0.15) / 0.35), clamp((t - 0.15) * 5))
        p = e_back((t - 0.3) / 0.4)
        if p > 0:
            put(cv, F3.soft_shadow(s(560), s(60), 110, s(18)), s(540), s(1220))
            put(cv, self.gear(s(190) * p, t * 60, YEL, GOLD), s(470), s(930))
            put(cv, self.gear(s(120) * p, -t * 95 + 7, WHITE, SILV), s(700), s(1100))
            put(cv, robot(s(60) * p, BLACK if False else (40, 40, 40)), s(470), s(930))
        y = s(1420)                                                  # bang chuyen
        rr(dr, (s(60), y, s(1020), y + s(40)), s(20), fill=(45, 45, 45, 255))
        for i in range(4):
            tt = t - 0.8 - i * 0.5
            if tt <= 0: continue
            x = lerp(s(100), s(900), clamp(tt / 1.6))
            ok = x > s(560)
            if tt > 1.9: continue                                  # da ra khoi bang chuyen
            flat = Image.new("RGBA", (s(170), s(110)), (0, 0, 0, 0)); cd = ImageDraw.Draw(flat)
            cd.rounded_rectangle([0, 0, s(170) - 1, s(110) - 1], radius=s(18), fill=(YEL if ok else WHITE) + (255,))
            lab = self.out if ok else "VIỆC"
            f = fit_font(BLK, 40, lab, s(150)); l, tt_, r, b = cd.textbbox((0, 0), lab, font=f)
            cd.text((s(85) - (r - l) / 2 - l, s(55) - (b - tt_) / 2 - tt_), lab, font=f, fill=BLACK + (255,))
            card = F3.extrude(flat, s(14), GOLD if ok else SILV, dx=0.0, dy=1.0)
            put(cv, card, x, y - s(60), a=clamp((1.9 - tt) / 0.3))
        text(cv, self.inp, BOLD(40), s(190), y + s(110), WHITE, a=clamp((t - 0.8) * 3))
        text(cv, "AI AGENT", BOLD(40), s(560), y + s(110), YEL, a=clamp((t - 0.8) * 3))
        text(cv, self.out, BOLD(40), s(900), y + s(110), WHITE, a=clamp((t - 0.8) * 3))
        if self.foot: text(cv, self.foot, SERIF(62), s(540), s(1700), WHITE, a=e_io((t - 1.2) / 0.4))

# ------------------------------------------------------------------ B-roll 3D thong dung cho noi dung kinh doanh (them 16/10/2026)
def person(r, col=WHITE):
    """Hinh nguoi khoi 3D (dau tron + vai bo goc)."""
    r = max(float(r), 8.0)
    im = Image.new("RGBA", (int(2.4 * r), int(2.6 * r)), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    cx = 1.2 * r
    d.ellipse([cx - 0.55 * r, 0.1 * r, cx + 0.55 * r, 1.2 * r], fill=col + (255,))
    d.rounded_rectangle([cx - 1.05 * r, 1.3 * r, cx + 1.05 * r, 2.5 * r], radius=int(0.6 * r), fill=col + (255,))
    return F3.extrude(im, max(3, int(r * 0.18)), F3.shade(col, 0.6), dx=0.3, dy=1.0)

def phone_face(pw, ph):
    face = Image.new("RGBA", (pw, ph), (0, 0, 0, 0)); fd = ImageDraw.Draw(face)
    rr(fd, (0, 0, pw - 1, ph - 1), s(70), fill=(22, 22, 22, 255), outline=(90, 90, 90, 255), width=s(6))
    rr(fd, (pw / 2 - s(80), s(26), pw / 2 + s(80), s(56)), s(15), fill=(8, 8, 8, 255))
    return face, fd

def notif_card(w, h, title, line, big=None):
    im = Image.new("RGBA", (int(w), int(h)), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, w - 1, h - 1], radius=s(30), fill=WHITE + (255,))
    d.rounded_rectangle([s(22), s(22), s(22) + h - s(44), h - s(22)], radius=s(18), fill=YEL + (255,))
    d.text((h + s(6), s(24)), title, font=fit_font(BLK, 34, title, w - h - s(30)), fill=BLACK + (255,))
    d.text((h + s(6), s(70)), line, font=fit_font(SEMI, 32, line, w - h - s(30)), fill=(70, 70, 70, 255))
    if big: d.text((s(40), h / 2 - s(26)), big, font=BLK(40), fill=BLACK + (255,))
    return F3.extrude(im, s(10), SILV, dx=0.0, dy=1.0)

class BRevenue:                                       # bieu do cot doanh thu tang dan + mui ten + tong
    layout = "full"
    def __init__(self, title="Doanh thu", big="TĂNG GẤP 5", values=(20, 35, 50, 75, 100), labels=("T1", "T2", "T3", "T4", "T5"), total=""):
        self.title, self.big, self.values, self.labels, self.total = title, big, list(values)[:6], list(labels)[:6], total
    def sfx(self, d):
        n = len(self.values)
        return [(0.0, "whoosh", 0.06)] + [(0.5 + i * 0.25, "pop", 0.05) for i in range(n)] + [(0.6 + n * 0.25, "ding", 0.09)]
    def draw(self, cv, t, d):
        dr = ImageDraw.Draw(cv)
        text(cv, self.title, SERIF(104), s(540), s(250), WHITE, a=e_io(t / 0.4))
        put3(cv, t3d(self.big, BLK(110), YEL, 18), s(540), s(400), 0.6 + 0.4 * e_back((t - 0.15) / 0.35), clamp((t - 0.15) * 5))
        n = len(self.values); vmax = max(self.values); base = s(1500); x0, x1 = s(130), s(950)
        step = (x1 - x0) / max(1, n - 1)
        cv.alpha_composite(F3.soft_shadow(s(900), s(60), 110, s(18)), (s(60), base + s(40)))
        dr.line([(s(80), base + s(6)), (s(1000), base + s(6))], fill=(70, 70, 70, 255), width=s(4))
        tops = []
        for i, v in enumerate(self.values):
            q = e_back((t - 0.5 - i * 0.25) / 0.35)
            x = x0 + i * step; h = int(s(820) * v / vmax * max(0.0, q))
            tops.append((x, base - s(820) * v / vmax))
            if q <= 0: continue
            last = i == n - 1
            blk = F3.block(s(120), max(6, h), s(14), YEL if last else WHITE, s(22), GOLD if last else SILV)
            cv.alpha_composite(blk, (int(x - blk.width / 2 + s(11)), int(base - max(6, h))))
            text(cv, self.labels[i] if i < len(self.labels) else "", BOLD(34), x, base + s(60), WHITE, shadow=False)
        u = clamp((t - 0.6) / (0.25 * n))
        if u > 0 and n > 1:
            k = u * (n - 1); i0 = min(n - 2, int(k)); f = k - i0
            pts = [(x, y - s(60)) for x, y in tops]
            px = lerp(pts[i0][0], pts[i0 + 1][0], f); py = lerp(pts[i0][1], pts[i0 + 1][1], f)
            dr.line(pts[:i0 + 1] + [(px, py)], fill=YEL + (255,), width=s(10))
            if u >= 1:
                ex, ey = pts[-1]; dr.polygon([(ex + s(10), ey - s(40)), (ex + s(40), ey + s(14)), (ex - s(22), ey + s(6))], fill=YEL + (255,))
        if self.total and t > 0.6 + 0.25 * n:
            put3(cv, t3d(self.total, BLK(90), YEL, 14), s(540), s(1700), e_back((t - 0.6 - 0.25 * n) / 0.3), ay=-8)

class BOrders:                                        # dien thoai nhan don lien tuc: the "Don moi" xep chong + bo dem
    layout = "full"
    def __init__(self, title="Đơn về liên tục", big="", count=37, item="Đơn mới", line="vừa đặt hàng"):
        self.title, self.big, self.count, self.item, self.line = title, big, count, item, line
    def sfx(self, d):
        return [(0.0, "whoosh", 0.06)] + [(0.5 + i * 0.32, "notif", 0.05) for i in range(6)] + [(2.6, "ding", 0.08)]
    def draw(self, cv, t, d):
        text(cv, self.title, SERIF(104), s(540), s(220), WHITE, a=e_io(t / 0.4))
        pw, ph = s(640), s(1180)
        face, fd = phone_face(pw, ph)
        k = int(clamp((t - 0.5) / 0.32 + 1, 0, 6))
        for j in range(k):                             # the moi nhat o tren, cu bi day xuong
            i = k - 1 - j
            p = e_back((t - 0.5 - i * 0.32) / 0.25) if j == 0 else 1.0
            card = notif_card(pw - s(80), s(150), "%s #%d" % (self.item, self.count - (5 - i) if self.count > 5 else i + 1), self.line)
            put(face, card, pw / 2, s(190) + j * s(170), sc=max(0.05, p))
        n = int(self.count * e_io((t - 0.5) / 2.0))
        rr(fd, (s(40), ph - s(170), pw - s(40), ph - s(50)), s(40), fill=YEL + (255,))
        lab = "%d ĐƠN HÔM NAY" % n if not self.big else self.big
        f = fit_font(BLK, 50, lab, pw - s(120)); l, tt, r, b = fd.textbbox((0, 0), lab, font=f)
        fd.text((pw / 2 - (r - l) / 2 - l, ph - s(110) - (b - tt) / 2 - tt), lab, font=f, fill=BLACK + (255,))
        panel = F3.extrude(face, s(26), (8, 8, 8), dx=0.0, dy=1.0, gl=False)
        put3(cv, panel, s(540), s(1050), a=clamp(t / 0.2), ay=lerp(-35, 12, e_out(t / 0.6)) + 2 * math.sin(t * 1.4), ax=8)

class BMoneyIn:                                       # bao "ting ting" tien ve: the ngan hang + dong xu roi
    layout = "full"
    def __init__(self, title="Ting ting!", amount=5000000, bank="TÀI KHOẢN", line="Tiền về tài khoản", suffix="đ"):
        self.title, self.amount, self.bank, self.line, self.suffix = title, amount, bank, line, suffix
    def sfx(self, d):
        return [(0.0, "whoosh", 0.06), (0.45, "notif", 0.09)] + [(0.8 + i * 0.12, "tick", 0.04) for i in range(10)] + [(2.1, "ding", 0.1)]
    def draw(self, cv, t, d):
        text(cv, self.title, SERIF(110), s(540), s(240), WHITE, a=e_io(t / 0.4))
        for i in range(9):                              # dong xu roi xoay
            tt = t - 0.6 - i * 0.13
            if tt <= 0: continue
            x = s(170 + (i * 113) % 760); y = s(420) + tt * s(900) + s(30) * math.sin(i)
            if y > s(1800): continue
            lab, _ = timg("đ", BLK(60), BLACK, shadow=False)
            put(cv, F3.coin(s(54), tt * 6 + i, YEL, GOLD, lab), x, y)
        p = e_back((t - 0.4) / 0.35)
        if p > 0:
            card = Image.new("RGBA", (s(900), s(420)), (0, 0, 0, 0)); cd = ImageDraw.Draw(card)
            cd.rounded_rectangle([0, 0, s(900) - 1, s(420) - 1], radius=s(40), fill=WHITE + (255,))
            cd.rounded_rectangle([s(40), s(40), s(140), s(140)], radius=s(26), fill=YEL + (255,))
            cd.text((s(170), s(48)), self.bank, font=BLK(46), fill=BLACK + (255,))
            cd.text((s(170), s(104)), self.line, font=SEMI(36), fill=(80, 80, 80, 255))
            n = self.amount * e_io((t - 0.75) / 1.3)
            txt = "+" + counter(n) + self.suffix
            f = fit_font(BLK, 120, txt, s(820)); l, tt_, r, b = cd.textbbox((0, 0), txt, font=f)
            cd.text((s(450) - (r - l) / 2 - l, s(280) - (b - tt_) / 2 - tt_), txt, font=f, fill=BLACK + (255,))
            put3(cv, F3.extrude(card, s(22), SILV, dx=0.0, dy=1.0), s(540), s(1000), sc=0.7 + 0.3 * p, ay=-10 + 4 * math.sin(t * 2), ax=6)

class BCalendar:                                      # lich 3D: cac ngay bi gach dan, ngay dich khoanh vang
    layout = "full"
    def __init__(self, title="Thử thách", big="21 NGÀY", days=21, label="NGÀY"):
        self.title, self.big, self.days, self.label = title, big, int(days), label
    def sfx(self, d):
        return [(0.0, "whoosh", 0.06)] + [(0.6 + i * 1.8 / max(1, self.days), "tick", 0.035) for i in range(self.days)] + [(2.5, "ding", 0.09)]
    def draw(self, cv, t, d):
        text(cv, self.title, SERIF(104), s(540), s(250), WHITE, a=e_io(t / 0.4))
        put3(cv, t3d(self.big, BLK(110), YEL, 18), s(540), s(400), 0.6 + 0.4 * e_back((t - 0.15) / 0.35), clamp((t - 0.15) * 5))
        pw, ph = s(860), s(900)
        face = Image.new("RGBA", (pw, ph), (0, 0, 0, 0)); fd = ImageDraw.Draw(face)
        rr(fd, (0, 0, pw - 1, ph - 1), s(40), fill=WHITE + (255,))
        rr(fd, (0, 0, pw - 1, s(150)), s(40), fill=YEL + (255,)); fd.rectangle([0, s(100), pw, s(150)], fill=YEL + (255,))
        for rx in (s(200), pw - s(200)): fd.ellipse([rx - s(22), s(-14), rx + s(22), s(30)], fill=BLACK + (255,))
        lab = "%d %s" % (self.days, self.label)
        l, tt, r, b = fd.textbbox((0, 0), lab, font=BLK(64)); fd.text((pw / 2 - (r - l) / 2 - l, s(75) - (b - tt) / 2 - tt), lab, font=BLK(64), fill=BLACK + (255,))
        cols = 7; rows = (self.days + cols - 1) // cols; cw = (pw - s(80)) / cols; chh = min(s(140), (ph - s(200)) / max(1, rows))
        done = int(self.days * clamp((t - 0.6) / 1.8))
        for i in range(self.days):
            cx = s(40) + (i % cols + 0.5) * cw; cy = s(190) + (i // cols + 0.5) * chh
            last = i == self.days - 1
            num = str(i + 1); l, tt, r, b = fd.textbbox((0, 0), num, font=BOLD(44))
            fd.text((cx - (r - l) / 2 - l, cy - (b - tt) / 2 - tt), num, font=BOLD(44), fill=(40, 40, 40, 255))
            if i < done and not last:
                fd.line([(cx - s(34), cy - s(30)), (cx + s(34), cy + s(30))], fill=YEL + (255,), width=s(9))
            if last and done >= self.days:
                fd.ellipse([cx - s(50), cy - s(50), cx + s(50), cy + s(50)], outline=YEL + (255,), width=s(10))
        panel = F3.extrude(face, s(28), SILV, dx=0.0, dy=1.0)
        put3(cv, panel, s(540), s(1080), a=clamp(t / 0.2), ay=lerp(30, 8, e_out(t / 0.6)) + 2 * math.sin(t * 1.5), ax=12)

class BClock:                                         # dong ho 3D kim quay nhanh roi cham lai: tiet kiem thoi gian
    layout = "full"
    def __init__(self, title="Tiết kiệm", big="5 GIỜ MỖI NGÀY", spins=3):
        self.title, self.big, self.spins = title, big, spins
    def sfx(self, d):
        return [(0.0, "whoosh", 0.06)] + [(0.5 + i * 0.14, "tick", 0.04) for i in range(14)] + [(2.6, "ding", 0.09)]
    def draw(self, cv, t, d):
        text(cv, self.title, SERIF(104), s(540), s(250), WHITE, a=e_io(t / 0.4))
        put3(cv, t3d(self.big, BLK(100), YEL, 18), s(540), s(400), 0.6 + 0.4 * e_back((t - 0.15) / 0.35), clamp((t - 0.15) * 5))
        R = s(320); im = Image.new("RGBA", (2 * R + 8, 2 * R + 8), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im); c = R + 4
        d_.ellipse([4, 4, 2 * R + 4, 2 * R + 4], fill=WHITE + (255,)); d_.ellipse([4 + s(24), 4 + s(24), 2 * R + 4 - s(24), 2 * R + 4 - s(24)], outline=YEL + (255,), width=s(16))
        for k in range(12):
            a = k * math.pi / 6; r1, r2 = R - s(60), R - s(95 if k % 3 == 0 else 75)
            d_.line([(c + r1 * math.sin(a), c - r1 * math.cos(a)), (c + r2 * math.sin(a), c - r2 * math.cos(a))], fill=BLACK + (255,), width=s(10 if k % 3 == 0 else 5))
        u = e_out((t - 0.4) / 2.2); turns = self.spins * u
        for ang, ln, w_, col in ((turns * 2 * math.pi, R * 0.62, s(16), BLACK), (turns * 24 * math.pi, R * 0.8, s(9), (90, 90, 90))):
            d_.line([(c, c), (c + ln * math.sin(ang), c - ln * math.cos(ang))], fill=col + (255,), width=w_)
        d_.ellipse([c - s(22), c - s(22), c + s(22), c + s(22)], fill=YEL + (255,))
        clk = F3.extrude(im, s(34), SILV, dx=0.25, dy=1.0)
        cv.alpha_composite(F3.soft_shadow(s(600), s(70), 120, s(20)), (s(210), s(1450)))
        put3(cv, clk, s(540), s(1060), sc=0.6 + 0.4 * e_back((t - 0.2) / 0.4), ay=-14 + 5 * math.sin(t * 1.6), ax=10)

class BFunnel:                                        # pheu ban hang 3D: cac tang + so luong, cham roi qua pheu
    layout = "full"
    def __init__(self, title="Phễu bán hàng", stages=("NGƯỜI XEM", "QUAN TÂM", "NHẮN TIN", "MUA"), numbers=("10.000", "1.000", "200", "50")):
        self.title, self.stages, self.numbers = title, list(stages)[:5], list(numbers)[:5]
    def sfx(self, d):
        n = len(self.stages)
        return [(0.0, "whoosh", 0.06)] + [(0.4 + i * 0.3, "pop", 0.055) for i in range(n)] + [(0.5 + n * 0.3, "ding", 0.09)]
    def draw(self, cv, t, d):
        dr = ImageDraw.Draw(cv)
        text(cv, self.title, SERIF(110), s(540), s(260), WHITE, a=e_io(t / 0.4))
        n = len(self.stages); top = s(480); hh = s(230)
        for i in range(n):
            q = e_back((t - 0.4 - i * 0.3) / 0.3)
            if q <= 0: continue
            w0 = s(900) - i * s(170); w1 = w0 - s(170); y = top + i * (hh + s(20))
            last = i == n - 1
            im = Image.new("RGBA", (int(w0), int(hh)), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im)
            d_.polygon([(0, 0), (w0, 0), (w0 - (w0 - w1) / 2, hh), ((w0 - w1) / 2, hh)], fill=(YEL if last else (WHITE if i % 2 == 0 else (215, 215, 215))) + (255,))
            lab = self.stages[i]; f = fit_font(BLK, 50, lab, w1 - s(60)); l, tt, r, b = d_.textbbox((0, 0), lab, font=f)
            d_.text((w0 / 2 - (r - l) / 2 - l, hh * 0.32 - (b - tt) / 2 - tt), lab, font=f, fill=BLACK + (255,))
            if i < len(self.numbers):
                num = self.numbers[i]; f2 = fit_font(BOLD, 46, num, w1 - s(60)); l, tt, r, b = d_.textbbox((0, 0), num, font=f2)
                d_.text((w0 / 2 - (r - l) / 2 - l, hh * 0.68 - (b - tt) / 2 - tt), num, font=f2, fill=(60, 60, 60, 255))
            blk = F3.extrude(im, s(20), GOLD if last else SILV, dx=0.0, dy=1.0)
            put(cv, blk, s(540), y + hh / 2, sc=q)
        for k in range(6):                              # cham roi qua pheu
            tt = (t * 0.9 + k / 6) % 1.0
            if t < 0.6: break
            y = top - s(60) + tt * (n * (hh + s(20)))
            x = s(540) + s(30) * math.sin(k * 2.1 + t * 3) * (1 - tt)
            dr.ellipse([x - s(14), y - s(14), x + s(14), y + s(14)], fill=YEL + (230,))

class BTarget:                                        # bia ban 3D nam nghieng, mui ten bay vao trung tam
    layout = "full"
    def __init__(self, title="Mục tiêu", big="TRÚNG ĐÍCH", foot=""):
        self.title, self.big, self.foot = title, big, foot
    def sfx(self, d):
        return [(0.0, "whoosh", 0.06), (0.9, "swish", 0.07), (1.3, "thud", 0.1), (1.45, "ding", 0.08)]
    def draw(self, cv, t, d):
        dr = ImageDraw.Draw(cv)
        text(cv, self.title, SERIF(104), s(540), s(250), WHITE, a=e_io(t / 0.4))
        put3(cv, t3d(self.big, BLK(110), YEL, 18), s(540), s(400), 0.6 + 0.4 * e_back((t - 0.15) / 0.35), clamp((t - 0.15) * 5))
        R = s(330); im = Image.new("RGBA", (2 * R + 8, 2 * R + 8), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im); c = R + 4
        for k, col in enumerate((WHITE, YEL, WHITE, YEL, WHITE, YEL)):
            r = R * (1 - k / 6); d_.ellipse([c - r, c - r, c + r, c + r], fill=col + (255,))
        shake = s(10) * math.sin(t * 50) * math.exp(-(t - 1.3) * 8) if t > 1.3 else 0
        tg = F3.extrude(F3.tilt(im, ay=20, ax=0), s(30), GOLD, dx=0.3, dy=0.6)
        cx, cy = s(540) + shake, s(1050)
        put(cv, F3.soft_shadow(s(560), s(60), 110, s(20)), s(540), s(1480))
        put(cv, tg, cx, cy, sc=0.6 + 0.4 * e_back((t - 0.2) / 0.4))
        u = e_in = clamp((t - 0.9) / 0.4)
        if u > 0:                                       # mui ten bay tu goc phai tren
            k = u * u
            hx, hy = lerp(s(1150), cx - s(10), k), lerp(s(500), cy - s(10), k)
            tx, ty = hx + s(300), hy - s(220)
            dr.line([(hx, hy), (tx, ty)], fill=WHITE + (255,), width=s(14))
            dr.polygon([(hx, hy), (hx + s(70), hy - s(10)), (hx + s(30), hy - s(60))], fill=BLACK + (255,))
            for f in (0, 1):
                dr.polygon([(tx, ty), (tx + s(50), ty - s(70) + f * s(40)), (tx + s(10), ty - s(30) + f * s(40))], fill=YEL + (255,))
        if self.foot: text(cv, self.foot, SERIF(64), s(540), s(1720), WHITE, a=e_io((t - 1.5) / 0.4))

class BRocket:                                        # ten lua phong len theo duong tang truong
    layout = "full"
    def __init__(self, title="Tăng trưởng", big="X10", foot=""):
        self.title, self.big, self.foot = title, big, foot
    def sfx(self, d):
        return [(0.0, "whoosh", 0.06), (0.5, "swish", 0.06), (0.7, "whoosh", 0.08), (1.9, "ding", 0.09)]
    def rocket(self, r, flame):
        im = Image.new("RGBA", (int(2.4 * r), int(4.6 * r)), (0, 0, 0, 0)); d = ImageDraw.Draw(im); cx = 1.2 * r
        d.polygon([(cx - 0.55 * r, 2.6 * r), (cx - 1.15 * r, 3.5 * r), (cx - 0.55 * r, 3.3 * r)], fill=YEL + (255,))
        d.polygon([(cx + 0.55 * r, 2.6 * r), (cx + 1.15 * r, 3.5 * r), (cx + 0.55 * r, 3.3 * r)], fill=YEL + (255,))
        d.polygon([(cx - 0.3 * r, 3.4 * r), (cx + 0.3 * r, 3.4 * r), (cx, (3.6 + 0.9 * flame) * r)], fill=(255, 225, 120, 255))
        d.rounded_rectangle([cx - 0.55 * r, 0.9 * r, cx + 0.55 * r, 3.4 * r], radius=int(0.3 * r), fill=WHITE + (255,))
        d.polygon([(cx - 0.55 * r, 1.1 * r), (cx, 0.05 * r), (cx + 0.55 * r, 1.1 * r)], fill=YEL + (255,))
        d.ellipse([cx - 0.28 * r, 1.5 * r, cx + 0.28 * r, 2.06 * r], fill=(20, 20, 20, 255), outline=YEL + (255,), width=max(2, int(r * 0.08)))
        return F3.extrude(im, max(3, int(r * 0.14)), SILV, dx=0.3, dy=0.6)
    def draw(self, cv, t, d):
        dr = ImageDraw.Draw(cv)
        text(cv, self.title, SERIF(104), s(540), s(250), WHITE, a=e_io(t / 0.4))
        put3(cv, t3d(self.big, BLK(150), YEL, 22), s(540), s(430), 0.5 + 0.5 * e_back((t - 1.6) / 0.35) if t > 1.6 else 0.01, clamp((t - 1.6) * 5))
        u = e_io((t - 0.5) / 1.4)
        pts = [(s(120) + k / 40 * s(780), s(1700) - (k / 40) ** 2.2 * s(1050)) for k in range(41)]
        m = int(40 * u)
        if m > 1: dr.line(pts[:m + 1], fill=YEL + (255,), width=s(12))
        for gx in range(5): dr.line([(s(120), s(1700) - gx * s(260)), (s(960), s(1700) - gx * s(260))], fill=(45, 45, 45, 255), width=s(2))
        x, y = pts[m]; x2, y2 = pts[min(40, m + 1)]
        ang = math.degrees(math.atan2(x2 - x, -(y2 - y))) if m < 40 else 20
        rk = self.rocket(s(80), 0.6 + 0.4 * abs(math.sin(t * 25))).rotate(-ang, expand=True, resample=Image.BICUBIC)
        put(cv, rk, x, y - s(60))
        if self.foot: text(cv, self.foot, SERIF(62), s(540), s(1800), WHITE, a=e_io((t - 1.8) / 0.4))

class BIdea:                                          # bong den 3D bat sang + cac the y tuong bat ra xung quanh
    layout = "full"
    def __init__(self, title="Ý tưởng", big="BẬT SÁNG", items=("Sản phẩm", "Nội dung", "Bán hàng", "Khách hàng")):
        self.title, self.big, self.items = title, big, list(items)[:4]
    def sfx(self, d):
        return [(0.0, "whoosh", 0.06), (0.7, "click", 0.08), (0.75, "sparkle", 0.05)] + [(1.1 + i * 0.25, "pop", 0.05) for i in range(len(self.items))]
    def draw(self, cv, t, d):
        dr = ImageDraw.Draw(cv)
        text(cv, self.title, SERIF(104), s(540), s(250), WHITE, a=e_io(t / 0.4))
        put3(cv, t3d(self.big, BLK(110), YEL, 18), s(540), s(400), 0.6 + 0.4 * e_back((t - 0.15) / 0.35), clamp((t - 0.15) * 5))
        on = t > 0.7; cx, cy = s(540), s(980)
        if on:
            for k in range(12):
                a = k * math.pi / 6 + t * 0.4; r1, r2 = s(290), s(290) + s(70) * (0.6 + 0.4 * math.sin(t * 6 + k))
                dr.line([(cx + r1 * math.cos(a), cy + r1 * math.sin(a)), (cx + r2 * math.cos(a), cy + r2 * math.sin(a))], fill=YEL + (255,), width=s(10))
        R = s(200); im = Image.new("RGBA", (2 * R + 8, int(3.1 * R)), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im); c = R + 4
        d_.ellipse([4, 4, 2 * R + 4, 2 * R + 4], fill=(YEL if on else (90, 90, 90)) + (255,))
        d_.polygon([(c - R * 0.55, R * 1.75), (c + R * 0.55, R * 1.75), (c + R * 0.4, R * 2.25), (c - R * 0.4, R * 2.25)], fill=(YEL if on else (90, 90, 90)) + (255,))
        for k in range(3): d_.rounded_rectangle([c - R * 0.42, R * (2.3 + k * 0.22), c + R * 0.42, R * (2.45 + k * 0.22)], radius=s(8), fill=WHITE + (255,))
        d_.line([(c - R * 0.25, R * 1.1), (c - R * 0.1, R * 0.8), (c, R * 1.1), (c + R * 0.1, R * 0.8), (c + R * 0.25, R * 1.1)], fill=(WHITE if on else (60, 60, 60)) + (255,), width=s(10))
        put(cv, F3.extrude(im, s(26), GOLD if on else (50, 50, 50), dx=0.25, dy=0.8), cx, cy + s(60), sc=0.7 + 0.3 * e_back((t - 0.2) / 0.4))
        pos = [(s(200), s(760)), (s(880), s(760)), (s(200), s(1420)), (s(880), s(1420))]
        for i, it in enumerate(self.items):
            q = e_back((t - 1.1 - i * 0.25) / 0.3)
            if q <= 0: continue
            card = F3.block(s(300), s(110), s(26), WHITE, s(14), SILV)
            put(cv, card, pos[i][0], pos[i][1], sc=q)
            text(cv, it, fit_font(BLK, 44, it, s(260)), pos[i][0], pos[i][1] - s(6), BLACK, sc=q, shadow=False)

class BStars:                                         # danh gia 5 sao khoi 3D + the nhan xet
    layout = "full"
    def __init__(self, title="Khách nói gì?", rating=5, review="Học xong ra đơn ngay tuần đầu!", who="Khách hàng thật", count=""):
        self.title, self.rating, self.review, self.who, self.count = title, rating, review, who, count
    def sfx(self, d):
        return [(0.0, "whoosh", 0.06)] + [(0.4 + i * 0.18, "pop", 0.055) for i in range(5)] + [(1.5, "sparkle", 0.05), (1.6, "ding", 0.08)]
    def star_img(self, r, on=True):
        im = Image.new("RGBA", (int(2.2 * r), int(2.2 * r)), (0, 0, 0, 0)); d = ImageDraw.Draw(im); c = 1.1 * r
        pts = [(c + (r if k % 2 == 0 else r * 0.45) * math.sin(k * math.pi / 5), c - (r if k % 2 == 0 else r * 0.45) * math.cos(k * math.pi / 5)) for k in range(10)]
        d.polygon(pts, fill=(YEL if on else (70, 70, 70)) + (255,))
        return F3.extrude(im, max(3, int(r * 0.2)), GOLD if on else (40, 40, 40), dx=0.3, dy=1.0)
    def draw(self, cv, t, d):
        text(cv, self.title, SERIF(110), s(540), s(260), WHITE, a=e_io(t / 0.4))
        for i in range(5):
            q = e_back((t - 0.4 - i * 0.18) / 0.3, 2.4)
            if q <= 0: continue
            put(cv, self.star_img(s(80), i < self.rating), s(540 + (i - 2) * 190), s(560) + s(10) * math.sin(t * 3 + i), sc=q)
        if self.count: text(cv, self.count, BOLD(46), s(540), s(720), WHITE, a=e_io((t - 1.2) / 0.3), track=s(4))
        p = e_out((t - 1.0) / 0.4)
        if p > 0:
            card = Image.new("RGBA", (s(860), s(560)), (0, 0, 0, 0)); cd = ImageDraw.Draw(card)
            cd.rounded_rectangle([0, 0, s(860) - 1, s(560) - 1], radius=s(40), fill=WHITE + (255,))
            cd.text((s(50), s(10)), "“", font=SERIF(200), fill=YEL + (255,))
            f = SERIF(64); ls = wrap(self.review, f, s(760))[:4]
            for k, l_ in enumerate(ls): cd.text((s(50), s(170) + k * s(80)), l_, font=f, fill=BLACK + (255,))
            cd.text((s(50), s(480)), "— " + self.who, font=BOLD(36), fill=(90, 90, 90, 255))
            put3(cv, F3.extrude(card, s(22), SILV, dx=0.0, dy=1.0), s(540), s(1180) + (1 - p) * s(120), a=p, ay=-8 + 3 * math.sin(t * 1.6), ax=6)

class BCustomers:                                     # luoi nguoi khoi 3D hien dan, mot phan hoa vang (khach mua) + bo dem
    layout = "full"
    def __init__(self, title="Từ người lạ", big="THÀNH KHÁCH HÀNG", total=24, buyers=8, label="KHÁCH"):
        self.title, self.big, self.total, self.buyers, self.label = title, big, int(total), int(buyers), label
    def sfx(self, d):
        return [(0.0, "whoosh", 0.06)] + [(0.5 + i * 0.06, "tick", 0.03) for i in range(self.total)] + [(1.8 + i * 0.12, "pop", 0.05) for i in range(min(8, self.buyers))] + [(2.9, "ding", 0.08)]
    def draw(self, cv, t, d):
        text(cv, self.title, SERIF(104), s(540), s(250), WHITE, a=e_io(t / 0.4))
        put3(cv, t3d(self.big, BLK(100), YEL, 18), s(540), s(400), 0.6 + 0.4 * e_back((t - 0.15) / 0.35), clamp((t - 0.15) * 5))
        cols = 6; rows = (self.total + cols - 1) // cols
        for i in range(self.total):
            q = e_back((t - 0.5 - i * 0.06) / 0.25)
            if q <= 0: continue
            buy = i < self.buyers and t > 1.8 + i * 0.12
            x = s(140 + (i % cols) * 160); y = s(640 + (i // cols) * 220)
            put(cv, person(s(52) * q, YEL if buy else WHITE), x, y)
        n = int(self.buyers * clamp((t - 1.8) / (0.12 * max(1, self.buyers))))
        if t > 1.8: put3(cv, t3d("%d %s" % (n, self.label), BLK(96), YEL, 16), s(540), s(640 + rows * 220) + s(40), ay=-8)

class BBeforeAfter:                                   # truoc / sau: man chia doi, thanh gat quet tu trai sang lam lo ben SAU
    layout = "full"
    def __init__(self, title="Trước và sau", before="TRƯỚC", after="SAU", b_items=("Làm tay", "Mất 5 giờ", "Hay sai"), a_items=("Tự động", "5 phút", "Chuẩn")):
        self.title, self.before, self.after, self.b_items, self.a_items = title, before, after, list(b_items)[:4], list(a_items)[:4]
    def sfx(self, d):
        return [(0.0, "whoosh", 0.06), (1.0, "swish", 0.08), (1.6, "ding", 0.08)] + [(1.4 + i * 0.15, "pop", 0.045) for i in range(len(self.a_items))]
    def panel(self, head, items, good):
        pw, ph = s(860), s(1050)
        im = Image.new("RGBA", (pw, ph), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
        d.rounded_rectangle([0, 0, pw - 1, ph - 1], radius=s(40), fill=((34, 34, 34) if good else (28, 28, 28)) + (255,), outline=(YEL if good else (90, 90, 90)) + (255,), width=s(6))
        d.rounded_rectangle([s(40), s(40), pw - s(40), s(190)], radius=s(26), fill=(YEL if good else (80, 80, 80)) + (255,))
        f = fit_font(BLK, 90, head, pw - s(140)); l, tt, r, b = d.textbbox((0, 0), head, font=f)
        d.text((pw / 2 - (r - l) / 2 - l, s(115) - (b - tt) / 2 - tt), head, font=f, fill=(BLACK if good else WHITE) + (255,))
        for k, it in enumerate(items):
            y = s(300) + k * s(180)
            d.ellipse([s(70), y - s(40), s(150), y + s(40)], fill=(YEL if good else (90, 90, 90)) + (255,))
            if good: d.line([(s(90), y), (s(105), y + s(18)), (s(132), y - s(18))], fill=BLACK + (255,), width=s(9))
            else:
                d.line([(s(92), y - s(18)), (s(128), y + s(18))], fill=WHITE + (255,), width=s(8)); d.line([(s(128), y - s(18)), (s(92), y + s(18))], fill=WHITE + (255,), width=s(8))
            d.text((s(190), y - s(36)), it, font=fit_font(BOLD, 64, it, pw - s(240)), fill=(WHITE if good else (170, 170, 170)) + (255,))
        return im
    def draw(self, cv, t, d):
        text(cv, self.title, SERIF(104), s(540), s(230), WHITE, a=e_io(t / 0.4))
        b = self.panel(self.before, self.b_items, False); a = self.panel(self.after, self.a_items, True)
        u = e_io((t - 1.0) / 0.6)
        mix = b.copy()
        if u > 0:
            cut = int(a.width * u); mix.paste(a.crop((0, 0, cut, a.height)), (0, 0))
        dr = ImageDraw.Draw(mix)
        if 0 < u < 1: dr.rectangle([int(a.width * u) - s(8), 0, int(a.width * u) + s(8), a.height], fill=WHITE + (255,))
        pan = F3.extrude(mix, s(26), (8, 8, 8), dx=0.0, dy=1.0, gl=False)
        put3(cv, pan, s(540), s(1060), a=clamp(t / 0.2), ay=lerp(-30, -8, e_out(t / 0.6)) + 2 * math.sin(t * 1.4), ax=8)

# ------------------------------------------------------------------ B-roll FITNESS / giam can (them 28/10/2026, clip "fitness vd 1-2")
class BScale:                                         # can suc khoe 3D: so tren man hinh chay tu can cu -> can moi, the "-N KG" bat ra
    layout = "full"
    def __init__(self, title="Sau 4 tháng", start=54, end=45, unit="KG", big="", foot="", badge=""):
        self.title, self.start, self.end, self.unit, self.big, self.foot = title, float(start), float(end), unit, big, foot
        self.badge = badge                            # chu thay cho "-N KG"; start == end -> so nhay qua lai (chung can)
    def sfx(self, d):
        return ([(0.0, "whoosh", 0.06), (0.45, "thud", 0.07)] + [(0.7 + i * 0.1, "tick", 0.035) for i in range(12)]
                + [(1.95, "ding", 0.09), (2.1, "pop", 0.06)])
    def draw(self, cv, t, d):
        dr = ImageDraw.Draw(cv)
        text(cv, self.title, fit_font(SERIF, 104, self.title, s(960)), s(540), s(250), WHITE, a=e_io(t / 0.4))
        if self.big:
            put3(cv, t3d(self.big, BLK(110), YEL, 18), s(540), s(400), 0.6 + 0.4 * e_back((t - 0.15) / 0.35), clamp((t - 0.15) * 5))
        u = e_io((t - 0.7) / 1.2)
        num = "%d" % round(lerp(self.start, self.end, u))
        if self.start == self.end and t > 0.7: num = "%d" % (self.start + (int(t * 5) % 2))    # chung can: nhay 60 <-> 61
        pw = s(760); face = Image.new("RGBA", (pw, pw), (0, 0, 0, 0)); fd = ImageDraw.Draw(face)
        rr(fd, (0, 0, pw - 1, pw - 1), s(130), fill=(238, 238, 238, 255))
        rr(fd, (s(28), s(28), pw - s(28), pw - s(28)), s(112), outline=(200, 200, 200, 255), width=s(4))
        sx0, sy0, sx1, sy1 = s(140), s(80), pw - s(140), s(310)            # man hinh so
        rr(fd, (sx0, sy0, sx1, sy1), s(34), fill=(14, 14, 14, 255))
        f = BLK(170); l, tt, r, b = fd.textbbox((0, 0), num, font=f)
        fu = BOLD(50); ul, ut, ur, ub = fd.textbbox((0, 0), self.unit, font=fu)
        tw = (r - l) + s(16) + (ur - ul); x0 = (sx0 + sx1) / 2 - tw / 2
        fd.text((x0 - l, (sy0 + sy1) / 2 - (b - tt) / 2 - tt), num, font=f, fill=YEL + (255,))
        fd.text((x0 + (r - l) + s(16) - ul, (sy0 + sy1) / 2 + (b - tt) / 2 - (ub - ut) - ut), self.unit, font=fu, fill=WHITE + (255,))
        if t > 0.45:                                                       # hai ban chan buoc len can
            k = e_back((t - 0.45) / 0.2)
            for sg in (-1, 1):
                fx, fy = pw / 2 + sg * s(120), s(530)
                rw, rh = s(70) * k, s(130) * k
                if rw > 2: fd.ellipse([fx - rw, fy - rh + s(20), fx + rw, fy + rh], fill=(200, 200, 200, 255))
                for j in range(5):
                    tr = max(1.0, s(16 - j * 2) * k); tx = fx - sg * (j - 2) * s(26) * k; ty = fy - rh - s(10) + abs(j - 2) * s(8)
                    fd.ellipse([tx - tr, ty - tr, tx + tr, ty + tr], fill=(200, 200, 200, 255))
        scl = F3.extrude(face, s(46), SILV, dx=0.0, dy=1.0)
        cv.alpha_composite(F3.soft_shadow(s(680), s(70), 120, s(22)), (s(200), s(1360)))
        jolt = s(14) * math.sin((t - 0.45) * 40) * math.exp(-(t - 0.45) * 9) if t > 0.45 else 0
        put3(cv, scl, s(540), s(1000) + jolt, sc=0.6 + 0.4 * e_back((t - 0.1) / 0.4), a=clamp(t / 0.2),
             ay=5 * math.sin(t * 1.5), ax=lerp(38, 20, e_out(t / 0.7)))
        delta = self.end - self.start
        if t > 1.9 and (self.badge or abs(delta) >= 0.5):
            lab = self.badge or ("-" if delta < 0 else "+") + "%d %s" % (round(abs(delta)), self.unit)
            put3(cv, t3d(lab, fit_font(BLK, 150, lab, s(900)), YEL, 24), s(540), s(1560), 0.6 + 0.4 * e_back((t - 1.9) / 0.35), clamp((t - 1.9) * 5),
                 ay=-8 + 4 * math.sin(t * 2), ax=-6)
        if self.foot: text(cv, self.foot, fit_font(SERIF, 64, self.foot, s(960)), s(540), s(1760), WHITE, a=e_io((t - 2.1) / 0.4))

class BCalo:                                          # tham hut calo: cot AN VAO (trang) vs cot DOT DI (vang) moc len, phan chenh danh dau + the ket qua
    layout = "full"
    def __init__(self, title="Thâm hụt calo", eat=2000, burn=2500, eat_label="ĂN VÀO", burn_label="ĐỐT ĐI", eat_txt="", burn_txt="",
                 result="", unit="calo"):
        self.title, self.eat, self.burn, self.eat_label, self.burn_label = title, float(eat), float(burn), eat_label, burn_label
        self.eat_txt, self.burn_txt, self.unit = eat_txt, burn_txt, unit
        self.result = result or "THÂM HỤT %s %s" % (counter(abs(self.burn - self.eat)), unit.upper())
    def sfx(self, d):
        return ([(0.0, "whoosh", 0.06), (0.4, "pop", 0.055), (0.8, "pop", 0.055)] + [(0.5 + i * 0.09, "tick", 0.03) for i in range(10)]
                + [(1.55, "swish", 0.06), (1.9, "ding", 0.09)])
    def draw(self, cv, t, d):
        dr = ImageDraw.Draw(cv)
        text(cv, self.title, fit_font(SERIF, 104, self.title, s(960)), s(540), s(250), WHITE, a=e_io(t / 0.4))
        base, hmax, bw = s(1380), s(760), s(240); vmax = max(self.eat, self.burn, 1)
        cv.alpha_composite(F3.soft_shadow(s(820), s(60), 110, s(18)), (s(100), base + s(30)))
        dr.line([(s(110), base + s(6)), (s(900), base + s(6))], fill=(70, 70, 70, 255), width=s(4))
        tops = []
        bars = ((s(290), self.eat, self.eat_label, self.eat_txt, WHITE, SILV), (s(680), self.burn, self.burn_label, self.burn_txt, YEL, GOLD))
        for i, (x, val, lab, txt, col, side) in enumerate(bars):
            t0 = 0.4 + i * 0.4
            q = e_back((t - t0) / 0.45, 1.2)
            full = hmax * val / vmax; tops.append(base - full)
            text(cv, lab, fit_font(BLK, 50, lab, s(330)), x, base + s(125), WHITE, a=clamp((t - t0) * 4), shadow=False)
            if q <= 0: continue
            h = max(6, int(full * q))
            blk = F3.block(bw, h, s(18), col, s(26), side)
            cv.alpha_composite(blk, (int(x - blk.width / 2 + s(13)), int(base - h)))
            c = e_io((t - t0) / 0.8)
            shown = txt if (txt and c >= 1) else counter(val * c)
            put3(cv, t3d(shown, fit_font(BLK, 76, shown, s(360)), col, 12), x, base - h - s(70), ay=-6)
        p = e_out((t - 1.55) / 0.35)
        if p > 0 and len(tops) == 2:
            ye, yb = tops
            xa, xb = s(290) + bw / 2, s(680) + bw / 2
            xe = lerp(xa, xb + s(30), p)
            for xx in range(int(xa), int(xe), s(34)):                     # vach dut muc "an vao" keo sang cot dot
                dr.line([(xx, ye), (min(xe, xx + s(18)), ye)], fill=YEL + (255,), width=s(6))
            if p >= 1 and abs(yb - ye) > s(20):
                bx = xb + s(40)
                dr.line([(bx, yb), (bx + s(20), yb), (bx + s(20), ye), (bx, ye)], fill=WHITE + (255,), width=s(6))
                g = "-" + counter(abs(self.burn - self.eat))
                text(cv, g, fit_font(BLK, 64, g, s(190)), bx + s(125), (ye + yb) / 2, WHITE)
        q = e_back((t - 1.9) / 0.35)
        if q > 0:
            put3(cv, t3d(self.result, fit_font(BLK, 90, self.result, s(940)), YEL, 16), s(540), s(1640), 0.6 + 0.4 * q, clamp((t - 1.9) * 5),
                 ay=-8 + 4 * math.sin(t * 2))

# ------------------------------------------------------------------ B-ROLL CUA NGUOI DUNG: canh quay / anh that (them 16/10/2026)
# Nguyen tac (tong hop tu cac huong dan edit video ngan): moi canh chen 2-4 s, CU THE dung cau dang noi; khong chen lien tuc
# thanh phim ghep; chu the de giua khung doc; canh lech ti le -> nen mo; anh tinh luon co chuyen dong; quay man hinh -> khung
# dien thoai; muon giu mat nguoi noi -> chia doi / bong tron goc; vao canh som hon tu khoa ~0.12 s; mau canh chen chinh giong video chinh.
BROLL_DIR = Path(getattr(DA, "BROLL_DIR", PROJ))
VEXT = {".mp4", ".mov", ".m4v", ".avi", ".mkv", ".webm"}
GRADE_UB = getattr(DA, "GRADE", "eq=contrast=1.05:saturation=1.07:gamma=1.03,colorbalance=rm=0.025:bm=-0.02:rh=0.01:bh=-0.015")

def _src(p):
    p = Path(p)
    return p if p.is_absolute() else BROLL_DIR / p

def _probe_media(p):
    o = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration",
                        "-of", "json", str(p)], capture_output=True, text=True).stdout
    j = json.loads(o or "{}"); st = (j.get("streams") or [{}])[0]
    try: dur = float((j.get("format") or {}).get("duration") or 0)
    except Exception: dur = 0.0
    return int(st.get("width", 1080)), int(st.get("height", 1920)), dur

def auto_inpoint(p, need, total):
    """Chon doan dep nhat trong clip: net (do bien canh) + co chuyen dong vua phai, tranh rung lac va 0.3 s dau."""
    if total <= need + 0.6: return 0.0
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(p), "-vf", "fps=4,scale=160:160,format=gray", "-f", "rawvideo", "-"],
                         capture_output=True).stdout
    fr = np.frombuffer(raw, np.uint8).reshape(-1, 160, 160).astype(np.float32)
    if len(fr) < 4: return 0.0
    sharp = np.array([np.var(np.diff(f, axis=0)) + np.var(np.diff(f, axis=1)) for f in fr])
    mot = np.concatenate([[0], np.abs(np.diff(fr, axis=0)).mean((1, 2))])
    sn = sharp / (np.median(sharp) + 1e-6); mn = mot / (np.median(mot) + 1e-6)
    sc = 0.6 * np.clip(sn, 0, 2) + 0.4 * np.clip(mn, 0, 1.5) - 0.6 * np.clip(mn - 2.0, 0, 5)
    win = max(1, int(need * 4)); best, bi = -1e9, 0
    for i in range(1, max(2, len(sc) - win)):
        v = sc[i:i + win].mean()
        if v > best: best, bi = v, i
    return round(min(bi / 4.0, max(0.0, total - need - 0.1)), 2)

class Media:
    """Doc canh chen (video hoac anh) da chinh mau giong video chinh, dung kich thuoc (fill = cat vua khung, fit = giu nguyen ti le)."""
    def __init__(self, path, w, h, mode="fill", focus=0.5, inpoint=0.0, need=3.0):
        self.path = _src(path); self.mode, self.focus = mode, float(focus)
        self.is_video = self.path.suffix.lower() in VEXT
        self.sw, self.sh, self.dur = _probe_media(self.path)
        if mode == "fit":
            k = min(w / self.sw, h / self.sh); self.w, self.h = int(self.sw * k) // 2 * 2, int(self.sh * k) // 2 * 2
        else: self.w, self.h = int(w) // 2 * 2, int(h) // 2 * 2
        if inpoint == "auto": inpoint = auto_inpoint(self.path, need, self.dur) if self.is_video else 0.0
        self.inp = float(inpoint or 0.0); self.proc = None; self.tnext = None; self.last = None; self.img = None
    def _vf(self):
        if self.mode == "fill":
            sc = "scale=%d:%d:force_original_aspect_ratio=increase,crop=%d:%d:(iw-%d)*%.3f:(ih-%d)*0.5" % (self.w, self.h, self.w, self.h, self.w, self.focus, self.h)
        else: sc = "scale=%d:%d" % (self.w, self.h)
        return sc + ",fps=%d," % FPS + GRADE_UB + ",format=rgb24"
    def _open(self, t):
        if self.proc:
            try: self.proc.kill()
            except Exception: pass
        st = min(self.inp + t, max(0.0, self.dur - 0.1)) if self.dur else self.inp + t
        self.proc = subprocess.Popen(["ffmpeg", "-v", "error", "-ss", "%.3f" % st, "-i", str(self.path), "-vf", self._vf(),
                                      "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        self.tnext = t
    def frame(self, t):
        if not self.is_video:
            if self.img is None:
                raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(self.path), "-frames:v", "1", "-vf", self._vf().replace(",fps=%d" % FPS, ""),
                                      "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True).stdout
                self.img = Image.frombuffer("RGB", (self.w, self.h), raw[: self.w * self.h * 3]) if len(raw) >= self.w * self.h * 3 else Image.new("RGB", (self.w, self.h))
            return self.img
        if self.proc is None or t < self.tnext - 0.6 / FPS or t > self.tnext + 0.5: self._open(t)
        n = self.w * self.h * 3
        while self.tnext <= t + 1e-6 or self.last is None:
            buf = self.proc.stdout.read(n)
            if len(buf) < n:                                   # het clip -> dung hinh cuoi
                if self.last is None: self.last = Image.new("RGB", (self.w, self.h))
                self.tnext = 1e9; break
            self.last = Image.frombuffer("RGB", (self.w, self.h), buf); self.tnext += 1.0 / FPS
        return self.last

def pill(txt):
    f = fit_font(BOLD, 38, txt, s(800)); d0 = ImageDraw.Draw(Image.new("RGBA", (4, 4))); l, t, r, b = d0.textbbox((0, 0), txt, font=f)
    im = Image.new("RGBA", (int(r - l + s(56)), int(b - t + s(34))), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, im.width - 1, im.height - 1], radius=im.height // 2, fill=YEL + (255,))
    d.text((s(28) - l, s(17) - t), txt, font=f, fill=BLACK + (255,))
    return im

def kb(img, t, d, motion="push", z0=1.0, z1=1.07, k=0):
    """Ken Burns: day vao cham / troi ngang cho anh va canh quay (img da lon hon khung mot chut)."""
    u = e_io(t / max(0.5, d)); W2, H2 = img.size
    if motion == "pull": z = lerp(z1, z0, u)
    else: z = lerp(z0, z1, u)
    cw, ch = W2 / z, H2 / z
    if motion == "pan": cx = lerp(cw / 2, W2 - cw / 2, u if k % 2 == 0 else 1 - u)
    else: cx = W2 / 2
    return img.transform((W2, H2), Image.EXTENT, (cx - cw / 2, (H2 - ch) / 2, cx + cw / 2, (H2 + ch) / 2), Image.BICUBIC)

def blur_bg(img, dark=0.45):
    sm = img.resize((max(8, W // 8), max(8, H // 8)), Image.BILINEAR).filter(ImageFilter.GaussianBlur(4)).resize((W, H), Image.BILINEAR)
    return Image.eval(sm, lambda v: int(v * dark)).convert("RGBA")

def rmask(w, h, r):
    m = Image.new("L", (int(w), int(h)), 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, int(w) - 1, int(h) - 1], radius=int(r), fill=255); return m

_STK = {}
def sticker_cut(img):
    """Tach vat the khoi nen (rembg u2net) + vien trang day kieu nhan dan."""
    key = id(img)
    if key not in _STK:
        if img.mode == "RGBA" and img.getchannel("A").getextrema()[0] < 250: a = img.getchannel("A")
        else:
            global _SESS_GEN
            if "_SESS_GEN" not in globals(): _SESS_GEN = new_session("u2net", providers=["CPUExecutionProvider"])
            a = remove(img.convert("RGB"), session=_SESS_GEN, only_mask=True)
        a = a.point(lambda v: 255 if v > 128 else 0)
        rad = max(3, s(14)) | 1
        outl = a.filter(ImageFilter.MaxFilter(rad)).filter(ImageFilter.MaxFilter(rad))
        im = Image.new("RGBA", img.size, (0, 0, 0, 0)); wl = Image.new("RGBA", img.size, WHITE + (255,)); wl.putalpha(outl)
        im.alpha_composite(wl); obj = img.convert("RGBA"); obj.putalpha(a); im.alpha_composite(obj)
        _STK[key] = im
    return _STK[key]

class BUser:
    """Canh quay / anh CUA NGUOI DUNG lam B-roll. src: 1 file hoac danh sach (montage / polaroid).
    layout: auto | full | split | card | phone | polaroid | sticker | pip | montage
    inpoint: 'auto' (tu chon doan net + co chuyen dong) hoac so giay; focus: 0..1 vi tri cat ngang khi canh ngang -> khung doc;
    label: nhan vang nho (vd 'App Hormozi OS'); title: dong chu nghieng phia tren (card/phone/sticker);
    items: chu duoi tung anh polaroid; audio: 0 = tat tieng canh chen, 0.2-0.5 = giu tieng nen nho; motion: push | pull | pan."""
    layout = "user"
    _n = 0
    def __init__(self, src, layout="auto", inpoint="auto", focus=0.5, label="", title="", items=None, audio=0.0, motion="push", captions=None):
        self.srcs = list(src) if isinstance(src, (list, tuple)) else [src]
        self.kind, self.inpoint, self.focus, self.label, self.title = layout, inpoint, focus, label, title
        self.items = list(items or []); self.audio = float(audio); self.motion = motion; self._cap = captions
        self.idx = BUser._n; BUser._n += 1; self.lead = 0.12; self.m = None; self.d = None
        if self.kind == "auto": self.kind = self._auto()
        self.keep_captions = self._cap if self._cap is not None else self.kind in ("split", "pip")
    def _auto(self):
        p = _src(self.srcs[0]); vid = p.suffix.lower() in VEXT
        if len(self.srcs) >= 2: return "montage" if vid else "polaroid"
        if not vid:
            if p.suffix.lower() == ".png":
                try:
                    if Image.open(p).mode == "RGBA": return "sticker"
                except Exception: pass
            return "card"
        w, h, _ = _probe_media(p)
        if h > w: return "full" if self.idx % 2 == 0 else "phone"
        return ("card", "split")[self.idx % 2]
    def _prep(self, d):
        if self.m is not None and self.d == d: return
        self.d = d; k = self.kind
        if k == "full" or k == "pip": self.m = [Media(self.srcs[0], W * 1.08, H * 1.08, "fill", self.focus, self.inpoint, d)]
        elif k == "split": self.m = [Media(self.srcs[0], W * 1.06, int(H * 0.56) * 1.06, "fill", self.focus, self.inpoint, d)]
        elif k == "card": self.m = [Media(self.srcs[0], W * 0.88, H * 0.60, "fit", self.focus, self.inpoint, d)]
        elif k == "phone": self.m = [Media(self.srcs[0], s(640), s(1280), "fill", self.focus, self.inpoint, d)]
        elif k == "sticker": self.m = [Media(self.srcs[0], W * 0.8, H * 0.5, "fit", 0.5, 0, d)]
        elif k == "polaroid": self.m = [Media(x, s(560), s(640), "fill", self.focus, 0, d) for x in self.srcs[:5]]
        elif k == "cards": self.m = [Media(x, W * 0.88, H * 0.60, "fit", self.focus, self.inpoint, d / max(1, len(self.srcs))) for x in self.srcs]
        else:                                                   # montage
            seg = max(0.45, d / max(1, len(self.srcs)))
            self.m = [Media(x, W * 1.06, H * 1.06, "fill", self.focus, self.inpoint, seg) for x in self.srcs]
    def audio_spec(self, t0, d):
        self._prep(d)
        if self.audio <= 0 or self.kind in ("polaroid", "montage") or not self.m[0].is_video: return None
        return (round(t0, 3), str(self.m[0].path), self.m[0].inp, round(d, 3), self.audio)
    def sfx(self, d):
        self._prep(d); k = self.kind
        ev = [(0.0, "whoosh", 0.06)]
        if k == "polaroid": ev += sum(([(i * (d - 0.6) / max(1, len(self.m)) + 0.05, "click", 0.06), (i * (d - 0.6) / max(1, len(self.m)) + 0.1, "pop", 0.05)] for i in range(len(self.m))), [])
        elif k == "montage":
            seg = max(0.45, d / max(1, len(self.m))); ev += [(i * seg, "swish", 0.04) for i in range(1, len(self.m))]
        elif k == "cards":
            seg = d / max(1, len(self.m)); ev += [(0.35, "pop", 0.05)] + sum(([(i * seg, "swish", 0.045), (i * seg + 0.2, "pop", 0.045)] for i in range(1, len(self.m))), [])
        elif k in ("sticker", "phone", "card"): ev += [(0.35, "pop", 0.05)]
        if self.label: ev.append((0.5, "pop_soft", 0.04))
        return ev
    # --- cac kieu dat canh
    def _full(self, fr, t, d):
        return kb(self.m[0].frame(t), t, d, self.motion, k=self.idx).resize((W, H), Image.BICUBIC).convert("RGBA")
    def _split(self, fr, t, d):
        H1 = int(H * 0.56); out = Image.new("RGBA", (W, H), BLACK + (255,))
        top = kb(self.m[0].frame(t), t, d, self.motion, k=self.idx).resize((W, H1), Image.BICUBIC)
        out.paste(top, (0, 0))
        y0 = int(H * 0.06); sp = fr.crop((0, y0, W, y0 + (H - H1))); out.paste(sp, (0, H1))
        u = e_out(t / 0.35); dr = ImageDraw.Draw(out)
        dr.rectangle([0, H1 - s(6), int(W * u), H1 + s(6)], fill=YEL + (255,))
        return out
    def _card(self, fr, t, d):
        img = self.m[0].frame(t); out = blur_bg(img)
        fg = kb(img, t, d, self.motion, 1.0, 1.05, self.idx).convert("RGBA"); fg.putalpha(rmask(fg.width, fg.height, s(34)))
        fr_ = Image.new("RGBA", (fg.width + s(16), fg.height + s(16)), (0, 0, 0, 0))
        ImageDraw.Draw(fr_).rounded_rectangle([0, 0, fr_.width - 1, fr_.height - 1], radius=s(40), fill=YEL + (255,)); fr_.alpha_composite(fg, (s(8), s(8)))
        blk = F3.extrude(fr_, s(18), GOLD, dx=0.0, dy=1.0, gl=False)
        cy = s(1000) if not self.title else s(1060)
        if self.title: text(out, self.title, fit_font(SERIF, 96, self.title, s(960)), s(540), s(300), WHITE, a=e_io(t / 0.35))
        put3(out, blk, s(540), cy + s(10) * math.sin(t * 1.7), sc=0.85 + 0.15 * e_back(t / 0.35), ay=lerp(-22, -6, e_out(t / 0.6)) + 2 * math.sin(t * 1.3), ax=6)
        return out
    def _phone(self, fr, t, d):
        out = bg_img(); scr = self.m[0].frame(t).convert("RGBA")
        pw, ph = scr.width + s(44), scr.height + s(44)
        face = Image.new("RGBA", (pw, ph), (0, 0, 0, 0)); fd = ImageDraw.Draw(face)
        fd.rounded_rectangle([0, 0, pw - 1, ph - 1], radius=s(74), fill=(18, 18, 18, 255), outline=(110, 110, 110, 255), width=s(6))
        scr.putalpha(rmask(scr.width, scr.height, s(56))); face.alpha_composite(scr, (s(22), s(22)))
        fd.rounded_rectangle([pw / 2 - s(90), s(34), pw / 2 + s(90), s(66)], radius=s(16), fill=(8, 8, 8, 255))
        ph3 = F3.extrude(face, s(26), (10, 10, 10), dx=0.0, dy=1.0, gl=False)
        if self.title: text(out, self.title, fit_font(SERIF, 90, self.title, s(960)), s(540), s(190), WHITE, a=e_io(t / 0.35))
        put(out, F3.soft_shadow(s(600), s(70), 120, s(22)), s(540), s(1720))
        put3(out, ph3, s(540), s(1000) + s(12) * math.sin(t * 1.6), sc=0.78 + 0.08 * e_back(t / 0.4),
             ay=lerp(-30, -10, e_out(t / 0.7)) + 3 * math.sin(t * 1.2), ax=7)
        return out
    def _sticker(self, fr, t, d):
        out = bg_img(); dr = ImageDraw.Draw(out)
        r0 = s(420) + s(30) * math.sin(t * 2)
        dr.ellipse([s(540) - r0, s(980) - r0, s(540) + r0, s(980) + r0], fill=(40, 33, 8, 255))
        st = sticker_cut(self.m[0].frame(0)); p = e_back((t - 0.15) / 0.4, 2.0)
        if p > 0:
            put(out, F3.soft_shadow(st.width * 0.7, s(60), 110, s(20)), s(540), s(980) + st.height * 0.5)
            rot = st.rotate(3 * math.sin(t * 1.5), resample=Image.BICUBIC, expand=True)
            put(out, rot, s(540), s(980) + s(14) * math.sin(t * 2.2), sc=max(0.05, 0.8 * p + 0.2 * p))
        if self.title: put3(out, t3d(self.title, BLK(96), YEL, 16), s(540), s(360), 0.6 + 0.4 * e_back((t - 0.1) / 0.35), clamp((t - 0.1) * 5))
        return out
    def _pip(self, fr, t, d):
        out = self._full(fr, t, d); p = e_back((t - 0.2) / 0.35)
        if p > 0:
            R = int(s(150) * p); cx, cy = s(205), s(300)
            fc = fr.crop((int(W * 0.18), int(H * 0.06), int(W * 0.82), int(H * 0.06) + int(W * 0.64))).resize((2 * R, 2 * R), Image.BILINEAR).convert("RGBA")
            m = Image.new("L", (2 * R, 2 * R), 0); ImageDraw.Draw(m).ellipse([0, 0, 2 * R - 1, 2 * R - 1], fill=255); fc.putalpha(m)
            dr = ImageDraw.Draw(out); dr.ellipse([cx - R - s(9), cy - R - s(9), cx + R + s(9), cy + R + s(9)], fill=YEL + (255,))
            out.alpha_composite(fc, (cx - R, cy - R))
        return out
    def _polaroid(self, fr, t, d):
        n = len(self.m); out = blur_bg(self.m[0].frame(0), 0.38)
        step = (d - 0.6) / max(1, n); ang = [-7, 5, -3, 8, -5]
        for i, m in enumerate(self.m):
            lt = t - i * step
            if lt <= 0: continue
            p = e_back(lt / 0.35, 1.6)
            ph = m.frame(0).convert("RGBA"); bw, bb = s(26), s(120)
            card = Image.new("RGBA", (ph.width + 2 * bw, ph.height + bw + bb), WHITE + (255,)); card.paste(ph, (bw, bw))
            if i < len(self.items):
                cd = ImageDraw.Draw(card); f = fit_font(SERIF, 56, self.items[i], card.width - s(40))
                l, tt, r, b = cd.textbbox((0, 0), self.items[i], font=f); cd.text((card.width / 2 - (r - l) / 2 - l, ph.height + bw + bb / 2 - (b - tt) / 2 - tt), self.items[i], font=f, fill=(30, 30, 30, 255))
            rot = card.rotate(ang[i % 5] * (0.6 + 0.4 * p), resample=Image.BICUBIC, expand=True)
            sh = F3.soft_shadow(rot.width * 0.85, s(60), 120, s(18))
            x = s(540 + ((i % 3) - 1) * 60); y = s(960 + (i % 2) * 40) - (1 - e_out(lt / 0.35)) * s(500)
            put(out, sh, x, y + rot.height * 0.45); put(out, rot, x, y, sc=1.25 - 0.25 * p)
        return out
    def _cards(self, fr, t, d):
        """Nhieu anh GIU NGUYEN KHUNG (anh truoc/sau ghep doi, anh vuong) - lan luot tung the vien vang nghieng 3D, nen la anh do lam mo."""
        n = len(self.m); seg = d / max(1, n); i = min(n - 1, int(t / seg)); lt = t - i * seg
        img = self.m[i].frame(lt); out = blur_bg(img)
        fg = kb(img, lt, seg, "push", 1.0, 1.04, i).convert("RGBA"); fg.putalpha(rmask(fg.width, fg.height, s(34)))
        fr_ = Image.new("RGBA", (fg.width + s(16), fg.height + s(16)), (0, 0, 0, 0))
        ImageDraw.Draw(fr_).rounded_rectangle([0, 0, fr_.width - 1, fr_.height - 1], radius=s(40), fill=YEL + (255,)); fr_.alpha_composite(fg, (s(8), s(8)))
        blk = F3.extrude(fr_, s(18), GOLD, dx=0.0, dy=1.0, gl=False)
        if self.title: text(out, self.title, fit_font(SERIF, 96, self.title, s(960)), s(540), s(300), WHITE, a=e_io(t / 0.35))
        p = e_back(lt / 0.3) if i > 0 else 1.0
        sg = -1 if i % 2 == 0 else 1
        put3(out, blk, s(540), s(1060) + s(10) * math.sin(t * 1.7), sc=(0.85 + 0.15 * e_back(t / 0.35)) * (0.8 + 0.2 * p),
             ay=sg * lerp(22, 6, e_out(lt / 0.6)) + 2 * math.sin(t * 1.3), ax=6)
        if i < len(self.items) and self.items[i]:
            pl = pill(self.items[i]); put(out, pl, s(540), s(1720) + (1 - e_out((lt - 0.3) / 0.3)) * s(40), a=clamp((lt - 0.3) / 0.2))
        if i > 0 and lt < 0.07: out.alpha_composite(Image.new("RGBA", (W, H), (255, 255, 255, 110)))
        return out
    def _montage(self, fr, t, d):
        n = len(self.m); seg = max(0.45, d / max(1, n)); i = min(n - 1, int(t / seg)); lt = t - i * seg
        out = kb(self.m[i].frame(lt), lt, seg, "push" if i % 2 == 0 else "pull", 1.0, 1.06).resize((W, H), Image.BICUBIC).convert("RGBA")
        if i > 0 and lt < 0.07: out.alpha_composite(Image.new("RGBA", (W, H), (255, 255, 255, 110)))
        return out
    def render(self, fr, t, d):
        self._prep(d)
        out = getattr(self, "_" + self.kind)(fr, t, d)
        if self.label and self.kind not in ("polaroid",):
            pl = pill(self.label); a = clamp((t - 0.45) / 0.2)
            y = {"split": int(H * 0.56) - s(70), "pip": s(520), "card": s(1500), "sticker": s(1560), "phone": s(1790)}.get(self.kind, s(1560))
            put(out, pl, s(540), y + (1 - e_out((t - 0.45) / 0.3)) * s(40), a=a)
        # vao canh: 4 kieu luan phien - truot len / bat phong / mo tron / quet ngang
        if t < 0.3:
            u = e_out(t / 0.3); base = fr.convert("RGBA"); kind = self.idx % 4
            if kind == 0: base.alpha_composite(out, (0, int((1 - u) * H)))
            elif kind == 1:
                sc = 1.25 - 0.25 * u; im = out.resize((int(W * sc), int(H * sc)), Image.BILINEAR)
                im.putalpha(Image.new("L", im.size, int(255 * u))); base.alpha_composite(im, ((W - im.width) // 2, (H - im.height) // 2))
            elif kind == 2:
                m = Image.new("L", (W, H), 0); R = u * math.hypot(W, H) / 2
                ImageDraw.Draw(m).ellipse([W / 2 - R, H * 0.45 - R, W / 2 + R, H * 0.45 + R], fill=255)
                base = Image.composite(out, base, m)
            else:
                off = int((1 - u) * W); g = out.copy()
                for k in (1, 2): g = Image.blend(g, out.transform(out.size, Image.AFFINE, (1, 0, k * s(40) * (1 - u), 0, 1, 0)), 0.33)
                base.alpha_composite(g, (off, 0))
            out = base
        return out

def _mk(spec):
    a, b, name = spec[0], spec[1], spec[2]
    kw = spec[3] if len(spec) > 3 else {}
    return (a, b, globals()[name](**kw))
BROLL = [_mk(x) for x in DA.BROLL]                    # (cum dau, cum cuoi, "TenMau", {tham so})
if not BROLL_3D: BROLL = [x for x in BROLL if type(x[2]).__name__ == "BUser"]   # tat mau 3D, chi giu canh quay cua nguoi dung
BEHIND = dict(getattr(DA, "BEHIND", {})) if TACH_PHONG else {}   # {so cum: "TU NGAN"} chu to sau dau
DARK = set(getattr(DA, "DARK", ())) if TACH_PHONG else set()     # {so cum} xoa phong nen toi
ZOOMS = [1.0, 1.08, 1.0, 1.14]

_bl = {}
def behind_layer(word):
    if word not in _bl:
        i = list(BEHIND.values()).index(word)
        f = font(SANS, s(430), "Black"); fill = WHITE if i % 2 == 0 else YEL
        d0 = ImageDraw.Draw(Image.new("RGBA", (4, 4))); l, t, r, b = d0.textbbox((0, 0), word, font=f)
        if r - l > s(1000): f = font(SANS, int(f.size * s(1000) / (r - l)), "Black"); l, t, r, b = d0.textbbox((0, 0), word, font=f)
        pad = s(50)
        im = Image.new("RGBA", (r - l + 2 * pad, b - t + 2 * pad), (0, 0, 0, 0))
        ImageDraw.Draw(im).text((pad - l, pad - t), word, font=f, fill=fill + (255,))
        sh = im.getchannel("A").filter(ImageFilter.GaussianBlur(s(20))).point(lambda v: int(v * 0.55))
        out = Image.new("RGBA", im.size, (0, 0, 0, 0)); shl = Image.new("RGBA", im.size, (0, 0, 0, 255)); shl.putalpha(sh)
        out.alpha_composite(shl, (s(6), s(10))); out.alpha_composite(im)
        _bl[word] = out
    return _bl[word]

# ------------------------------------------------------------------ 4. tach nguoi
# Tach nguoi (nang cap 16/10/2026): mac dinh RobustVideoMatting ban net (rvm_resnet50) - mo hinh tach nguoi cho VIDEO,
# nho khung truoc nen mep on dinh, toc/vai/tay min; nhanh gap ~2 lan u2net va it nhap nhay gap ~3 lan (do tren clip 0544).
# du_an.py: MATTE = "rvm" (mac dinh) | "rvm-nhe" (may yeu) | "u2net" (cu). Thieu file mo hinh -> tu ve u2net.
import onnxruntime as ort
MODEL_DIR = HERE.parent / "models"                   # cai-dat.ps1 tai RobustVideoMatting ve day
MATTE = getattr(DA, "MATTE", "rvm")
_RVM_FILE = {"rvm": "rvm_resnet50_fp32.onnx", "rvm-nhe": "rvm_mobilenetv3_fp32.onnx"}.get(MATTE) if TACH_PHONG else None
if _RVM_FILE and not (MODEL_DIR / _RVM_FILE).exists():
    print("!! khong thay %s trong %s -> dung u2net" % (_RVM_FILE, MODEL_DIR)); _RVM_FILE = None
LAST_FGR = None                                      # mau nguoi da khu nen (RVM) - dung de xoa vien sang quanh toc/tai
if _RVM_FILE:
    _RVM = ort.InferenceSession(str(MODEL_DIR / _RVM_FILE), providers=["CPUExecutionProvider"])
    _REC = [np.zeros((1, 1, 1, 1), np.float32)] * 4
    _RATIO = min(1.0, 480.0 / max(W, H))             # 1920 -> 0.25, 1280 -> 0.375 (theo khuyen nghi cua tac gia)
    def _rvm_step(arr):
        global _REC
        x = (arr.astype(np.float32) / 255.0).transpose(2, 0, 1)[None]
        o = _RVM.run(None, {"src": x, "r1i": _REC[0], "r2i": _REC[1], "r3i": _REC[2], "r4i": _REC[3],
                            "downsample_ratio": np.array([_RATIO], np.float32)})
        _REC = list(o[2:6])
        return o[0][0].transpose(1, 2, 0) * 255.0, o[1][0, 0]
    def matte(img, prev):
        global _REC, LAST_FGR
        arr = np.asarray(img)
        if prev is None:                             # doan tach phong moi -> xoa tri nho + ham nong 2 luot
            _REC = [np.zeros((1, 1, 1, 1), np.float32)] * 4
            for _ in range(2): _rvm_step(arr)
        fgr, a = _rvm_step(arr)
        LAST_FGR = fgr
        return np.clip(a, 0, 1).astype(np.float32)
elif not TACH_PHONG:                                  # khong tach phong -> khong nap mo hinh (dung nhanh hon)
    def matte(img, prev): return np.ones((H, W), np.float32)
else:
    SESS = new_session("u2net_human_seg", providers=["CPUExecutionProvider"])
    MW, MH = 432, 768
    def matte(img, prev):
        global LAST_FGR
        LAST_FGR = None
        sm = img.resize((MW, MH), Image.BILINEAR)
        m = np.asarray(remove(sm, session=SESS, only_mask=True), dtype=np.float32) / 255.0
        g = np.asarray(sm.convert("L"), dtype=np.float32) / 255.0
        m = np.clip(guided(g, m, 4, 2e-3), 0, 1)
        m = np.clip((m - 0.28) / 0.44, 0, 1); m = m * m * (3 - 2 * m)
        return m if prev is None else 0.68 * m + 0.32 * prev

def rounded_mask(w, h, r):
    m = Image.new("L", (w, h), 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, w - 1, h - 1], radius=r, fill=255); return m

def main():
    global BG
    WORK.mkdir(exist_ok=True)
    cut = WORK / "cut.mov"
    if not cut.exists() and "--list" not in sys.argv: make_cut(cut)
    plan = manual_plan()
    if "--list" in sys.argv:
        for c in plan: print("  [%2d] %5.2f-%5.2f  %s" % (c["ci"], c["t0"], c["t1"], " / ".join(L["x"] for L, _, _ in c["lines"])))
        return
    cst = {c["ci"]: c["t0"] for c in plan}; cen = {c["ci"]: c["t1"] for c in plan}
    BR = []
    for a, b, obj in BROLL:
        t0 = max(0.0, round((cst[a] - getattr(obj, "lead", 0.0)) * FPS) / FPS); t1 = round(cen[b] * FPS) / FPS   # canh nguoi dung vao som ~0.12s
        if getattr(obj, "me_ci", None) is not None: obj.me_at = cst[obj.me_ci] - t0
        BR.append((t0, t1, obj))
    print("%dx%d | %.2fs (x%.1f) | %d cum | %d B-roll" % (W, H, DUR, SPEED, len(plan), len(BR)))
    for t0, t1, o in BR: print("  B-roll %-10s %5.2f-%5.2f (%.1fs) %s" % (type(o).__name__, t0, t1, t1 - t0, o.layout))
    capplan = [c for c in plan if not any(t0 - 0.05 <= c["t0"] < t1 and not getattr(o, "keep_captions", False) for t0, t1, o in BR)]
    for c in capplan:                                 # cat cum chu cham vao B-roll (tru B-roll giu phu de: chia doi / bong tron)
        for t0, t1, o in BR:
            if c["t0"] < t0 < c["t1"] and not getattr(o, "keep_captions", False): c["t1"] = t0
    BAUDIO = [x for x in (o.audio_spec(t0, t1 - t0) for t0, t1, o in BR if hasattr(o, "audio_spec")) if x]
    md = lambda ci: "behind" if ci in BEHIND else ("dark" if ci in DARK else "real")
    TRANS = [c["t0"] for i, c in enumerate(plan) if i > 0 and md(c["ci"]) != md(plan[i - 1]["ci"])
             and not any(t0 - 0.1 <= c["t0"] <= t1 + 0.1 for t0, t1, _ in BR)]
    # Hoa tan (che do muot): doi nen 0.3s, vao/ra B-roll toan man 0.25s, cho cat trong nguon 0.1s (3 khung)
    SOFT = []
    if SMOOTH:
        SOFT += [(x, 0.30) for x in TRANS]
        for t0, t1, o in BR:
            if o.layout in ("full", "card", "user"): SOFT += [(t0, 0.25), (t1, 0.25)]
        for a_, b_ in SCENE_OUT: SOFT += [(a_, 0.30), (b_, 0.30)]
        acc = 0.0
        for a_, b_ in KEEP[:-1]:
            acc += b_ - a_; x = acc / SPEED
            if not any(abs(x - y) < 0.25 for y, _ in SOFT): SOFT.append((x, 0.10))
        SOFT.sort()
    SFX = []
    for t0, t1, o in BR:
        SFX += [(t0 + dt, k, a) for dt, k, a in o.sfx(t1 - t0)]
        SFX.append((t1 - 0.05, "whoosh_out", 0.035))
    # tieng cho CHU va NEN (them 16/10/2026 - chu chua du tieng): chu day bat ra -> pop nhe, chu manh -> lap lanh,
    # chu to sau dau -> swish + thud, doi nen -> swish nhe. Muc nho de khong at giong.
    for c in capplan:
        for L, x, y in c["lines"]:
            if L["kind"] == "bold": SFX.append((L["s"] - 0.03, "pop_soft", 0.04))
            elif L["kind"] == "thin": SFX.append((L["s"] + 0.25, "sparkle", 0.022))
    for ci in BEHIND:
        if ci in cst and not any(t0 <= cst[ci] < t1 for t0, t1, _ in BR):
            SFX += [(cst[ci] - 0.02, "swish", 0.05), (cst[ci] + 0.22, "thud", 0.09)]
    SFX += [(t, "swish", 0.03) for t in TRANS if not any(abs(t - (cst[ci] if ci in cst else -9)) < 0.1 for ci in BEHIND)]
    SFX.sort()
    ev = sorted([c["t0"] for c in capplan] + [x for t0, t1, _ in BR for x in (t0, t1)] + [0, DUR])
    print("  khoang cach su kien lon nhat: %.2fs | %d hieu ung am thanh | %d lan doi nen" % (max(b - a for a, b in zip(ev, ev[1:])), len(SFX), len(TRANS)))
    if "--meta" in sys.argv:                          # chi tinh lai danh sach tieng (khong dung hinh) -> chay lai mix_engine
        WORK.mkdir(exist_ok=True)
        json.dump({"DUR": DUR, "SFX": SFX, "BAUDIO": BAUDIO, "BR": [(a, b, type(o).__name__) for a, b, o in BR]}, open(WORK / "meta.json", "w"))
        print("meta xong: %d tieng" % len(SFX)); return
    BG = dark_bg()
    sk = Skin()
    rng = np.random.default_rng(1)
    grain = [rng.normal(0, 2.2, (H, W, 1)).astype(np.float32) for _ in range(6)]
    yy = np.arange(H, dtype=np.float32)
    shade = (1 - 0.55 * np.clip((yy - s(1100)) / s(700), 0, 1) ** 1.3)[:, None, None]
    fade = np.clip((yy - s(1180)) / s(420), 0, 1)[:, None] ** 1.2
    head_top = {}
    png_at = float(sys.argv[sys.argv.index("--png") + 1]) if "--png" in sys.argv else None
    t_off = max(0, png_at - 0.6) if png_at is not None else 0.0
    ss = ["-ss", "%.3f" % t_off] if png_at is not None else []
    rd = subprocess.Popen(["ffmpeg", "-v", "error"] + ss + ["-i", str(cut), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE)
    wr = None
    if png_at is None:
        wr = subprocess.Popen(["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", "%dx%d" % (W, H), "-r", str(FPS), "-i", "-",
                               "-c:v", "libx264", "-crf", "20" if DRAFT else "17", "-preset", "veryfast" if DRAFT else "slow", "-tune", "film",
                               "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(WORK / "video.mp4")], stdin=subprocess.PIPE)
    prev = None; n = int(round(DUR * FPS)); fsz = W * H * 3; first = t_off
    snap = None; last_res = None                      # hoa tan (che do muot)
    for f in range(n):
        buf = rd.stdout.read(fsz)
        if len(buf) < fsz: break
        t = t_off + f / FPS
        if png_at is not None and abs(t - png_at) > 0.6 / FPS and t < png_at - 0.2: continue
        fr = Image.frombuffer("RGB", (W, H), buf)
        br = next(((t0, t1, o) for t0, t1, o in BR if t0 <= t < t1), None)
        ci = max([c["ci"] for c in plan if c["t0"] <= t] or [0])
        if br and br[2].layout == "full":
            prev = None
            t0, t1, o = br; lt = t - t0
            out = bg_img(); o.draw(out, lt, t1 - t0)
            # vao: dai vang quet doc; ra: cat thang (che do muot: bo dai quet, dung hoa tan o cuoi vong lap)
            if lt < 0.28 and not SMOOTH:
                u = e_io(lt / 0.28); dr = ImageDraw.Draw(out)
                dr.rectangle([0, H * (1 - u) - s(60), W, H * (1 - u) + s(60)], fill=YEL + (255,))
        else:
            fr, _ = sk(fr)                            # lam min da
            c0, c1 = cst.get(ci, 0), cen.get(ci, DUR); u = clamp((t - c0) / max(0.3, c1 - c0))
            if SMOOTH:                                # zoom doi tu tu 0.7s giua cac cum, day vao rat cham, troi ngang lien tuc
                zt = lambda k: (1.0, 1.04, 1.0, 1.07)[k % 4]
                k_in = e_io((t - c0) / 0.7)
                z = lerp(zt(ci - 1) if ci > 0 else zt(0), zt(ci), k_in) + 0.006 * (1 - math.cos(t * 0.3))   # "tho" lien tuc, khong giat khi sang cum
                pan = 0.006 * W * math.sin(t * 0.35)
            else:
                z = ZOOMS[ci % len(ZOOMS)]; kz = ci % 3
                if kz == 0: z += 0.035 * u
                elif kz == 1: z += 0.06 * (1 - e_out((t - c0) / 0.30))
                else: z += 0.035 * (1 - u)
                if br: z = 1.0
                pan = (0.0, -0.012, 0.012)[ci % 3] * u * W
            if z > 1.001:
                cw_, ch_ = W / z, H / z; x0 = min(max(0, (W - cw_) / 2 + pan), W - cw_); y0 = (H - ch_) * 0.18
                fr = fr.transform((W, H), Image.EXTENT, (x0, y0, x0 + cw_, y0 + ch_), Image.BICUBIC).filter(ImageFilter.UnsharpMask(2, 40, 2))
            mode = "real" if (br or in_scene(t)) else ("behind" if ci in BEHIND else ("dark" if ci in DARK else "real"))
            frf = np.asarray(fr, dtype=np.float32)
            if mode == "real":
                prev = None
                canvas = frf * shade + grain[f % 6] * 0.6
            else:
                m = matte(fr, prev); prev = m
                if m.shape == (H, W): mf = m
                else: mf = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).resize((W, H), Image.BILINEAR), dtype=np.float32) / 255.0
                if mode == "dark":
                    col = frf
                    if LAST_FGR is not None:                 # mep nguoi lay mau da khu nen -> het vien sang
                        wv = (mf > 0.97)[..., None]; col = LAST_FGR * (1 - wv) + frf * wv
                    mf = (mf * (1 - fade))[..., None]
                    canvas = BG * (1 - mf) + col * mf + grain[f % 6]
                else:
                    if ci not in head_top:
                        rows = np.where(m.max(1) > 0.5)[0]
                        head_top[ci] = (rows[0] / m.shape[0] * H) if len(rows) else s(330)
                    lt = t - c0
                    big = behind_layer(BEHIND[ci])
                    p = e_back(lt / 0.32, 2.2)
                    sc = 0.6 + 0.4 * p + 0.07 * u
                    jx = s(10) * math.sin(lt * 55) * math.exp(-lt * 7) if lt > 0.25 else 0       # rung khi cham
                    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
                    put(lay, big, W / 2 + jx, head_top[ci] + s(5) - s(30) * u, sc, clamp(lt / 0.12))
                    la = np.asarray(lay, dtype=np.float32); ta = la[..., 3:4] / 255.0
                    base = frf * shade
                    under = base * (1 - ta) + la[..., :3] * ta
                    mf = mf[..., None]
                    canvas = under * (1 - mf) + base * mf + grain[f % 6] * 0.6
            out = Image.fromarray(np.clip(canvas, 0, 255).astype(np.uint8)).convert("RGBA")
            if br:
                t0, t1, o = br; lt = t - t0; dr = ImageDraw.Draw(out)
                if o.layout == "user":                    # canh quay / anh cua nguoi dung
                    out = o.render(fr, lt, t1 - t0)
                    if o.keep_captions: draw_captions(out, [c for c in plan if t0 - 0.05 <= c["t0"] < t1 or c["t0"] <= t < c["t1"]], t)
                elif o.layout == "lower":                   # nua duoi toi dan + do hoa truot len
                    a = e_io(lt / 0.25) * (1 - e_io((lt - (t1 - t0) + 0.2) / 0.2))
                    gy = np.arange(H, dtype=np.float32)
                    dk = (np.clip((gy - s(1000)) / s(250), 0, 1) * 0.86 * a)[:, None, None]
                    arr = np.asarray(out, dtype=np.float32); arr[..., :3] = arr[..., :3] * (1 - dk) + np.array(BLACK, np.float32) * dk
                    out = Image.fromarray(arr.astype(np.uint8))
                    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); o.draw(lay, lt, t1 - t0)
                    out.alpha_composite(lay, (0, int((1 - e_out(lt / 0.3)) * s(120))))
                else:                                     # card: do hoa tren nen den, nguoi trong the bo goc o duoi
                    full = bg_img(); o.draw(full, lt, t1 - t0)
                    cwid, chei = s(700), s(640)
                    p = e_back(lt / 0.35)
                    face = fr.crop((0, int(H * 0.04), W, int(H * 0.04) + int(W * chei / cwid))).resize((cwid, chei), Image.LANCZOS)
                    sc = 0.7 + 0.3 * p
                    fw, fh = int(cwid * sc), int(chei * sc)
                    face = face.resize((fw, fh), Image.BILINEAR).convert("RGBA")
                    msk = rounded_mask(fw, fh, s(40)); face.putalpha(msk)
                    bx, by = int(W / 2 - fw / 2), int(s(1580) - fh / 2)
                    ImageDraw.Draw(full).rounded_rectangle([bx - s(6), by - s(6), bx + fw + s(6), by + fh + s(6)], radius=s(46), fill=YEL + (255,))
                    full.alpha_composite(face, (bx, by))
                    out = full
            else:
                draw_captions(out, capplan, t)
            if not SMOOTH:                            # kieu cu: chop trang 2 khung khi doi nen
                tr = next((x for x in TRANS if 0 <= t - x < 0.067), None)
                if tr is not None: out.alpha_composite(Image.new("RGBA", (W, H), (255, 255, 255, 120)))
        res = out.convert("RGB")
        if SMOOTH:                                    # hoa tan tu khung cuoi truoc moc sang khung moi
            ev = next(((x, d) for x, d in SOFT if x <= t < x + d), None)
            if ev is not None:
                if snap is None or snap[0] != ev[0]: snap = (ev[0], last_res)
                if snap[1] is not None:
                    res = Image.blend(snap[1], res, e_io((t - ev[0] + 1.0 / FPS) / (ev[1] + 1.0 / FPS)))
            last_res = res
        if png_at is not None:
            if abs(t - png_at) <= 0.6 / FPS: res.save(sys.argv[sys.argv.index("--png") + 2]); break
            continue
        wr.stdin.write(res.tobytes())
        if f % 150 == 0: print("  khung %d/%d" % (f, n), flush=True)
    rd.stdout.close(); rd.wait()
    if wr: wr.stdin.close(); wr.wait()
    json.dump({"DUR": DUR, "SFX": SFX, "BAUDIO": BAUDIO, "BR": [(a, b, type(o).__name__) for a, b, o in BR]}, open(WORK / "meta.json", "w"))
    print("hinh xong")

if __name__ == "__main__":
    main()
