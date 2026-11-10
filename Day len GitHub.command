#!/bin/bash
# Đẩy toàn bộ dự án VIDEO AI lên https://github.com/giangkma/glt-editor (bấm đúp để chạy)
set -e
cd "$(dirname "$0")"
REPO="https://github.com/giangkma/glt-editor.git"

# Skill tải từ repo khác có .git riêng → cất lịch sử cũ đi để đưa TRỌN code skill (đã sửa) vào repo này
if [ -d backend/skills/reel-doc-3d/.git ]; then
  mv backend/skills/reel-doc-3d/.git backend/skills/reel-doc-3d/.git-skill-goc
fi

[ -d .git ] || git init -b main
git add -A
if ! git diff --cached --quiet; then
  if git rev-parse HEAD >/dev/null 2>&1; then git commit -m "Cập nhật $(date '+%d/%m/%Y %H:%M')"
  else git commit -m "VIDEO AI: web app tự edit video (Next.js + Express + skill reel-doc-3d)"; fi
fi
git branch -M main
git remote get-url origin >/dev/null 2>&1 || git remote add origin "$REPO"

if ! git push -u origin main; then
  echo "→ Repo trên GitHub đã có sẵn nội dung (vd README) — gộp rồi đẩy lại…"
  git pull origin main --allow-unrelated-histories --no-rebase --no-edit
  git push -u origin main
fi
echo ""
echo "✅ Đã đẩy lên $REPO"
read -r -p "Nhấn Enter để đóng…"
