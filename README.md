# 复旦体育理论考试自动答题

## 使用方法

1. 登录复旦体育考试页面，进入答题界面
2. 打开浏览器开发者工具（F12 → Console）
3. 控制台粘贴下面两行，回车执行（替换 `sk-xxx` 为你的 Key）：

```js
window.__DEEPSEEK_KEY = 'sk-xxx';
var s = document.createElement('script'); s.src = 'https://fdty.oss-cn-beijing.aliyuncs.com/fdty_top.js'; document.head.appendChild(s);
```

## 原理

- 从考试页面提取题目，调用 DeepSeek API 进行多轮投票仲裁
- 是非题三次随机温度投票，不一致的题目逐题 10 次仲裁
- 仍然无法确定的高分歧题目输出到控制台，需人工判断

## 环境变量

运行 `chapter_to_md.py` 前需设置：

```bash
export DEEPSEEK_API_KEY="sk-xxx"
```
