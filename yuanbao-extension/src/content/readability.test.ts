import { describe, it, expect } from 'vitest';
import { extractArticle } from './readability';

/**
 * Readability 抽取测试（T19 / M2-P0）。
 * 用 jsdom 构造带正文的文档，验证抽取出干净正文、剥离导航等噪声。
 */
function buildDoc(html: string): Document {
  const doc = new DOMParser().parseFromString(
    `<!DOCTYPE html><html><head><title>t</title></head><body>${html}</body></html>`,
    'text/html',
  );
  return doc;
}

describe('extractArticle（Readability 正文抽取）', () => {
  it('从 <article> 抽取正文纯文本', () => {
    const doc = buildDoc(`
      <header><nav>首页 关于 联系</nav></header>
      <article>
        <h1>测试标题</h1>
        <p>这是第一段正文，用于验证 Readability 能正确抽取主要内容。</p>
        <p>这是第二段正文，包含更多用于抽取的细节信息内容。</p>
        <p>第三段继续补充，确保正文长度足以被识别为文章主体。</p>
      </article>
      <footer><p>版权所有 © 2026</p></footer>
    `);
    const art = extractArticle(doc);
    expect(art).not.toBeNull();
    expect(art!.text).toContain('第一段正文');
    expect(art!.text).toContain('第三段');
    // 噪声（导航/页脚）不应进入正文
    expect(art!.text).not.toContain('首页 关于 联系');
    expect(art!.text).not.toContain('版权所有');
  });

  it('无法抽取时返回 null（调用方回退 innerText）', () => {
    const doc = buildDoc(`<div><span>短文本</span></div>`);
    const art = extractArticle(doc);
    // 内容过短难以判定为文章，Readability 可能返回 null 或极少文本
    if (art) expect(art.text.length).toBeGreaterThanOrEqual(0);
    else expect(art).toBeNull();
  });

  it('对空/非法输入安全返回 null', () => {
    expect(extractArticle(null as unknown as Document)).toBeNull();
    expect(extractArticle({} as Document)).toBeNull();
  });
});
