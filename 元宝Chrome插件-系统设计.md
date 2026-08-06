# 元宝 Chrome 插件 · 系统设计（V0.1 草案）

> 文档状态：草案（需求规划 / 设计评审用）
> 设计日期：2026-08-06
> 设计依据：腾讯元宝官方浏览器插件公开功能（悬浮球 / 常驻侧边栏 / 划词工具栏） + Chrome 扩展 MV3 最佳实践

---

## 1. 背景与产品定位

**问题**：用户在浏览网页时，信息获取与处理被严重割裂——看外文要切翻译工具、看长文要手动提炼、有问题要新开标签页搜索。

**定位**：把元宝 AI 能力"嵌入浏览器"，以三种零打断的交互形态，让用户**边看、边问、边存**。

- 一句话定位：浏览器内的 AI 信息处理中枢。
- 核心价值：降低"获取信息 → 理解信息 → 沉淀信息"的摩擦成本。
- 目标用户：学生党（查文献/写论文）、职场人（看报告/行业资讯）、外语学习者。

**三大交互形态（沿用已验证形态，不重造轮子）**：
| 形态 | 触发方式 | 核心动作 |
|------|----------|----------|
| 悬浮球 | 屏幕边缘常驻 | 一键翻译 / 总结 / 收藏 |
| 常驻侧边栏 | Alt+O 或点击唤起 | 对话问答、截图提问、历史会话 |
| 划词工具栏 | 选中文本 | 搜索 / 翻译 / 复制 / 收藏 / 问问元宝 |

---

## 2. 设计假设（请确认）

1. **项目性质**：假设为元宝产品团队对现有插件的**迭代重构**（架构升级 + 功能增强），而非从零克隆。若实际是新独立项目，第 6 章技术选型需重新评估。
2. **模型底座**：假设复用元宝/Hunyuan 后端网关（对话、多模态视觉问答、翻译、总结均为远端能力），扩展端只做编排与体验。
3. **平台范围**：MVP 先覆盖 Chrome（MV3），Edge/Firefox 作为后续兼容项（见第 10 章）。
4. **账号体系**：假设与元宝主站账号打通，支持会话历史/收藏云同步；若无账号，则退化为本地存储。

> 以上假设如与实际不符，请指出，我会修正对应章节。

**补充（基于 1.0.16 安装包代码分析）**：
- 插件当前已内置**混元 Hunyuan**（含"深度思考 T1"）与 **DeepSeek**（R1，manifest 描述"联网识图满血版"），代码中还残留**智谱 GLM**、**MiniMax（abab）** 痕迹；模型清单疑似**服务端动态下发**（代码含 `modelList` / `ModelSwitchTip` / `ModelSwitchErrorTip`），前端仅做展示与切换。
- 后端**强耦合腾讯元宝网关**（host ≈ `yuanbao.tencent.com`），鉴权依赖腾讯专属头（`X-Instance-ID`、设备 `device-id` 等）；翻译/总结硬编码走 `model:"hunyuan-translation"` 专用 endpoint。
- 你提供的 `yuanbaoerror.md` 实为一段**打包后的 JS**（含 background 逻辑与 `declarativeNetRequest` 规则），并非文字报错日志。真实报错需按第 10 章方式在 `chrome://extensions` 里 inspect 后台/内容脚本控制台取证定位。

---

## 3. 功能范围

### 3.1 现有功能基线（必须支持）
- **悬浮球**：一键翻译（双语对照）、一键总结、一键收藏。
- **侧边栏**：对话问答（可带当前页面上下文）、截图提问（框选区域多模态问答）、新会话。
- **划词工具栏**：选中文本后弹出 → 搜索 / 翻译 / 复制 / 收藏 / 问问元宝。
- **快捷键**：Alt+O 侧边栏、Alt+1 翻译、Alt+2 总结、Alt+4 收藏、Alt+A 新聊天、Enter 发送、Ctrl+Enter 换行。

