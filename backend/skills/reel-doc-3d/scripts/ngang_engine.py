# -*- coding: utf-8 -*-
"""BO MAY VIDEO NGANG 16:9 kieu HUONG DAN (them 30/10/2026).
Dung lai chu / khoi 3D / tach nguoi cua reel_engine.py, tieng cua mix_engine.py. Cau hinh mau: du_an_ngang_mau.py
Khac reel doc:
  - doan noi ve man hinh: NGUOI TACH NEN THU GON VE GOC PHAI, anh chup man hinh ben trai, ZOOM vao dung cho dang noi + vong vang + note;
  - ANH CHE thong tin rieng truoc khi dung (BLUR trong SCREENS);
  - do hoa ngang tu ve (GVS, GSTEPS, GGRID, GSOCIAL, GCTA) va dong xu icon (thu muc ICON_DIR).
Chay bang venv xoaphong-speed:  python ngang_engine.py --du-an <du an> [--draft] [--list] [--meta] [--png <giay> <anh.png>]
Roi mix_engine.py --du-an <du an> [--draft] nhu reel doc. du_an.py dat OUT_RES = (1080, 1920) (he so ve, khong phai khung ra), BROLL = []."""
import json, math, subprocess, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
sys.path.insert(0, str(Path(__file__).resolve().parent))
import reel_engine as E
from reel_engine import (s, clamp, e_out, e_io, e_back, lerp, WHITE, BLACK, YEL, GOLD, SILV, PANEL, PANEL_SIDE, F3, text, put, put3, t3d, timg,
                         BLK, BOLD, SEMI, SERIF, fit_font, FPS, SPEED)
from skin import Skin
DA = E.DA
W, H = E.H, E.W                                       # khung ngang: 1920x1080 (nhap 1280x720)
PROJ, WORK, DRAFT = E.PROJ, E.WORK, E.DRAFT
ICON_DIR = Path(getattr(DA, "ICON_DIR", PROJ / "icons"))
BROLL_DIR = Path(getattr(DA, "BROLL_DIR", PROJ / "broll"))
ZOOMS = [1.0, 1.07, 1.0, 1.11]                        # quy tac: zoom nhan chi 107% / 111% (nguon 1080p)
CARD_W, CARD_H = s(1300), s(720)
CARD_X, CARD_Y = s(56), s(176)
ASP = CARD_W / CARD_H
SC_NHO = getattr(DA, "SC_NHO", 0.70)                  # nguoi thu gon con 70%
X_NHO = s(getattr(DA, "X_NHO", 1640))                 # tam nguoi khi thu gon
XC = getattr(DA, "XC", 0.49)                          # tam nguoi trong khung goc (ti le ngang)

def make_cut(out):
    parts, ins = [], []
    for i, (a, b) in enumerate(E.KEEP):
        d = b - a
        parts.append("[0:v]trim=%.4f:%.4f,setpts=PTS-STARTPTS[v%d];[0:a]atrim=%.4f:%.4f,asetpts=PTS-STARTPTS,afade=t=in:d=0.03,afade=t=out:st=%.4f:d=0.03[a%d]"
                     % (a, b, i, a, b, max(0, d - 0.03), i))
        ins.append("[v%d][a%d]" % (i, i))
    grade = getattr(DA, "GRADE", "eq=contrast=1.05:saturation=1.07:gamma=1.03,colorbalance=rm=0.025:bm=-0.02:rh=0.01:bh=-0.015")
    fg = (";".join(parts) + ";" + "".join(ins) + "concat=n=%d:v=1:a=1[vc][ac];" % len(E.KEEP) +
          "[vc]setpts=PTS/%.3f,fps=%d,scale=%d:%d:flags=lanczos,%s,format=yuv420p[v];[ac]atempo=%.3f[a]" % (SPEED, FPS, W, H, grade, SPEED))
    (WORK / "fg.txt").write_text(fg, encoding="utf-8")
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", E.SRC, "-filter_complex_script", str(WORK / "fg.txt"), "-map", "[v]", "-map", "[a]",
                    "-c:v", "libx264", "-crf", "10", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "pcm_s16le", "-ar", "48000", str(out)], check=True)

