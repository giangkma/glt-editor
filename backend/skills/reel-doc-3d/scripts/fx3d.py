# -*- coding: utf-8 -*-
"""Cong cu ve gia 3D bang PIL: dun khoi (extrude) cho chu/hinh, nghieng phoi canh (xoay quanh truc Y/X),
khoi hop bo goc co mat ben + bong loang, dong xu xoay, hop dang canh (isometric), bong do mem."""
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

def shade(c, k): return tuple(max(0, min(255, int(v * k))) for v in c[:3])

def gloss(img, top=0.35, strength=70):
    """Phu bong sang tren nua tren cua vat (giong mat nhua bong)."""
    a = img.getchannel("A")
    h = img.height
    g = np.clip(1 - np.arange(h, dtype=np.float32) / max(1, h * top), 0, 1)[:, None] * strength
    hl = Image.fromarray(np.broadcast_to(g, (h, img.width)).astype(np.uint8))
    white = Image.new("RGBA", img.size, (255, 255, 255, 0))
    white.putalpha(Image.fromarray(np.minimum(np.asarray(a, np.float32), np.asarray(hl, np.float32)).astype(np.uint8)))
    out = img.copy(); out.alpha_composite(white); return out

def extrude(face, depth, side, dx=0.35, dy=1.0, shadow=True, gl=True):
    """face: RGBA mat truoc. Dun khoi ra sau-xuong bang cac lop bong mau 'side' (toi dan). Tra RGBA moi (them le)."""
    depth = max(1, int(depth))
    pad = depth + 8
    W_, H_ = face.width + pad * 2 + int(depth * abs(dx)), face.height + pad * 2 + int(depth * dy) + depth
    out = Image.new("RGBA", (W_, H_), (0, 0, 0, 0))
    a = face.getchannel("A")
    ox, oy = pad, pad
    if shadow:
        sh = Image.new("RGBA", face.size, (0, 0, 0, 255)); sh.putalpha(a.point(lambda v: int(v * 0.55)))
        sh = sh.filter(ImageFilter.GaussianBlur(max(2, depth * 0.8)))
        out.alpha_composite(sh, (int(ox + depth * dx * 1.2), int(oy + depth * dy * 1.6)))
    dark = None
    if side is None:                                   # mat ben = chinh mau mat truoc lam toi (vat nhieu mau)
        dark = face.convert("RGB").point(lambda v: int(v * 0.5)).convert("RGBA"); dark.putalpha(a)
    for i in range(depth, 0, -1):
        k = 0.55 + 0.25 * (1 - i / depth)
        if dark is not None: lay = dark
        else: lay = Image.new("RGBA", face.size, shade(side, k) + (255,)); lay.putalpha(a)
        out.alpha_composite(lay, (int(ox + i * dx), int(oy + i * dy)))
    out.alpha_composite(gloss(face) if gl else face, (ox, oy))
    return out

def _coeffs(pa, pb):
    m = []
    for p1, p2 in zip(pa, pb):
        m.append([p1[0], p1[1], 1, 0, 0, 0, -p2[0] * p1[0], -p2[0] * p1[1]])
        m.append([0, 0, 0, p1[0], p1[1], 1, -p2[1] * p1[0], -p2[1] * p1[1]])
    return np.linalg.solve(np.array(m, float), np.array(pb, float).reshape(8))

def tilt(img, ay=0.0, ax=0.0, persp=2.2, scale=1.0):
    """Xoay anh phang quanh truc Y (ay, do) va X (ax, do) roi chieu phoi canh. Tra RGBA (cung tam)."""
    w, h = img.size
    f = max(w, h) * persp
    ry, rx = math.radians(ay), math.radians(ax)
    pts = []
    for x, y in ((-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)):
        x1, z1 = x * math.cos(ry), x * math.sin(ry)
        y2, z2 = y * math.cos(rx) - z1 * math.sin(rx), y * math.sin(rx) + z1 * math.cos(rx)
        k = f / (f + z2) * scale
        pts.append((x1 * k, y2 * k))
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    ow, oh = int(max(xs) - min(xs)) + 4, int(max(ys) - min(ys)) + 4
    cx, cy = -min(xs) + 2, -min(ys) + 2
    pa = [(p[0] + cx, p[1] + cy) for p in pts]
    pb = [(0, 0), (w, 0), (w, h), (0, h)]
    out = img.transform((ow, oh), Image.PERSPECTIVE, tuple(_coeffs(pa, pb)), Image.BICUBIC)
    # giu tam: lech tam do phoi canh
    out.info["center"] = (cx + 0.0, cy + 0.0)
    return out

