# 这是一个标题

本项目受到 [fdty](https://github.com/KevinWang15/fdty) 的启发，延续了"一键自动答题"的思路，但采用了完全不同的技术路线——用 AI 替代本地题库匹配，无需维护题库即可应对任意题目。

## 与 fdty 的区别

| | fdty | fdtyexam |
|---|---|---|
| 答题方式 | 本地题库匹配 | DeepSeek AI 推理 |
| 题库维护 | 需要人工收集更新 | 无需题库，AI 直接作答 |
| 新题处理 | 匹配不到需手动百度 | AI 自动推理，争议题才需人工 |
| 联网搜索 | 无 | 已移除（原支持智谱搜索） |
| 投票机制 | 无 | 多温度三票 + 分歧十票仲裁 |

## 使用方法

1. 登录复旦体育考试页面，进入答题界面
2. 打开浏览器开发者工具（F12 → Console）
3. 在控制台粘贴以下代码，替换 `sk-xxx` 为你的 DeepSeek API Key，回车执行：

```js
window.__DEEPSEEK_KEY = 'sk-xxx';
var s = document.createElement('script'); s.src = 'https://fdty.oss-cn-beijing.aliyuncs.com/fdty_top.js'; document.head.appendChild(s);
```

## 原理

- **题目提取**：从考试页面自动解析是非题和单选题
- **Phase 0**：AI 判断每道题出自教材哪个章节，按需加载对应知识点
- **Phase 1**：每道题用 3 个不同温度（0.1/0.6/1.2）并行调用 DeepSeek，全票一致则直接作答
- **Phase 2**：Phase 1 未一致的题目，每题 10 次投票（温度 0.3），≥8 票才采纳；仍分歧的题目输出到控制台供人工判断

## 致谢

- [KevinWang15/fdty](https://github.com/KevinWang15/fdty) —— 本项目的最初灵感来源
