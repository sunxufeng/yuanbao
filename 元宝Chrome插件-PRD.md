# 元宝 AI 浏览器助手（增强版）· 产品需求文档（PRD）

- **文档版本**：v0.1（评审稿）
- **创建日期**：2026-08-07
- **状态**：待评审
- **关联文档**：《元宝 Chrome 插件系统设计 v0.1》（架构与模型层增强设计）
- **需求原则**：EARS（Ubiquitous / Event-driven / Unwanted / State-driven / Optional）

---

## 1. 背景

元宝官方 Chrome 插件（1.0.16）当前支持混元（Hunyuan）与 DeepSeek 两款大模型，具备悬浮球、侧边栏、划词工具栏三大交互形态及翻译/总结/对话能力。用户反馈安装后有运行期报错（不影响使用），且模型选择受限，无法接入自有或第三方大模型。

本次增强目标：**在保持官方体验的前提下，将模型层抽象为可扩展的 Provider 架构**，支持常用大模型（GPT / Claude / Gemini / Qwen / GLM / Kimi / DeepSeek 官方 / Ollama）与用户自定义模型端点，并修复运行期噪声报错，提升多浏览器兼容性。

> 注：用户提供的 `yuanbaoerror.md` 经核实为一段打包 JS（含 background 逻辑与 declarativeNetRequest 规则），并非文字报错日志。真实报错需在 `chrome://extensions` 的「检查视图：后台页 / 内容脚本」控制台抓取（见 9.4）。

---

## 2. 目标

### 业务目标
- G1：模型可选择性从 2 款扩展到 9+ 预置 Provider，并支持无限自定义端点。
- G2：消除安装/运行期非阻断报错，后台与内容脚本零噪声。
- G3：Chrome 为主、Edge 同期、Firefox 可降级运行。

### 成功指标（可量化）
- M1：自定义模型配置成功率 ≥ 98%（用户填 baseURL+Key 后能正常对话）。
- M2：运行期 `console.error` / `runtime.lastError` 数量较 1.0.16 降至 0（非阻断类）。
- M3：模型切换平均耗时 < 500ms（本地路由，不涉及网络回退时）。
- M4：Firefox 加载成功率 100%（无 manifest 解析错误）。

---

## 3. 用户故事

- US1（普通用户）：作为经常浏览外文网页的用户，我希望把默认模型切到 GPT-4o，这样总结/翻译质量更符合我的习惯。
- US2（开发者）：作为本地用 Ollama 跑模型的用户，我希望填入 `http://127.0.0.1:11434/v1` 就能用本地模型，数据不出本机。
- US3（企业用户）：作为使用自建兼容网关的用户，我希望填一个 OpenAI 兼容端点 + Key 即可接入，不需要改代码。
- US4（隐私敏感用户）：作为在意密钥泄露的用户，我希望 API Key 只存在本机、不跨设备同步、可一键清除。
- US5（多浏览器用户）：作为 Firefox 用户，我希望插件至少能打开弹窗对话，不报错。

---

## 4. 功能清单（EARS）

### 4.1 模型 Provider 抽象层
- **Ubiquitous**：系统应始终通过 `ProviderManager` 按 `ModelEntry.providerId` 路由对话/翻译/总结请求，不直接耦合任一厂商网关。
- **Event-driven**：当 `saveProviders` 消息到达时，系统应将重建 ProviderManager 实例并刷新模型清单。
- **Optional**：Where 用户未配置第三方 Key，系统应保留内置 `yuanbao` Provider 作为默认回退。

### 4.2 预置常用大模型
- **Ubiquitous**：系统应在首次安装时写入 9 个预置 Provider（yuanbao / OpenAI / DeepSeek / Qwen / GLM / Kimi / Gemini / Claude / Ollama），其中 Ollama 默认关闭。
- **Event-driven**：当 Provider 类型为 `openai-compatible` 且 `extInfo.dialect='anthropic'` 时，系统应将其请求转换为 Anthropic 原生协议格式发送。

### 4.3 自定义模型
- **Ubiquitous**：系统应允许用户在选项页新增/编辑/删除自定义 Provider（type=`custom`），字段含 baseURL、apiKey、modelId、能力标记。
- **Event-driven**：当用户在选项页点击「测试连接」时，系统应向该 Provider 发送一次最小探测请求并返回连通结果。
- **Unwanted**：If 用户保存的自定义 Provider 缺少 `baseURL` 或 `modelId`，then 系统应阻止保存并提示「端点与模型 ID 必填」。

