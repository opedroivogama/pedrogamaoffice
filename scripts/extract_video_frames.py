"""Extract evenly-spaced frames from the user's gameplay recording for review."""
import sys
from pathlib import Path
import cv2

VIDEO = Path(r"C:\Users\Pedro\Desktop\Gravação de Tela 2026-06-02 091759.mp4")
OUT_DIR = Path(r"C:\Users\Pedro\Desktop\escritorio online\scripts\_video_frames")
OUT_DIR.mkdir(parents=True, exist_ok=True)

NUM_FRAMES = 16  # evenly spaced across the clip

cap = cv2.VideoCapture(str(VIDEO))
if not cap.isOpened():
    sys.exit(f"could not open {VIDEO}")
total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
fps = cap.get(cv2.CAP_PROP_FPS)
print(f"video: {total} frames @ {fps:.2f} fps, {total/fps:.2f}s")

step = max(1, total // NUM_FRAMES)
saved = 0
for i in range(NUM_FRAMES):
    idx = i * step
    if idx >= total:
        break
    cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
    ok, frame = cap.read()
    if not ok:
        continue
    out = OUT_DIR / f"frame_{i:02d}_pos{idx:05d}.png"
    cv2.imwrite(str(out), frame)
    saved += 1
print(f"saved {saved} frames to {OUT_DIR}")
cap.release()
