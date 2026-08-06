import { useEffect, useState } from 'react';
import { api } from '@/shared/client';
import { track } from '@/core/analytics';
import type { ProviderConfig, ModelEntry } from '@/types/model';

function maskKey(key?: string): string {
  if (!key) return '';
  if (key.length <= 6) return '••••';
  return key.slice(0, 3) + '••••••' + key.slice(-3);
}

export function OptionsApp() {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [defaultModel, setDefaultModelId] = useState<string>('');
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [testState, setTestState] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  async function load() {
    const [p, d] = await Promise.all([api.getProviders(), api.getDefaultModel()]);
    if (p.ok) setProviders(p.providers);
    if (d.ok && d.defaultModel) setDefaultModelId(d.defaultModel);
  }
  useEffect(() => {
    load();
  }, []);

  const allModels: ModelEntry[] = providers.flatMap((p) => p.models);

  function updateProvider(id: string, patch: Partial<ProviderConfig>) {
    setProviders((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    setSaved(false);
  }
  function updateModel(providerId: string, modelId: string, patch: Partial<ModelEntry>) {
    setProviders((prev) =>
      prev.map((p) =>
        p.id === providerId ? { ...p, models: p.models.map((m) => (m.id === modelId ? { ...m, ...patch } : m)) } : p
      )
    );
    setSaved(false);
  }

  async function save() {
    await api.saveProviders(providers);
    if (defaultModel) await api.setDefaultModel(defaultModel);
    if (providers.some((p) => p.type === 'custom')) void track('custom_provider_saved');
    setSaved(true);
  }

  async function test(id: string) {
    setTestState((s) => ({ ...s, [id]: '测试中…' }));
    const r = await api.testProvider(id);
    setTestState((s) => ({ ...s, [id]: r ? '✅ 连通' : '❌ 失败' }));
  }

  function addCustom() {
    const id = 'custom-' + Date.now().toString(36);
    const newP: ProviderConfig = {
      id,
      type: 'custom',
      name: '自定义端点',
      baseURL: 'https://',
      apiKey: '',
      enabled: true,
      models: [{ id: id + '-model', label: '自定义模型', providerId: id, capability: ['chat'] }],
    };
    setProviders((prev) => [...prev, newP]);
    setSaved(false);
  }

  function removeCustom(id: string) {
    setProviders((prev) => prev.filter((p) => p.id !== id));
    setSaved(false);
  }

  return (
    <div className="mx-auto max-w-3xl p-5 text-sm text-gray-800">
      <h1 className="mb-1 text-lg font-semibold text-brand">元宝 AI 助手 · 模型设置</h1>
      <p className="mb-4 text-xs text-gray-500">
        支持多模型与自定义模型。API Key 仅保存在本地（chrome.storage.local），不会同步到其它设备。
      </p>

      <section className="mb-6">
        <h2 className="mb-2 font-medium">默认模型</h2>
        <select
          className="w-full rounded border border-gray-200 px-2 py-1.5"
          value={defaultModel}
          onChange={(e) => setDefaultModelId(e.target.value)}
        >
          {allModels.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}（{providers.find((p) => p.id === m.providerId)?.name}）
            </option>
          ))}
        </select>
      </section>

      <section className="mb-4 flex items-center justify-between">
        <h2 className="font-medium">Provider 列表</h2>
        <button className="rounded bg-brand px-3 py-1 text-white" onClick={addCustom}>
          + 新增自定义
        </button>
      </section>

      <div className="space-y-3">
        {providers.map((p) => (
          <div key={p.id} data-testid="provider-card" className="rounded-lg border border-gray-200 p-3">
            <div className="mb-2 flex items-center gap-2">
              <input
                className="flex-1 rounded border border-gray-200 px-2 py-1 font-medium"
                value={p.name}
                disabled={p.builtin}
                data-testid={`provider-name-${p.id}`}
                onChange={(e) => updateProvider(p.id, { name: e.target.value })}
              />
              <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500">{p.type}</span>
              <label className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={p.enabled}
                  onChange={(e) => updateProvider(p.id, { enabled: e.target.checked })}
                />
                启用
              </label>
              {!p.builtin && (
                <button className="text-xs text-red-500" onClick={() => removeCustom(p.id)}>
                  删除
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <label className="text-xs text-gray-500">
                Base URL
                <input
                  className="mt-0.5 w-full rounded border border-gray-200 px-2 py-1 text-gray-800"
                  value={p.baseURL || ''}
                  onChange={(e) => updateProvider(p.id, { baseURL: e.target.value })}
                />
              </label>
              <label className="text-xs text-gray-500">
                API Key
                <div className="mt-0.5 flex gap-1">
                  <input
                    type={showKey[p.id] ? 'text' : 'password'}
                    className="w-full rounded border border-gray-200 px-2 py-1 text-gray-800"
                    placeholder={maskKey(p.apiKey) || '留空则使用默认凭证'}
                    value={showKey[p.id] ? p.apiKey || '' : p.apiKey || ''}
                    onChange={(e) => updateProvider(p.id, { apiKey: e.target.value })}
                  />
                  <button
                    className="rounded border border-gray-200 px-2 text-xs"
                    onClick={() => setShowKey((s) => ({ ...s, [p.id]: !s[p.id] }))}
                  >
                    {showKey[p.id] ? '隐藏' : '显示'}
                  </button>
                  <button
                    className="rounded border border-gray-200 px-2 text-xs text-gray-400"
                    onClick={() => updateProvider(p.id, { apiKey: '' })}
                  >
                    清除
                  </button>
                </div>
              </label>
            </div>

            <div className="mt-2 flex items-center gap-3">
              <button className="rounded border border-gray-200 px-2 py-0.5 text-xs" onClick={() => test(p.id)}>
                测试连接
              </button>
              <span className="text-xs text-gray-500">{testState[p.id]}</span>
            </div>

            <div className="mt-2 border-t border-gray-100 pt-2">
              <div className="mb-1 text-xs text-gray-400">模型（id / 标签）</div>
              {p.models.map((m) => (
                <div key={m.id} className="mb-1 flex items-center gap-2 text-xs">
                  <input
                    className="w-40 rounded border border-gray-200 px-1.5 py-0.5"
                    value={m.id}
                    disabled={p.builtin}
                    onChange={(e) => updateModel(p.id, m.id, { id: e.target.value })}
                  />
                  <input
                    className="flex-1 rounded border border-gray-200 px-1.5 py-0.5"
                    value={m.label}
                    onChange={(e) => updateModel(p.id, m.id, { label: e.target.value })}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button className="rounded bg-brand px-4 py-1.5 text-white" onClick={save}>
          保存
        </button>
        {saved && <span className="text-xs text-green-600">已保存 ✓</span>}
      </div>
    </div>
  );
}
