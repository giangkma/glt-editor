#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  VIDEO AI — CÀI ĐẶT LẦN ĐẦU cho máy chưa có gì (macOS, hoặc Linux Ubuntu/Debian)
#
#    ./setup.sh            cài mọi thứ, hỏi API key, xong có thể chạy luôn
#    ./setup.sh --yes      không hỏi gì (bỏ qua API key, tải sẵn mô hình giọng nói)
#
#  Cài: Homebrew (Mac) · Node.js · Python 3.12 · FFmpeg bản đủ tính năng · git
#       → thư viện backend + frontend → môi trường Python của skill (font, mô hình tách người)
#       → file cấu hình .env → (tuỳ chọn) mô hình nhận giọng nói Whisper.
#  Chạy lại bao nhiêu lần cũng được: bước nào xong rồi sẽ tự bỏ qua.
#  Windows: dùng WSL (Ubuntu) rồi chạy script này trong WSL.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
BE="$ROOT/backend"
FE="$ROOT/frontend"
SKILL="$BE/skills/reel-doc-3d"
YES=0; [ "${1:-}" = "--yes" ] && YES=1

c_ok=$'\033[32m'; c_warn=$'\033[33m'; c_err=$'\033[31m'; c_b=$'\033[1m'; c_off=$'\033[0m'
step() { echo; echo "${c_b}━━ $* ━━${c_off}"; }
say()  { echo "${c_ok}✓${c_off} $*"; }
warn() { echo "${c_warn}!${c_off} $*"; }
die()  { echo "${c_err}✗ $*${c_off}"; exit 1; }
ask()  { # ask "câu hỏi" mặc_định(y/n)
  [ "$YES" = 1 ] && { [ "$2" = y ]; return; }
  local a; read -r -p "$1 [$( [ "$2" = y ] && echo "Y/n" || echo "y/N")] " a || true
  a="${a:-$2}"; [[ "$a" =~ ^[Yy] ]]
}

OS="$(uname -s)"
echo "${c_b}VIDEO AI — cài đặt lần đầu${c_off}  ($OS, thư mục: $ROOT)"

