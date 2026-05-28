#!/usr/bin/env python3
"""大学体育.pdf → 结构化知识库 (RapidOCR)
支持断点续跑，输出 knowledge_base.json
"""
import fitz
import json
import os
import re
import sys
import time
from rapidocr_onnxruntime import RapidOCR

PDF_PATH = "大学体育.pdf"
CHECKPOINT = "kb_checkpoint.json"
OUTPUT = "knowledge_base.json"

CH_PAT = re.compile(r"^第([一二三四五六七八九十]+)章\s*(.+)$")
SEC_PAT = re.compile(r"^第([一二三四五六七八九十]+)节\s*(.+)$")


def render_page(doc, pg, dpi=200):
    pix = doc[pg].get_pixmap(dpi=dpi)
    path = f"/tmp/kb_page_{pg}.png"
    pix.save(path)
    return path


def ocr_page(ocr, img_path):
    result, elapse = ocr(img_path)
    os.remove(img_path)
    if not result:
        return "", 0
    lines = []
    for item in result:
        bbox, text, conf = item[0], item[1], item[2]
        y = (bbox[0][1] + bbox[2][1]) / 2
        x = bbox[0][0]
        lines.append((y, x, text))
    # Sort top-to-bottom, left-to-right
    lines.sort(key=lambda t: (round(t[0] / 15) * 15, t[1]))
    text = "\n".join(l[2] for l in lines)
    return text, elapse[0]


def main():
    doc = fitz.open(PDF_PATH)
    total = doc.page_count
    print(f"[kb] {PDF_PATH}: {total} pages", flush=True)
    print("[kb] loading RapidOCR model...", flush=True)

    ocr = RapidOCR()
    print("[kb] model ready, starting...", flush=True)
    chapters = []
    cur_ch = None
    cur_sec = None
    start_pg = 0

    # Resume
    if os.path.exists(CHECKPOINT):
        ck = json.load(open(CHECKPOINT))
        start_pg = ck["page"]
        chapters = ck["chapters"]
        if chapters:
            cur_ch = chapters[-1]
            cur_sec = cur_ch["sections"][-1] if cur_ch["sections"] else None
        print(f"[kb] resume from page {start_pg + 1}")

    t_start = time.time()
    for pg in range(start_pg, total):
        t0 = time.time()
        img = render_page(doc, pg)
        text, ocr_t = ocr_page(ocr, img)

        # Detect headings
        for line in text.split("\n"):
            line = line.strip()
            ch_m = CH_PAT.match(line)
            sec_m = SEC_PAT.match(line)

            if ch_m:
                new_title = line
                # Skip if same as current chapter (page header repetition)
                if cur_ch and cur_ch["chapter"] == new_title:
                    pass
                else:
                    cur_ch = {"chapter": new_title, "page": pg + 1, "sections": []}
                    cur_sec = None
                    chapters.append(cur_ch)
                    print(f"[kb] p{pg+1:4d}  {new_title}")
                break
            elif sec_m:
                new_sec = line
                # Skip if same as current section (page header repetition)
                if cur_sec and cur_sec["section"] == new_sec:
                    pass
                else:
                    cur_sec = {"section": new_sec, "page": pg + 1, "content": text}
                    if cur_ch is None:
                        cur_ch = {"chapter": "前言/目录", "page": pg + 1, "sections": []}
                        chapters.append(cur_ch)
                    cur_ch["sections"].append(cur_sec)
                    print(f"[kb] p{pg+1:4d}    {new_sec}")
                break
        else:
            # Append to current section
            if cur_sec is not None:
                cur_sec["content"] += "\n" + text
            elif cur_ch is not None:
                cur_ch.setdefault("content", "")
                cur_ch["content"] += "\n" + text

        # Progress bar
        elapsed = time.time() - t_start
        rate = (pg - start_pg + 1) / elapsed if elapsed > 0 else 0
        eta = (total - pg - 1) / rate if rate > 0 else 0
        pct = 100 * (pg + 1) / total
        bar_w = 20
        done = int(bar_w * (pg + 1) / total)
        bar = "█" * done + "░" * (bar_w - done)
        print(f"\r[kb] [{bar}] {pct:4.0f}%  {pg+1}/{total}  eta:{eta:.0f}s",
              end="", flush=True)

        # Checkpoint every 20 pages
        if (pg + 1) % 20 == 0:
            json.dump({"page": pg + 1, "chapters": chapters},
                      open(CHECKPOINT, "w"), ensure_ascii=False)

    print()
    json.dump(chapters, open(OUTPUT, "w"), ensure_ascii=False, indent=2)
    print(f"[kb] done → {OUTPUT}  ({len(chapters)} chapters, {total} pages)")

    if os.path.exists(CHECKPOINT):
        os.remove(CHECKPOINT)


if __name__ == "__main__":
    main()
