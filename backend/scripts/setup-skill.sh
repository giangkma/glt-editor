#!/usr/bin/env bash
# Cài môi trường cho skill reel-doc-3d trên Mac / Linux (bản tương đương cai-dat.ps1 của Windows).
#   npm run skill:setup            (hoặc: bash scripts/setup-skill.sh skills/<tên skill>)
# Cần sẵn: Python 3.10–3.12 và ffmpeg  →  brew install python@3.12 ffmpeg
set -euo pipefail
DIR="$(cd "${1:-skills/reel-doc-3d}" && pwd)"
echo "Skill: $DIR"

# 1. Chọn Python 3.10–3.12 (thư viện tách phông/gỡ băng chưa ổn với bản mới hơn)
PY=""
for c in python3.12 python3.11 python3.10 python3; do
  if command -v "$c" >/dev/null 2>&1; then
    v=$("$c" -c 'import sys; print("%d.%d" % sys.version_info[:2])')
    case "$v" in 3.10|3.11|3.12) PY="$c"; break ;; esac
  fi
done
if [ -z "$PY" ]; then
  echo "!! Cần Python 3.10, 3.11 hoặc 3.12. Trên Mac: brew install python@3.12"; exit 1
fi
command -v ffmpeg >/dev/null || { echo "!! Chưa có ffmpeg. Trên Mac: brew install ffmpeg"; exit 1; }
echo "1/5 Python: $($PY --version) · $(ffmpeg -version | head -1)"

echo "2/5 Tạo môi trường riêng (venv) trong thư mục skill..."
[ -x "$DIR/venv/bin/python" ] || "$PY" -m venv "$DIR/venv"
VPY="$DIR/venv/bin/python"

echo "3/5 Cài thư viện (vài phút)..."
"$VPY" -m pip install --upgrade pip -q
"$VPY" -m pip install -r "$DIR/requirements.txt"
# faster-whisper (đến 1.2.x) vẫn gọi av.open(..., metadata_errors=...) — PyAV mới đã bỏ tham số này
# → lỗi "open() got an unexpected keyword argument 'metadata_errors'" khi gỡ băng. Ghim PyAV bản cũ.
"$VPY" -m pip install "av>=11,<14" -q
echo "    tải mô hình tách người dự phòng u2net (~170 MB, 1 lần)..."
"$VPY" -c "from rembg import new_session; new_session('u2net_human_seg'); print('    ok')"

echo "4/5 Tải font Inter Tight + Playfair Display (Google Fonts, SIL Open Font License)..."
mkdir -p "$DIR/fonts"
GF="https://raw.githubusercontent.com/google/fonts/main/ofl"
dl() { [ -s "$DIR/fonts/$1" ] || curl -fL --retry 3 -o "$DIR/fonts/$1" "$2"; }
dl "InterTight-VF.ttf"             "$GF/intertight/InterTight%5Bwght%5D.ttf"
dl "InterTight-Italic-VF.ttf"      "$GF/intertight/InterTight-Italic%5Bwght%5D.ttf"
dl "PlayfairDisplay-Italic-VF.ttf" "$GF/playfairdisplay/PlayfairDisplay-Italic%5Bwght%5D.ttf"
dl "OFL-InterTight.txt"            "$GF/intertight/OFL.txt"
dl "OFL-PlayfairDisplay.txt"       "$GF/playfairdisplay/OFL.txt"

# DT Phudu (Dương Trần, SIL OFL) — font phụ đề mặc định. Thử lần lượt nhiều nguồn, kiểm tra đúng file font.
is_font() { [ -s "$1" ] && head -c 4 "$1" | od -An -tx1 | tr -d ' \n' | grep -qE '^(00010000|74727565|4f54544f)$'; }
PHUDU="$DIR/fonts/Phudu-VF.ttf"
if ! is_font "$PHUDU"; then
  for u in "$GF/phudu/Phudu%5Bwght%5D.ttf" \
           "https://github.com/duongtrtype/DTPhudu/raw/main/fonts/variable/Phudu%5Bwght%5D.ttf"; do
    curl -fsSL --retry 2 -o "$PHUDU" "$u" 2>/dev/null && is_font "$PHUDU" && break
  done
fi
if ! is_font "$PHUDU"; then
  # Google Fonts API: client "lạ" được trả file .ttf (bản biến thiên 300–900)
  u=$(curl -fsSL -A "curl/8" "https://fonts.googleapis.com/css2?family=Phudu:wght@300..900" | grep -oE 'https://fonts.gstatic.com/[^)]+\.ttf' | head -1)
  [ -n "$u" ] && curl -fsSL -o "$PHUDU" "$u"
fi
if is_font "$PHUDU"; then echo "    Phudu: ok"; else rm -f "$PHUDU"; echo "!! Không tải được font Phudu — tải tay ở fonts.google.com/specimen/Phudu, đặt file thành $PHUDU"; fi

echo "5/5 Tải mô hình tách người RobustVideoMatting (~117 MB, GPL-3.0, tác giả PeterL1n)..."
mkdir -p "$DIR/models"
for n in rvm_resnet50_fp32.onnx rvm_mobilenetv3_fp32.onnx; do
  [ -s "$DIR/models/$n" ] || curl -fL --retry 3 -o "$DIR/models/$n" "https://github.com/PeterL1n/RobustVideoMatting/releases/download/v1.0.0/$n"
done

echo ""
echo "XONG. Python của skill: $VPY"
echo "Lần gỡ băng đầu tiên sẽ tự tải mô hình Whisper (~1.5 GB)."