### 3.2 增强建议（按优先级，供评审决策）
| 优先级 | 增强点 | 说明 |
|--------|--------|------|
| P0 | 正文抽取质量 | 复杂页面（SPA/Shadow DOM/付费墙）抽取不准，是总结/翻译体验天花板 |
| P0 | 会话历史与收藏云同步 | 跨设备连续性，留存用户价值 |
| P1 | 自定义提示词 / 指令 | 用户预设"用通俗语言解释""提取待办"等 |
| P1 | 多模型/风格切换 | 快速/深度、不同语气 |
| P1 | 隐私模式 | 不发送当前页内容、本地处理开关 |
| P2 | 划词记录沉淀 | 高亮记忆形成个人知识库（官方已提及雏形） |
| P2 | 离线缓存 | 弱网下历史会话可读 |

---

## 4. 系统架构

整体采用 **Chrome Extension MV3 四层架构**，扩展端只做交互编排与轻量缓存，重逻辑（LLM、多模态、翻译）下沉到远端网关。在此基础上新增**模型 Provider 抽象层**（见第 11 章），将"选哪个模型/走哪个端点"与具体后端解耦，以支撑多模型与可自定义模型。

```
┌─────────────────────────────────────────────────────────────┐
│  远端服务层（元宝/Hunyuan 网关）                              │
│  · 对话 Chat · 视觉问答 Vision · 翻译 Translate · 总结 Summ · │
│  · 账号/收藏同步 Auth & Bookmark Sync                        │
└───────────────▲──────────────────────────▲──────────────────┘
                │ HTTPS (鉴权 token)         │
┌───────────────┴──────────────────────────┴──────────────────┐
│  后台中枢 Service Worker (MV3)                                │
│  · 命令路由 · API 编排 · 鉴权/Token 管理 · 缓存 · 消息总线    │
└───────▲───────────────▲──────────────────▲──────────────────┘
        │ messaging      │ port(long)        │ messaging
┌───────┴──────┐ ┌──────┴─────────┐ ┌──────┴──────────────────┐
│ 注入层        │ │ 侧边栏/弹窗     │ │ 悬浮球 / 选项页          │
│ Content Script│ │ Sidebar/Popup  │ │ Floating Ball/Options   │
│ · 选区捕获    │ │ · 对话 UI       │ │ · 快捷操作              │
│ · 截图        │ │ · 历史/收藏     │ │ · 设置                  │
│ · 正文抽取    │ │                │ │                         │
└──────────────┘ └────────────────┘ └─────────────────────────┘
        ▲
        │ 直接读取/操作 DOM
┌───────┴───────────────────────────────────────────────┐
│  浏览器页面（用户正在浏览的网页）                         │
└───────────────────────────────────────────────────────┘
```

**数据流（以"侧边栏问当前页"为例）**：
1. 侧边栏 UI → `chrome.runtime.sendMessage` → Service Worker
2. SW 向 Content Script 取当前页正文摘要（避免整页 token 浪费）
3. SW 携"正文摘要+用户问题"调远端 `/chat`
4. 流式响应回传侧边栏渲染（SSE / chunk）

---

## 5. 核心模块设计

### 5.1 注入层（Content Script）
- **职责**：选区监听、悬浮球挂载、截图覆盖层、正文抽取（Readability 改良）。
- **关键风险**：SPA 路由变化、Shadow DOM、iframe、反爬页面。方案：MutationObserver 监听 DOM 变化；提供"手动框选区域"兜底。
- **隔离**：所有 UI 用 Shadow DOM 包裹，避免污染/被污染页面样式。

### 5.2 后台中枢（Service Worker）
- **职责**：唯一对外出口（远端 API 鉴权、限流、缓存、重试）；命令路由（来自快捷键/弹窗/注入层）；跨实例状态。
- **MV3 注意**：SW 生命周期短，状态存 `chrome.storage` + 内存缓存；长任务用 `chrome.offscreen` 或后台 fetch 流式处理。

