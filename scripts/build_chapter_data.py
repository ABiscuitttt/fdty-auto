#!/usr/bin/env python3
"""从 chapters_summary.md 生成 JS 数据，嵌入 fdty_top.js"""
import re

SUMMARY_FILE = "chapters_summary.md"
TARGET_FILE = "fdty_top.js"

with open(SUMMARY_FILE) as f:
    content = f.read()

# 按 "---" 分割各章
blocks = re.split(r'\n---\n', content)
chapters = []

for block in blocks:
    block = block.strip()
    if not block:
        continue

    # 提取文件名和章名: ## 第一章_xxx.md
    h2 = re.search(r'^## (.+\.md)', block, re.MULTILINE)
    filename = h2.group(1) if h2 else ""

    # 提取章名: **xxx**
    bold = re.search(r'^\*\*(.+?)\*\*', block, re.MULTILINE)
    title = bold.group(1) if bold else ""

    # 提取摘要: > xxx
    quote = re.search(r'^> (.+)', block, re.MULTILINE)
    summary = quote.group(1) if quote else ""

    # 提取节标题列表
    sections = re.findall(r'^  - (.+)$', block, re.MULTILINE)

    chapters.append({
        "id": filename,
        "title": title,
        "summary": summary,
        "sections": sections,
    })

# 生成 JS
lines = ["/* 自动生成 — uv run python scripts/build_chapter_data.py */", "window.__CHAPTERS_DATA = ["]
for i, ch in enumerate(chapters):
    secs = ", ".join(f'"{s}"' for s in ch["sections"])
    lines.append(f'  {{id:"{ch["id"]}",title:"{ch["title"]}",summary:"{ch["summary"]}",sections:[{secs}]}}' +
                 ("," if i < len(chapters) - 1 else ""))
lines.append("];")

js_data = "\n".join(lines) + "\n"

# 读入 fdty_top.js，替换或插入数据
with open(TARGET_FILE) as f:
    target = f.read()

# 如果已有 __CHAPTERS_DATA，替换之
if "window.__CHAPTERS_DATA" in target:
    target = re.sub(
        r'/\*.*?\*/\s*window\.__CHAPTERS_DATA\s*=\s*\[[\s\S]*?\];',
        js_data.strip(),
        target
    )
else:
    # 插入到 var API_KEY 之前
    target = target.replace(
        "var API_KEY = window.__DEEPSEEK_KEY || '';",
        js_data + "\nvar API_KEY = window.__DEEPSEEK_KEY || '';"
    )

with open(TARGET_FILE, "w") as f:
    f.write(target)

print(f"嵌入 {len(chapters)} 章数据到 {TARGET_FILE} ({len(js_data)} chars)")
