import type { ManifestV3Export } from '@crxjs/vite-plugin';

/**
 * Firefox 专用 Manifest（T10 多浏览器兼容降级方案）。
 *
 * 与 Chrome manifest 的差异：
 *  - 移除 `sidePanel` 权限与 `side_panel` 键（Firefox 不识别，会拒绝加载）；
 *    改用 `sidebar_action` 提供侧栏入口。
 *  - 移除 `_execute_side_panel` 命令（Firefox 用 `_execute_sidebar_action`）。
 *  - 新增 `browser_specific_settings.gecko.id`（Firefox 要求）。
 *  - 其余能力（action popup、options、content script、host_permissions）保持一致。
 *
 * 构建：BUILD_TARGET=firefox npm run build
 */
const manifest: ManifestV3Export = {
  manifest_version: 3,
  name: '元宝 AI 浏览器助手（增强版）',
  version: '0.2.0',
  description: '支持多模型（混元/DeepSeek/GPT/Claude/Gemini/Qwen/GLM/Kimi/Ollama）与可自定义模型 Provider。',
  action: {
    default_popup: 'src/popup/index.html',
    default_title: '元宝 AI 助手',
  },
  options_page: 'src/options/index.html',
  sidebar_action: {
    default_path: 'src/sidepanel/index.html',
    default_title: '元宝 AI 助手',
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/index.ts'],
      run_at: 'document_idle',
      all_frames: false,
    },
  ],
  permissions: ['storage', 'activeTab', 'scripting', 'commands'],
  host_permissions: [
    'https://*.tencent.com/*',
    'https://api.openai.com/*',
    'https://api.anthropic.com/*',
    'https://generativelanguage.googleapis.com/*',
    'https://dashscope.aliyuncs.com/*',
    'https://open.bigmodel.cn/*',
    'https://api.moonshot.cn/*',
    'https://api.deepseek.com/*',
    'http://localhost/*',
    'http://127.0.0.1/*',
  ],
  commands: {
    _execute_sidebar_action: {
      suggested_key: { default: 'Alt+O' },
      description: '打开侧边栏',
    },
    translate_selection: {
      suggested_key: { default: 'Alt+1' },
      description: '翻译选中内容',
    },
    summarize_page: {
      suggested_key: { default: 'Alt+2' },
      description: '总结当前页面',
    },
  },
  icons: {
    16: 'src/assets/icon-16.png',
    48: 'src/assets/icon-48.png',
    128: 'src/assets/icon-128.png',
  },
  web_accessible_resources: [
    {
      resources: ['src/assets/*'],
      matches: ['<all_urls>'],
    },
  ],
  browser_specific_settings: {
    gecko: {
      id: 'yuanbao-extension@tencent.local',
    },
  },
} as ManifestV3Export;

export default manifest;