# ------------------------------------------------------------------ icon + chu
_ic = {}
def icon_img(name, size, col=BLACK):
    key = (name, int(size), col)
    if key not in _ic:
        a = Image.open(ICON_DIR / (name + ".png")).convert("RGBA").getchannel("A").resize((int(size), int(size)), Image.LANCZOS)
        im = Image.new("RGBA", (int(size), int(size)), col + (255,)); im.putalpha(a)
        if len(_ic) > 200: _ic.clear()
        _ic[key] = im
    return _ic[key]

def coin_ic(name, r, th=0.0, face=YEL, edge=GOLD, col=BLACK):
    r = max(float(r), 8.0)
    return F3.coin(r, th, face, edge, icon_img(name, int(r * 1.15), col))

_pl = {}
def pill2(txt, sz=46):
    key = (txt, sz)
    if key not in _pl:
        f = fit_font(BOLD, sz, txt, s(1200)); d0 = ImageDraw.Draw(Image.new("RGBA", (4, 4))); l, t, r, b = d0.textbbox((0, 0), txt, font=f)
        im = Image.new("RGBA", (int(r - l + s(72)), int(b - t + s(40))), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
        d.rounded_rectangle([0, 0, im.width - 1, im.height - 1], radius=im.height // 2, fill=YEL + (255,))
        d.text((s(36) - l, s(20) - t), txt, font=f, fill=BLACK + (255,))
        _pl[key] = im
    return _pl[key]

def tieu_de(cv, title, icon, t):
    a = e_io(t / 0.35)
    x = s(58)
    if icon:
        put(cv, coin_ic(icon, s(48), 0.25 * math.sin(t * 1.5)), s(100), s(96), a=a); x = s(166)
    text(cv, title, fit_font(SERIF, 72, title, s(1120)), x, s(96), WHITE, a=a, anchor="lm")

def ve_note(cv, txt, lt):
    if not txt: return
    p = e_back(lt / 0.3); a = clamp(lt / 0.15)
    put(cv, pill2(txt), CARD_X + CARD_W / 2, s(985) + (1 - p) * s(26), a=a)

def xep_chu(plan):
    """Chu reel co san -> thu nho 72%, xep thanh khoi ben trai / ben phai nguoi noi."""
    SC = 0.72
    for c in plan:
        rows, y = [], 0
        for li, (L, _, _) in enumerate(c["lines"]):
            im = L["img"]; L["img"] = im.resize((max(1, int(im.width * SC)), max(1, int(im.height * SC))), Image.LANCZOS)
            for k in ("pad", "th", "w", "boxpad"): L[k] = L[k] * SC
            dx = (li % 2) * s(34) - (li // 2) * s(14)
            rows.append((L, dx, y + L["boxpad"])); y += int(L["th"] + s(8) + 2 * L["boxpad"])
        bw = max(L["w"] + dx for L, dx, _ in rows)
        cx = s(330) if c["ci"] % 2 == 0 else s(1590)
        x0 = clamp(cx - bw / 2, s(40), W - bw - s(40)); y0 = s(1040) - y
        c["lines"] = [(L, x0 + dx, y0 + yy) for L, dx, yy in rows]
        c["box"] = (x0, y0, bw)

# ------------------------------------------------------------------ man hinh: anh chup + zoom dung cho dang noi
class Man:
    layout = "man"
    def __init__(self, img, title, a, b, keys, icon=None, blur=()):
        self.a, self.b, self.title, self.icon, self.keys = a, b, title, icon, keys
        im = Image.open(BROLL_DIR / img).convert("RGB")
        for (x0, y0, x1, y1) in blur:                 # che thong tin rieng ngay tren anh goc
            box = (int(x0), int(y0), int(min(x1, im.width)), int(min(y1, im.height)))
            r = im.crop(box).resize((max(1, (box[2] - box[0]) // 24), max(1, (box[3] - box[1]) // 24)), Image.BILINEAR)
            im.paste(r.resize((box[2] - box[0], box[3] - box[1]), Image.BILINEAR).filter(ImageFilter.GaussianBlur(10)), box[:2])
        self.img = im; self.tk = []
    def rect(self, cx, cy, wd):
        wd = min(wd, self.img.width); hg = wd / ASP
        if hg > self.img.height: hg = self.img.height; wd = hg * ASP
        x0 = clamp(cx - wd / 2, 0, self.img.width - wd); y0 = clamp(cy - hg / 2, 0, self.img.height - hg)
        return (x0, y0, x0 + wd, y0 + hg)
    def bind(self, cst, t0, t1):
        self.t0, self.t1 = t0, t1
        self.tk = [(max(t0, cst[k[0]] - 0.1) - t0, self.rect(k[1], k[2], k[3]), k[4] if len(k) > 4 else "", k[5] if len(k) > 5 else None) for k in self.keys]
    def sfx(self):
        ev = [(0.0, "whoosh", 0.05)]
        for i, (tk, _, note, ring) in enumerate(self.tk):
            if i: ev.append((tk, "swish", 0.04))
            if ring: ev.append((tk + 0.65, "pop", 0.05))
            if note: ev.append((tk + 0.12, "pop_soft", 0.04))
        return ev
    def draw(self, cv, t):
        i = max([j for j, k in enumerate(self.tk) if k[0] <= t] or [0])
        tk, rc, note, ring = self.tk[i]
        if i:
            u = e_io((t - tk) / 0.7); p = self.tk[i - 1][1]; rc2 = tuple(lerp(a, b, u) for a, b in zip(p, rc))
        else: u = 1.0; rc2 = rc
        tr = max(0.0, t - tk - 0.7) * 0.006                # troi rat cham de anh khong dung
        w_, h_ = rc2[2] - rc2[0], rc2[3] - rc2[1]
        rc2 = (rc2[0] + w_ * tr, rc2[1] + h_ * tr, rc2[2] - w_ * tr, rc2[3] - h_ * tr)
        cr = self.img.transform((CARD_W, CARD_H), Image.EXTENT, rc2, Image.BICUBIC).filter(ImageFilter.UnsharpMask(1.2, 45, 2)).convert("RGBA")
        if ring and u >= 0.8:
            sx, sy = CARD_W / (rc2[2] - rc2[0]), CARD_H / (rc2[3] - rc2[1])
            q = e_back((t - tk - 0.55) / 0.3); pad = s(14) * (2 - q)
            bx = [(ring[0] - rc2[0]) * sx - pad, (ring[1] - rc2[1]) * sy - pad, (ring[2] - rc2[0]) * sx + pad, (ring[3] - rc2[1]) * sy + pad]
            dim = Image.new("L", (CARD_W, CARD_H), int(120 * clamp((t - tk - 0.55) / 0.25)))
            ImageDraw.Draw(dim).rounded_rectangle(bx, radius=s(16), fill=0)
            sh = Image.new("RGBA", (CARD_W, CARD_H), (0, 0, 0, 255)); sh.putalpha(dim); cr.alpha_composite(sh)
            ImageDraw.Draw(cr).rounded_rectangle(bx, radius=s(16), outline=YEL + (255,), width=s(6))
        cr.putalpha(E.rounded_mask(CARD_W, CARD_H, s(30)))
        lt = t
        ox = -(1 - e_out(lt / 0.38)) * s(1450)
        fr_ = Image.new("RGBA", (CARD_W + s(12), CARD_H + s(12)), (0, 0, 0, 0))
        ImageDraw.Draw(fr_).rounded_rectangle([0, 0, fr_.width - 1, fr_.height - 1], radius=s(36), fill=YEL + (255,))
        fr_.alpha_composite(cr, (s(6), s(6)))
        cv.alpha_composite(BONG, (int(CARD_X - s(40) + ox), int(CARD_Y + CARD_H - s(30))))
        cv.alpha_composite(fr_, (int(CARD_X - s(6) + ox), CARD_Y - s(6)))
        tieu_de(cv, self.title, self.icon, t)
        ve_note(cv, note, t - tk - 0.1)

# ------------------------------------------------------------------ do hoa ngang (ve ben trai, nguoi o ben phai)
class G:
    layout = "g"
    def __init__(self, a, b): self.a, self.b, self.tk = a, b, {}
    def bind(self, cst, t0, t1):
        self.t0, self.t1 = t0, t1
        self.at = lambda ci: cst[ci] - t0

class GVS(G):                                         # hai AI: Claude vs ChatGPT, Claude thang
    def __init__(self, a, b, r_ci, code_ci, win_ci):
        super().__init__(a, b); self.r_ci, self.code_ci, self.win_ci = r_ci, code_ci, win_ci
    def sfx(self):
        return [(0.0, "whoosh", 0.05), (0.2, "pop", 0.06), (self.at(self.r_ci), "pop", 0.06), (self.at(self.code_ci), "pop_soft", 0.05),
                (self.at(self.win_ci), "ding", 0.09), (self.at(self.win_ci), "thud", 0.08)]
    def draw(self, cv, t):
        tieu_de(cv, "Chọn AI nào để edit video?", None, t)
        tr, tc, tw = self.at(self.r_ci), self.at(self.code_ci), self.at(self.win_ci)
        win = e_back((t - tw) / 0.35) if t > tw else 0
        p = e_back((t - 0.15) / 0.4)
        y = s(500)
        cv.alpha_composite(F3.soft_shadow(s(340), s(60), 110, s(18)), (s(180), s(700)))
        put(cv, coin_ic("claude", s(170) * (1 + 0.1 * win), 0.3 * math.sin(t * 1.6)), s(380), y + s(10) * math.sin(t * 2.2), sc=max(0.05, p))
        text(cv, "Claude", BLK(70), s(380), s(790), WHITE, a=clamp((t - 0.25) * 4))
        q = e_back((t - tr) / 0.4)
        if t > tr:
            put(cv, coin_ic("openai", s(150), 0.3 * math.sin(t * 1.4 + 1), WHITE, SILV), s(1010), y, sc=max(0.05, q), a=1 - 0.5 * clamp(win))
            text(cv, "ChatGPT", BLK(62), s(1010), s(790), WHITE, a=clamp((t - tr) * 4) * (1 - 0.5 * clamp(win)))
            put3(cv, t3d("VS", BLK(96), WHITE, 14), s(695), y, sc=max(0.1, e_back((t - tr - 0.2) / 0.3)), a=clamp((t - tr - 0.2) * 5))
        if t > tc:
            text(cv, "cài thêm Codex", SERIF(54), s(1010), s(862), WHITE, a=e_io((t - tc) / 0.3) * (1 - 0.5 * clamp(win)))
        if t > tw:
            put3(cv, t3d("TỐT NHẤT", BLK(84), YEL, 14), s(380), s(275), 0.6 + 0.4 * win, clamp((t - tw) * 5), ay=-6)
            dr = ImageDraw.Draw(cv)
            for i, (dx, dy) in enumerate(((-230, -60), (230, -90), (-190, 170), (210, 150))):
                r = s(22) * e_back((t - tw - i * 0.05) / 0.3) * (0.7 + 0.3 * math.sin(t * 6 + i))
                if r > 0: E.star(dr, s(380 + dx), y + s(dy), r)

class GSTEPS(G):                                      # hang coin icon noi nhau bang mui ten, bat ra dung luc noi
    def __init__(self, a, b, steps, title, notes=()):
        super().__init__(a, b); self.steps, self.title, self.notes = steps, title, list(notes)
    def sfx(self):
        ev = [(0.0, "whoosh", 0.05)]
        for _, _, ci in self.steps: ev += [(max(0.15, self.at(ci)), "pop", 0.06)]
        return ev + [(self.at(self.steps[-1][2]) + 0.1, "ding", 0.08)]
    def draw(self, cv, t):
        tieu_de(cv, self.title, None, t)
        n = len(self.steps); xs = [s(190) + i * s(1020) / (n - 1) for i in range(n)]; y = s(450)
        dr = ImageDraw.Draw(cv)
        for i, (ic, lab, ci) in enumerate(self.steps):
            ti = max(0.15, self.at(ci)); p = e_back((t - ti) / 0.35)
            if t < ti: continue
            if i:
                u = e_out((t - ti) / 0.25); x0, x1 = xs[i - 1] + s(128), xs[i] - s(128); xe = lerp(x0, x1, u)
                dr.line([(x0, y), (xe, y)], fill=WHITE + (255,), width=s(8))
                dr.polygon([(xe, y - s(20)), (xe + s(30), y), (xe, y + s(20))], fill=WHITE + (255,))
            cv.alpha_composite(F3.soft_shadow(s(190), s(36), 110, s(14)), (int(xs[i] - s(123)), s(590)))
            put(cv, coin_ic(ic, s(105), 0.28 * math.sin(t * 1.6 + i)), xs[i], y + s(8) * math.sin(t * 2.2 + i), sc=max(0.05, p))
            text(cv, lab, fit_font(BLK, 46, lab, s(310)), xs[i], s(680), WHITE, a=clamp((t - ti - 0.1) * 5))
            text(cv, str(i + 1), BLK(34), xs[i], s(300), YEL, a=clamp((t - ti) * 5))
        note = None
        for ci, tx in self.notes:
            if t >= self.at(ci): note = (ci, tx)
        if note: ve_note(cv, note[1], t - self.at(note[0]))

class GGRID(G):                                       # 4 o khoi 3D, o moi nhat sang vang
    def __init__(self, a, b, title, items):
        super().__init__(a, b); self.title, self.items = title, items; self._t = {}
    def tile(self, hl):
        if hl not in self._t:
            self._t[hl] = F3.block(s(590), s(280), s(26), YEL if hl else PANEL, s(20), GOLD if hl else PANEL_SIDE, outline=None if hl else YEL, ow=s(4))
        return self._t[hl]
    def sfx(self):
        return [(0.0, "whoosh", 0.05)] + [(max(0.2 + i * 0.2, self.at(ci)), "pop", 0.06) for i, (_, _, ci) in enumerate(self.items)]
    def draw(self, cv, t):
        tieu_de(cv, self.title, None, t)
        last = max([i for i, (_, _, ci) in enumerate(self.items) if t >= self.at(ci)] or [0])
        for i, (ic, lab, ci) in enumerate(self.items):
            ti = max(0.2 + i * 0.2, self.at(ci)); p = e_out((t - ti) / 0.35)
            if p <= 0: continue
            hl = i == last; col = BLACK if hl else WHITE
            bl = self.tile(hl).copy(); d_ = ImageDraw.Draw(bl)
            ico = icon_img(ic, s(110), col); bl.alpha_composite(ico, (int(bl.width / 2 - s(66)), s(50)))
            f = fit_font(BLK, 46, lab, s(540)); l, tt, r, b = d_.textbbox((0, 0), lab, font=f)
            d_.text((bl.width / 2 - s(11) - (r - l) / 2 - l, s(205) - (b - tt) / 2 - tt), lab, font=f, fill=col + (255,))
            cx, cy = s(372 + (i % 2) * 650), s(355 + (i // 2) * 345)
            put3(cv, bl, cx, cy, a=clamp(p * 2), ax=lerp(-70, 0, p) + (4 * math.sin(t * 2 + i) if p >= 1 else 0))

class GSOCIAL(G):                                     # ban full HD dang duoc moi nen tang
    def __init__(self, a, b, c1, c2, nets):
        super().__init__(a, b); self.c1, self.c2, self.nets = c1, c2, nets
    def sfx(self):
        t1 = self.at(self.c1)
        return [(0.0, "whoosh", 0.05), (0.2, "thud", 0.07)] + [(t1 + i * 0.16, "pop", 0.055) for i in range(len(self.nets))] + [(self.at(self.c2), "ding", 0.09)]
    def draw(self, cv, t):
        tieu_de(cv, "Bản final", None, t)
        put3(cv, t3d("FULL HD", BLK(150), YEL, 24), s(695), s(320), 0.6 + 0.4 * e_back((t - 0.15) / 0.35), clamp((t - 0.15) * 5), ay=6 * math.sin(t * 1.8))
        t1, t2 = self.at(self.c1), self.at(self.c2)
        n = len(self.nets)
        for i, (ic, lab) in enumerate(self.nets):
            ti = t1 + i * 0.16; p = e_back((t - ti) / 0.32)
            if t < ti: continue
            x = s(695 + (i - (n - 1) / 2) * 300)
            put(cv, coin_ic(ic, s(100), 0.3 * math.sin(t * 1.5 + i), WHITE, SILV), x, s(640) + s(8) * math.sin(t * 2.3 + i), sc=max(0.05, p))
            text(cv, lab, BOLD(38), x, s(780), WHITE, a=clamp((t - ti) * 5))
        if t > t2:
            ve_note(cv, "Chất lượng tốt nhất cho mọi nền tảng", t - t2)

class GCTA(G):                                        # lay link skill
    def __init__(self, a, b, c1, c2):
        super().__init__(a, b); self.c1, self.c2 = c1, c2
    def sfx(self):
        return [(0.0, "whoosh", 0.05), (0.25, "pop", 0.06), (self.at(self.c1), "notif", 0.06), (self.at(self.c2), "pop", 0.05)]
    def draw(self, cv, t):
        tieu_de(cv, "Muốn lấy skill này?", None, t)
        dr = ImageDraw.Draw(cv)
        put(cv, coin_ic("github", s(165), t * 1.1), s(310), s(500) + s(10) * math.sin(t * 2.2), sc=max(0.05, e_back((t - 0.15) / 0.4)))
        put3(cv, t3d("LINK GITHUB", BLK(92), YEL, 16), s(880), s(370), 0.6 + 0.4 * e_back((t - 0.2) / 0.35), clamp((t - 0.2) * 5), ay=-6)
        t1, t2 = self.at(self.c1), self.at(self.c2)
        if t > t1:
            text(cv, "ở phần mô tả", SERIF(82), s(880), s(540), WHITE, a=e_io((t - t1) / 0.35))
            yy = s(760) + s(16) * abs(math.sin(t * 4)); dr.polygon([(s(250), yy), (s(370), yy), (s(310), yy + s(70))], fill=YEL + (255,))
        if t > t2:
            text(cv, "hoặc nhắn tin cho mình", SERIF(70), s(880), s(680), YEL, a=e_io((t - t2) / 0.35))

def tao_vat():
    out = []
    for sp in DA.SCREENS: out.append(Man(**sp))
    for k, kw in DA.GFX: out.append(globals()[k](**kw))
    return sorted(out, key=lambda o: o.a)

def main():
    global BONG
    WORK.mkdir(exist_ok=True)
    cut = WORK / "cut.mov"
    if not cut.exists() and "--list" not in sys.argv: make_cut(cut)
    plan = E.manual_plan()
    if "--list" in sys.argv:
        for c in plan: print("  [%3d] %6.2f-%6.2f  %s" % (c["ci"], c["t0"], c["t1"], " / ".join(L["x"] for L, _, _ in c["lines"])))
        return
    xep_chu(plan)
    DUR = E.DUR
    cst = {c["ci"]: c["t0"] for c in plan}; cen = {c["ci"]: c["t1"] for c in plan}
    VAT = tao_vat()
    for o in VAT:
        t0 = max(0.0, round((cst[o.a] - 0.12) * FPS) / FPS); t1 = round(cen[o.b] * FPS) / FPS
        o.bind(cst, t0, t1)
    for a, b in zip(VAT, VAT[1:]): a.t1 = min(a.t1, b.t0)
    NHOM = []                                         # cac doan lien nhau: nguoi o nguyen ben phai, khong chay ra chay vao
    for o in VAT:
        if NHOM and o.t0 - NHOM[-1][1] < 1.0: NHOM[-1][1] = o.t1
        else: NHOM.append([o.t0, o.t1])
    print("%dx%d | %.2fs (x%.1f) | %d cum | %d man hinh/do hoa | %d nhom thu gon" % (W, H, DUR, SPEED, len(plan), len(VAT), len(NHOM)))
    for o in VAT: print("  %-8s cum %3d-%3d  %6.2f-%6.2f (%.1fs) %s" % (type(o).__name__, o.a, o.b, o.t0, o.t1, o.t1 - o.t0, getattr(o, "title", "")))
    DEMO = [(cst[a], cen[b]) for a, b in getattr(DA, "DEMO", [])]
    trong = lambda t: any(a - 0.02 <= t < b for a, b in DEMO)
    capplan = [c for c in plan if not any(o.t0 - 0.05 <= c["t0"] < o.t1 for o in VAT) and not trong(c["t0"])]
    for c in capplan:
        for o in VAT:
            if c["t0"] < o.t0 < c["t1"]: c["t1"] = o.t0
    BEHIND = dict(getattr(DA, "BEHIND_N", {})); DARK = set(getattr(DA, "DARK_N", ())); ICONS = dict(getattr(DA, "ICONS", {}))
    E.BEHIND.clear(); E.BEHIND.update(BEHIND)
    md = lambda ci: "behind" if ci in BEHIND else ("dark" if ci in DARK else "real")
    TRANS = [c["t0"] for i, c in enumerate(capplan) if i and md(c["ci"]) != md(capplan[i - 1]["ci"])]
    SFX = []
    for o in VAT: SFX += [(o.t0 + dt, k, a) for dt, k, a in o.sfx()]
    for m0, m1 in NHOM: SFX.append((m1 - 0.05, "whoosh_out", 0.035))
    for c in capplan:
        for L, x, y in c["lines"]:
            if L["kind"] == "bold": SFX.append((L["s"] - 0.03, "pop_soft", 0.04))
            elif L["kind"] == "thin": SFX.append((L["s"] + 0.25, "sparkle", 0.022))
        if c["ci"] in BEHIND: SFX += [(c["t0"] - 0.02, "swish", 0.05), (c["t0"] + 0.22, "thud", 0.09)]
    SFX += [(t, "swish", 0.03) for t in TRANS]
    SFX.sort()
    ev = sorted([c["t0"] for c in capplan] + [x for o in VAT for x in (o.t0, o.t1)] + [tk + o.t0 for o in VAT if isinstance(o, Man) for tk, *_ in o.tk] + [0, DUR] + [x for ab in DEMO for x in ab])
    gap = [(b - a, a) for a, b in zip(ev, ev[1:])]
    print("  khoang cach su kien lon nhat: %.2fs (luc %.1fs) | %d hieu ung am thanh | %d lan doi nen" % (max(gap)[0], max(gap)[1], len(SFX), len(TRANS)))
    meta = {"DUR": DUR, "SFX": SFX, "BAUDIO": [], "BR": []}
    if "--meta" in sys.argv:
        json.dump(meta, open(WORK / "meta.json", "w")); print("meta xong: %d tieng" % len(SFX)); return
    BONG = F3.soft_shadow(CARD_W, s(60), 130, s(26))
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    glow = np.clip(1 - np.sqrt(((xx - X_NHO) / (W * 0.42)) ** 2 + ((yy - H * 0.55) / (H * 0.8)) ** 2), 0, 1) ** 2
    bgh = np.zeros((H, W, 3), np.float32) + np.array(BLACK, np.float32) + glow[..., None] * np.array([58, 46, 10], np.float32)
    BGH = Image.fromarray(np.clip(bgh, 0, 255).astype(np.uint8)).convert("RGBA")
    shade = (1 - 0.6 * np.clip((np.arange(H, dtype=np.float32) - s(560)) / s(460), 0, 1) ** 1.2)[:, None, None]
    sk = Skin()
    png_at = float(sys.argv[sys.argv.index("--png") + 1]) if "--png" in sys.argv else None
    t_off = max(0, png_at - 0.6) if png_at is not None else 0.0
    ss = ["-ss", "%.3f" % t_off] if png_at is not None else []
    rd = subprocess.Popen(["ffmpeg", "-v", "error"] + ss + ["-i", str(cut), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE)
    wr = None
    if png_at is None:
        wr = subprocess.Popen(["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", "%dx%d" % (W, H), "-r", str(FPS), "-i", "-",
                               "-c:v", "libx264", "-crf", "21" if DRAFT else "14", "-preset", "veryfast" if DRAFT else "slow", "-tune", "film",
                               "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(WORK / "video.mp4")], stdin=subprocess.PIPE)
    prev = None; n = int(round(DUR * FPS)); fsz = W * H * 3
    def nhom_u(t):
        for m0, m1 in NHOM:
            if m0 <= t < m1: return e_io((t - m0) / 0.45) * (1 - e_io((t - (m1 - 0.38)) / 0.38))
        return 0.0
    def tach(fr):
        nonlocal prev
        m = E.matte(fr, prev); prev = m
        if m.shape != (H, W): m = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).resize((W, H), Image.BILINEAR), dtype=np.float32) / 255.0
        frf = np.asarray(fr, dtype=np.float32)
        if E.LAST_FGR is not None:
            wv = (m > 0.97)[..., None]; frf = E.LAST_FGR * (1 - wv) + frf * wv
        return m, frf
    for f in range(n):
        buf = rd.stdout.read(fsz)
        if len(buf) < fsz: break
        t = t_off + f / FPS
        if png_at is not None and t < png_at - 0.3 and not nhom_u(png_at): continue
        fr = Image.frombuffer("RGB", (W, H), buf)
        u = nhom_u(t)
        vat = next((o for o in VAT if o.t0 <= t < o.t1), None)
        if u > 0 or vat is not None:
            fr, _ = sk(fr, (0.28, 0.0, 0.72, 0.62))
            m, frf = tach(fr)
            sc = lerp(1.0, SC_NHO, u); X = lerp(XC * W, X_NHO, u)
            nguoi = Image.fromarray(np.dstack([np.clip(frf, 0, 255), m * 255]).astype(np.uint8), "RGBA")
            if sc < 0.999: nguoi = nguoi.resize((int(W * sc), int(H * sc)), Image.LANCZOS)
            canh = BGH.copy()
            if vat is not None: vat.draw(canh, t - vat.t0)
            if u < 0.999: canh = Image.blend(fr.convert("RGBA"), canh, clamp(u * 1.5))
            out = canh; out.alpha_composite(nguoi, (max(0, int(X - XC * W * sc)), H - nguoi.height) if sc < 0.999 else (0, 0))
        else:
            c_ = [c for c in plan if c["t0"] <= t]; c = c_[-1] if c_ else plan[0]; ci = c["ci"]
            demo = trong(t)
            if not demo: fr, _ = sk(fr, (0.28, 0.0, 0.72, 0.62))
            c0, c1 = cst.get(ci, 0), cen.get(ci, DUR); uc = clamp((t - c0) / max(0.3, c1 - c0))
            z = 1.0 if demo else ZOOMS[ci % len(ZOOMS)]; kz = ci % 3
            if not demo:
                if kz == 0: z += 0.03 * uc
                elif kz == 1: z += 0.05 * (1 - e_out((t - c0) / 0.30))
                else: z += 0.03 * (1 - uc)
            if z > 1.001:
                cw_, ch_ = W / z, H / z; x0 = (W - cw_) * XC; y0 = (H - ch_) * 0.30
                fr = fr.transform((W, H), Image.EXTENT, (x0, y0, x0 + cw_, y0 + ch_), Image.BICUBIC).filter(ImageFilter.UnsharpMask(2, 40, 2))
            mode = "real" if demo else md(ci)
            frf = np.asarray(fr, dtype=np.float32)
            if mode == "real":
                prev = None
                canvas = frf * (1.0 if demo else shade)
            else:
                mm, col = tach(fr); mf = mm[..., None]
                if mode == "dark": canvas = bgh * (1 - mf) + col * mf
                else:
                    lt = t - c0; big = E.behind_layer(BEHIND[ci]); p = e_back(lt / 0.32, 2.2)
                    jx = s(10) * math.sin(lt * 55) * math.exp(-lt * 7) if lt > 0.25 else 0
                    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
                    put(lay, big, W * XC + jx, s(300) - s(24) * uc, 0.66 + 0.38 * p + 0.06 * uc, clamp(lt / 0.12))
                    la = np.asarray(lay, dtype=np.float32); ta = la[..., 3:4] / 255.0
                    base = frf * shade; under = base * (1 - ta) + la[..., :3] * ta
                    canvas = under * (1 - mf) + base * mf
            out = Image.fromarray(np.clip(canvas, 0, 255).astype(np.uint8)).convert("RGBA")
            if not demo:
                E.draw_captions(out, capplan, t)
                if ci in ICONS and "box" in c:
                    x0, y0, bw = c["box"]; lt = t - c0
                    put(out, coin_ic(ICONS[ci], s(58), 0.3 * math.sin(t * 2)), x0 + bw / 2, y0 - s(84) + s(6) * math.sin(t * 3), sc=max(0.05, e_back(lt / 0.3)))
            tr = next((x for x in TRANS if 0 <= t - x < 0.067), None)
            if tr is not None: out.alpha_composite(Image.new("RGBA", (W, H), (255, 255, 255, 120)))
        res = out.convert("RGB")
        if png_at is not None:
            if abs(t - png_at) <= 0.6 / FPS: res.save(sys.argv[sys.argv.index("--png") + 2]); break
            continue
        wr.stdin.write(res.tobytes())
        if f % 150 == 0: print("  khung %d/%d" % (f, n), flush=True)
    rd.stdout.close(); rd.wait()
    if wr: wr.stdin.close(); wr.wait()
    json.dump(meta, open(WORK / "meta.json", "w"))
    print("hinh xong")

if __name__ == "__main__":
    main()
