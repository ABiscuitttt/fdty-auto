#!/usr/bin/env python3
"""提取所有章节大纲 + 摘要，输出到单个文件"""
import json, os, re, urllib.request

API_KEY = os.environ.get("DEEPSEEK_API_KEY", "")
API_URL = "https://api.deepseek.com/chat/completions"
MODEL = "deepseek-v4-flash"
CHAPTER_DIR = "chapters"
OUT_FILE = "chapters_summary.md"


def extract_headings(content):
    """提取所有标题"""
    headings = []
    for line in content.split("\n"):
        line = line.strip()
        if line.startswith("# "):
            headings.append(("H1", line[2:]))
        elif line.startswith("## "):
            headings.append(("H2", line[3:]))
        elif line.startswith("### "):
            headings.append(("H3", line[4:]))
    return headings


def call_summary(text):
    """调用 API 生成摘要"""
    body = json.dumps({
        "model": MODEL,
        "temperature": 0.1,
        "thinking": {"type": "disabled"},
        "max_tokens": 512,
        "messages": [
            {"role": "system", "content": "你是一个文档摘要助手。输出一段 60-100 字的中文摘要，概括章节主要内容和知识点。只输出摘要。"},
            {"role": "user", "content": text[:3000]}
        ]
    }).encode()

    req = urllib.request.Request(API_URL, data=body, headers={
        "Content-Type": "application/json",
        "Authorization": f"Bearer {API_KEY}"
    })

    with urllib.request.urlopen(req, timeout=120) as resp:
        data = json.loads(resp.read())
        return data["choices"][0]["message"]["content"].strip()


def main():
    if not API_KEY:
        print("请设置 DEEPSEEK_API_KEY 环境变量")
        return

    files = sorted(os.listdir(CHAPTER_DIR))
    output = "# 大学体育 章节大纲\n\n"

    for fname in files:
        if not fname.endswith(".md"):
            continue
        fpath = os.path.join(CHAPTER_DIR, fname)
        with open(fpath) as f:
            content = f.read()

        headings = extract_headings(content)
        title = headings[0][1] if headings and headings[0][0] == "H1" else fname

        # 生成摘要
        print(f"摘要: {title} ...")
        summary = call_summary(content)

        # 写入单文件
        output += f"## {fname}\n\n"
        output += f"**{title}**\n\n"
        output += f"> {summary}\n\n"

        for level, text in headings[1:]:  # 跳过 H1 章标题
            prefix = "    -" if level == "H3" else "  -"
            output += f"{prefix} {text}\n"

        output += "\n---\n\n"

    with open(OUT_FILE, "w") as f:
        f.write(output)
    print(f"\n→ {OUT_FILE}")


if __name__ == "__main__":
    main()