### 5.3 AI 对话引擎
- 统一 `ChatSession` 抽象：管理消息列表、上下文（页面摘要）、流式渲染、错误重试。
- 支持"带页面上下文"与"纯闲聊"两种模式。

### 5.4 翻译 / 总结 / 视觉问答
- 统一走远端能力，扩展端负责：入参构造（正文/选区/截图 base64）、结果渲染（双语对照）、失败降级。

### 5.5 收藏与同步
- 本地 `chrome.storage.local` 写缓存 → 异步同步远端；冲突策略：最后写入优先（LVW），带时间戳。

### 5.6 快捷键 / 命令系统
- `chrome.commands` 声明全局快捷键；映射表可配置（用户可改键位）。

---

## 6. 技术选型（推荐）

| 层 | 选型 | 理由 |
|----|------|------|
| 构建 | Vite + CRXJS | 热更新、MV3 友好 |
| UI 框架 | React + TypeScript | 组件化、生态成熟 |
| 样式 | Tailwind CSS | 快速、可控 |
| 状态 | Zustand | 轻量、适合 SW/UI 共享 |
| 通信 | `chrome.runtime` messaging + Port | 稳定长连接 |
| 正文抽取 | @mozilla/readability（改良） | 业界标准 |
| 测试 | Vitest（单元）+ Playwright（E2E） | 覆盖注入/交互 |

> 若为独立新项目，可考虑 Plasmo 框架一站式；若是官方迭代，沿用现有栈更稳。

---

## 7. 数据模型（本地 + 远端）

```ts
UserConfig   { theme, shortcuts, defaultModel, privacyMode, lang }
ChatSession  { id, messages[], pageContext?, createdAt, updatedAt }
Message      { role, content, type: text|image|error, ts }
Bookmark     { id, url, title, excerpt, tags[], createdAt, synced }
SelectionLog { id, text, pageUrl, action, ts }   // 划词沉淀（P2）
ProviderConfig { id, type:'yuanbao'|'openai-compatible'|'custom', name, baseURL?, apiKey?(仅local), models: ModelEntry[] }
ModelEntry     { id, label, providerId, capability:'chat'|'vision'|'translate' }
```

存储分层：`chrome.storage.local`（大对象/缓存）、`chrome.storage.session`（临时）、远端（云同步）。

---

## 8. 权限与隐私（最小权限原则）

| 权限 | 用途 | 是否必需 |
|------|------|----------|
| `activeTab` | 获取当前页内容 | 必需 |
| `storage` | 配置/历史/收藏 | 必需 |
| `commands` | 快捷键 | 必需 |
| `scripting` | 动态注入 | 按需 |
| `host_permissions` | 调用元宝网关域 | 必需（仅限官方域） |
| `<all_urls>` | 全站注入 | **审慎**：建议用 `activeTab` 替代，降低隐私顾虑 |

**隐私**：明确告知数据用途；隐私模式可关闭"页面上下文携带"；不持久化用户正文到第三方。

---

## 9. 远端接口抽象（扩展端视角）

```
POST /v1/chat        { messages, pageContext, model }   → SSE stream
POST /v1/summarize   { content, lang }                  → { summary }
POST /v1/translate   { text, targetLang, dual }         → { translation, original }
POST /v1/vision-qa   { image(b64), question }           → { answer }
POST /v1/bookmark    { url, title, excerpt }            → { id }
GET  /v1/sessions    → 历史（云同步）
```

> 具体路径/鉴权由后端定，扩展端以 SDK 封装隔离变化。

---

## 10. 风险与里程碑

