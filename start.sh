#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  VIDEO AI — chạy cả Backend (Express) và Frontend (Next.js) bằng 1 lệnh
#
#    ./start.sh              chạy cả hai, tự mở trình duyệt
#    ./start.sh --no-open    không tự mở trình duyệt
#
#  Ctrl + C để tắt cả hai. Log: [BE] = backend, [FE] = frontend.
# ─────────────────────────────────────────────────────────────
set -u
ROOT="$(cd "$(dirname "$0")" && pwd)"
BE="$ROOT/backend"
FE="$ROOT/frontend"
OPEN_BROWSER=1
[ "${1:-}" = "--no-open" ] && OPEN_BROWSER=0

c_be=$'\033[36m'; c_fe=$'\033[35m'; c_ok=$'\033[32m'; c_warn=$'\033[33m'; c_err=$'\033[31m'; c_off=$'\033[0m'
say()  { echo "${c_ok}▸${c_off} $*"; }
warn() { echo "${c_warn}!${c_off} $*"; }
die()  { echo "${c_err}✗ $*${c_off}"; exit 1; }

# ── 1. Kiểm tra môi trường ──
command -v node >/dev/null || die "Chưa có Node.js. Cài bằng: brew install node"
command -v npm  >/dev/null || die "Chưa có npm (đi kèm Node.js)."
[ -f "$BE/package.json" ] || die "Không thấy $BE/package.json"
[ -f "$FE/package.json" ] || die "Không thấy $FE/package.json"
command -v ffmpeg >/dev/null || warn "Chưa thấy ffmpeg trong PATH → cài: brew install ffmpeg-full (hoặc ffmpeg)"

# ── 2. Cài thư viện nếu chưa có (chỉ lần đầu) ──
for dir in "$BE" "$FE"; do
  if [ ! -d "$dir/node_modules" ]; then
    say "Cài thư viện cho $(basename "$dir") (lần đầu, vài phút)..."
    (cd "$dir" && npm install) || die "npm install lỗi trong $(basename "$dir")"
  fi
done
[ -f "$BE/.env" ] || { [ -f "$BE/.env.example" ] && cp "$BE/.env.example" "$BE/.env" && warn "Đã tạo backend/.env từ .env.example — nhớ điền ANTHROPIC_API_KEY"; }
if [ -d "$BE/skills/reel-doc-3d" ] && [ ! -x "$BE/skills/reel-doc-3d/venv/bin/python" ]; then
  warn "Skill reel-doc-3d chưa cài môi trường Python → chạy: (cd backend && npm run skill:setup)"
fi

# ── 3. Cổng backend đang bị chiếm? ──
BE_PORT="$(grep -E '^PORT=' "$BE/.env" 2>/dev/null | tail -1 | cut -d= -f2 | tr -d '[:space:]')"
BE_PORT="${BE_PORT:-4000}"
if command -v lsof >/dev/null && lsof -nP -iTCP:"$BE_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  warn "Cổng $BE_PORT đang có chương trình khác dùng (có thể backend cũ chưa tắt):"
  lsof -nP -iTCP:"$BE_PORT" -sTCP:LISTEN | tail -n +2 | awk '{print "    " $1 " (PID " $2 ")"}'
  die "Tắt chương trình đó (kill <PID>) rồi chạy lại."
fi

# ── 4. Chạy song song, gắn nhãn log ──
pids=(); pgids=()
cleanup() {
  trap - INT TERM EXIT
  echo
  say "Đang tắt backend + frontend..."
  for g in "${pgids[@]:-}"; do [ -n "$g" ] && kill -TERM -- "-$g" 2>/dev/null; done
  sleep 1
  for g in "${pgids[@]:-}"; do [ -n "$g" ] && kill -KILL -- "-$g" 2>/dev/null; done
  exit 0
}
trap cleanup INT TERM EXIT

# set -m: mỗi tiến trình nền có nhóm riêng → tắt được cả cây (node, next, ffmpeg, python con)
set -m
# Gắn nhãn từng dòng log (vòng read của bash: in ngay từng dòng, không bị đệm như awk/sed)
label() {
  local prefix="$1" open_it="${2:-0}" opened=0 line
  while IFS= read -r line || [ -n "$line" ]; do
    printf '%s %s\n' "$prefix" "$line"
    if [ "$open_it" = 1 ] && [ "$opened" = 0 ] && [[ "$line" =~ (https?://localhost:[0-9]+) ]]; then
      opened=1
      url="${BASH_REMATCH[1]}"
      ( sleep 2; { command -v open >/dev/null && open "$url"; } || xdg-open "$url" ) >/dev/null 2>&1 &
    fi
  done
}
(cd "$BE" && exec npm run dev 2>&1 </dev/null) | label "${c_be}[BE]${c_off}" &
pids+=($!); pgids+=("$(ps -o pgid= -p $! | tr -d ' ')")
(cd "$FE" && exec npm run dev 2>&1 </dev/null) | label "${c_fe}[FE]${c_off}" "$OPEN_BROWSER" &
pids+=($!); pgids+=("$(ps -o pgid= -p $! | tr -d ' ')")
set +m

say "Backend:  http://localhost:$BE_PORT   ·   Frontend: xem dòng [FE] Local: ...   ·   Ctrl + C để tắt"

# Một bên dừng (lỗi) → tắt luôn bên còn lại để không chạy nửa vời
while :; do
  for p in "${pids[@]}"; do
    if ! kill -0 "$p" 2>/dev/null; then
      warn "Một tiến trình đã dừng — tắt cả hai. Xem log phía trên để biết lỗi."
      cleanup
    fi
  done
  sleep 1
done
