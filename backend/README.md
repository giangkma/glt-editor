# GLT EDITOR — Backend (Bước 2)

Node.js · Express 5 · Multer 2 (ES Modules, Node ≥ 18.17)

## Chạy

```bash
npm install
npm run dev        # http://localhost:4000 (tự reload khi sửa code)
```

Ở frontend, sửa `frontend/.env.local` → `NEXT_PUBLIC_MOCK_UPLOAD=false` rồi chạy lại `npm run dev`.

## Cấu trúc

```
backend/
├── src/
│   ├── server.js                 # Khởi động, timeout, tắt êm, lưới an toàn process
│   ├── app.js                    # Express app, CORS, routes
│   ├── config.js                 # Đọc .env
│   ├── routes/
│   │   ├── upload.routes.js      # POST /api/upload
│   │   └── video.routes.js       # GET /api/videos/:id, /:id/file
│   ├── middleware/
│   │   ├── upload.js             # Cấu hình multer (2GB, lọc định dạng, tên UUID)
│   │   └── errorHandler.js       # Gom mọi lỗi → JSON, dọn file dở dang
│   ├── services/
│   │   └── videoStore.js         # Lưu metadata, xoá file hết hạn
│   └── utils/AppError.js
├── uploads/                      # File tạm: <id>.mp4 + <id>.json
└── .env
```

## API

| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/health` | Kiểm tra server |
| POST | `/api/upload` | multipart, field `video` |
| GET | `/api/videos/:id` | Metadata video |
| GET | `/api/videos/:id/file` | Stream file (hỗ trợ tua) |

Upload thành công (201):
```json
{
  "success": true,
  "message": "Tải lên thành công.",
  "id": "3f2c...",
  "video": { "id": "3f2c...", "originalName": "clip.mp4", "size": 123456, "mimeType": "video/mp4", "url": "/api/videos/3f2c..." }
}
```

Lỗi (luôn cùng dạng):
```json
{ "success": false, "error": { "code": "LIMIT_FILE_SIZE", "message": "File vượt quá giới hạn 2048 MB." } }
```

| Mã HTTP | Khi nào |
|---|---|
| 400 | Không có file, sai tên field, ID sai |
| 403 | Origin không nằm trong CORS_ORIGIN |
| 413 | File > 2GB |
| 415 | Không phải video |
| 507 | Ổ đĩa server hết chỗ |

## Test nhanh bằng curl

```bash
curl -F "video=@/duong/dan/clip.mp4" http://localhost:4000/api/upload
```

---

# Bước 3 — Auto-Edit (`/api/edit`)

## Cài thêm
```bash
brew install ffmpeg-full     # bản đủ tính năng (có libass để vẽ chữ). Gói "ffmpeg" thường của Homebrew đã bỏ libass
npm install                  # cài thêm fluent-ffmpeg
```
Muốn có **text theo giọng nói**: điền `OPENAI_API_KEY` trong `.env` (dùng OpenAI Whisper, tính phí theo phút âm thanh).
Không có key → vẫn cắt khoảng lặng + SFX + render 4K, chỉ bỏ phần text.

Mac: đặt `VIDEO_ENCODER=h264_videotoolbox` để render 4K nhanh hơn rất nhiều.

## Luồng xử lý
| Bước | Làm gì | Code |
|---|---|---|
| 1 | ffprobe + `silencedetect` → đoạn có tiếng nói (snap theo khung hình) | `editor/timeline.js` |
| 2 | Tách mp3 → Whisper → timestamp từng chữ → đổi sang timeline mới | `editor/transcribe.js` |
| 3 | Gom 2–3 chữ/cụm → file `.ass` (chữ to, viền đen, nảy nhẹ, số/câu cảm thán tô vàng) | `editor/captions.js` |
| 3 | Lên lịch SFX: whoosh ở chỗ cắt dài, pop ở chữ nhấn mạnh, giãn cách ≥ 2s, tối đa 1 SFX / 6s | `editor/sfx.js` |
| 4 | **1 lượt FFmpeg**: select/aselect cắt → scale 4K → vẽ text → loudnorm -14 LUFS → trộn SFX → H.264 MP4 | `editor/filterGraph.js` |

## API
| Method | Path | Mô tả |
|---|---|---|
| POST | `/api/edit` | `{ videoId, options?: { captions, sfx, silenceThresholdDb, minSilenceSec } }` → 202 `{ jobId, eventsUrl }` |
| GET | `/api/edit/:jobId/events` | **SSE** — `event: progress` / `done` / `failed` / `cancelled` |
| GET | `/api/edit/:jobId` | Trạng thái (dự phòng nếu không dùng SSE) |
| GET | `/api/edit/:jobId/file` | Xem video kết quả |
| GET | `/api/edit/:jobId/download` | Tải .mp4 |
| DELETE | `/api/edit/:jobId` | Huỷ (kill FFmpeg ngay) |

Thay SFX: ghi đè `assets/sfx/whoosh.wav` và `assets/sfx/pop.wav` bằng file của bạn (cùng tên).
Debug lệnh FFmpeg: đặt `DEBUG_FFMPEG=1` trong `.env`.

---

# Bước 4 — Skill (lưu cách edit của bạn cho mọi video)

Web lưu skill trong `backend/skills/<tên>/` (đúng cấu trúc repo GitHub). **Skill mặc định** được ghi trong
`data/settings.json` và tự áp dụng cho mọi video tải lên. Quản lý ở trang **/skills** của frontend.

Đã cài sẵn: **reel-doc-3d** (https://github.com/tranbahuy1205-dotcom/claude-skill-edit-reel), đặt làm mặc định.

## Cài môi trường cho skill (1 lần)
```bash
brew install python@3.12 ffmpeg
npm run skill:setup     # venv + thư viện + font + mô hình tách phông (~1–2 GB)
```
Điền `ANTHROPIC_API_KEY` trong `.env` để Claude đọc SKILL.md và lên kịch bản như khi bạn dùng skill trong Claude Code.
Không có key → kịch bản tự động đơn giản (bỏ từ đệm, chia cụm theo nhịp, nhấn con số, bộ đếm cho số lớn).

## Một lần edit bằng skill chạy thế nào
| Bước | Script của skill | Web làm gì |
|---|---|---|
| Gỡ băng | `go_bang.py` | → `projects/<id>/tj.json` |
| Kịch bản | — | Claude nhận nguyên văn SKILL.md + lời thoại + danh sách 27 mẫu B-roll → `submit_plan` → kiểm tra như `soat_cum.py` (lệch thì gửi lỗi cho Claude sửa, tối đa 3 lần) → ghi `du_an.py` |
| Chạy khô | `thu_broll.py` | B-roll nào vẽ lỗi thì bỏ, dựng tiếp |
| Dựng hình | `reel_engine.py [--draft]` | % lấy từ dòng `khung f/n` |
| Âm thanh | `mix_engine.py [--draft]` | nhạc -15 dB, SFX, -14 LUFS |
| Nâng 4K | ffmpeg (tuỳ chọn) | 1080×1920 → 2160×3840 |

Bản nháp 720p trước → bấm **Duyệt & dựng bản chính** (`POST /api/edit/:jobId/finalize`) → dùng lại đúng kịch bản.
Muốn sửa kịch bản bằng tay: sửa `projects/<id>/du_an.py` rồi bấm duyệt.

## API skill
| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/skills` | Danh sách skill + trạng thái cài đặt |
| POST | `/api/skills` | `{ repoUrl }` cài từ GitHub |
| POST | `/api/skills/:id/update` | `git pull --ff-only` |
| PUT | `/api/skills/default` | `{ id }` hoặc `{ id: null }` (bộ cơ bản) |
| POST | `/api/skills/:id/music` | multipart `music` + `name` → `chuan_bi_nhac.py` |
| GET | `/api/skills/:id/preview` | ảnh thư viện mẫu B-roll |

`POST /api/edit` nhận thêm `options.style` (bỏ trống = skill mặc định, `"basic"` = bộ cơ bản), `mode` (`draft`/`final`), `export4k`, `music`.

## Giới hạn hiện tại
- Chỉ video **quay dọc** (video ngang → chọn “Cơ bản”). Chế độ video ngang hướng dẫn (`ngang_engine.py`) chưa nối vào web.
- Web **không tự vẽ mẫu B-roll mới** (việc đó cần Claude Code sửa `reel_engine.py`). Mẫu mới bạn thêm bằng Claude Code vào `skills/reel-doc-3d` sẽ được web dùng ngay.
- Chưa tải cảnh quay/ảnh riêng (`BUser`) qua web.