def block(w, h, r, face, depth, side=None, outline=None, ow=0):
    """Khoi bo goc co mat ben day (nhin hoi tu tren xuong) + bong sang mat tren."""
    side = side or shade(face, 0.6)
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, w - 1, h - 1], radius=r, fill=face + (255,), outline=(outline + (255,)) if outline else None, width=ow)
    return extrude(im, depth, side, dx=0.0, dy=1.0)

def coin(r, theta, face, edge, label_img=None, thick=None):
    """Dong xu xoay quanh truc doc: be ngang = |cos theta|, co mep day."""
    r = max(float(r), 6.0)
    thick = thick or max(4, int(r * 0.22))
    c = abs(math.cos(theta)); w = max(2, int(2 * r * c))
    im = Image.new("RGBA", (int(2 * r + thick + 8), int(2 * r + 8)), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    cx, cy = im.width / 2, im.height / 2
    sgn = 1 if math.sin(theta) >= 0 else -1
    for i in range(thick, 0, -1):                       # mep
        off = sgn * i * (1 - c) * 0.9 + sgn * i * 0.1
        d.ellipse([cx - w / 2 + off, cy - r, cx + w / 2 + off, cy + r], fill=shade(edge, 0.7 + 0.3 * i / thick) + (255,))
    d.ellipse([cx - w / 2, cy - r, cx + w / 2, cy + r], fill=face + (255,))
    d.ellipse([cx - w / 2 + r * 0.12 * c, cy - r * 0.88, cx + w / 2 - r * 0.12 * c, cy + r * 0.88], outline=shade(face, 0.8) + (255,), width=max(2, int(r * 0.05)))
    if label_img is not None and c > 0.15 and label_img.width > 2 and label_img.height > 2:
        li = label_img.resize((max(1, int(label_img.width * c)), label_img.height), Image.BILINEAR)
        im.alpha_composite(li, (int(cx - li.width / 2), int(cy - li.height / 2)))
    return gloss(im, 0.45, 60)

def iso_box(sz, top, left, right, h_ratio=0.9):
    """Hop vuong dang canh (isometric): tra RGBA va cac dinh mat tren de ve no/day."""
    w = sz * 0.87
    hh = sz * h_ratio
    im = Image.new("RGBA", (int(2 * w + 8), int(sz + hh + 8)), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    cx, cy = im.width / 2, sz / 2 + 4
    T = [(cx, cy - sz / 2), (cx + w, cy), (cx, cy + sz / 2), (cx - w, cy)]
    L = [(cx - w, cy), (cx, cy + sz / 2), (cx, cy + sz / 2 + hh), (cx - w, cy + hh)]
    R = [(cx, cy + sz / 2), (cx + w, cy), (cx + w, cy + hh), (cx, cy + sz / 2 + hh)]
    d.polygon(L, fill=left + (255,)); d.polygon(R, fill=right + (255,)); d.polygon(T, fill=top + (255,))
    return im, (cx, cy, w, sz, hh)

def soft_shadow(w, h, a=110, blur=18):
    im = Image.new("RGBA", (int(w + blur * 4), int(h + blur * 4)), (0, 0, 0, 0))
    ImageDraw.Draw(im).ellipse([blur * 2, blur * 2, blur * 2 + w, blur * 2 + h], fill=(0, 0, 0, a))
    return im.filter(ImageFilter.GaussianBlur(blur))
