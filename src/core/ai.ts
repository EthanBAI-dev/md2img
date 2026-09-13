import type { Note } from './types';

export interface AiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface AiPreset {
  label: string;
  baseUrl: string;
  model: string;
  keyUrl: string;
}

/** 常见的 OpenAI 兼容服务，填 key 就能用 */
export const AI_PRESETS: AiPreset[] = [
  {
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    keyUrl: 'https://platform.deepseek.com/api_keys',
  },
  {
    label: '月之暗面 Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-8k',
    keyUrl: 'https://platform.moonshot.cn/console/api-keys',
  },
  {
    label: '通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
    keyUrl: 'https://bailian.console.aliyun.com/',
  },
  {
    label: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-flash',
    keyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
  },
  {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    keyUrl: 'https://platform.openai.com/api-keys',
  },
];

export interface CoverMeta {
  /** 封面大标题，简短有力，不受小红书 20 字限制 */
  title: string;
  /** 封面副标题，一句话说清这篇讲什么 */
  subtitle: string;
  /** 封面左上角的分类小标签 */
  badge: string;
}

export interface XhsCopy {
  /** 备选标题，小红书标题上限 20 字 */
  titles: string[];
  /** 正文文案，上限 1000 字 */
  body: string;
  /** 话题标签，不带 # */
  tags: string[];
  /** 用户当前选中、发送到创作台的标题序号 */
  selectedTitle?: number;
  /** 封面用的标题/副标题/分类标签，同一次调用顺带生成，省得再点一次 */
  cover: CoverMeta;
}

const SYSTEM_PROMPT = `你是资深的小红书内容运营，擅长把一篇原始笔记（可能连标题都没有）一次性整理成一整套可以直接发布的素材：封面文案 + 小红书正文文案。

严格遵守以下平台规则：
- 小红书标题（titles）不超过 20 个字（含 emoji 和标点），超了会被截断
- 正文不超过 1000 字
- 标签不超过 10 个
- 封面大标题（cover.title）不超过 16 个字，是卡片图片上的大字报，要精炼有冲击力
- 封面副标题（cover.subtitle）不超过 24 个字，一句话说清这篇内容讲什么
- 封面分类标签（cover.badge）不超过 6 个字，是一个类目词，例如"机器学习入门""职场干货""读书笔记"

写作要求：
- 小红书标题要有钩子：用具体数字、身份代入、反常识结论或痛点提问，不要用"分享""总结"这种空词
- 封面大标题和小红书标题不必是同一句话：封面标题更像书的章节名，小红书标题更像点击诱饵
- 正文开头两行必须交代清楚"这篇能解决什么问题"，因为小红书默认只展开前两行
- 正文分 3-5 个小段，段间空一行，每段开头可以用 emoji 做视觉锚点，但整篇 emoji 不超过 12 个
- 语气自然口语化，像跟朋友讲，不要用书面语和排比句堆砌
- 结尾加一句互动引导（提问 / 求评论 / 提示收藏）
- 标签混合搭配：2-3 个大流量词（如 学习方法、程序员），3-4 个精准长尾词，1-2 个人群词
- 不要编造原文里没有的事实、数据和结论。如果笔记本身没有标题，就从正文内容自己提炼一个

只输出 JSON，不要任何解释文字，格式：
{"titles": ["标题1", "标题2", "标题3"], "body": "正文...", "tags": ["标签1", "标签2"], "cover": {"title": "封面大标题", "subtitle": "封面副标题", "badge": "分类标签"}}`;

/** 从模型返回里抠出 JSON，兼容 ```json 包裹和前后废话 */
function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('模型没有返回 JSON');
  return JSON.parse(candidate.slice(start, end + 1));
}

