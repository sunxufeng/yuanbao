import type { ManifestV3Export } from '@crxjs/vite-plugin';

/**
 * MV3 Manifest（由 @crxjs/vite-plugin 消费）。
 * 设计依据：逆向 1.0.16 安装包的 manifest（MV3 + background SW + contentScript + sidePanel + options）。
 * 调整点：
 *  - 移除原 declarativeNetRequest 强依赖（T1 报错待排查项之一，MVP 暂不使用规则集，降低报错面）。
 *  - host_permissions 收敛为“官方域 + 常用模型端点”，避免盲目 <all_urls>。
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
  side_panel: {
    default_path: 'src/sidepanel/index.html',
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
  permissions: ['storage', 'activeTab', 'scripting', 'sidePanel', 'commands'],
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
    _execute_side_panel: {
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
};

export default manifest;
