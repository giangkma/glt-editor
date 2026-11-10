# GLT EDITOR — Frontend (Bước 1)

Next.js 15 (App Router) · TypeScript · Tailwind CSS · Dark mode

## Chạy thử

```bash
npm install
cp .env.example .env.local   # đã có sẵn .env.local
npm run dev                  # http://localhost:3000
```

Mặc định `NEXT_PUBLIC_MOCK_UPLOAD=true` → upload được **giả lập** để test giao diện
khi chưa có backend. Khi có backend Express, đổi thành `false`.

## Cấu trúc thư mục

```
frontend/
├── src/
│   ├── app/
│   │   ├── layout.tsx            # Root layout, font, metadata
│   │   ├── page.tsx              # Trang chủ
│   │   └── globals.css           # Tailwind + style nền dark
│   ├── components/
│   │   ├── ui/
│   │   │   └── Button.tsx        # Nút dùng chung (primary / ghost)
│   │   └── upload/
│   │       ├── UploadPanel.tsx   # Điều phối 3 trạng thái
│   │       ├── VideoDropzone.tsx # Vùng kéo thả + chọn file
│   │       ├── UploadProgress.tsx# Thanh tiến trình %
│   │       └── UploadComplete.tsx# Preview + nút "Bắt đầu Auto-Edit"
│   ├── hooks/
│   │   └── useVideoUpload.ts     # State machine upload (idle/uploading/success/error)
│   ├── lib/
│   │   ├── config.ts             # API URL, giới hạn dung lượng, định dạng
│   │   ├── upload.ts             # XHR upload có progress + chế độ mock
│   │   ├── validate.ts           # Kiểm tra định dạng / dung lượng
│   │   └── format.ts             # formatBytes
│   └── types/
│       └── upload.ts
├── tailwind.config.ts
├── postcss.config.mjs
├── next.config.mjs
├── tsconfig.json
└── .env.example
```

## Hợp đồng API cho backend (bước 2)

`POST {NEXT_PUBLIC_API_URL}/api/upload`
- Body: `multipart/form-data`, field **`video`**
- Response: `{ "id": "<videoId>" }`
- Cần bật CORS cho `http://localhost:3000`

Nút "Bắt đầu Auto-Edit" hiện gọi `handleStartAutoEdit` trong
`UploadPanel.tsx` (có `TODO`) — sẽ nối vào `POST /api/auto-edit` ở bước 2.
