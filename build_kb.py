#!/usr/bin/env python3
"""大学体育.pdf → OCR JSON（直接读 pages/ 预渲染图）"""
import json
import os
import time
from rapidocr_onnxruntime import RapidOCR

IMG_DIR = "pages"
OUT_DIR = "ocr_pages"

imgs = sorted(f for f in os.listdir(IMG_DIR) if f.endswith(".png"))
total = len(imgs)
print(f"[ocr] {total} images", flush=True)
os.makedirs(OUT_DIR, exist_ok=True)

ocr = RapidOCR()
t0 = time.time()

for i, fname in enumerate(imgs):
    out = os.path.join(OUT_DIR, fname.replace(".png", ".json"))
    if os.path.exists(out):
        continue

    img = os.path.join(IMG_DIR, fname)
    result, _ = ocr(img)

    lines = []
    if result:
        for item in result:
            bbox_raw, text, conf = item[0], item[1], item[2]
            x = min(p[0] for p in bbox_raw)
            y = min(p[1] for p in bbox_raw)
            w = max(p[0] for p in bbox_raw) - x
            h = max(p[1] for p in bbox_raw) - y
            lines.append({
                "x": round(x, 1), "y": round(y, 1),
                "w": round(w, 1), "h": round(h, 1),
                "text": text, "conf": round(conf, 4)
            })

    json.dump({"page": i + 1, "lines": lines}, open(out, "w"), ensure_ascii=False)

    elapsed = time.time() - t0
    rate = (i + 1) / elapsed if elapsed > 0 else 0
    eta = (total - i - 1) / rate if rate > 0 else 0
    done = int(20 * (i + 1) / total)
    bar = "█" * done + "░" * (20 - done)
    print(f"\r[ocr] [{bar}] {100*(i+1)/total:4.0f}%  {i+1}/{total}  {rate:.1f}pg/s  eta:{eta:.0f}s",
          end="", flush=True)

elapsed = time.time() - t0
print(f"\n[ocr] done → {OUT_DIR}/  ({total} pages, {elapsed:.0f}s)", flush=True)