/** 去掉模型偶尔加的 ```markdown 包裹，模型明明被要求了不要加，但不是每次都听话 */
function stripCodeFence(text: string): string {
  const fenced = /^```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/.exec(text.trim());
  return (fenced ? fenced[1] : text).trim();
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x).trim()).filter(Boolean);
}

/**
 * 一次会话内的结果缓存：同样的 system + user + 模型，直接返回上次的结果，不再发请求。
 *
 * 挡的是最常见的一种浪费——手滑双击、或者「生成完看了看又点一次」。
 * 内容只要改动一个字缓存就自然失效，所以不会拿到过期结果。
 * 只存在内存里，刷新页面就没了：这是防手滑的，不是持久化缓存。
 */
const responseCache = new Map<string, string>();

/**
 * 改写类任务的输出上限：输出和输入基本等长，按中文 ~1.5 字/token 折算再留 1.6 倍余量。
 * 给足余量是因为卡太紧会把结尾截断，那比多花一点 token 糟糕得多。
 */
function rewriteCap(input: string): number {
  return Math.min(4000, Math.max(600, Math.ceil((input.length / 1.5) * 1.6)));
}
/** 缓存条数上限，避免长时间使用后无限增长 */
const CACHE_MAX = 24;

/** 本次会话累计发出去的字符数，界面上用来提示「花了多少」 */
export const usage = { chars: 0, calls: 0, saved: 0 };

/**
 * 输出上限。不设的话模型可能把一个只要三十来字的封面写成一大段——
 * 输出 token 通常比输入贵，能卡就卡。
 * 改写类任务的输出和输入等长，所以按输入长度动态给，不能写死。
 */
async function chat(
  system: string,
  user: string,
  config: AiConfig,
  signal?: AbortSignal,
  maxTokens?: number,
): Promise<string> {
  if (!config.apiKey) throw new Error('还没填 API Key，点右上角设置');
  if (!config.baseUrl) throw new Error('还没填 API 地址');

  const cacheKey = `${config.model}\u0000${maxTokens ?? 0}\u0000${system}\u0000${user}`;
  const hit = responseCache.get(cacheKey);
  if (hit !== undefined) {
    usage.saved += system.length + user.length;
    return hit;
  }

  const url = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.7,
      ...(maxTokens ? { max_tokens: maxTokens } : {}),
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`接口返回 ${res.status}${detail ? `：${detail.slice(0, 200)}` : ''}`);
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('接口返回内容为空');

  usage.chars += system.length + user.length;
  usage.calls += 1;
  if (responseCache.size >= CACHE_MAX) responseCache.delete(responseCache.keys().next().value as string);
  responseCache.set(cacheKey, content);
  return content;
}

const FORMAT_SYSTEM_PROMPT = `你是专业的笔记排版编辑，负责把用户粘贴的一段没有格式的纯文本，整理成结构清晰的 Markdown。

只做排版层面的改写，严格遵守：
- 不改变原意，不删除、不编造内容；专有名词、数字、结论必须和原文完全一致
- 按内容的自然段落划分小节，给每个小节加二级标题（## 标题），标题要精炼概括这一段在讲什么
- 原文里并列的几点、步骤、对比，改写成无序或有序列表
- 关键术语、结论句用 **加粗** 标出来，但不要整段加粗，一段里最多加粗 2-3 处
- 如果原文本来就有清晰的段落结构，只需要补标题和列表，不要大改句子
- 不要添加 frontmatter（不要输出 --- 包裹的部分），不要加你自己的总结或点评
- 图片（<img> 标签和 ![]() 写法）必须原样保留，尤其是 src 里 pm-img-1 这类占位符，
  一个字符都不要改、不要补全、不要删掉——它们会在你返回之后被换回真实图片地址
- 只输出整理后的 Markdown 正文，不要任何解释文字，不要用代码块包裹整个结果`;

/**
 * 把一段没有结构的纯文本，用 AI 整理成带标题/列表/加粗的 Markdown 正文。
 * 只处理正文，frontmatter 由调用方自己保留、不经过这里。
 */
export async function formatAsMarkdown(rawText: string, config: AiConfig, signal?: AbortSignal): Promise<string> {
  // 排版任务需要看到完整结构，给的余量比文案生成大一些
  const excerpt = rawText.slice(0, 6000);
  // 排版只是重组结构，输出长度和输入同量级，留 1.5 倍余量够了
  const content = await chat(FORMAT_SYSTEM_PROMPT, excerpt, config, signal, rewriteCap(excerpt));
  return stripCodeFence(content);
}

export type ToneId = 'translate' | 'prompt' | 'persona';

export interface Tone {
  id: ToneId;
  /** 选择器上的短标签 */
  label: string;
  /** 悬停提示，解释这一档在干什么 */
  hint: string;
  /** 改写正文时，追加在通用要求后面的文风指令 */
  article: string;
  /** 生成小红书文案时，追加在写作要求里的文风指令 */
  copy: string;
}

/**
 * 三种「去 AI 味」的路子，正文改写和小红书文案共用同一档选择，
 * 免得图上的文章是一个腔调、配套文案又是另一个腔调。
 */
export const TONES: Tone[] = [
  {
    id: 'translate',
    label: '① 机翻回译',
    hint: '删掉强逻辑词再机翻回译：连接词干净，但会留下翻译腔',
    article: `本档模拟「先删强逻辑词、再机器翻译成英文、译回中文」的效果：
- 彻底删掉「首先、其次、然后、此外、最后、综上所述、总之、值得注意的是」这类强逻辑连接词，让句子靠内容本身衔接
- 保留回译特有的痕迹：主语补得比中文习惯更全（多用「我」「它」「这」开头），少用省略主语的短句
- 多用完整的长句和更书面的措辞，例如「对于……而言」「……是被提高了」「不应当被无条件地」
- 语气平实、克制，读起来略带说明书感，这是这一档的正常特征，不要刻意口语化`,
    copy: `文案的文风：删光「首先/其次/然后/总之」这类连接词，句子主语补全、措辞偏书面完整，语气平实克制，带一点翻译腔。不要用夸张的网感词。`,
  },
  {
    id: 'prompt',
    label: '② 提示词法',
    hint: '提高词汇丰富度和节奏感：最像写作者本人，但要核对事实',
    article: `为保证输出质量，你的输出需提高文本复杂程度和节奏感，实现出色表达：
- 提高文本复杂程度：提高词汇运用的丰富度，避免同一个词、同一个句式反复出现；提高内容的不可预测度，少用「首先/其次/最后」「总而言之」「在当今」「众所周知」「不仅…而且…」这类 AI 惯用套话和排比句
- 提高文章节奏感：句子长度要有波动，短句、长句交替出现，避免整段都是同样长度、同样结构的句子；句式也要有变化，不要每句都是「主语+谓语+宾语」的平铺直叙
- 允许出现三五个字的独立短句，用来在长句之后收一下力道`,
    copy: `文案的文风：提高词汇丰富度和节奏感。句子长短交替，允许短句独立成行来收力道；避免排比和 AI 套话；用具体的动词代替笼统的形容词。`,
  },
  {
    id: 'persona',
    label: '③ 人设法',
    hint: '扮演文化程度不高的大学生：几乎不像 AI，但信息密度会掉',
    article: `本档要求你扮演一个文化程度不高、说话逻辑性偏弱的大学生，用他的口气把同一件事讲一遍：
- 大量口语词和语气词：「反正」「其实」「就是」「挺……的」「差挺多的」「真不是我瞎说」
- 逻辑链条可以松一点，允许「我猜是这样的」「这个是真的没想到」这种主观、不严谨的表述
- 多用短句和大白话，专业词该出现还是要出现，但周围要用大白话解释
- 可以自嘲，可以说「做砸了」「拉了」这类词
- 但绝对不能编造或改动任何事实、数据、结论——说话可以随便，数字必须一字不差`,
    copy: `文案的文风：扮演一个文化程度不高、说话逻辑性偏弱的大学生。大量口语词和语气词，短句为主，可以自嘲，语气随意但真诚。数字和事实必须准确。`,
  },
];

export function getTone(id: ToneId): Tone {
  return TONES.find((t) => t.id === id) ?? TONES[1];
}

/** 三档共用的硬约束：怎么说可以变，说什么不许变 */
const HUMANIZE_BASE = `你是文字润色编辑，负责把一段「AI 味」很重的 Markdown 正文，按指定文风改写得更像人写的。

不管用哪种文风，以下红线都不能碰：
- 不改变原意，不删除、不编造事实、数据、结论，专有名词和数字必须和原文完全一致
- 保留原有 Markdown 结构：标题层级、列表、代码块、公式（$...$/$$...$$）、加粗都原样保留，不要增删标题、不要调整段落顺序
- 只是把「话怎么说」改掉，不是重新组织内容
- 图片（<img> 标签和 ![]() 写法）原样保留，src 里 pm-img-1 这类占位符一个字符都不要动，
  它们会在你返回之后被换回真实图片地址
- 只输出改写后的 Markdown 正文，不要任何解释文字，不要用代码块包裹整个结果

本次要求的文风：`;

/**
 * 把一段读起来「AI 味」很重的 Markdown 正文，按选定的文风档位改写。
 * 只改措辞和节奏，不改结构和事实，frontmatter 由调用方自己保留、不经过这里。
 */
export async function humanizeMarkdown(
  rawText: string,
  tone: ToneId,
  config: AiConfig,
  signal?: AbortSignal,
): Promise<string> {
  const excerpt = rawText.slice(0, 6000);
  const content = await chat(`${HUMANIZE_BASE}\n${getTone(tone).article}`, excerpt, config, signal, rewriteCap(excerpt));
  return stripCodeFence(content);
}

const FIX_FORMULA_SYSTEM_PROMPT = `你是 LaTeX 语法专家。用户会给你一段渲染失败的 LaTeX 公式和 KaTeX 报错信息，你要修好它。

规则：
- 只修语法错误（缺括号、命令拼错、多余的定界符等），不改变公式表达的数学含义
- 如果你无法判断原意，就做最保守的修复（比如把明显打错的命令名改成最接近的正确命令）
- 不要加 $ 或 $$ 定界符，只输出定界符之间的 LaTeX 内容
- 只输出修好的 LaTeX，不要任何解释文字，不要用代码块包裹`;

/** 用 AI 修一个渲染失败的公式，输入输出都是不带 $ 定界符的纯 LaTeX */
export async function fixFormula(
  tex: string,
  errorMessage: string,
  config: AiConfig,
  signal?: AbortSignal,
): Promise<string> {
  const userPrompt = `报错信息：${errorMessage}\n\n原始公式：\n${tex}`;
  // 修好的公式不会比原式长太多，给 400 绰绰有余
  const content = await chat(FIX_FORMULA_SYSTEM_PROMPT, userPrompt, config, signal, 400);
  // 模型有时还是会手滑带上 $ 定界符或代码块，都给它剥掉
  return stripCodeFence(content).replace(/^\${1,2}|\${1,2}$/g, '').trim();
}

/**
 * 封面只需要「这篇在讲什么」，不需要读完全文——所以只发开头这么多字。
 * 对比：整套文案生成要发 4000 字，改写正文要发 6000 字。
 */
const COVER_EXCERPT = 700;

const COVER_SYSTEM_PROMPT = `你是图文卡片的封面文案编辑。用户给你一篇笔记的开头，你负责提炼出封面上的三行字。

规则：
- 大标题（title）不超过 16 个字，是卡片上的大字报，要精炼、有信息量，不要用「分享」「总结」这类空词
- 副标题（subtitle）不超过 24 个字，一句话说清这篇讲什么
- 分类标签（badge）不超过 6 个字，是一个类目词，例如「机器学习入门」「职场干货」「读书笔记」
- 只依据用户给的内容提炼，不要编造原文里没有的结论
- 只输出 JSON，不要任何解释文字，格式：{"title": "...", "subtitle": "...", "badge": "..."}`;

/**
 * 只生成封面三行字。
 *
 * 和 generateCopy 分开是有意的：generateCopy 顺带也会产出封面，但它要发 4000 字正文、
 * 还要写标题/正文/标签一整套，输出也长。只想换个封面的时候用它太亏，
 * 这个接口只发开头 700 字、只要三个短字段，成本大约是前者的六分之一。
 */
export async function generateCover(
  note: Note,
  plainText: string,
  config: AiConfig,
  signal?: AbortSignal,
): Promise<CoverMeta> {
  const hasRealTitle = note.title && note.title !== '未命名笔记';
  const userPrompt = [
    hasRealTitle ? `笔记标题：${note.title}` : '（这篇笔记还没有标题，请你根据正文自己提炼）',
    note.tags.length ? `作者的标签：${note.tags.join('、')}` : '',
    '',
    '笔记开头：',
    plainText.slice(0, COVER_EXCERPT),
  ]
    .filter(Boolean)
    .join('\n');

  // 封面就三个短字段，200 足够
  const content = await chat(COVER_SYSTEM_PROMPT, userPrompt, config, signal, 200);
  const parsed = extractJson(content) as Record<string, unknown>;
  return {
    title: String(parsed.title ?? '').trim().slice(0, 16) || note.title.slice(0, 16),
    subtitle: String(parsed.subtitle ?? '').trim().slice(0, 24),
    badge: String(parsed.badge ?? '').trim().slice(0, 6),
  };
}

const DOUYIN_SYSTEM_PROMPT = `你是资深的抖音图文运营。用户给你一篇笔记（或一份已经写好的小红书文案），你负责产出抖音「图文」作品的配套文案。

抖音和小红书的写法不一样，严格遵守：
- 作品标题（titles）不超过 20 个字，给 3 个备选。抖音用户刷得快，标题要在一眼之内给出冲突、结果或数字，不要铺垫
- 作品描述（body）控制在 80~300 字：第一句就是钩子（反常识结论 / 具体收益 / 直接提问），后面 2~3 句交代这组图讲了什么，最后一句引导「收藏」「关注看下一篇」或抛一个评论区问题
- 抖音描述不适合长段落和密集 emoji：少分段，整篇 emoji 不超过 3 个
- 话题（tags）3~5 个，不带 #：1~2 个大流量泛话题 + 2~3 个精准话题。宁少勿滥，话题堆太多会显得像刷量
- 不要编造原文里没有的事实、数据和结论

只输出 JSON，不要任何解释文字，格式：
{"titles": ["标题1", "标题2", "标题3"], "body": "作品描述...", "tags": ["话题1", "话题2"]}`;

/**
 * 抖音版文案。
 *
 * 省 token 的关键：已经有小红书文案时，直接拿那份文案（标题+正文+标签，最多一千来字）改写成抖音风格，
 * 不再把笔记正文重新发一遍（4000 字）。两份文案讲的是同一件事，只是平台腔调不同，信息量完全够用。
 */
export async function generateDouyinCopy(
  note: Note,
  plainText: string,
  config: AiConfig,
  options: { signal?: AbortSignal; tone?: ToneId; fromXhs?: XhsCopy | null } = {},
): Promise<XhsCopy> {
  const { signal, tone, fromXhs } = options;
  const hasRealTitle = note.title && note.title !== '未命名笔记';
  const source = fromXhs?.body
    ? [
        '以下是这篇内容已经写好的小红书文案，请改写成抖音风格：',
        `标题：${fromXhs.titles[fromXhs.selectedTitle ?? 0] ?? fromXhs.titles[0] ?? ''}`,
        `正文：${fromXhs.body}`,
        fromXhs.tags.length ? `小红书标签：${fromXhs.tags.join('、')}` : '',
      ]
    : [
        hasRealTitle ? `笔记标题：${note.title}` : '（这篇笔记还没有标题，请你根据正文自己提炼）',
        '',
        '笔记正文：',
        plainText.slice(0, 3000),
      ];
  const userPrompt = source.filter(Boolean).join('\n');
  const system = tone
    ? `${DOUYIN_SYSTEM_PROMPT}\n\n额外的文风要求：\n${getTone(tone).copy}`
    : DOUYIN_SYSTEM_PROMPT;
  // 3 个标题 + 300 字以内描述 + 5 个话题
  const content = await chat(system, userPrompt, config, signal, 700);
  const parsed = extractJson(content) as Record<string, unknown>;
  const titles = asStringArray(parsed.titles).map((t) => t.slice(0, 20));
  const tags = asStringArray(parsed.tags)
    .map((t) => t.replace(/^#/, '').trim())
    .filter(Boolean)
    .slice(0, 5);
  return {
    titles: titles.length ? titles : [note.title.slice(0, 20)],
    body: String(parsed.body ?? '').slice(0, 1000),
    tags: tags.length ? tags : note.tags.slice(0, 5),
    selectedTitle: 0,
    // 抖音不需要封面文案，沿用笔记本身的，保持类型一致
    cover: { title: note.title.slice(0, 16), subtitle: note.subtitle?.slice(0, 24) ?? '', badge: note.badge?.slice(0, 6) ?? '' },
  };
}

export async function generateCopy(
  note: Note,
  plainText: string,
  config: AiConfig,
  signal?: AbortSignal,
  tone?: ToneId,
): Promise<XhsCopy> {
  // 正文太长会浪费 token，前 4000 字足够模型抓住主旨
  const excerpt = plainText.slice(0, 4000);
  // 没写标题时 note.title 是兜底的「未命名笔记」，这种占位符没必要喂给模型，
  // 免得它误以为这就是作者想要的标题
  const hasRealTitle = note.title && note.title !== '未命名笔记';
  const userPrompt = [
    hasRealTitle ? `笔记标题：${note.title}` : '（这篇笔记还没有标题，请你根据正文自己提炼）',
    note.subtitle ? `一句话简介：${note.subtitle}` : '',
    note.tags.length ? `作者已想好的标签：${note.tags.join('、')}` : '',
    '',
    '笔记正文：',
    excerpt,
  ]
    .filter(Boolean)
    .join('\n');

  // 文风档位和「AI 去味」共用一个选择，图上的文章和配套文案才是同一个腔调
  const system = tone ? `${SYSTEM_PROMPT}\n\n额外的文风要求（优先级高于上面的"语气自然口语化"）：\n${getTone(tone).copy}` : SYSTEM_PROMPT;
  // 标题 + 1000 字正文 + 10 个标签 + 封面，中文按 ~1.5 字/token 折算再留余量
  const content = await chat(system, userPrompt, config, signal, 1400);
  const parsed = extractJson(content) as Record<string, unknown>;
  const titles = asStringArray(parsed.titles).map((t) => t.slice(0, 20));
  const tags = asStringArray(parsed.tags)
    .map((t) => t.replace(/^#/, '').trim())
    .filter(Boolean)
    .slice(0, 10);

  const rawCover = (parsed.cover ?? {}) as Record<string, unknown>;
  const cover: CoverMeta = {
    title: String(rawCover.title ?? '').trim().slice(0, 16) || (titles[0] ?? note.title).slice(0, 16),
    subtitle: String(rawCover.subtitle ?? '').trim().slice(0, 24),
    badge: String(rawCover.badge ?? '').trim().slice(0, 6),
  };

  return {
    titles: titles.length ? titles : [note.title.slice(0, 20)],
    body: String(parsed.body ?? '').slice(0, 1000),
    tags: tags.length ? tags : note.tags.slice(0, 10),
    cover,
  };
}

/** 把标签拼成小红书正文末尾的 #话题 形式 */
export function formatTags(tags: string[]): string {
  return tags.map((t) => `#${t}`).join(' ');
}