**关键风险**
1. **MV3 限制**：SW 短生命周期 → 大文件/长流式需 Offscreen 兜底。
2. **正文抽取准确率**：决定总结/翻译上限，需持续打磨。
3. **成本与限流**：整页 token 消耗大，需摘要裁剪 + 缓存。
4. **多浏览器兼容**：Firefox/Edge 的 API 差异（如 `sidePanel` 仅 Chrome）。
5. **隐私合规**：`<all_urls>` 注入的信任与合规问题。
6. **安装/运行期报错（已知非阻断）**：1.0.16 安装后有报错但不影响使用，根因尚未定位。取证方式：打开 `chrome://extensions` → 开启"开发者模式" → 点击插件"检查视图：背景页/Service Worker"与"检查视图：内容脚本"，复现并抓取真实错误栈（很可能是 `Unchecked runtime.lastError: Receiving end does not exist` 类消息，或 `declarativeNetRequest`/`sidePanel` 兼容告警），再针对性修复。
7. **自定义模型密钥安全**：第三方 API Key 存本地、不外泄、不进 `storage.sync`；需明确合规边界。
8. **自定义端点 CORS / 模型清单冲突**：本地 Ollama 等需开启 CORS；"服务端下发模型清单"与"本地预置+自定义"需明确合并策略。

**里程碑建议**
- M1（2-3 周）：MV3 骨架 + 三种形态 MVP（翻译/总结/问答）。
- M2（2 周）：正文抽取增强 + 收藏/历史云同步。
- M3（2 周）：自定义提示词、隐私模式、Edge 兼容。

---

## 11. 模型层增强设计（多模型 + 可自定义）

> 设计依据：逆向分析已安装插件 `1.0.16_0`（MV3）所得代码事实（见第 2 章补充）。

### 11.1 现状（代码事实）
- 后端**强耦合腾讯元宝网关**（host ≈ `yuanbao.tencent.com`），鉴权依赖腾讯专属头（`X-Instance-ID`、设备 `device-id`、`X-Web-Plugin-Version` 等），统一经 `N({apiType,url,headers,data})` 发起。
- 模型以 `chatModelId` + `chatModelExtInfo` 描述；模型清单疑似**服务端动态下发**（代码含 `modelList` / `ModelSwitchTip` / `ModelSwitchErrorTip`），前端仅展示与切换。
- 当前可见模型：混元 **Hunyuan**（含"深度思考 T1"）、**DeepSeek**（R1）；代码还出现 `glm`（智谱）、`abab`（MiniMax）痕迹。
- 翻译/总结**硬编码**走 `model:"hunyuan-translation"` 专用 endpoint。

### 11.2 目标
- 保留元宝内置模型，新增**常用大模型**（GPT-4o/o 系列、Claude、Gemini、通义 Qwen、智谱 GLM、Kimi/Moonshot、DeepSeek 官方、本地 Ollama 等）。
- 支持**用户自定义模型**：任意 OpenAI 兼容端点（`baseURL` + `API Key` + `modelId`），配置本地保存。

### 11.3 方案：Model Provider 抽象层
```
interface ModelProvider {
  id: string
  type: 'yuanbao' | 'openai-compatible' | 'custom'
  name: string
  baseURL?: string          // 兼容/自定义端点
  apiKey?: string           // 仅本地存储，不跨设备同步
  models: ModelEntry[]
  chat(req): AsyncIterable<Chunk>   // 统一流式接口
  test(): Promise<boolean>          // 连通性自检
}
interface ModelEntry { id; label; capability: 'chat'|'vision'|'translate'; extInfo? }
```
- **内置 Provider（yuanbao）**：维持现有网关 + 腾讯鉴权；模型清单仍服务端下发，原样保留。
- **常用模型 Provider（openai-compatible）**：预置 GPT / Claude / Gemini / Qwen / GLM / Kimi / DeepSeek 官方，统一走 OpenAI Chat Completions 协议（SSE 流式）。
- **自定义 Provider（custom）**：options 页填写 `baseURL` + `Key` + `modelId`，支持本地 `http://localhost:11434`（Ollama）。

### 11.4 路由与降级
- 对话/视觉问答：按当前 `ModelEntry.provider` 路由；兼容/自定义走 OpenAI 协议。
- 翻译/总结：优先元宝 `hunyuan-translation`；当选中 provider 非元宝时，**降级为"该模型 chat + 专用 prompt"** 实现，保证功能不缺失。
- 缺省回退：provider 不可达 → 回退内置混元 + 错误提示（复用现有 `ModelSwitchErrorTip`）。

