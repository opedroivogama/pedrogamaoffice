"""Generate a sprite image via Gemini 2.5 Flash Image (Nano Banana).

Usage:
    python scripts/gen_sprite.py "<prompt>" <out_path>

Reads GEMINI_API_KEY from .env.local at the repo root.
"""
from __future__ import annotations

import base64
import json
import sys
import urllib.request
import urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = ROOT / ".env.local"
MODEL = "gemini-2.5-flash-image"
ENDPOINT = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent"


def load_env(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    if not path.exists():
        return out
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def generate(prompt: str, out_path: Path, input_image: Path | None = None) -> None:
    env = load_env(ENV_FILE)
    api_key = env.get("GEMINI_API_KEY")
    if not api_key:
        raise SystemExit("GEMINI_API_KEY not found in .env.local")

    parts: list[dict] = [{"text": prompt}]
    if input_image is not None and input_image.exists():
        img_b64 = base64.b64encode(input_image.read_bytes()).decode("ascii")
        mime = "image/png" if input_image.suffix.lower() == ".png" else "image/jpeg"
        parts.append({"inlineData": {"mimeType": mime, "data": img_b64}})

    body = {
        "contents": [{"parts": parts}],
        "generationConfig": {"responseModalities": ["IMAGE"]},
    }
    req = urllib.request.Request(
        f"{ENDPOINT}?key={api_key}",
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        raise SystemExit(f"HTTP {e.code}: {detail[:500]}")

    image_b64 = None
    for cand in payload.get("candidates", []):
        for part in cand.get("content", {}).get("parts", []):
            inline = part.get("inlineData") or part.get("inline_data")
            if inline and inline.get("data"):
                image_b64 = inline["data"]
                break
        if image_b64:
            break

    if not image_b64:
        raise SystemExit(f"No image in response. Keys: {list(payload.keys())}")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(base64.b64decode(image_b64))
    print(f"wrote {out_path} ({out_path.stat().st_size} bytes)")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("usage: gen_sprite.py <prompt> <out_path> [input_image]", file=sys.stderr)
        sys.exit(2)
    ref = Path(sys.argv[3]) if len(sys.argv) > 3 else None
    generate(sys.argv[1], Path(sys.argv[2]), ref)
