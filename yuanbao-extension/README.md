# 元宝 AI 浏览器助手（增强版）· Chrome 插件

基于 MV3 的元宝 Chrome 插件重构/增强工程。核心增强：**多模型 + 可自定义模型 Provider**。

## 功能
- 三大交互形态（沿用设计）：悬浮球 / 侧边栏 / 划词工具栏。
- **划词工具条（已实现）**：选中文本弹出浮动工具条（复制 / 翻译 / 总结 / 问问元宝），**Shadow DOM 隔离**页面样式；显示与滚动/缩放时自动**碰撞避让**，绝不遮挡页面已有的其它弹窗（见 `src/content/`）。
- **模型 Provider 抽象层**：`yuanbao`（内置腾讯网关）、`openai-compatible`（GPT/DeepSeek/Qwen/GLM/Kimi/Gemini/Ollama，Claude 走 Anthropic 方言兼容）、`custom`（用户自定义端点）。
- 翻译/总结：元宝走专用 endpoint，其余模型以"chat + 专用 prompt"降级。
- 模型不可达时自动回退默认模型。
- API Key 仅存 `chrome.storage.local`，不进 `storage.sync`。

## 工程结构
```
src/
  manifest.ts            MV3 manifest（@crxjs）
  types/model.ts         模型层类型（Provider/ModelEntry/ChatRequest…）
  shared/                messages 协议 + 前端通信客户端
  core/
    builtinModels.ts     预置 Provider 清单
    storage.ts           配置存储（local，密钥不进 sync）
    providerManager.ts   Provider 编排：路由 / 回退 / 降级
    providers/           yuanbao / openai-compatible / custom 实现
  background/            Service Worker 中枢
  content/               内容脚本：取正文 + 划词工具条（selectionToolbar / positioning / obstacles）
  ui/                    可复用 ChatPanel
  popup|sidepanel|options 入口与界面
```

## 开发
```bash
npm install
npm run dev      # 开发（CRXJS HMR）
npm run build    # 类型检查 + 构建 Chrome 版到 dist/
npm test         # 单元测试（Provider 路由/降级/回退/合并 + 碰撞算法/弹窗探测/工具条集成，18 用例全绿）
npm run e2e      # E2E（Playwright 真实无头 Chromium：options 页交互 + 划词碰撞避让加载真实扩展）
npm run build:firefox   # 构建 Firefox 版（sidebar_action，移除 sidePanel 权限）
```
加载：打开 `chrome://extensions` → 开发者模式 → 加载已解压的 `dist/`。

## 测试
- **单元（Vitest，18 用例全绿）**：
  - `src/core/providerManager.test.ts` —— 路由、不可达回退、翻译降级、模型清单合并。
  - `src/content/positioning.test.ts` —— 碰撞算法：无障→上方居中、有障→下沉、贴边 clamp、窄视口完整可见。
  - `src/content/obstacles.test.ts` —— 弹窗探测：识别 tooltip、排除整屏容器、兜底高 z 浮层、排除自身。
  - `src/content/selectionToolbar.test.ts` —— 工具条集成（jsdom 驱动真实组件）：无障上方、有障下沉不重叠、自身不计入障碍。
- **E2E（Playwright）**：
  - `e2e/options.spec.ts` —— 注入 mock `chrome` 在真实浏览器验证预置模型渲染与新增自定义 Provider。
  - `e2e/selection-collision.spec.ts` —— 加载真实扩展，页面放已有 tooltip，划词后断言工具条与其**不重叠**；当前沙箱 headless 限制自动跳过，真机通过。
  - 说明：沙箱有代理，`webServer` 自动探测 localhost 会超时，故 `npm run e2e` 脚本自带起停 `vite preview`；浏览器加 `--no-proxy-server` 直连本地。

## 多浏览器
- Chrome / Edge：完整体验（侧边栏 + 弹窗）。
- Firefox：构建用 `build:firefox`，manifest 自动改为 `sidebar_action` 并移除 `sidePanel` 权限；主入口回退为弹窗（见 `src/manifest.firefox.ts`、`src/shared/browserSupport.ts`）。

## 待办（对应看板 T1–T12 已完成；T13–T16 划词工具条 + 碰撞避让已完成）
- T1–T12 见上文；T1 真机报错栈取证、T7 视觉问答 UI 接入、Firefox 真机验证仍待真机闭环。
- T13 划词工具条 UI 与交互（Shadow DOM，复制/翻译/总结/问问元宝）。
- T14 碰撞避让算法 + 页面弹窗探测（positioning + obstacles）。
- T15 划词动作接入（复制/翻译/总结/问问元宝→侧边栏预填）。
- T16 单元测试 + 文档/看板更新（本迭代）。
- 后续可迭代：正文抽取增强（Readability，PRD 中 P0）、视觉问答 UI 接入、T1 真实报错栈闭环。
