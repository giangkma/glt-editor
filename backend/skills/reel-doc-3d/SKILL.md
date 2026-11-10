---
name: reel-doc-3d
description: 'Edit hoàn chỉnh video DỌC 9:16 (Reels/TikTok/Shorts) người nói chuyện, 1 hoặc nhiều clip: AI xem cả hình lẫn lời để chọn đoạn giữ (cắt khoảng lặng/ậm ừ/câu vấp nhưng GIỮ cảnh không lời đẹp), tăng tốc 1.1-1.2, chỉnh màu + làm mịn da, phụ đề hiện từng cụm font DT Phudu (trắng viền đen, nhấn vàng), luôn giữ phông thật (không xoá phông, không B-roll 3D), chuyển cảnh mượt bằng hoà tan, hiệu ứng âm thanh nhẹ, nhạc nền -15 dB, -14 LUFS, xuất 1080x1920. Kích hoạt khi người dùng đưa video QUAY DỌC và nói "edit video này", "làm reel", "edit reel dọc", "dựng video dọc", hoặc kéo file .MP4 dọc kèm ý muốn edit hoàn chỉnh.'
---

# Reel dọc 3D

Trả lời người dùng bằng ngôn ngữ của họ, dễ hiểu (họ thường không phải dân code). Báo rõ làm được gì / chưa / vì sao. Gửi file nháp/bản chính cho họ xem ngay khi xong. Lệnh lâu (dựng video) chạy nền.

**Python của skill:** `<thư mục skill>\venv\Scripts\python.exe` (tạo bằng `cai-dat.ps1`; chưa có thì hướng dẫn người dùng làm theo `HUONG-DAN-CAI-DAT.md`). Cần `ffmpeg` trong PATH. Dưới đây `py` = Python đó, `S` = `<thư mục skill>\scripts`.

