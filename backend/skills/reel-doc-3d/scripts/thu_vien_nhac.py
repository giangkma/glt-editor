# -*- coding: utf-8 -*-
"""THU VIEN NHAC THEO LOAI VIDEO (them 09/11/2026).
Nguoi dung tha nhac vao 2 thu muc trong <skill>\\nhac\\:
  nhac_nen_voice\\   -> nhac cho video CO LOI thuyet minh (nam duoi giong, -15 dB)
  nhac_nen_chill\\   -> nhac cho video CHILL khong loi (montage cat theo nhip, tat tieng goc)
                       (chap nhan ca ten go nham "nhan_nen_chill")
Chay script nay -> moi file moi/doi duoc chuan bi (chuan_bi_nhac.py) + phan tich nhip (nhip_nhac.py),
ten bai = "<loai>-<ten file khong dau>", ghi danh sach vao nhac\\_thu_vien.json. File da xu ly thi bo qua.
   python thu_vien_nhac.py            quet + xu ly
   python thu_vien_nhac.py --list     chi in danh sach (JSON)
Nhac file .mp3/.wav/.m4a/.aac/.flac/.ogg hoac video .mp4/.mov (lay tieng)."""
import json, re, subprocess, sys, unicodedata
from pathlib import Path

HERE = Path(__file__).resolve().parent
NHAC = HERE.parent / "nhac"
MANIFEST = NHAC / "_thu_vien.json"
FOLDERS = {"voice": ["nhac_nen_voice"], "chill": ["nhac_nen_chill", "nhan_nen_chill"]}
EXT = {".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".opus", ".mp4", ".mov", ".m4v", ".webm", ".mkv"}
sys.stdout.reconfigure(encoding="utf-8")


def slug(s):
    s = unicodedata.normalize("NFKD", s.replace("đ", "d").replace("Đ", "D"))
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:40] or "bai"


def load_manifest():
    try: return json.load(open(MANIFEST, encoding="utf-8"))
    except Exception: return {"tracks": {}}


def summary(man):
    out = {"voice": [], "chill": []}
    for name, t in sorted(man["tracks"].items()):
        if (NHAC / (name + "_full.wav")).exists() and (NHAC / (name + "_grid.json")).exists():
            out.setdefault(t["cat"], []).append(name)
    return out


man = load_manifest()
if "--list" in sys.argv:
    print("THU_VIEN " + json.dumps(summary(man), ensure_ascii=False)); sys.exit()

# 1. Quet file trong cac thu muc loai
found = []
for cat, dirs in FOLDERS.items():
    for d in dirs:
        p = NHAC / d
        if not p.is_dir(): continue
        for f in sorted(p.iterdir()):
            if f.is_file() and f.suffix.lower() in EXT and not f.name.startswith("."):
                found.append((cat, f))

by_file = {t["file"]: n for n, t in man["tracks"].items()}
used = set(man["tracks"])
todo = []
for cat, f in found:
    rel = str(f.relative_to(NHAC))
    st = f.stat()
    name = by_file.get(rel)
    if name is None:
        base = "%s-%s" % (cat, slug(f.stem)); name = base; k = 2
        while name in used: name = "%s-%d" % (base, k); k += 1
        used.add(name)
    t = man["tracks"].get(name)
    fresh = t and t.get("size") == st.st_size and int(t.get("mtime", 0)) == int(st.st_mtime) and t.get("cat") == cat
    ready = (NHAC / (name + "_full.wav")).exists() and (NHAC / (name + "_grid.json")).exists() and (NHAC / (name + "_nhip.json")).exists()
    man["tracks"][name] = {"cat": cat, "file": rel, "size": st.st_size, "mtime": int(st.st_mtime)}
    if not (fresh and ready): todo.append((name, f))

# File da bi xoa khoi thu muc -> bo khoi danh sach (khong xoa wav da chuan bi)
present = {str(f.relative_to(NHAC)) for _, f in found}
for n in [n for n, t in man["tracks"].items() if t["file"] not in present]: del man["tracks"][n]

# 2. Chuan bi + phan tich nhip cho bai moi
bad = []
for i, (name, f) in enumerate(todo):
    print("  nhac %d/%d: %s" % (i + 1, len(todo), name), flush=True)
    r = subprocess.run([sys.executable, str(HERE / "chuan_bi_nhac.py"), str(f), name], capture_output=True, text=True)
    if r.returncode == 0:
        (NHAC / (name + "_nhip.json")).unlink(missing_ok=True)       # file nhac doi -> phan tich lai
        r = subprocess.run([sys.executable, str(HERE / "nhip_nhac.py"), name], capture_output=True, text=True)
    if r.returncode != 0:
        bad.append(name); del man["tracks"][name]
        print("!! loi bai %s: %s" % (name, (r.stderr or r.stdout).strip()[-200:]), flush=True)

json.dump(man, open(MANIFEST, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
s = summary(man)
print("xong: %d bai voice, %d bai chill (%d bai moi xu ly%s)" % (len(s["voice"]), len(s["chill"]), len(todo) - len(bad),
      ", %d loi" % len(bad) if bad else ""))
print("THU_VIEN " + json.dumps(s, ensure_ascii=False))
