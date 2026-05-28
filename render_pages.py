#!/usr/bin/env python3
"""渲染 PDF 所有页面为图片，保存到 pages/ 目录"""
import fitz
import os
import time

PDF = "大学体育.pdf"
OUT_DIR = "pages"
DPI = 200

os.makedirs(OUT_DIR, exist_ok=True)

doc = fitz.open(PDF)
total = doc.page_count
print(f"[render] {total} pages → {OUT_DIR}/  (DPI={DPI})", flush=True)

t0 = time.time()
for pg in range(total):
    path = os.path.join(OUT_DIR, f"page_{pg+1:04d}.png")
    if os.path.exists(path):
        continue  # skip existing
    pix = doc[pg].get_pixmap(dpi=DPI)
    pix.save(path)
    elapsed = time.time() - t0
    rate = (pg + 1) / elapsed if elapsed > 0 else 0
    eta = (total - pg - 1) / rate if rate > 0 else 0
    print(f"\r[render] {pg+1}/{total}  {rate:.1f}pg/s  eta:{eta:.0f}s", end="", flush=True)

elapsed = time.time() - t0
print(f"\n[render] done {total} pages in {elapsed:.0f}s")