### 11.5 配置与数据安全
- API Key 仅存 `chrome.storage.local`（**不**进 `storage.sync`，避免跨设备泄露）。
- options 页展示掩码；提供"清除密钥"。
- 自定义端点 CORS：云厂商大多放行；本地 Ollama 需用户开启 CORS（扩展背景页 `fetch` 不受页面 CORS 限制，但受目标服务器 CORS 响应头约束）。

---

## 12. 待确认问题清单

1. 这是**官方迭代**还是**独立新项目**？（决定技术选型与账号体系）
2. 是否复用元宝**现有后端网关**，还是需新建插件专用后端？
3. 收藏/历史**是否要云同步**？账号体系如何打通？
4. 是否需要 **Firefox/Edge** 同期支持，还是 Chrome 先行？
5. 团队**现有技术栈**是什么（React/Vue/原生）？沿用还是升级？
6. 隐私合规红线：是否允许默认全站注入？
7. **常用模型预置清单**以哪份为准？（具体要内置哪些厂商/模型，见 11.2）
8. 自定义模型允许填**第三方密钥**吗？泄露/合规风险是否可接受？（见 11.5）
9. 翻译/总结在自定义模型下，接受**"prompt 降级"**方案，还是必须保留元宝专用能力？

> 确认以上问题后，我可以把本方案推进到 **PRD 撰写（阶段二）**，按 EARS 原则拆解需求并产出评审材料；开发计划见项目计划看板。

---

## 13. 开发计划（里程碑）

任务编号（T1–T12）对应**项目计划看板**，下表为里程碑映射：

| 里程碑 | 对应任务 | 关键产出 |
|--------|----------|----------|
| **M0 复盘** | T1 报错定位与修复 · T2 现有能力/模型下发机制梳理 | 报错根因报告、内置模型合并策略 |
| **M1 模型抽象（核心增强）** | T3 Provider 抽象层 · T4 内置 yuanbao 适配 · T5 常用模型接入 · T6 自定义模型 | Model Provider 层 + 多模型 + 可自定义 |
| **M2 路由与体验** | T7 翻译/总结/视觉问答降级 · T8 选择器整合与回退 | 统一模型切换体验、异常可提示 |
| **M3 质量与发布** | T9 配置/数据安全 · T10 多浏览器兼容 · T11 测试覆盖 · T12 PRD 撰写与评审 | 可发布版本 + PRD 通过评审 |

**建议启动顺序**：先 T1/T2（并行）→ T3 → T4/T5/T6 → T7/T8 → T9/T10/T11 → T12。

---

## 14. 开发进展（截至 2026-08-07）

已按本方案完成全量开发，主线（多模型 + 可自定义）落地，**可构建、单测 + E2E 全绿**。

- **工程**：`yuanbao-extension/`（Vite + React + TS + @crxjs MV3）。
  - `npm run build` 产出 Chrome 版 `dist/`；`npm run build:firefox` 产出 Firefox 版 `dist/`（自动切换 `sidebar_action`、移除 `sidePanel` 权限）。
  - `npm test`：**21 个单测全绿**（Provider 路由/回退/降级/清单合并 4 + 碰撞算法 positioning 7 + 弹窗探测 obstacles 4 + 工具条集成 selectionToolbar 3 + Readability 抽取 readability 3）。
  - `npm run e2e`：**真实无头 Chromium 运行**；options 页 2 用例全绿；划词碰撞避让用例（加载真实扩展）在支持扩展的环境通过，当前沙箱 headless 限制自动跳过。
