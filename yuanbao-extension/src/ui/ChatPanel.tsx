import { useCallback, useEffect, useRef, useState } from 'react';
import { api, streamChat, streamTransform } from '@/shared/client';
import { PENDING_TRANSFORM_KEY, type PendingTransform } from '@/shared/messages';
import type { ModelEntry, ContentPart } from '@/types/model';

interface Msg {
  role: 'user' | 'assistant' | 'error';
  content: string;
}

export function ChatPanel() {
  const [models, setModels] = useState<ModelEntry[]>([]);
  const [modelId, setModelId] = useState<string>('');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const modelIdRef = useRef('');
  const busyRef = useRef(false);

  useEffect(() => {
    (async () => {
      const [m, d] = await Promise.all([api.getModels(), api.getDefaultModel()]);
      if (m.ok) setModels(m.models);
      if (d.ok && d.defaultModel) {
        setModelId(d.defaultModel);
        modelIdRef.current = d.defaultModel;
      } else if (m.ok && m.models[0]) {
        setModelId(m.models[0].id);
        modelIdRef.current = m.models[0].id;
      }
    })();
  }, []);

  const onModelChange = async (id: string) => {
    setModelId(id);
    modelIdRef.current = id;
    await api.setDefaultModel(id);
  };

  /** 执行翻译/总结（快捷键或划词工具条触发），结果作为一条对话展示 */
  const runTransform = useCallback(async (kind: 'translate' | 'summarize', text: string) => {
    if (!text || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setInput(text);
    // 侧边栏刚打开时模型可能尚未加载完成，兜底取一次默认模型
    const model = modelIdRef.current || (await api.getDefaultModel()).defaultModel || '';
    const label = kind === 'translate' ? `翻译：${text}` : `总结：${text}`;
    setMessages((prev) => [...prev, { role: 'user', content: label }, { role: 'assistant', content: '' }]);
    let acc = '';
    try {
      for await (const c of streamTransform({ task: kind, text, model })) {
        if (c.type === 'chunk') {
          acc += c.delta;
          setMessages((prev) => {
            const copy = [...prev];
            copy[copy.length - 1] = { role: 'assistant', content: acc };
            return copy;
          });
        } else if (c.type === 'error') {
          setMessages((prev) => {
            const copy = [...prev];
            copy[copy.length - 1] = { role: 'error', content: c.message };
            return copy;
          });
        }
      }
    } catch (e) {
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: 'error', content: (e as Error).message };
        return copy;
      });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  // 划词工具条“问问元宝”：消费待问文本并预填输入框
  useEffect(() => {
    const KEY = 'yb_pending_ask';
    const apply = async () => {
      try {
        const r = await chrome.storage.local.get(KEY);
        const text = r[KEY];
        if (typeof text === 'string' && text) {
          setInput(text);
          await chrome.storage.local.remove(KEY);
        }
      } catch {
        /* ignore */
      }
    };
    void apply();
    const onChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes[KEY]) void apply();
    };
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, []);

  // 划词工具条“截图提问”：消费待问图片（视觉问答），展示缩略图
  useEffect(() => {
    const KEY = 'yb_pending_image';
    const apply = async () => {
      try {
        const r = await chrome.storage.local.get(KEY);
        const img = r[KEY];
        if (typeof img === 'string' && img) setPendingImage(img);
      } catch {
        /* ignore */
      }
    };
    void apply();
    const onChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes[KEY]) void apply();
    };
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, []);

  // 快捷键命令（Alt+1 翻译选中 / Alt+2 总结页面）：消费待执行任务并自动运行 transform
  useEffect(() => {
    const apply = async () => {
      try {
        const r = await chrome.storage.local.get(PENDING_TRANSFORM_KEY);
        const v = r[PENDING_TRANSFORM_KEY] as PendingTransform | undefined;
        if (v && typeof v.text === 'string') {
          const kind = v.kind === 'summarize' ? 'summarize' : 'translate';
          await chrome.storage.local.remove(PENDING_TRANSFORM_KEY);
          await runTransform(kind, v.text);
        }
      } catch {
        /* ignore */
      }
    };
    void apply();
    const onChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes[PENDING_TRANSFORM_KEY]) void apply();
    };
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, [runTransform]);

  const send = async () => {
    const text = input.trim();
    if (!text || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    const img = pendingImage;
    setInput('');
    setPendingImage(null);
    const next = [...messages, { role: 'user' as const, content: text }, { role: 'assistant' as const, content: '' }];
    setMessages(next);
    setBusy(true);
    // 若有待问图片（视觉问答），把最后一条用户消息拼成多模态内容
    const history = next.slice(0, -1).map((m, i) =>
      i === next.length - 2 && img
        ? ({ role: m.role as 'user' | 'assistant', content: [{ type: 'text', text }, { type: 'image_url', image_url: { url: img } }] as ContentPart[] })
        : { role: m.role as 'user' | 'assistant', content: m.content },
    );
    if (img) {
      try {
        await chrome.storage.local.remove('yb_pending_image');
      } catch {
        /* ignore */
      }
    }
    let acc = '';
    try {
      for await (const chunk of streamChat({ model: modelId, messages: history, stream: true })) {
        if (chunk.type === 'chunk') {
          acc += chunk.delta;
          setMessages((prev) => {
            const copy = [...prev];
            copy[copy.length - 1] = { role: 'assistant', content: acc };
            return copy;
          });
        } else if (chunk.type === 'error') {
          setMessages((prev) => {
            const copy = [...prev];
            copy[copy.length - 1] = { role: 'error', content: chunk.message };
            return copy;
          });
        }
      }
    } catch (e) {
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: 'error', content: (e as Error).message };
        return copy;
      });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-white">
      <header className="flex items-center gap-2 border-b border-gray-100 px-3 py-2">
        <span className="text-sm font-semibold text-brand">元宝 AI 助手</span>
        {models.length > 0 ? (
          <select
            className="ml-auto rounded border border-gray-200 px-2 py-1 text-xs"
            value={modelId}
            onChange={(e) => onModelChange(e.target.value)}
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        ) : (
          <span className="ml-auto text-xs text-gray-400">未配置模型</span>
        )}
        <button
          className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
          onClick={() => {
            try {
              void chrome.runtime.openOptionsPage();
            } catch {
              /* ignore */
            }
          }}
          title="打开设置"
        >
          设置
        </button>
      </header>

      <div ref={scrollRef} className="yb-scroll flex-1 space-y-3 overflow-y-auto px-3 py-3 text-sm">
        {messages.length === 0 && (
          <div className="mt-10 px-4 text-center text-gray-400">
            {models.length === 0 ? (
              <>
                尚未配置任何模型 Provider。
                <br />
                点击右上角「设置」添加你的 API 端点与 Key。
              </>
            ) : (
              <>选中模型后开始对话，支持多模型 / 自定义模型。</>
            )}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'text-right' : 'text-left'}>
            <div
              className={
                m.role === 'user'
                  ? 'inline-block rounded-lg bg-brand px-3 py-2 text-white'
                  : m.role === 'error'
                  ? 'inline-block rounded-lg bg-red-50 px-3 py-2 text-red-600'
                  : 'inline-block rounded-lg bg-gray-100 px-3 py-2 text-gray-800 whitespace-pre-wrap'
              }
            >
              {m.content || (busy && i === messages.length - 1 ? '思考中…' : '')}
            </div>
          </div>
        ))}
      </div>

      {pendingImage && (
        <div className="flex items-center gap-2 border-t border-gray-100 px-2 pt-2">
          <img src={pendingImage} alt="待问截图" className="h-12 w-12 rounded border border-gray-200 object-cover" />
          <span className="text-xs text-gray-400">截图将随本条消息发送（视觉问答）</span>
          <button
            className="ml-auto rounded px-2 py-0.5 text-xs text-gray-400 hover:bg-gray-100"
            onClick={() => {
              setPendingImage(null);
              try {
                void chrome.storage.local.remove('yb_pending_image');
              } catch {
                /* ignore */
              }
            }}
          >
            移除
          </button>
        </div>
      )}

      <div className="flex items-end gap-2 border-t border-gray-100 p-2">
        <textarea
          className="yb-scroll max-h-24 flex-1 resize-none rounded border border-gray-200 px-2 py-1 text-sm outline-none focus:border-brand"
          rows={1}
          placeholder="输入消息，Enter 发送，Shift+Enter 换行"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button
          className="rounded bg-brand px-3 py-1.5 text-sm text-white disabled:opacity-50"
          onClick={send}
          disabled={busy}
        >
          {busy ? '…' : '发送'}
        </button>
      </div>
    </div>
  );
}
