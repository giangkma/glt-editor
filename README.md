# GLT Editor — GLT EDITOR

Web app cá nhân **tự động edit video TikTok / Reels**: thả video (hoặc dán link Google Drive) → AI xem hình, nghe lời, lên kịch bản → cắt ghép, phụ đề từng từ, nhạc nền, ảnh bìa, đoạn kết thương hiệu → xuất 1080p / 4K / 4K 60fps.

- **Frontend:** Next.js 15 (App Router) · Tailwind · TypeScript — `frontend/`
- **Backend:** Node.js / Express · FFmpeg · skill Python `reel-doc-3d` — `backend/`

## Cài đặt (máy mới, chưa có gì)

```bash
git clone https://github.com/giangkma/glt-editor.git
cd glt-editor
./setup.sh
```

Trên Mac có thể **bấm đúp `Cai dat lan dau.command`** thay cho lệnh trên.

`setup.sh` tự cài: Homebrew (Mac) · Node.js · Python 3.12 · FFmpeg bản đủ tính năng · thư viện backend/frontend · môi trường Python của skill (font, mô hình tách người) · file `.env` · mô hình nhận giọng nói Whisper. Chạy lại bao nhiêu lần cũng được. Lần đầu mất khoảng 15–30 phút tuỳ mạng.

- **macOS**: hỗ trợ đầy đủ (Apple Silicon & Intel). Sẽ hỏi mật khẩu máy khi cài Homebrew.
- **Linux** Ubuntu/Debian: hỗ trợ (dùng apt).
- **Windows**: cài WSL (Ubuntu) rồi chạy `./setup.sh` trong WSL.

## Chạy

```bash
./start.sh          # chạy backend + frontend, tự mở trình duyệt
```

Hoặc bấm đúp **`Chay GLT EDITOR.command`** (Mac). `Ctrl + C` để tắt.

## API key

Điền vào `backend/.env` (file này **không** được đẩy lên git):

| Biến | Dùng cho | Bắt buộc |
|---|---|---|
| `ANTHROPIC_API_KEY` | Claude xem video, lên kịch bản, chọn câu móc, viết caption | Không — thiếu thì dùng kịch bản tự động |
| `GOOGLE_API_KEY` | Đọc thư mục Google Drive ổn định hơn | Không |

## Không có trong repo (tự tạo lại khi cài / chạy)

`node_modules/`, `skills/*/venv/`, `skills/*/models/`, `skills/*/fonts/`, nhạc đã xử lý (`*_full.wav`…), video tải lên / kết quả (`uploads/`, `outputs/`, `projects/`, `data/`), các file `.env`.

## Cập nhật lên GitHub

Bấm đúp **`Day len GitHub.command`** — tự commit mọi thay đổi và đẩy lên.
