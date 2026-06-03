# fdty-auto 答题准确率提升设计：升级 v4-pro + 分层投票

日期：2026-06-03
状态：已确认，待实现

## 背景与目标

`fdty_top.js` 是浏览器控制台脚本，用 DeepSeek 自动作答复旦体育理论考试（通常 50 道判断题），采用两阶段投票仲裁。

当前准确率约 90%，目标是在**不大动提示词、不引入评测体系**的前提下提升准确率，且改动必须稳妥（真实考试机会少、试错成本高）。

## 关键事实（决定设计的两个发现）

1. **模型可升级且零格式风险**：当前 `model` 为 `deepseek-v4-flash`（284B 总参 / 13B 激活）。`deepseek-v4-pro`（1.6T 总参 / 49B 激活）是同一 API、同一请求格式的更强模型，仅需替换 `model` 一个字段。端点 `https://api.deepseek.com/chat/completions` 是 DeepSeek 自有端点（OpenAI 兼容格式），非 OpenAI 端点。
   - 来源：https://api-docs.deepseek.com/quick_start/pricing

2. **思考模式下 temperature 不生效**：DeepSeek 文档明确，思考模式会忽略 `temperature`、`top_p`、`presence_penalty`、`frequency_penalty`。当前代码 Phase 1 用三个温度（0.1/0.6/1.2）制造投票差异，但因为一直开着 `thinking: enabled`，这三票实际是**同参数重跑**，温度从未生效。三票差异只来自模型采样随机性。
   - `reasoning_effort` 是真正生效的思考强度参数，合法值 `high` / `max`（`low`/`medium`→`high`，`xhigh`→`max`）。当前 `reasoning_effort: 'max'` 合法且为最高档。
   - 来源：https://api-docs.deepseek.com/guides/thinking_mode

## 设计决策（方案 B：换 pro + 分层投票，temperature 退役）

核心思路：pro 单票已足够强，不必每题平摊 3 票；把预算从"每题平摊"改为"难题集中"。

### 改动清单

改动文件：`fdty_top.js`，外加 `README.md` 原理小节同步。

1. **模型升级**
   - `callAPI` 请求体 `model: 'deepseek-v4-flash'` → `'deepseek-v4-pro'`。

2. **退役 temperature（因其在思考模式下无效，留着会误导）**
   - `callAPI(qs, temp)` 移除 `temp` 形参，请求体删除 `temperature` 字段。
   - 删除 Phase 1 的 `var temps = [0.1, 0.6, 1.2]`。
   - 保留 `thinking: { type: 'enabled' }` 与 `reasoning_effort: 'max'`（真正生效的参数）。

3. **Phase 1 改为 2 票**
   - 每题并发跑 2 次 pro（原为 3 次）。
   - 两票一致即采纳；不一致进 Phase 2。
   - 采纳判定：`if (best && max === 3)` → `max === 2`（`fdty_top.js` 现 234 行附近）。
   - **分歧判定同步改**：Phase 1 结束后的 disputed 收集 `if (!r.best || r.count < 3)` → `r.count < 2`（现 247 行附近）。否则 2 票时 `r.count < 3` 恒成立，会导致每题都被判分歧、全部涌入 Phase 2。两处阈值必须一起从 3 降到 2。
   - 面板提示文案中"每题3票"相应改为"每题2票"（现 214 行附近）。

4. **Phase 2 仲裁维持不变**
   - 分歧题每题 10 票，`reasoning_effort: 'max'`，`max >= 8` 采纳，否则输出到控制台供人工判断。
   - 票数、阈值、输出逻辑全部保留。

### 不改动的部分

- SYSTEM_PROMPT（提示词）——符合"机会少、别乱动"的约束。
- 悬浮面板逻辑、`MAX_CONCURRENCY = 5` 并发数。
- 题目提取逻辑、答案选择 `selectAnswer`。
- OSS 上传链路、`.githooks/pre-push`。

## 净效果

- **准确率**：单调 ≥ 现状（pro 强于 flash，其余逻辑不削弱）。
- **成本/耗时**：Phase 1 调用从 50×3=150 次降到 50×2=100 次，抵消 pro 单价更贵的影响；难题仲裁稳健性原样保留。
- **代码诚实度**：移除从未生效的 temperature，使代码反映真实行为。

## 验证方式

- 不做评测（用户明确要求）。
- `node --check fdty_top.js` 保证语法不破。
- 准确率提升只能靠下次真实考试验证。

## 实现时需顺手核实（不改逻辑）

1. `max_tokens: 4096` 对 pro 是否够用。单题 JSON 答案很短，`max_tokens` 通常指最终回答上限（不含思维链），预计绰绰有余；确认其对 pro 的语义无误即可，预期无需改动。
2. README "原理"小节：当前未写死 model 名，但描述了"每道题用 3 个不同温度并行调用"。需同步为"2 票"且移除"不同温度"的措辞（因温度不生效）。

## 范围外（本次明确不做）

- 方案 A（仅换模型、保留 3 票同参数重跑）——被本方案取代。
- 方案 C（引入第二个异源模型交叉复核）——改动面与试错需求过大，与"少折腾"约束冲突，记录为未来可选的捅破上限手段。
- 本地评测集 / 离线跑分体系——用户明确不要。
- 提示词工程优化。