# ═════════════════════ 1. Phần mềm hệ thống ═════════════════════
step "1/6 Phần mềm hệ thống (Node.js, Python 3.12, FFmpeg, git)"
if [ "$OS" = "Darwin" ]; then
  # Homebrew (tự cài Xcode Command Line Tools: git, curl, trình biên dịch). Sẽ hỏi mật khẩu máy.
  if ! command -v brew >/dev/null; then
    for b in /opt/homebrew/bin/brew /usr/local/bin/brew; do [ -x "$b" ] && eval "$("$b" shellenv)"; done
  fi
  if ! command -v brew >/dev/null; then
    warn "Chưa có Homebrew → cài (sẽ hỏi mật khẩu đăng nhập máy Mac)..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    for b in /opt/homebrew/bin/brew /usr/local/bin/brew; do [ -x "$b" ] && eval "$("$b" shellenv)"; done
    command -v brew >/dev/null || die "Cài Homebrew chưa xong — mở Terminal mới rồi chạy lại ./setup.sh"
    # Lần sau mở Terminal là có brew luôn
    PROFILE="$HOME/.zprofile"
    grep -q "brew shellenv" "$PROFILE" 2>/dev/null || echo "eval \"\$($(command -v brew) shellenv)\"" >> "$PROFILE"
  fi
  say "Homebrew $(brew --version | head -1 | awk '{print $2}')"

  need=()
  command -v node >/dev/null && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 20 ] || need+=(node)
  command -v python3.12 >/dev/null || need+=(python@3.12)
  [ -x "$(brew --prefix)/opt/ffmpeg-full/bin/ffmpeg" ] || need+=(ffmpeg-full)   # bản đủ: libass (phụ đề), vidstab (chống rung)...
  command -v git >/dev/null || need+=(git)
  if [ ${#need[@]} -gt 0 ]; then
    warn "Cài: ${need[*]} (ffmpeg-full khá lớn, có thể mất 5–15 phút)..."
    brew install "${need[@]}"
  fi
  FFBIN="$(brew --prefix)/opt/ffmpeg-full/bin"
elif [ "$OS" = "Linux" ]; then
  command -v apt-get >/dev/null || die "Script hỗ trợ Ubuntu/Debian (apt). Bản Linux khác: tự cài Node ≥20, Python 3.10–3.12, ffmpeg rồi chạy lại."
  SUDO=""; [ "$(id -u)" -ne 0 ] && SUDO="sudo"
  $SUDO apt-get update -y
  $SUDO apt-get install -y curl git ffmpeg python3 python3-venv python3-pip ca-certificates
  if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | $SUDO -E bash -
    $SUDO apt-get install -y nodejs
  fi
  FFBIN=""
else
  die "Hệ điều hành $OS chưa hỗ trợ. Windows: cài WSL (Ubuntu) rồi chạy ./setup.sh trong WSL."
fi
# ffmpeg-full (Mac) không nằm sẵn trong PATH → thêm cho các bước sau
[ -n "${FFBIN:-}" ] && [ -d "$FFBIN" ] && export PATH="$FFBIN:$PATH"
say "Node $(node -v) · npm $(npm -v)"
say "$(ffmpeg -version | head -1 | cut -c1-60)"
say "git $(git --version | awk '{print $3}')"

# ═════════════════════ 2. Thư viện backend + frontend ═════════════════════
step "2/6 Thư viện backend + frontend (npm)"
for dir in "$BE" "$FE"; do
  name="$(basename "$dir")"
  if [ -f "$dir/package-lock.json" ]; then (cd "$dir" && npm ci --no-audit --no-fund) || (cd "$dir" && npm install --no-audit --no-fund)
  else (cd "$dir" && npm install --no-audit --no-fund); fi
  say "$name: đã cài thư viện"
done

# ═════════════════════ 3. File cấu hình ═════════════════════
step "3/6 Cấu hình (.env)"
if [ ! -f "$BE/.env" ]; then
  cp "$BE/.env.example" "$BE/.env"
  say "Tạo backend/.env"
fi
if [ ! -f "$FE/.env.local" ]; then
  if [ -f "$FE/.env.example" ]; then cp "$FE/.env.example" "$FE/.env.local"; else printf 'NEXT_PUBLIC_API_URL=http://localhost:4000\nNEXT_PUBLIC_MOCK_UPLOAD=false\n' > "$FE/.env.local"; fi
  sed -i.bak 's/^NEXT_PUBLIC_MOCK_UPLOAD=.*/NEXT_PUBLIC_MOCK_UPLOAD=false/' "$FE/.env.local" && rm -f "$FE/.env.local.bak"
  say "Tạo frontend/.env.local"
fi
# Khoá Claude (AI xem video, lên kịch bản, viết caption). Không có vẫn chạy được ở chế độ tự động.
if ! grep -qE '^ANTHROPIC_API_KEY=.+' "$BE/.env"; then
  if [ "$YES" = 0 ]; then
    echo "Dán ANTHROPIC_API_KEY (lấy ở console.anthropic.com → API Keys). Bỏ trống + Enter để thêm sau:"
    read -r -s KEY || true; echo
    if [ -n "${KEY:-}" ]; then
      [[ "$KEY" =~ ^[A-Za-z0-9_-]+$ ]] || die "Khoá có ký tự lạ — kiểm tra lại (chỉ chữ, số, - và _)."
      if grep -q '^ANTHROPIC_API_KEY=' "$BE/.env"; then sed -i.bak "s|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=$KEY|" "$BE/.env" && rm -f "$BE/.env.bak"
      else echo "ANTHROPIC_API_KEY=$KEY" >> "$BE/.env"; fi
      chmod 600 "$BE/.env"
      say "Đã lưu khoá vào backend/.env (chỉ nằm trên máy này)"
    else warn "Chưa có khoá Claude — điền sau vào backend/.env (dòng ANTHROPIC_API_KEY=)"; fi
  else warn "Chưa có ANTHROPIC_API_KEY — điền sau vào backend/.env"; fi
else say "Đã có ANTHROPIC_API_KEY"; fi
# Thư mục dữ liệu + skill mặc định
mkdir -p "$BE/uploads" "$BE/outputs" "$BE/tmp" "$BE/projects" "$BE/data"
[ -f "$BE/data/settings.json" ] || echo '{ "defaultSkill": "reel-doc-3d" }' > "$BE/data/settings.json"
say "Thư mục dữ liệu + skill mặc định reel-doc-3d"

# ═════════════════════ 4. Skill: Python, font, mô hình ═════════════════════
step "4/6 Skill reel-doc-3d: môi trường Python, font, mô hình tách người"
[ -d "$SKILL" ] || die "Không thấy $SKILL"
if [ -x "$SKILL/venv/bin/python" ] && [ -s "$SKILL/fonts/Phudu-VF.ttf" ] && [ -s "$SKILL/models/rvm_mobilenetv3_fp32.onnx" ]; then
  say "Đã cài từ trước — bỏ qua (xoá thư mục skills/reel-doc-3d/venv nếu muốn cài lại)"
else
  (cd "$BE" && bash scripts/setup-skill.sh skills/reel-doc-3d)
fi
VPY="$SKILL/venv/bin/python"

# ═════════════════════ 5. Thư viện nhạc ═════════════════════
step "5/6 Thư viện nhạc nền (phân tích nhịp các bài trong nhac_nen_voice / nhan_nen_chill)"
if (cd "$SKILL/scripts" && PATH="$BE/scripts/ffmpeg-compat:$PATH" FFMPEG_PATH="${FFBIN:+$FFBIN/ffmpeg}" "$VPY" thu_vien_nhac.py >/dev/null 2>&1); then say "Đã chuẩn bị nhạc"
else warn "Chưa chuẩn bị được nhạc — backend sẽ tự làm khi khởi động"; fi

# ═════════════════════ 6. Mô hình giọng nói ═════════════════════
step "6/6 Mô hình nhận giọng nói Whisper (~1.5 GB)"
if ask "Tải sẵn ngay bây giờ? (không thì lần edit đầu tiên sẽ tự tải, chờ lâu hơn)" y; then
  "$VPY" -c "from faster_whisper import WhisperModel; WhisperModel('medium', device='cpu', compute_type='int8'); print('ok')" \
    && say "Đã tải mô hình Whisper" || warn "Tải chưa xong — lần edit đầu sẽ tự tải lại"
fi

chmod +x "$ROOT/start.sh" "$ROOT"/*.command 2>/dev/null || true
echo
echo "${c_ok}${c_b}✅ CÀI ĐẶT XONG${c_off}"
echo "   Chạy ứng dụng:  ./start.sh   (hoặc bấm đúp \"Chay VIDEO AI.command\" trên Mac)"
grep -qE '^ANTHROPIC_API_KEY=.+' "$BE/.env" || echo "   Nhớ điền ANTHROPIC_API_KEY vào backend/.env để AI lên kịch bản."
echo
if [ "$YES" = 0 ] && ask "Mở ứng dụng luôn?" y; then exec "$ROOT/start.sh"; fi
