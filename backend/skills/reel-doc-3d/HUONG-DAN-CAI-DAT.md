# Hướng dẫn cài skill "reel-doc-3d" (edit video dọc kiểu 3D)

Skill này giúp **Claude Code** tự edit video quay dọc (Reels/TikTok/Shorts) người nói chuyện:
- tự cắt khoảng lặng, câu vấp;
- tăng tốc nhẹ, chỉnh màu, làm mịn da;
- chữ hiện theo từng cụm;
- hình minh hoạ khối 3D (hơn 25 mẫu, tự vẽ thêm mẫu mới theo nội dung của bạn);
- hiệu ứng âm thanh, nhạc nền, cân âm chuẩn mạng xã hội.

Làm lần lượt từ trên xuống. Mỗi bước chỉ làm **một lần** trên mỗi máy.

## Bước 1 — Cài Python
1. Vào trang python.org, mục Downloads, tải **Python 3.12** cho Windows.
2. Mở file vừa tải. Ở màn hình đầu tiên, **tích vào ô "Add python.exe to PATH"** ở dưới cùng, rồi bấm "Install Now".

## Bước 2 — Cài ffmpeg
1. Mở **PowerShell**: bấm phím Windows, gõ chữ PowerShell, bấm vào kết quả.
2. Gõ dòng sau rồi nhấn phím Enter trên bàn phím:
   `winget install ffmpeg`
3. Chờ cài xong, **đóng PowerShell rồi mở lại**.

## Bước 3 — Lấy skill về và đặt vào đúng chỗ
Cách dễ nhất: mở Claude Code và nói *"cài skill từ https://github.com/tranbahuy1205-dotcom/claude-skill-edit-reel vào thư mục skill của tôi, đặt tên thư mục là reel-doc-3d"* — Claude sẽ tự tải về đúng chỗ.

Hoặc tự làm: vào trang GitHub trên, bấm nút xanh **Code** → **Download ZIP**, giải nén, **đổi tên thư mục thành `reel-doc-3d`** rồi đặt vào thư mục skill của Claude Code:
`C:\Users\<tên máy của bạn>\.claude\skills\reel-doc-3d`
(nếu chưa có thư mục `skills` thì tạo mới).

## Bước 4 — Cài thư viện
Trong thư mục `reel-doc-3d`, bấm chuột phải vào file **cai-dat.ps1** và chọn **"Run with PowerShell"**. Chờ đến khi hiện chữ **XONG** (mất khoảng 5–15 phút, máy sẽ tải khoảng 1–2 GB: thư viện, font Google Fonts và mô hình tách người cho video RobustVideoMatting — giấy phép GPL-3.0).

## Bước 5 — Thêm nhạc nền (tuỳ chọn)
Skill **không kèm nhạc** vì bản quyền. Muốn có nhạc nền:
1. Chuẩn bị file nhạc bạn được phép dùng, ví dụ `chill.mp3`.
2. Nói với Claude: *"chuẩn bị bài nhạc D:\nhac\chill.mp3 tên là chill cho skill reel-doc-3d"*.

## Dùng thế nào
Mở Claude Code, kéo video quay dọc vào (hoặc dán đường dẫn) và nói: **"edit video này"**.

Claude sẽ:
1. Gỡ băng và báo những chữ phải đoán.
2. Dựng bản nháp 720p để bạn xem.
3. Bạn duyệt xong thì ra bản chính 1080×1920.

Nội dung của bạn có ý chưa có mẫu minh hoạ hợp thì Claude tự vẽ mẫu 3D mới và lưu lại vào thư viện, để những video sau dùng tiếp.

## Máy nên có
- Windows 10/11, RAM từ 16 GB.
- Có card đồ hoạ NVIDIA thì gỡ băng nhanh hơn nhiều. Không có vẫn chạy được, chỉ chậm hơn.
- Ổ đĩa trống từ 10 GB.
- Thời gian dựng: khoảng 10 phút cho bản nháp, 25–30 phút cho bản chính, tính cho mỗi 1 phút video.

## Bản quyền
- Font **Inter Tight** và **Playfair Display** dùng giấy phép SIL Open Font License, được phép dùng và chia sẻ tự do.
- Hiệu ứng âm thanh do máy tự tạo, không dùng file của ai.
- Nhạc nền do bạn tự chịu trách nhiệm bản quyền.
