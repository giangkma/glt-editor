# -*- coding: utf-8 -*-
"""Lam min da + sang da nhe cho tung khung (numpy thuan, khong can cv2).
Mau da hoc tu khung dau (seed nguong chat giong photo-retouch/retouch.py), mat na tinh o nua do phan giai,
lam min bang guided filter tu dan (giu canh mat/mat/long may), phan chenh lech phong len roi cong vao anh goc
-> da min ma van giu chi tiet nho cua ban goc."""
import numpy as np
from PIL import Image

def box(x, r):
    h, w = x.shape
    c = np.cumsum(np.cumsum(np.pad(x, ((1, 0), (1, 0))), 0), 1)
    y0 = np.clip(np.arange(h) - r, 0, h); y1 = np.clip(np.arange(h) + r + 1, 0, h)
    x0 = np.clip(np.arange(w) - r, 0, w); x1 = np.clip(np.arange(w) + r + 1, 0, w)
    sm = c[y1][:, x1] - c[y0][:, x1] - c[y1][:, x0] + c[y0][:, x0]
    return sm / ((y1 - y0)[:, None] * (x1 - x0)[None, :])

def guided(I, p, r, eps):
    mI, mP = box(I, r), box(p, r)
    a = (box(I * p, r) - mI * mP) / (box(I * I, r) - mI * mI + eps)
    b = mP - a * mI
    return box(a, r) * I + box(b, r)

def ycc(h):
    R, G, B = h[..., 0], h[..., 1], h[..., 2]
    Y = 0.299 * R + 0.587 * G + 0.114 * B
    return Y, (R - Y) * 0.713 + 128, (B - Y) * 0.564 + 128

class Skin:
    def __init__(self, smooth=0.75, lift=6.0):
        self.mu = None; self.smooth = smooth; self.lift = lift
    def learn(self, h):
        R, G, B = h[..., 0], h[..., 1], h[..., 2]
        Y, Cr, Cb = ycc(h)
        seed = (Cr > 146) & (Cr < 173) & (Cb > 96) & (Cb < 127) & (Y > 55) & (Y < 235) & (R > G + 20) & (G > B + 6)
        if seed.sum() > 500: self.mu = (float(np.median(Cr[seed])), float(np.median(Cb[seed])))
        else: self.mu = (154.0, 112.0)
    def mask(self, h):
        R, G, B = h[..., 0], h[..., 1], h[..., 2]
        Y, Cr, Cb = ycc(h)
        m = np.exp(-((Cr - self.mu[0]) / 13.0) ** 2 - ((Cb - self.mu[1]) / 14.0) ** 2)
        m *= np.clip((Cr - (self.mu[0] - 11)) / 5.0, 0, 1)          # chan go/rem mau nau (Cr thap hon da)
        m *= np.clip((R - G) / 10.0, 0, 1) * np.clip((Y - 40) / 25.0, 0, 1)
        g = Y / 255.0
        return np.clip(guided(g, m.astype(np.float32), 6, 1e-4), 0, 1)
    def __call__(self, img, region=(0.08, 0.0, 0.92, 0.60)):
        """img: PIL RGB -> PIL RGB da lam min (chi xu ly vung mat 'region' cho nhanh)"""
        W, H = img.size
        bx = (int(W * region[0]) // 4 * 4, int(H * region[1]) // 4 * 4, int(W * region[2]) // 4 * 4, int(H * region[3]) // 4 * 4)
        crop = img.crop(bx)
        h = np.asarray(crop.reduce(2), dtype=np.float32)
        if self.mu is None: self.learn(h)
        m = self.mask(h)
        r = max(4, int(W / 2 / 110))
        sm = np.stack([guided(h[..., c] / 255.0, h[..., c] / 255.0, r, 0.0016) * 255.0 for c in range(3)], -1)
        d = (sm - h) * (m[..., None] * self.smooth) + m[..., None] * self.lift
        cw, ch = crop.size
        up = np.stack([np.asarray(Image.fromarray(np.ascontiguousarray(d[..., c])).resize((cw, ch), Image.BILINEAR)) for c in range(3)], -1)
        out = Image.fromarray(np.clip(np.asarray(crop, dtype=np.float32) + up, 0, 255).astype(np.uint8))
        res = img.copy(); res.paste(out, bx[:2])
        return res, m