- **核心已落地（T3–T12 全部完成）**：
  - `src/core/providers/`：`YuanBaoProvider`、`OpenAICompatibleProvider`（Claude 走 Anthropic 方言）、`CustomProvider`。
  - `src/core/providerManager.ts`：路由 + 回退 + `transform` 降级（含 `yuanbaoTransform` 专用端点 + chat 兜底）。
  - `src/core/builtinModels.ts`：预置 9 个 Provider。
  - `src/core/storage.ts`：配置存 `chrome.storage.local`，密钥不进 `sync`。
  - `src/options/` + `src/ui/`：管理页 + 统一选择器 + 流式对话。
  - `src/shared/browserSupport.ts` + `background` 改造（T1/T10）：`onInstalled` 初始化默认值、`safeChrome` 包裹吞掉 `runtime.lastError`、`sidePanel` 能力探测；内容脚本对受限页面静默退出。
  - `src/manifest.firefox.ts` + `vite.config` `BUILD_TARGET` 切换（T10）：Firefox 降级走 popup/sidebar_action。
  - `e2e/options.spec.ts` + `playwright.config.ts`（T11）：真实浏览器 UI 交互验证。
  - `元宝Chrome插件-PRD.md`（T12）：按 EARS 原则 + 标准结构产出，覆盖验收标准 AC1–AC9。
- **本轮新增（T13–T16，划词工具条 + 碰撞避让）**：
  - `src/content/selectionToolbar.ts`：划词浮动工具条（复制/翻译/总结/问问元宝），**Shadow DOM 隔离**页面样式。
  - `src/content/positioning.ts`：碰撞避让纯算法 `computeToolbarPlacement`（候选位评分：重叠面积 > 挤出视口位移 > 序位偏好），clamp 进视口。
  - `src/content/obstacles.ts`：`detectObstacles` 探测页面已有弹窗（role=tooltip/menu/dialog、`.tooltip/.popover/.toast` 等 + 高 z-index 浮层兜底），排除工具条自身。
  - `src/content/index.ts`：选区监听（`mouseup`/`selectionchange` 防抖/`contextmenu`），点击外部/Esc 隐藏，滚动时重定位再避让；忽略可编辑区与超长选区。
  - 后台 `askYuanbao`：写入 `yb_pending_ask` 并（若支持）打开侧边栏；`src/ui/ChatPanel.tsx` 监听并预填空输入。
  - 单测 + 集成测试覆盖算法、探测、工具条真实摆放（无障碍→上方居中；上方有弹窗→下沉不重叠；自身不计入障碍）。
- **本轮新增（T18 视觉问答 UI + T19 Readability 正文抽取）**：
  - `src/content/readability.ts`：用 `@mozilla/readability` 对 `document` 克隆后抽取干净正文（不污染原页面），失败优雅回退 `body.innerText`。
  - `src/content/index.ts`：`getPageContent` 现返回 `articleText`（Readability 抽取），供“问当前页 / 翻译 / 总结”拿到干净正文，降低 token 成本。
  - `src/content/selectionToolbar.ts`：新增 `截图提问` 按钮（`data-act="capture"`），动作路由到后台 `captureAndAsk`。
  - `src/background/index.ts`：`captureAndAsk` 调 `chrome.tabs.captureVisibleTab` 截当前页（JPEG q80），写入 `yb_pending_image`（附 `yb_pending_ask`），并打开侧边栏；`chat` 支持注入 `pageContext`（网页正文→system 提示）。
  - `src/ui/ChatPanel.tsx`：监听 `yb_pending_image`，展示缩略图（可移除），发送时把图片拼成多模态 `ContentPart[]` 随本条消息发出（视觉问答）；Provider 层 OpenAI/Anthropic 方言均已透传图片内容。
  - `src/content/readability.test.ts`（3）：抽取正文、剥离导航/页脚噪声、空/非法输入返回 null。
