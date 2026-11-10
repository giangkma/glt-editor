# -*- coding: utf-8 -*-
"""TEP CAU HINH MAU cho VIDEO NGANG kieu huong dan (ngang_engine.py). Copy vao thu muc du an, doi ten thanh du_an.py.
Thu muc du an can co: tj.json (go_bang.py), broll\\ (anh chup man hinh), icons\\ (icon PNG nen trong suot, xem doi_icon_png.py).
Chay:  python ngang_engine.py --du-an <du an> --draft --list   -> in so cum de gan zoom
       python ngang_engine.py --du-an <du an> [--draft]        -> dung hinh
       python mix_engine.py   --du-an <du an> [--draft]        -> ghep tieng, xuat file"""

SRC = r"D:\video\huong-dan.mp4"     # video nguon quay NGANG
SPEED = 1.1                         # luon tang toc: noi nhanh 1.1, noi cham 1.2
OUT_RES = (1080, 1920)              # GIU NGUYEN dong nay: la he so ve cua engine, ban ra van la 1920x1080 ngang
MUSIC = ["chill"]                   # ten nhac da chuan bi bang chuan_bi_nhac.py
OUT_NAME = "huong_dan"
BROLL = []                          # video ngang khong dung BROLL, dung SCREENS + GFX ben duoi
BROLL_DIR = r"D:\reel\huong-dan\broll"
ICON_DIR = r"D:\reel\huong-dan\icons"

WRANGES = [(0, 40), (46, 120)]      # doan giu theo so thu tu tu (liet_ke.py)

# Cum co chu nhu reel doc. "_|n" = n tu thuoc doan man hinh/do hoa (an phu de), chia nho de lay moc zoom dung luc noi.
MANUAL = [
    ["Hôm nay mình sẽ", "hướng dẫn", "*edit bằng AI"],                         # 0
    ["_|12"],                                                                   # 1 man hinh
    ["_|10"],                                                                   # 2 man hinh
    # ...
]

DEMO = []                           # [(cum dau, cum cuoi)] doan chia man hinh co san trong nguon: khong chu, khong zoom

# SCREENS: anh chup man hinh. keys = (cum, tam x, tam y, be rong vung xem, "nhan chu", (khung vang x0,y0,x1,y1)) theo TOA DO ANH GOC.
# blur = cac vung lam mo truoc khi dung: LUON che lich su chat, bookmark, ten khach hang, thong tin rieng.
SCREENS = [
    {"img": "buoc1.png", "title": "Bước 1 · Mở ứng dụng", "icon": "claude", "a": 1, "b": 2, "blur": [(0, 0, 300, 1080)], "keys": [
        (1, 960, 540, 1800, "Mở ứng dụng lên"),
        (2, 1640, 110, 560, "Bấm nút này", (1700, 6, 1775, 38))]},
]

# GFX: do hoa ngang. GVS (2 AI), GSTEPS (hang buoc), GGRID (4 o), GSOCIAL (nen tang), GCTA (keu goi lay link).
GFX = [
    # ("GSTEPS", {"a": 5, "b": 9, "title": "Tóm lại 3 bước", "steps": [("video", "Quay", 5), ("capcut", "Cắt", 6), ("check", "Xong", 8)], "notes": [(7, "Ghi chú")]}),
]

BEHIND_N = {0: "AI"}                # {so cum: "TU NGAN"} chu to sau dau
DARK_N = set()                      # {so cum} xoa phong nen toi
ICONS = {}                          # {so cum: "ten icon"} dong xu icon canh chu