### 4.4 路由与回退
- **Event-driven**：When 当前选中模型请求返回错误或不可达，系统应自动回退至默认模型（优先 yuanbao）并在对话流中提示「已回退」。
- **State-driven**：While 选中模型非 `yuanbao` 且用户触发翻译/总结，系统应改用「该模型 chat + 专用 prompt」降级，保证功能不缺失。

### 4.5 翻译/总结专用能力
- **Ubiquitous**：系统应在选中 `yuanbao` 且模型具备 `translate` 能力时，优先调用 `hunyuan-translation` 专用端点。
- **Unwanted**：If `hunyuan-translation` 端点不可用，then 系统应降级为该模型的 chat 总结/翻译。

### 4.6 配置与数据安全
- **Ubiquitous**：系统应将 Provider 配置（含 apiKey）仅写入 `chrome.storage.local`，绝不写入 `storage.sync`。
- **Event-driven**：当用户在选项页点击「显示/隐藏」时，系统应切换该 Key 的明文/掩码展示。
- **Unwanted**：If 用户清空某 Provider 的 apiKey，then 系统应仅保留内置网关默认凭证（如有）。

### 4.7 多浏览器兼容
- **Ubiquitous**：系统应在不支持 `chrome.sidePanel` 的环境（Firefox）下，将主入口回退为工具栏弹窗（popup）。
- **Event-driven**：当 `BUILD_TARGET=firefox` 构建时，系统应产出不含 `sidePanel` 权限/`side_panel` 键、改用 `sidebar_action` 的 Firefox 清单。

---

## 5. 流程说明

### 5.1 对话主流程
1. 用户在侧边栏/弹窗输入 → 前端 `streamChat` 建立 Port 长连接。
2. 后台 SW 收到 `chat` 消息 → `ProviderManager.chatWithFallback` 按 `req.model` 解析 Provider。
3. Provider 流式返回 chunk → SW 经 Port 透传 → 前端渲染。
4. 失败 → 回退默认模型 → 提示「已回退」。

### 5.2 自定义模型接入流程
1. 选项页「+ 新增自定义」→ 填写 baseURL / apiKey / modelId。
2. 「测试连接」→ SW 调 `provider.test()`（最小探测）。
3. 「保存」→ `saveProviders` → SW 重建 manager → 模型选择器出现新模型。

### 5.3 翻译/总结流程
- yuanbao + translate 能力 → 专用端点。
- 其它 → chat + 专用 prompt 降级。

---

## 6. 交互说明

- **模型选择器**：合并「内置 + 常用 + 自定义」全部模型，按 Provider 分组展示；下拉含「默认模型」设置。
- **选项页**：Provider 卡片展示名称（内置禁用改名）、类型标签、启用开关、Base URL、API Key（掩码+显示/隐藏）、测试连接按钮、模型列表（id/标签）；自定义项可删除。
- **错误提示**：复用 `ModelSwitchErrorTip` 思路，回退/连通失败时给出轻量提示，不阻塞主流程。
- **快捷键**：Alt+O 打开侧栏，Alt+1 翻译选中，Alt+2 总结页面（Firefox 用 `_execute_sidebar_action`）。

---

## 7. 数据指标与埋点

| 指标 | 埋点事件 | 说明 |
|------|----------|------|
| 模型使用分布 | `model_used` {modelId, providerType} | 统计各模型调用占比 |
| 自定义接入成功 | `custom_provider_saved` {success} | 自定义端点保存结果 |
| 回退发生 | `model_fallback` {from, to} | 路由回退次数（健康度） |
| 翻译/总结降级 | `transform_degraded` {providerType} | 非元宝模型降级次数 |
| 运行期错误 | `runtime_error` {area, message} | 后台/内容脚本异常（目标=0） |

> 埋点需遵守隐私合规：不上报页面正文、不上报 apiKey、仅上报聚合计数与脱敏错误类型。

---

## 8. 边界场景与异常（EARS 补充）