## Bộ đồ nghề (`scripts\`)
| Tệp | Việc |
|---|---|
| `go_bang.py <video> <du an>` | gỡ băng (faster-whisper) → `tj.json` (từ + mốc giây + khoảng lặng) |
| `liet_ke.py <du an>` | in lời kèm số thứ tự từ để chọn đoạn giữ |
| `soat_cum.py <du an>` | soát `MANUAL` khớp lời, chỉ chỗ lệch |
| `reel_engine.py --du-an <du an> [--draft] [--list] [--png <giây> <ảnh>] [--meta]` | dựng hình + **thư viện mẫu B-roll** |
| `mix_engine.py --du-an <du an> [--draft]` | giọng + nhạc + hiệu ứng âm thanh, cân −14 LUFS, chặn đỉnh → file cuối |
| `thu_broll.py <du an>` | chạy khô mọi khung B-roll của dự án (bắt lỗi trước khi dựng) |
| `thu_mau.py <du an>` / `anh_mau_broll.py <du an>` | vẽ thử mọi mẫu / ảnh xem trước `mau-broll\_tat-ca.png` |
| `chuan_bi_nhac.py <bài.mp3> <tên>` | chuẩn bị nhạc nền vào `<skill>\nhac\` |
| `nhip_nhac.py <tên> \| --all` | phân tích nhịp + tính chất bài nhạc → `nhac\<tên>_nhip.json` |
| `montage_engine.py --du-an <du an> [--draft]` | video KHÔNG LỜI: montage cắt đúng nhịp nhạc từ `montage.json` |
| `du_an_mau.py` | tệp cấu hình mẫu |
| `skin.py`, `fx3d.py` | làm mịn da; bộ vẽ giả 3D (extrude, tilt, block, coin, iso_box, soft_shadow) |
| `so_sanh_tach_phong.py <video> <giây> <số giây> <thư mục ra>` | so các cách tách phông cạnh nhau (tốc độ + độ nhấp nháy mép) |

**Tách phông:** mặc định **RobustVideoMatting bản nét** (`models\rvm_resnet50_fp32.onnx`, `cai-dat.ps1` tự tải) — mô hình tách người cho video, mép tóc/vai ổn định, dùng màu đã khử nền ở mép để hết viền sáng. `du_an.py`: `MATTE = "rvm"` (mặc định) / `"rvm-nhe"` (máy yếu, nhanh gấp ~2) / `"u2net"` (dự phòng). Thiếu file mô hình → tự dùng u2net.

Mỗi video = **một thư mục dự án** có `tj.json` + `du_an.py`. Engine không phải sửa cho từng video.

## Quy trình (nhiều video thì làm lần lượt)
1. **Xem video**: `ffprobe` (phải là dọc) + ảnh ghép khung (`ffmpeg -vf "fps=1/10,scale=160:-1,tile=13x2"`).
2. **Gỡ băng**: `py S\go_bang.py <video> <du an>` (dự án ví dụ `D:\reel\<tên>-edit`).
3. **Đọc lời** `py S\liet_ke.py <du an>`. Soát chữ nghe sai (tên riêng, thuật ngữ — ghi lại để báo người dùng xác nhận). Chọn đoạn giữ: bỏ câu vấp/lặp (**câu nói 2–3 lần giữ lần trôi chảy nhất**), bỏ câu bỏ lửng, từ đệm thừa ("thì", "đấy", "à ừ"), đoạn lan man. Lặp dính liền không có khoảng nghỉ thì để nguyên.
4. **Soạn `du_an.py`** (từ `du_an_mau.py`): `SRC`, `SCENES` (cảnh không lời giữ lại — xem mục GIỮ CẢNH KHÔNG LỜI), `SPEED` (luôn tăng tốc: nói nhanh > ~4 từ/giây → 1.1, chậm → 1.2), `OUT_RES = (1080, 1920)`, `MUSIC` (≤3 bài đã chuẩn bị; video > ~2 phút cần 2 bài), `OUT_NAME`, `WRANGES` (đoạn giữ theo số thứ tự từ), `MANUAL` (chia cụm bằng tay 2–4 dòng; `*` chữ mảnh nhấn, `!` chữ dày nhấn, `"chữ|n"` khi sửa chữ nghe sai). Soát `soat_cum.py` → phải "OK".
5. **In số cụm**: `reel_engine.py --du-an <du an> --draft --list` → gán theo số trong ngoặc:
   - **Phong cách đã chốt (09/11/2026): `BROLL = []`, `BEHIND = {}`, `DARK = set()`** — không minh hoạ khối 3D, không xoá phông / nền tối, không chữ to sau đầu; video LUÔN giữ phông thật. Nhấn ý bằng phụ đề (`!` hộp vàng chữ đen, `*` chữ vàng to) và bằng cảnh không lời (`SCENES`). `du_an.py` ghi rõ `FONT_CHU = "phudu"`, `BROLL_3D = False`, `TACH_PHONG = False` (engine mặc định như vậy; đặt `True` mới bật lại kiểu cũ).
6. **Chạy khô** (chỉ khi có BROLL — phong cách hiện tại không có) `thu_broll.py <du an>` → "KHONG LOI". Xem thử vài khung `--png`, ghép bằng ffmpeg `hstack/xstack` để nhìn một lượt.
7. **Nháp 720p** (~10 phút / 1 phút video): `reel_engine.py --du-an <du an> --draft` rồi `mix_engine.py --du-an <du an> --draft` → gửi người dùng xem.
8. **Bản chính 1080×1920** (~25–30 phút / 1 phút video): bỏ `--draft`, chạy nền, lần lượt từng video. Chỉ đổi tiếng thì không dựng lại hình: `reel_engine.py ... --meta` rồi chạy lại `mix_engine.py`.
   - Đặt `FINAL_DIR` (thư mục thành phẩm của người dùng) + `TEN_GIAO` trong `du_an.py` → bản chính tự chép thêm vào đó tên `<ngày-tháng> <TEN_GIAO>.mp4`. Hỏi người dùng muốn để thành phẩm ở đâu ở video đầu tiên rồi ghi nhớ.
9. **Kiểm rồi báo**: độ dài, độ phân giải, LUFS/đỉnh (dòng "ket qua" của mix), số hiệu ứng âm thanh; nói thẳng phần chưa kiểm (AI không nghe được nhạc; chữ phải đoán). Dọn thư mục `work*` khi người dùng đã duyệt.

## GIỮ CẢNH KHÔNG LỜI (`SCENES`, thêm 09/11/2026) — KHÔNG phải cứ im lặng là cắt
Chọn đoạn giữ bằng **cả hình lẫn lời**: trích khung (`ffmpeg -vf "fps=1,scale=-2:384"`) và XEM các đoạn không có tiếng nói.
- Đoạn không lời nhưng hình đáng giữ — phong cảnh, đường đi, hành động đang làm, khoảnh khắc cảm xúc, cảnh mở/kết, cảnh minh hoạ cho câu vừa nói → ghi vào `SCENES = [(giây đầu, giây cuối, "lý do"), ...]` (theo thời gian video nguồn). Mỗi đoạn thường 1,5–6 s; khoảng lặng dài thì lấy phần đẹp, ổn định nhất. Có thể dùng cảnh không lời làm mở màn.
- Bỏ đoạn không lời vô nghĩa: tối đen, rung mạnh, che ống kính, chĩa xuống đất, cảnh lặp lại, đang loay hoay chuẩn bị quay.
- Engine giữ nguyên các đoạn này (không cắt khoảng lặng bên trong), ẩn phụ đề, nền luôn là phông thật, vào/ra bằng hoà tan. Đừng gán BROLL/BEHIND/DARK cho cụm sát mép `SCENES`.
- Video không có lời nào → `WRANGES = []`, `MANUAL = []`, chỉ dùng `SCENES`.

**Nhiều clip → 1 reel:** đưa từng clip về 1080×1920 / 30 fps / tiếng 48 kHz (clip ngang cắt khung dọc ở giữa), nối theo thứ tự rồi coi file nối là `SRC`. Clip không có lời nào thường là cảnh minh hoạ người dùng cố ý quay → giữ phần đẹp nhất qua `SCENES`.

## VIDEO KHÔNG LỜI → MONTAGE THEO NHẠC (thêm 09/11/2026)
Video (1 hoặc nhiều clip) gần như không có lời (gỡ băng < 6 chữ hoặc lời < 8% thời lượng, hoặc không có tiếng) → KHÔNG dùng `reel_engine.py`, dựng montage:
1. Nhạc: thư viện `nhac\` (chuẩn bị bằng `chuan_bi_nhac.py`). Phân tích nhịp: `py S\nhip_nhac.py --all` → `nhac\<tên>_nhip.json` (BPM, beats, downbeats, độ sôi động mỗi 0,5 s, tính chất: nhịp chậm/vừa/nhanh, êm/sôi động, âm sắc). Skill KHÔNG tự tải nhạc trên mạng (bản quyền) — chọn bài hợp không khí hình trong thư viện; thiếu thì nhờ người dùng thêm.
2. Xem khung hình, chọn bài + cảnh, soạn `<du an>\montage.json`: `{"src", "music", "shots": [{"start": giây nguồn, "beats": 1–8, "speed": 0.5–2, "reason"}], "ambient": 0–0.3}`.
   - Cắt luôn rơi đúng nhịp; nhạc êm → cảnh 4–8 nhịp, có thể quay chậm 0,6–0,8; nhạc sôi động → 1–2 nhịp, cắt dồn. Theo "độ sôi động từng ô nhịp" để đặt cao trào.
   - Lấy khoảnh khắc đẹp, ổn định của mỗi cảnh; bỏ rung, mờ, tối, chĩa xuống đất; không lặp cảnh. Mạch: cảnh toàn mở màn → chi tiết/hành động → cao trào → cảnh rộng, êm để kết. Thường 12–45 s.
   - `ambient` LUÔN = 0: video chill tắt hẳn tiếng gốc, chỉ còn nhạc.
   - **Chọn nhạc theo LOẠI VIDEO (người dùng đã chốt 09/11/2026)** — nhạc nằm trong 2 thư mục của `nhac\`:
     - `nhac_nen_voice\` → video **voice thuyết minh** (có lời): `MUSIC = [bài voice]` (mặc định bài đầu / `SKILL_VOICE_MUSIC`), nằm dưới giọng -15 dB.
     - `nhac_nen_chill\` (chấp nhận cả tên gõ nhầm `nhan_nen_chill\`) → video **chill** (không lời): montage, AI xem hình tự chọn bài hợp nhất CHỈ trong thư mục này, tắt hẳn tiếng gốc.
     - Thả file (mp3/wav/m4a… hoặc mp4/mov lấy tiếng) vào thư mục rồi chạy `py S\thu_vien_nhac.py`: bài mới được chuẩn bị (`chuan_bi_nhac.py`) + phân tích nhịp (`nhip_nhac.py`), tên bài = `voice-…` / `chill-…`, danh sách ở `nhac\_thu_vien.json`; bài đã xử lý thì bỏ qua.
     - Người dùng chọn loại video trước khi edit (web: ① voice / ② chill). Chưa rõ thì: gần như không có lời → chill.
   - `title`: video chill **KHÔNG chèn chữ** (không POV, không tiêu đề) — để `""`. Chỉ hình + nhạc.
   - `fps` (tuỳ chọn): `60` cho bản chính 60fps khi nguồn quay 60fps; web app tự đặt khi chọn xuất "4K 60fps" (nguồn 30fps thì nội suy chuyển động lúc nâng 4K).
   - Phong cách tham khảo người dùng thích (video trekking chỉ có nhạc, ~20 s): mỗi cảnh ~1,2–4,5 s, **cắt thẳng đúng phách**, mở bằng cảnh "hero" ấn tượng, giữa là người khám phá / chi tiết, kết bằng cảnh rộng giơ tay ngắm cảnh; màu tươi, ấm.
3. Dựng: `py S\montage_engine.py --du-an <du an> [--draft]` → `montage(_nhap720).mp4`: bắt đầu ở nhịp mạnh gần điểm vào của bài, mỗi cảnh 1 đầu vào riêng (tua thẳng, ít RAM, xếp cảnh tự do), đẩy vào/kéo ra nhẹ luân phiên, màu tươi ấm, tiêu đề (nếu có), mờ dần đầu/cuối, -14 LUFS.

## THƯ VIỆN MẪU B-ROLL 3D — ĐÃ TẮT (09/11/2026)
Người dùng không muốn minh hoạ khối 3D: KHÔNG dùng, KHÔNG vẽ mẫu mới. Mã các mẫu vẫn nằm trong `reel_engine.py` (chỉ chạy khi `BROLL_3D = True`), phần dưới giữ để tham khảo.

Xem tất cả: `mau-broll\_tat-ca.png`. Mỗi mẫu là 1 class trong `reel_engine.py`, chỉ đổi tham số:

| Mẫu | Kiểu | Dùng khi nói về | Tham số |
|---|---|---|---|
| `BCount` | lower | số lớn: follow, doanh thu, giá, số ngày | target, top, label, suffix |
| `BRevenue` | full | doanh thu/số liệu tăng theo thời gian | title, big, values, labels, total |
| `BOrders` | full | đơn hàng về liên tục | title, big, count, item, line |
| `BMoneyIn` | full | tiền về tài khoản, chốt đơn | title, amount, bank, line, suffix |
| `BCalendar` | full | thử thách N ngày, hạn chót | title, big, days, label |
| `BClock` | full | tiết kiệm thời gian, tốc độ | title, big, spins |
| `BFunnel` | full | phễu bán hàng, chuyển đổi | title, stages, numbers |
| `BTarget` | full | mục tiêu, đúng khách | title, big, foot |
| `BRocket` | full | tăng trưởng mạnh, bứt phá | title, big, foot |
| `BIdea` | full | ý tưởng, nhiều hướng | title, big, items[4] |
| `BStars` | full | đánh giá, review | title, rating, review, who, count |
| `BCustomers` | full | khách hàng, cộng đồng | title, big, total, buyers, label |
| `BBeforeAfter` | full | trước/sau, cũ vs mới | title, before, after, b_items, a_items |
| `BSplit` | full | so sánh 2 phía | title, left, left_items, right, right_items, me_ci |
| `BDonut` | full | tỉ lệ %, giảm giá % | title, pct, center, rest |
| `BProgress` | card | % hoàn thành | top, big, pct |
| `BStairs` | full | các giai đoạn tiến bộ, lộ trình | title, big, steps, foot |
| `BFx` | full | danh sách 4–6 hạng mục | title, big, items, icons |
| `BTimeline` | full | quy trình/phần mềm tự chạy | title, big, chip, foot, tracks |
| `BWave` | lower | cắt ghép âm thanh (CHỈ khi nói về âm thanh) | big, sub |
| `BGift` | lower | quà tặng, miễn phí, CTA, phần sau | big, sub |
| `BAgentTeam` | full | công ty AI agent, phân việc cho AI | title, big, boss, agents[4] |
| `BChatTask` | full | giao việc cho AI qua chat | title, user, items, done, agent |
| `BBugFix` | full | lỗi, trục trặc | title, big, sub, count |
| `BAutomate` | full | tự động hoá | title, big, inp, out, foot |
| `BScale` | full | cân nặng giảm từ A → B kg (bàn cân 3D, số chạy, thẻ "-N KG"); start == end → chững cân | title, start, end, unit, big, foot, badge |
| `BCalo` | full | thâm hụt calo: cột ăn vào vs cột đốt đi + "THÂM HỤT N CALO" | title, eat, burn, eat_label, burn_label, eat_txt, burn_txt, result |

**Quy tắc thư viện (quan trọng nhất):**
1. **Nội dung có ý chưa có mẫu hợp → VẼ MẪU MỚI** đúng ý (không gượng ép mẫu cũ). Viết class mới trong `reel_engine.py` cùng kiểu: nền đen; chỉ trắng + vàng #FFC400 (+ sắc tối của chúng cho mặt bên); khối 3D (`t3d`, `put3`, `F3.block/tilt/coin/iso_box/extrude/soft_shadow`, `robot()`, `person()`); có chuyển động bên trong (phần tử bật lần lượt, xoay, nảy); hàm `sfx()` trả danh sách tiếng; chữ dài phải tự co (`fit_font`); kẹp kích thước tối thiểu khi phần tử bật ra từ 0.
2. **GIỮ LẠI mẫu mới** trong `reel_engine.py` của skill, thêm 1 dòng vào bảng trên, chạy `thu_mau.py` (phải "KHONG LOI") rồi `anh_mau_broll.py` để cập nhật ảnh. Càng nhiều video, thư viện càng dày.
3. **Minh hoạ phải đúng ý câu nói** — không dùng sóng nhạc cho "lỗi", không gắn thứ không liên quan.
4. Muốn dùng icon/ảnh tải từ mạng thì phải hỏi người dùng trước (bản quyền).

## B-ROLL CỦA NGƯỜI DÙNG — cảnh quay / ảnh thật (`BUser`, thêm 16/10/2026)
Người dùng có cảnh riêng: quay sản phẩm, quay màn hình app, ảnh khách, hậu trường… → bỏ vào một thư mục (đặt `BROLL_DIR` trong `du_an.py`, đường dẫn trong `src` tính từ đó). Mỗi cảnh là 1 dòng trong `BROLL`, dùng xen kẽ với mẫu 3D:
`(cụm đầu, cụm cuối, "BUser", {"src": "app.mp4", "layout": "phone", "title": "Hormozi OS", "label": "Quay màn hình app"})`

| `layout` | Trông thế nào | Hợp với | Phụ đề |
|---|---|---|---|
| `full` | toàn màn hình, đẩy vào chậm | cảnh quay dọc đẹp, cảnh "khoe" | ẩn |
| `split` | cảnh ở trên 56%, mặt người nói ở dưới, vạch vàng ngăn | cảnh quay ngang khi vẫn cần thấy mặt người nói | **giữ** |
| `card` | cảnh trong thẻ bo góc viền vàng nghiêng 3D, nền là chính cảnh đó làm mờ | cảnh quay ngang, quay màn hình máy tính, ảnh ngang | ẩn |
| `phone` | cảnh trong khung điện thoại 3D nghiêng | **quay màn hình điện thoại / app** | ẩn |
| `polaroid` | 2–5 ảnh khung trắng rơi xuống xếp chồng, chữ dưới mỗi ảnh (`items`) | ảnh khách, kết quả, hậu trường, bằng chứng | ẩn |
| `sticker` | tách vật thể khỏi nền + viền trắng kiểu nhãn dán, lơ lửng trên nền tối | ảnh sản phẩm, đồ vật (PNG trong suốt càng đẹp) | ẩn |
| `pip` | cảnh toàn màn hình + mặt người nói trong bong bóng tròn viền vàng ở góc | demo dài mà vẫn cần mặt người nói | **giữ** |
| `montage` | nhiều cảnh/ảnh cắt nhanh 0,45–0,8 s, chớp trắng nhẹ giữa các cảnh | liệt kê nhiều thứ, "rất nhiều khách / đơn / sản phẩm" | ẩn |
| `cards` | nhiều ảnh lần lượt, mỗi ảnh GIỮ NGUYÊN KHUNG trong thẻ viền vàng nghiêng 3D, nền là ảnh đó làm mờ, `items` = nhãn vàng dưới từng ảnh; ≥1,3 s/ảnh | **ảnh trước/sau ghép đôi**, ảnh vuông, ảnh thành tích (montage/full sẽ cắt mất một nửa) | ẩn |
| `auto` (mặc định) | tự chọn: nhiều ảnh → polaroid; nhiều video → montage; PNG trong suốt → sticker; ảnh → card; video dọc → full/phone; video ngang → card/split | | |

Tham số khác: `inpoint` (`"auto"` = tự chọn đoạn NÉT + có chuyển động vừa, tránh rung và 0,3 s đầu; hoặc số giây), `focus` (0–1, vị trí cắt ngang khi cảnh ngang đưa vào khung dọc), `label` (nhãn vàng nhỏ), `title`, `items` (chữ dưới ảnh polaroid), `audio` (0 = tắt tiếng cảnh chèn; 0,2–0,5 = giữ tiếng nền nhỏ cho thật), `motion` (`push` / `pull` / `pan`), `captions` (ép giữ/ẩn phụ đề).

Tự động làm sẵn: cảnh **vào sớm hơn từ khoá 0,12 s**; chỉnh màu cảnh chèn **giống video chính** (`GRADE`); ảnh tĩnh luôn có chuyển động (Ken Burns); 4 kiểu vào cảnh luân phiên (trượt lên / bật phóng / mở tròn / quét ngang có nhoè); tiếng vút vào–ra, polaroid có tiếng chụp ảnh, montage có swish mỗi cảnh; hết clip thì dừng ở khung cuối.

**Quy tắc chọn & đặt cảnh (tổng hợp từ hướng dẫn edit video ngắn):** mỗi cảnh chèn 2–4 s (montage 0,45–0,8 s/cảnh); cảnh phải **CỤ THỂ đúng câu đang nói**, không chung chung; ~3–6 cảnh chèn mỗi phút, đừng phủ kín thành phim ghép — người xem cần thấy mặt người nói (không để mặt vắng > ~6 s trừ `split`/`pip`); chủ thể để giữa khung dọc; cảnh lệch tỉ lệ → `card` (nền mờ) hoặc `split` thay vì cắt mất chủ thể; quay màn hình → `phone`; hiệu ứng nổi khối/parallax chỉ dùng cho khoảnh khắc đặc biệt, không dùng cho mọi cảnh. Chưa rõ cảnh nào hợp câu nào → xem vài khung từng cảnh (ffmpeg trích khung) rồi tự ghép, báo người dùng danh sách để duyệt.



## VIDEO NGANG 16:9 kiểu HƯỚNG DẪN (`ngang_engine.py`, thêm 30/10/2026)
Video quay NGANG có nói về màn hình/phần mềm, người dùng gửi ảnh chụp màn hình → dùng `ngang_engine.py` thay `reel_engine.py`, rồi vẫn chạy `mix_engine.py`. Cấu hình mẫu: `du_an_ngang_mau.py`.
- **Thu gọn người:** ở đoạn nói về màn hình, người tách nền thu còn 70% về góc phải, ảnh chụp bên trái. Nói xong người phóng to trở lại.
- **Zoom đúng chỗ đang nói:** mỗi ảnh là 1 dòng trong `SCREENS`, `keys` gán theo số cụm, toạ độ theo ảnh gốc; khung vàng làm tối xung quanh + nhãn chữ. Cụm `"_|n"` ẩn phụ đề, chia nhỏ để lấy mốc zoom.
- **LUÔN che thông tin riêng** trong ảnh chụp bằng `blur` hoặc để ngoài vùng zoom: lịch sử chat, bookmark, tab trình duyệt, tên khách hàng, thư mục riêng.
- **Đồ hoạ ngang** trong `GFX`: `GVS` (so 2 AI), `GSTEPS` (hàng bước), `GGRID` (4 ô), `GSOCIAL` (nền tảng), `GCTA` (kêu gọi lấy link).
- **Icon:** để PNG nền trong suốt trong `icons\`. Tải SVG từ simple-icons / lucide rồi đổi bằng `doi_icon_png.py <thư mục icons>`. Skill không kèm logo, phải hỏi người dùng trước khi tải.
- Quy trình giống reel: `go_bang.py` → `liet_ke.py` → soạn `du_an.py` → `soat_cum.py` → `ngang_engine.py --draft --list` → xem thử `--png` → nháp → bản chính.

## NÂNG CẤP CHẤT LƯỢNG TIKTOK (thêm 09/11/2026)
- **Câu móc** (`HOOK = (từ đầu, từ cuối)` trong du_an.py): câu gây tò mò nhất (2–4s, nằm trong WRANGES) — engine ghi `work/hook.json`, web app chép đoạn đó lên ĐẦU video (cold open). Montage: cảnh đầu tiên luôn là cảnh "wow" nhất.
- **Phụ đề kiểu TikTok** (`PHU_DE = "tung-tu"`): chữ hiện TỪNG TỪ đúng lúc nói, nảy nhẹ. `MAU_NHAN = (255, 122, 26)` (cam): dòng `*` = chữ cam to, `!` = hộp cam chữ trắng. Tách từ khoá (giá tiền, địa danh, con số, tên tour) thành dòng `*` riêng, ~1 từ khoá / 2–3 cụm. `PHU_DE = "cum"` = kiểu cũ.
- **Bộ màu** (`GRADE = "<chuỗi filter ffmpeg>"`; montage.json `"grade"`): tu-nhien | rung-tuoi | hoang-hon | dien-anh — chọn theo không khí khung hình.
- **Khung đi theo người** (`reframe.py`): clip ngang → dọc, dùng mô hình RVM (models/) dò người, lia mượt như người quay.
- Web app còn tự làm: chống rung (vidstab), lọc gió/tiếng ồn cho giọng nói, giữ 60fps cho montage (quay chậm 0.5 mượt), đoạn kết CTA thương hiệu, gợi ý caption/hashtag, chỉnh nhanh bản nháp.

## Phong cách đã chốt
- **Phụ đề font DT Phudu** (Dương Trần, SIL OFL — `fonts\Phudu-VF.ttf`, `FONT_CHU = "phudu"`): chữ thường trắng viền đen (dòng đầu ExtraBold, dòng sau Bold), `*` = chữ vàng Black to, `!` = hộp vàng chữ đen. Thiếu font → tạm dùng Inter Tight. 3 màu: trắng, đen #0C0C0C, vàng #FFC400. Kiểu cũ Inter Tight + Playfair nghiêng: `FONT_CHU = "inter"`.
- Chữ nhấn `*` → hiện mờ + trôi lên + gạch chân vàng + sao lấp lánh. Chữ dày (Inter Black) → hộp vàng quét + bật nảy + rung. Chữ thường → nổi lên / trượt trái / trượt phải luân phiên.
- **Chuyển cảnh mượt, nhẹ nhàng (mặc định, `CHUYEN_CANH = "muot"`, sửa 09/11/2026):** máy quay đổi zoom từ từ trong 0,7 s giữa các cụm (1.0 / 1.04 / 1.0 / 1.07) + "thở" và trôi ngang liên tục, KHÔNG giật nhấn; đổi nền và vào/ra B-roll toàn màn (full, card, cảnh người dùng) **hoà tan 0,25–0,3 s**, không chớp trắng, không dải vàng quét; chỗ cắt trong nguồn hoà tan 3 khung; chỉ cắt khoảng nghỉ ≥ 0,3 s (`PAUSE_CUT`), fade tiếng 0,05 s ở chỗ cắt.
- Kiểu cũ (năng động, nhiều nháy): `CHUYEN_CANH = "manh"` — máy quay 3 kiểu luân phiên theo cụm (đẩy vào chậm, giật nhấn rồi lùi, lùi ra + trôi ngang); đổi nền có chớp trắng 1–2 khung.
- Chỉnh màu ấm nhẹ + làm mịn da vùng mặt (`skin.py`).
- **Âm thanh nhiều nhưng nhỏ dưới giọng**: B-roll (vút vào/ra, tích tắc khi đếm, ding, pop, chuông tin nhắn, gõ phím), chữ (bóp nhẹ ở chữ dày, lấp lánh ở chữ mảnh, swish + đập trầm khi chữ sau đầu, swish khi đổi nền); boom ≤ 3 (thừa tự đổi thành thud), riser ≤ 1. Nhạc −15 dB so với giọng, hạ khi nói, nhỏ dần cuối. Cân −14 LUFS rồi chặn đỉnh −1,5 dB.

## Bẫy đã gặp
- Hình bật ra từ kích thước 0 → PIL lỗi kích thước âm giữa lúc dựng → luôn chạy khô trước.
- Gán số cụm bằng đếm nhẩm dễ lệch 1 → luôn dùng `--list`.
- Bộ đệm ảnh chữ 3D đã giới hạn; khi sửa nhớ xoá bộ đệm TRƯỚC khi thêm.
- Video 2K/4K dọc: bản chính để 1080×1920 cho nhanh và nhẹ; RAM 16 GB thì dựng lần lượt, không chạy song song.
- Mặt nạ tách người có thể dính lưng ghế cạnh vai — soi khung đoạn `DARK`.
- Tiếng ngắn sắc (gõ phím, lấp lánh) đẩy đỉnh vượt 0 dB sau khi nâng độ to → mix đã có chặn đỉnh; đừng bỏ.
