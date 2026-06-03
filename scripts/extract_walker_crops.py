"""Densely sample frames and crop to the moving chrome-dummy walker region."""
from pathlib import Path
import cv2

VIDEO = Path(r"C:\Users\Pedro\Desktop\Gravação de Tela 2026-06-02 091759.mp4")
OUT_DIR = Path(r"C:\Users\Pedro\Desktop\escritorio online\scripts\_video_frames")
OUT_DIR.mkdir(parents=True, exist_ok=True)

cap = cv2.VideoCapture(str(VIDEO))
total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
fps = cap.get(cv2.CAP_PROP_FPS)

# Sample every Nth frame around the most active part of the video
samples = list(range(60, total, 12))[:24]
for i, idx in enumerate(samples):
    cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
    ok, frame = cap.read()
    if not ok:
        continue
    out = OUT_DIR / f"dense_{i:02d}.png"
    cv2.imwrite(str(out), frame)
print(f"saved {len(samples)} dense frames")
cap.release()