- **Unwanted**：If 用户选中的模型在配置中不存在，then 系统应提示「未知模型」并回退默认模型。
- **Unwanted**：If 第三方端点 CORS 拒绝或返回非 2xx，then 系统应在对话流中返回错误块并触发回退。
- **State-driven**：While 处于隐私模式（用户开启「关闭第三方端点」开关，后续版本），系统应仅允许内置 yuanbao 调用。
- **Unwanted**：If `chrome.storage` 不可用（极少数环境），then 系统应降级为内存存储，保证本次会话可用。
- **Unwanted**：If 内容脚本被注入到受限页面（chrome://、PDF viewer 等）且无 `chrome.runtime`，then 系统应静默退出，不报错。

---

## 9. 权限与隐私

### 9.1 权限清单
- `storage`：读写 Provider 配置（仅 local）。
- `activeTab` / `scripting`：取当前页正文用于「问当前页」。
- `sidePanel`：Chrome 侧栏（Firefox 构建移除）。
- `commands`：快捷键。
- `host_permissions`：收敛为官方域 + 各厂商已知端点 + localhost，避免盲目 `<all_urls>` 注入信任。

### 9.2 隐私红线
- API Key 仅存 `storage.local`，不进 `sync`，不出现在任何同步/上报数据。
- 选项页 Key 默认掩码，提供清除。
- 自定义第三方端点的合规边界由用户在选项页确认（知情授权）。

### 9.3 报错修复（T1）
- 移除 `declarativeNetRequest` 强依赖（原疑似报错源之一）。
- 全部 chrome API 调用经 `safeChrome` 包裹，吞掉 `Unchecked runtime.lastError`。
- `onInstalled` 初始化默认配置并探测 sidePanel 能力，避免首装异常。

### 9.4 真实报错取证步骤
1. 打开 `chrome://extensions` → 开启「开发者模式」。
2. 点击本插件「检查视图：背景页」与「内容脚本」旁的「错误」/控制台。
3. 复现报错动作，复制完整错误栈贴回，定位后修复。

---

## 10. 验收标准

| 编号 | 验收项 | 通过条件 |
|------|--------|----------|
| AC1 | 多模型对话 | 在模型选择器切换 GPT-4o / Claude / Gemini / Qwen / GLM / Kimi 均可流式对话 |
| AC2 | 自定义模型 | 填 Ollama 端点后对话成功；填错误端点时提示失败且不崩溃 |
| AC3 | 回退 | 拔掉网络/填错 Key，对话自动回退默认模型并提示 |
| AC4 | 翻译/总结降级 | 非元宝模型下翻译/总结仍可用（chat+prompt） |
| AC5 | 零噪声报错 | 后台/内容脚本控制台无 `runtime.lastError` 类报错 |
| AC6 | 密钥安全 | apiKey 仅存 storage.local；选项页掩码、可清除 |
| AC7 | 多浏览器 | Chrome + Edge 正常；Firefox 构建可加载、弹窗可用 |
| AC8 | 测试 | 单测（路由/回退/降级）全绿；E2E（options 渲染/新增自定义）通过 |
| AC9 | 构建 | `npm run build` 与 `npm run build:firefox` 均成功产出可加载包 |

---

## 11. 范围与非目标

**范围内**：Provider 抽象层、9 预置模型、自定义模型、路由回退、翻译/总结降级、报错修复、多浏览器清单、选项页管理、单元+E2E 测试。

**非目标（本期不做）**：
- 正文抽取增强（Readability 改良，P0 留待 M2）。
- 收藏/历史的云同步（需账号体系，单独评估）。
- 视觉问答多模态的完整 UI（仅保留能力路由，UI 后续补）。
- 移动端浏览器。

---

## 12. 风险与待确认

- R1：自定义第三方 Key 的泄露/合规风险（已确认允许，但需在选项页明确告知）。
- R2：部分 OpenAI 兼容端点的 SSE 字段差异（已用通用解析，长尾需反馈迭代）。
- R3：Firefox 真机未在沙箱验证（仅构建通过 + 弹窗降级逻辑，需人工在 Firefox 跑一遍）。
- R4：真实运行期报错栈待用户在真浏览器抓取（9.4 步骤）以闭环 T1。

---

## 13. 评审材料与流转建议

- 本 PRD 评审通过后，建议创建评审事项并分配给：技术负责人（架构/接口）、设计师（选项页/选择器交互）、测试（AC1–AC9）。
- 关联交付物：《系统设计 v0.1》《yuanbao-extension 工程》（已含实现与测试）。
- 评审结论沉淀至项目资料库；待办问题拆成事项分配给对应负责人。