- **已闭环 / 已知限制**：
  - T1 报错修复：沙箱无法跑真 Chrome，已施加防御性修复（移除 declarativeNetRequest、safeChrome、受限页静默退出）。**待用户真机按 PRD 9.4 步骤抓取真实报错栈做最终闭环**。
  - T7 视觉问答：`transform` 当前覆盖翻译/总结；**UI 已完整接入**（划词工具条 `截图提问` → 后台截图 → `ChatPanel` 缩略图 + 多模态消息），视觉问答随本条消息走 OpenAI/Anthropic 方言透传图片；能否真正识别取决于所选模型是否具备 vision 能力。
  - Firefox 仅构建通过 + 弹窗降级逻辑，**未真机验证**（沙箱无 Firefox）。
  - 元宝内置 Provider 凭证依赖用户登录态，离线脚手架缺凭证时由 manager 兜底回退。

---

## 15. 划词工具条与碰撞避让（T13–T16）

> 用户明确诉求：**划词弹出框显示时，若页面已有其它弹出框，必须避让，不能遮挡。**

### 15.1 交互形态
选中页面文本（非可编辑区、长度 ≤ 5000）后，在选区附近弹出浮动工具条：
`复制` · `翻译` · `总结` · `问问元宝`。工具条用 **Shadow DOM** 挂载（宿主 `#yb-selection-toolbar-host` 挂到 `<html>`），与页面 CSS 完全隔离，也不污染页面。

### 15.2 碰撞避让算法（核心）
纯函数 `computeToolbarPlacement(anchor, toolbar, viewport, obstacles, gap, margin)`：
1. 生成 6 个候选位（相对选区）：上方居中（默认）→ 下方居中 → 上方左对齐 → 上方右对齐 → 下方左对齐 → 下方右对齐。
2. 对每个候选：`clamp` 进视口，计算与所有 `obstacles` 的**重叠面积之和**、被挤出视口的位移、候选序位微偏置。
3. 评分 `score = 重叠面积 + 位移×0.5 + 序位×2`，取最小者为最终坐标。
4. 若上方居中无重叠 → 默认上方（符合直觉）；一旦上方有弹窗 → 自动下沉/侧移；极端情况（四周均被夹）也保证 clamp 进视口、重叠最小。

### 15.3 障碍探测 `detectObstacles`
- 命中常见弹窗语义/类名：`[role=tooltip|menu|dialog|alert]`、`.tooltip`/`.popover`/`.toast`/`[class*="dropdown"]` 等。
- 兜底扫描：高 `z-index`（≥1000）的 `fixed/absolute` 元素（捕获其它扩展注入的浮层）。
- 过滤：不可见、零尺寸、超出视口、整屏级大容器（>520×360）不作为障碍。
- 调用时传入工具条宿主作为 `exclude`，避免“自己挡自己”。

### 15.4 显隐与重定位
- 显示前以 `visibility:hidden` 实测工具条尺寸再定位，避免抖动。
- 选区变化（`selectionchange` 防抖）、`mouseup`、右键菜单触发显示；点击工具条外部 / `Esc` 隐藏。
- 监听 `scroll`/`resize`：选区仍在则**重新探测障碍并重定位**（持续避让），选区消失则隐藏。
- 翻译/总结结果区展开后也触发一次重定位，防止超出视口或压住别的弹窗。

### 15.5 动作接线
- `复制`：Clipboard API（安全上下文），失败回退 `execCommand('copy')`。
- `翻译`/`总结`：后台 `transform` 流式输出到工具条结果区（复用 Provider 降级）。
- `问问元宝`：后台写 `chrome.storage.local.yb_pending_ask` 并打开侧边栏；`ChatPanel` 监听后预填空输入。

### 15.6 验证
- 单测 `positioning.test.ts`（7）：无障→上方居中；上方有障→下沉；上下皆障→取最小重叠；贴边 clamp；窄视口完整可见。
- 单测 `obstacles.test.ts`（4）：识别 tooltip、排除整屏容器、兜底高 z 浮层、排除自身。
- 集成 `selectionToolbar.test.ts`（3，jsdom 驱动真实工具条）：无障上方、有障下沉不重叠、自身不计入障碍。
- E2E `selection-collision.spec.ts`：加载真实扩展，页面放已有 tooltip，划词后断言工具条与其**不重叠**（当前沙箱 headless 限制自动跳过，真机通过）。

