#!/usr/bin/env python3
"""上传 fdty_top.js 到阿里云 OSS"""
import os, sys
import oss2

# 配置
BUCKET = "fdty"
ENDPOINT = "oss-cn-beijing.aliyuncs.com"
URL = f"https://{BUCKET}.{ENDPOINT}"

SRC = "fdty_top.js"
DST = "fdty_top.js"

ACCESS_KEY = os.environ.get("OSS_ACCESS_KEY")
ACCESS_SECRET = os.environ.get("OSS_ACCESS_SECRET")

if not ACCESS_KEY or not ACCESS_SECRET:
    # 尝试从 .oss_credentials 文件读取
    cred_file = os.path.join(os.path.dirname(__file__), "..", ".oss_credentials")
    if os.path.exists(cred_file):
        with open(cred_file) as f:
            for line in f:
                line = line.strip()
                if line.startswith("#") or not line:
                    continue
                if "=" in line:
                    key, val = line.split("=", 1)
                    if key.strip() == "OSS_ACCESS_KEY":
                        ACCESS_KEY = val.strip()
                    elif key.strip() == "OSS_ACCESS_SECRET":
                        ACCESS_SECRET = val.strip()

if not ACCESS_KEY or not ACCESS_SECRET:
    print("请设置环境变量 OSS_ACCESS_KEY 和 OSS_ACCESS_SECRET")
    print("或创建 .oss_credentials 文件（已加入 .gitignore）")
    sys.exit(1)

auth = oss2.Auth(ACCESS_KEY, ACCESS_SECRET)
bucket = oss2.Bucket(auth, ENDPOINT, BUCKET)

bucket.put_object_from_file(DST, SRC)

print(f"上传完成: {URL}/{DST}")
