# Pose Fighter

Game đối kháng điều khiển bằng **tư thế cơ thể qua webcam** (pose detection) — người chơi vs boss.

## Cách chơi

| Tư thế / phím | Hành động |
|---|---|
| Tay trái giơ lên | Bắn (skill 1, 100 dmg, CD 3s) |
| Tay phải giơ lên | Cầu nổ (skill 2, 150 dmg, CD 5s) |
| Tay chữ X trước ngực | Khiên (giảm 75% sát thương) |
| Đứng thẳng | Di chuyển bằng phím mũi tên ↑ ↓ ← → |
| ↑ | Nhảy (né đạn) |

Boss bắn đạn every 3s và chém every 4s — hết 1200 HP là thua.

## Chạy local

```bash
python -m http.server 8734 --directory .
```

Mở http://localhost:8734/ → BẮT ĐẦU → cho phép camera.

> Cần server (không mở trực tiếp file `index.html` vì camera bị chặn trên `file://`).

## Tech

- [Teachable Machine](https://teachablemachine.withgoogle.com/) Pose model (PoseNet / MobileNetV1)
- TensorFlow.js 1.3.1 + tfjs-models (tmPose)
- Vanilla JS + Canvas, không build step

## File

- `index.html` — trang chính
- `style.css` — giao diện
- `stretch.js` — game logic + pose detection
- `player.png` / `boss.png` — sprite
