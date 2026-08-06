/**
 * 正文抽取（Readability 增强，对应 M2/P0）
 *
 * 设计目标：让“总结 / 翻译 / 问当前页”拿到干净正文，而非整页 innerText，
 * 既提升质量也降低 token 成本。
 *  - 在内容脚本隔离世界里对 document 克隆后解析（不污染原页面）；
 *  - 解析失败优雅回退到 body.innerText（见 content/index.ts 的 getPageText）。
 */
import { Readability } from '@mozilla/readability';

export interface ArticleResult {
  title: string;
  byline: string | null;
  excerpt: string;
  /** 清洗后的正文纯文本 */
  text: string;
  length: number;
}

/**
 * 从文档抽取正文。传入真实 document（内容脚本环境）。
 * 返回 null 表示难以抽取（调用方应回退到 innerText）。
 */
export function extractArticle(doc: Document): ArticleResult | null {
  if (!doc || !doc.cloneNode) return null;
  try {
    // 克隆避免 Readability 修改原页面 DOM
    const clone = doc.cloneNode(true) as Document;
    const article = new Readability(clone).parse();
    if (!article) return null;
    const text = (article.textContent || '').replace(/\s+/g, ' ').trim();
    if (!text) return null;
    return {
      title: article.title || doc.title || '',
      byline: (article.byline as string) || null,
      excerpt: article.excerpt || '',
      text,
      length: (article.length as number) || text.length,
    };
  } catch {
    return null;
  }
}
