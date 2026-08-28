import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import demoMarkdown from '../../examples/demo.md?raw';
import {
  fixFormula,
  formatAsMarkdown,
  generateCopy,
  getTone,
  humanizeMarkdown,
  type AiConfig,
  type ToneId,
  type XhsCopy,
} from '../core/ai';
import { downloadBlob, exportCards, safeName, zipImages } from '../core/export';
import { maskImageSources, splitFrontmatterRaw, upsertFrontmatter } from '../core/markdown';
import { buildFormulaLocators, type MathError } from '../core/math';
import { buildCards, themeFromMarkdown, type BuildResult } from '../core/pipeline';
import {
  DEFAULT_AD_OPTIONS,
  DEFAULT_RENDER_OPTIONS,
  IMAGE_H_MAX,
  IMAGE_H_MIN,
  MAX_CARDS,
  normalizeAdOptions,
  normalizeRenderOptions,
  type AdOptions,
  type RenderOptions,
} from '../core/types';
import { AdPanel } from './components/AdPanel';
import { CopyPanel } from './components/CopyPanel';
import { MarkdownToolbar } from './components/MarkdownToolbar';
import { MathErrorPanel } from './components/MathErrorPanel';
import { Preview } from './components/Preview';
import { SettingsDialog } from './components/SettingsDialog';
import { ThemePicker } from './components/ThemePicker';
import { TonePicker } from './components/TonePicker';
import { WatermarkPanel } from './components/WatermarkPanel';
import { blobToDataUrl, imageToDataUrl } from './fileUtils';
import { inlineImages, readFolder, type FolderNote } from './folderImport';
import { KEYS, ensureHostPermission, isExtension, loadState, saveState, subscribeState } from './storage';
import type { PublishPayload } from '../shared/messages';

const DEFAULT_AI: AiConfig = { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', apiKey: '' };

interface Props {
  /** 侧边栏窄，单栏纵向排列；网页版宽，编辑区和预览区左右分栏 */
  variant: 'web' | 'panel';
}

export function App({ variant }: Props) {
  const [markdown, setMarkdown] = useState(demoMarkdown);
  const [options, setOptions] = useState<RenderOptions>(DEFAULT_RENDER_OPTIONS);
  const [adOptions, setAdOptions] = useState<AdOptions>(DEFAULT_AD_OPTIONS);
  const [aiConfig, setAiConfig] = useState<AiConfig>(DEFAULT_AI);
  const [defaultAuthor, setDefaultAuthor] = useState('');
  const [tone, setTone] = useState<ToneId>('prompt');
  const [result, setResult] = useState<BuildResult | null>(null);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [copy, setCopy] = useState<XhsCopy | null>(null);
  const [copyLoading, setCopyLoading] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [formatting, setFormatting] = useState(false);
  const [humanizing, setHumanizing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [insertingImage, setInsertingImage] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  // 「打开文件夹」读进来的一批笔记和图片：图片只留在内存里，不写存储——
  // 一个文件夹的图动辄上兆，网页版 localStorage 只有 5~10MB，塞进去会直接把保存搞挂。
  // 真正会被持久化的是内联进 markdown 的那几张，体积可控。
  const [folderNotes, setFolderNotes] = useState<FolderNote[]>([]);
  const [folderImages, setFolderImages] = useState<Map<string, string>>(new Map());
  // 笔记里的 <picture> 有手机/电脑两路候选，用哪一路影响很大：
  // 电脑版通常是宽扁图（占高度小、卡片省），手机版是竖长图（更占版面）。
  // 切换后要拿原始笔记文本重新内联一次，所以得记住当前是哪一篇。
  const [currentNote, setCurrentNote] = useState<FolderNote | null>(null);
  const [figureNarrow, setFigureNarrow] = useState(true);
  const [folderLoading, setFolderLoading] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const noteTextareaRef = useRef<HTMLTextAreaElement>(null);

  // 恢复上次的编辑内容和设置
  useEffect(() => {
    (async () => {
      const [md, opts, savedAd, ai, savedCopy, author, savedTone] = await Promise.all([
        loadState<string | null>(KEYS.markdown, null),
        loadState<RenderOptions>(KEYS.options, DEFAULT_RENDER_OPTIONS),
        loadState<AdOptions>(KEYS.ad, DEFAULT_AD_OPTIONS),
        loadState<AiConfig>(KEYS.ai, DEFAULT_AI),
        loadState<XhsCopy | null>(KEYS.copy, null),
        loadState<string>(KEYS.defaultAuthor, ''),
        loadState<ToneId>(KEYS.tone, 'prompt'),
      ]);
      if (md) setMarkdown(md);
      setOptions(normalizeRenderOptions(opts));
      setAdOptions(normalizeAdOptions(savedAd));
      setAiConfig({ ...DEFAULT_AI, ...ai });
      if (savedCopy) setCopy(savedCopy);
      setDefaultAuthor(author);
      setTone(savedTone);
      setRestored(true);
    })();
  }, []);

  useEffect(() => {
    if (restored) void saveState(KEYS.markdown, markdown);
  }, [markdown, restored]);
  useEffect(() => {
    if (restored) void saveState(KEYS.options, options);
  }, [options, restored]);
  useEffect(() => {
    if (restored) void saveState(KEYS.ad, adOptions);
  }, [adOptions, restored]);
  useEffect(() => {
    if (restored) void saveState(KEYS.copy, copy);
  }, [copy, restored]);
  useEffect(() => {
    if (restored) void saveState(KEYS.tone, tone);
  }, [tone, restored]);

  // 侧边栏和「全屏编辑」新标签页是两个独立页面，各自持有一份 React 状态。
  // 光靠上面「挂载时读一次」不够——那份状态一旦读完就再也不知道另一个页面又存了新内容。
  // 这里订阅别的页面写入存储的变化，实时同步过来；正在这个页面打字的时候不接收，
  // 不然远端更新会把当前正在敲的内容替换掉。
  useEffect(() => {
    if (!restored) return;
    const unsubMd = subscribeState<string>(KEYS.markdown, (incoming) => {
      if (document.activeElement === noteTextareaRef.current) return;
      setMarkdown((cur) => (incoming !== cur ? incoming : cur));
    });
    const unsubOpts = subscribeState<RenderOptions>(KEYS.options, (incoming) => {
      setOptions((cur) => {
        const merged = normalizeRenderOptions(incoming);
        return JSON.stringify(merged) !== JSON.stringify(cur) ? merged : cur;
      });
    });
    const unsubAd = subscribeState<AdOptions>(KEYS.ad, (incoming) => {
      setAdOptions((cur) => {
        const merged = normalizeAdOptions(incoming);
        return JSON.stringify(merged) !== JSON.stringify(cur) ? merged : cur;
      });
    });
    const unsubTone = subscribeState<ToneId>(KEYS.tone, (incoming) => {
      setTone((cur) => (incoming !== cur ? incoming : cur));
    });
    return () => {
      unsubMd();
      unsubOpts();
      unsubAd();
      unsubTone();
    };
  }, [restored]);

  // 重新分页：防抖 260ms，避免每敲一个字都跑一遍测量
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const built = await buildCards(markdown, options, defaultAuthor, adOptions);
        if (!cancelled) {
          setResult(built);
          setBuildError(null);
        }
      } catch (err) {
        if (!cancelled) setBuildError(err instanceof Error ? err.message : String(err));
      }
    }, 260);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [markdown, options, defaultAuthor, adOptions]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  }, []);

  /** 把一篇笔记装进编辑器，并用文件夹里读到的图片把相对路径内联掉 */
  const loadNote = useCallback(
    (note: FolderNote, images: Map<string, string>, narrow: boolean) => {
      const { markdown: inlined, inlined: count, missing } = inlineImages(note.text, images, narrow);
      setMarkdown(inlined);
      setCurrentNote(note);
      const declared = themeFromMarkdown(inlined);
      if (declared) setOptions((prev) => ({ ...prev, themeId: declared }));
      const parts = [`已载入 ${note.name}`];
      if (count) parts.push(`内联 ${count} 张${narrow ? '手机版' : '电脑版'}图`);
      if (missing.length) parts.push(`${missing.length} 张没找到`);
      showToast(parts.join('，'));
    },
    [showToast],
  );

  /** 切换手机版/电脑版配图：拿原始笔记文本重新内联一次 */
  const switchFigureVariant = (narrow: boolean) => {
    setFigureNarrow(narrow);
    if (currentNote) loadNote(currentNote, folderImages, narrow);
  };

  const openFolder = async (files: FileList) => {
    setFolderLoading('读取中…');
    try {
      const { notes, images, skipped } = await readFolder(files);
      if (!notes.length) {
        showToast('这个文件夹里没有 .md / .txt 笔记');
        return;
      }
      setFolderNotes(notes);
      setFolderImages(images);
      // 只有一篇就直接打开；多篇时下面会出一个下拉，让用户自己挑
      if (notes.length === 1) {
        loadNote(notes[0], images, figureNarrow);
      } else {
        showToast(`读到 ${notes.length} 篇笔记、${images.size} 张图，选一篇开始${skipped.length ? `（${skipped.length} 张图过大已跳过）` : ''}`);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : '文件夹读取失败');
    } finally {
      setFolderLoading(null);
    }
  };

  const openFile = async (file: File) => {
    const text = await file.text();
    setMarkdown(text);
    // frontmatter 里写了 theme 就同步到选择器，之后用户改主题以选择器为准
    const declared = themeFromMarkdown(text);
    if (declared) setOptions((prev) => ({ ...prev, themeId: declared }));
    showToast(`已载入 ${file.name}`);
  };

  const insertAtCursor = (text: string) => {
    const el = noteTextareaRef.current;
    if (!el) {
      setMarkdown((md) => md + (md.endsWith('\n') || !md ? '' : '\n') + text);
      return;
    }
    const start = el.selectionStart ?? markdown.length;
    const end = el.selectionEnd ?? markdown.length;
    setMarkdown(markdown.slice(0, start) + text + markdown.slice(end));
    const pos = start + text.length;
    // 受控 textarea 要等这次渲染画完才是新值，下一帧再摆光标位置
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  const insertImageFile = async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    setInsertingImage(true);
    try {
      const dataUrl = await imageToDataUrl(file);
      insertAtCursor(`![${file.name.replace(/\.[^.]+$/, '')}](${dataUrl})\n`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : '图片插入失败');
    } finally {
      setInsertingImage(false);
    }
  };

  /**
   * 侧边栏就这么点地方，真要写长笔记、贴图片还是得有整块屏幕。
   * 之前做过一版同页面内的全屏遮罩，但插件侧边栏本身只有几百像素宽，
   * 遮罩再怎么"全屏"也只能撑满那几百像素——不是真的全屏。
   * 改成直接开一个新标签页跑网页版（编辑区/预览区左右分栏，屏幕多大就能用多大），
   * 两边的笔记内容都走同一套自动保存，开出来就是最新内容。
   */
  const openFullEditor = () => {
    if (isExtension && chrome.tabs) {
      void chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
      return;
    }
    window.open(new URL('index.html', window.location.href).toString(), '_blank');
  };

  const handleExport = async () => {
    if (!result?.cards.length) return;
    setBusy('正在生成图片…');
    try {
      const images = await exportCards(result.cards, options, (done, total) =>
        setBusy(`正在生成第 ${done}/${total} 张…`),
      );
      const zip = await zipImages(images, result.note.title);
      downloadBlob(zip, `${safeName(result.note.title)}.zip`);
      showToast(`已导出 ${images.length} 张图片`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : '导出失败');
    } finally {
      setBusy(null);
    }
  };

  const handleGenerateCopy = async () => {
    if (!result) return;
    setCopyLoading(true);
    setCopyError(null);
    try {
      const plain = result.cards
        .flatMap((c) => (c.kind === 'content' ? c.blocks.map((b) => b.text) : []))
        .join('\n');
      const generated = await generateCopy(result.note, plain, aiConfig, undefined, tone);
      setCopy({ ...generated, selectedTitle: 0 });
      // 顺带把封面标题/副标题/分类标签写回笔记源文本，不用自己手写 frontmatter，
      // 粘贴一段没有标题的内容也能直接生成完整的封面
      setMarkdown((md) =>
        upsertFrontmatter(md, {
          title: generated.cover.title,
          subtitle: generated.cover.subtitle,
          badge: generated.cover.badge,
        }),
      );
      showToast('已生成文案，封面标题也帮你填好了');
    } catch (err) {
      setCopyError(err instanceof Error ? err.message : '生成失败');
    } finally {
      setCopyLoading(false);
    }
  };

  const handleFormatMarkdown = async () => {
    if (!markdown.trim() || formatting) return;
    setFormatting(true);
    try {
      // frontmatter 原样保留，只把正文交给 AI 重新排版，避免它把 title/author 这些字段也改写了
      const { front, body } = splitFrontmatterRaw(markdown);
      // 图片地址换成短占位符再发：内联后一张图就是几万字符 base64，会把上下文占满
      const { masked, restore } = maskImageSources(body);
      const formatted = restore(await formatAsMarkdown(masked, aiConfig));
      setMarkdown(`${front}${front ? '\n' : ''}${formatted}\n`);
      showToast('已整理成 Markdown 格式');
    } catch (err) {
      showToast(err instanceof Error ? err.message : '整理失败');
    } finally {
      setFormatting(false);
    }
  };

  const handleHumanize = async () => {
    if (!markdown.trim() || humanizing) return;
    setHumanizing(true);
    try {
      // frontmatter 原样保留，只把正文交给 AI 润色，避免它把 title/author 这些字段也改写了
      const { front, body } = splitFrontmatterRaw(markdown);
      const { masked, restore } = maskImageSources(body);
      const humanized = restore(await humanizeMarkdown(masked, tone, aiConfig));
      setMarkdown(`${front}${front ? '\n' : ''}${humanized}\n`);
      showToast(`已按「${getTone(tone).label}」改写正文`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : '润色失败');
    } finally {
      setHumanizing(false);
    }
  };

  /** 返回值表示有没有在原文里定位到这处公式，MathErrorPanel 会据此提示要不要手动改 */
  const handleFixFormula = async (err: MathError): Promise<boolean> => {
    try {
      const fixed = await fixFormula(err.tex, err.message, aiConfig);
      // 依次试几种定位方式：err.tex 来自转换过定界符之后的正文，
      // 原文如果写的是 \(...\)/\[...\] 就得换个正则才能找到，找不到再退到宽松的头尾锚定匹配
      const locator = buildFormulaLocators(err.tex, err.displayMode).find((l) => l.pattern.test(markdown));
      if (!locator) {
        showToast(`没能在原文里定位这处公式，手动把它换成：${fixed}`);
        return false;
      }
      setMarkdown(markdown.replace(locator.pattern, locator.wrap(fixed)));
      showToast('已修复公式');
      return true;
    } catch (e) {
      showToast(e instanceof Error ? e.message : '修复失败');
      return false;
    }
  };

  const handleSendToCreator = async () => {
    if (!result?.cards.length) return;
    setBusy('正在准备图片…');
    try {
      const images = await exportCards(result.cards, options, (done, total) =>
        setBusy(`正在生成第 ${done}/${total} 张…`),
      );
      setBusy('正在打开创作平台…');
      const payload: PublishPayload = {
        images: await Promise.all(images.map((i) => blobToDataUrl(i.blob))),
        title: (copy?.titles[copy?.selectedTitle ?? 0] ?? copy?.titles[0] ?? result.note.title).slice(0, 20),
        body: copy?.body ?? '',
        tags: copy?.tags ?? result.note.tags,
        createdAt: Date.now(),
      };
      await chrome.storage.local.set({ [KEYS.payload]: payload });
      await chrome.runtime.sendMessage({ type: 'TEXTPIC_PUBLISH' });
      showToast('已发送到小红书创作台，切到那个标签页看看');
    } catch (err) {
      showToast(err instanceof Error ? err.message : '发送失败');
    } finally {
      setBusy(null);
    }
  };

  const cards = result?.cards ?? [];
  const warnings = useMemo(() => {
    const list = [...(result?.warnings ?? [])];
    if (buildError) list.unshift(`排版出错：${buildError}`);
    return list;
  }, [result, buildError]);

  const notePanel = (
    <div className="panel">
      <header className="panel-head">
        <h3>笔记内容</h3>
        <span className="counter">{markdown.length} 字符</span>
      </header>
      {variant === 'web' && (
        <MarkdownToolbar
          textareaRef={noteTextareaRef}
          value={markdown}
          onChange={setMarkdown}
          onInsertImage={() => imageRef.current?.click()}
        />
      )}
      <textarea
        ref={noteTextareaRef}
        className="editor"
        value={markdown}
        spellCheck={false}
        placeholder={
          variant === 'web'
            ? '# 标题\n\n正文… 支持 $E=mc^2$ 公式、代码块、表格\n\n用 --- 强制分页\n\n图片可以直接拖进来，或者 Ctrl+V 粘贴'
            : '# 标题\n\n正文… 支持 $E=mc^2$ 公式、代码块、表格\n\n用 --- 强制分页\n\n图片可以直接拖进来'
        }
        onChange={(e) => setMarkdown(e.target.value)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={async (e) => {
          e.preventDefault();
          const files = Array.from(e.dataTransfer.files);
          const image = files.find((f) => f.type.startsWith('image/'));
          if (image) {
            await insertImageFile(image);
            return;
          }
          const doc = files[0];
          if (doc) void openFile(doc);
        }}
        onPaste={async (e) => {
          // 参考 Madopic 的剪贴板粘图：复制一张图直接 Ctrl+V 粘进来，不用先存文件再选
          const item = Array.from(e.clipboardData.items).find((it) => it.type.startsWith('image/'));
          if (!item) return; // 粘贴的是文字，交给浏览器默认行为
          e.preventDefault();
          const file = item.getAsFile();
          if (file) await insertImageFile(file);
        }}
      />
      {/* 一个文件夹里有多篇笔记时，图片只需读一次，切换笔记复用同一份图库 */}
      {folderNotes.length > 1 && (
        <div className="folder-row">
          <span className="folder-label">文件夹（{folderImages.size} 张图）</span>
          <select
            className="folder-select"
            value={currentNote?.path ?? ''}
            onChange={(e) => {
              const picked = folderNotes.find((n) => n.path === e.target.value);
              if (picked) loadNote(picked, folderImages, figureNarrow);
            }}
          >
            <option value="" disabled>
              选一篇笔记…
            </option>
            {folderNotes.map((n) => (
              <option key={n.path} value={n.path}>
                {n.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {/* 笔记用 <picture> 给了手机/电脑两套图时才有得选 */}
      {currentNote && folderImages.size > 0 && (
        <div className="folder-row">
          <span className="folder-label">配图版本</span>
          <div className="tone-group" role="radiogroup" aria-label="配图版本">
            <button
              type="button"
              role="radio"
              aria-checked={figureNarrow}
              className={`tone-btn${figureNarrow ? ' is-active' : ''}`}
              title="用作者给窄屏准备的竖版图，占版面大、细节多"
              onClick={() => switchFigureVariant(true)}
            >
              手机版
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={!figureNarrow}
              className={`tone-btn${!figureNarrow ? ' is-active' : ''}`}
              title="用宽扁的桌面版图，占高度小、卡片数更少"
              onClick={() => switchFigureVariant(false)}
            >
              电脑版
            </button>
          </div>
        </div>
      )}

      {/* 文风档位放在两个 AI 按钮正上方：它同时决定「AI 去味」怎么改正文、
          以及右边「AI 生成」写出什么腔调的小红书文案，一处选择两处生效 */}
      <TonePicker tone={tone} onSelect={setTone} />
      <div className="field-actions">
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          disabled={!markdown.trim() || formatting}
          onClick={handleFormatMarkdown}
          title="粘贴的是一段没有标题、没有列表的大白话文本？点这个让 AI 帮你加上标题和列表"
        >
          {formatting ? '整理中…' : 'AI 排版'}
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          disabled={!markdown.trim() || humanizing}
          onClick={handleHumanize}
          title={`按「${getTone(tone).label}」改写正文：${getTone(tone).hint}。只改措辞，不动结构和数字`}
        >
          {humanizing ? '改写中…' : 'AI 去味'}
        </button>
        {variant === 'web' ? (
          insertingImage && <span className="busy">插入中…</span>
        ) : (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={openFullEditor}
            title="在新标签页里打开，屏幕更大，还有完整的编辑工具栏和插入图片"
          >
            全屏编辑 ↗
          </button>
        )}
        <input
          ref={imageRef}
          type="file"
          accept="image/*"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) await insertImageFile(f);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );

  const stylePanel = (
    <div className="panel">
      <header className="panel-head">
        <h3>样式</h3>
        <span className="counter">
          {cards.length} / {MAX_CARDS} 张
        </span>
      </header>
      <ThemePicker themeId={options.themeId} onSelect={(themeId) => setOptions({ ...options, themeId })} />

      <div className="control-row">
        <label htmlFor="fontScale">正文字号</label>
        <input
          id="fontScale"
          type="range"
          min={0.5}
          max={1.3}
          step={0.01}
          value={options.fontScale}
          onChange={(e) => setOptions({ ...options, fontScale: Number(e.target.value) })}
        />
        <span className="counter">{Math.round(options.fontScale * 100)}%</span>
      </div>
      {/* 竖图撑满卡片宽度后往往比一整页还高，这里封顶。图片切不开，
          调小它是让竖图和正文挤进同一页最直接的办法 */}
      <div className="control-row">
        <label htmlFor="imageMaxHeight">图片高度</label>
        <input
          id="imageMaxHeight"
          type="range"
          min={IMAGE_H_MIN}
          max={IMAGE_H_MAX}
          step={20}
          value={options.imageMaxHeight}
          onChange={(e) => setOptions({ ...options, imageMaxHeight: Number(e.target.value) })}
        />
        <span className="counter">{options.imageMaxHeight}px</span>
      </div>
      <div className="control-row control-row--checks">
        <label>
          <input
            type="checkbox"
            checked={options.pageNumber}
            onChange={(e) => setOptions({ ...options, pageNumber: e.target.checked })}
          />
          显示页码
        </label>
        <label>
          <input
            type="checkbox"
            checked={options.showAuthor}
            onChange={(e) => setOptions({ ...options, showAuthor: e.target.checked })}
          />
          显示署名
        </label>
        <label title="关掉后每页尽量塞满，代价是标题可能落在页尾、正文翻到下一页">
          <input
            type="checkbox"
            checked={options.keepHeadingWithBody}
            onChange={(e) => setOptions({ ...options, keepHeadingWithBody: e.target.checked })}
          />
          标题不留在页尾
        </label>
      </div>
    </div>
  );

  const adPanel = <AdPanel value={adOptions} onChange={setAdOptions} />;

  const watermarkPanel = <WatermarkPanel options={options} onChange={setOptions} />;

  const copyPanel = (
    <CopyPanel
      copy={copy}
      loading={copyLoading}
      error={copyError}
      onGenerate={handleGenerateCopy}
      onChange={setCopy}
      onCreateManual={() =>
        setCopy({
          titles: [result?.note.title.slice(0, 20) ?? ''],
          body: '',
          tags: result?.note.tags.slice(0, 10) ?? [],
          selectedTitle: 0,
          cover: {
            title: result?.note.title.slice(0, 16) ?? '',
            subtitle: result?.note.subtitle?.slice(0, 24) ?? '',
            badge: result?.note.badge?.slice(0, 6) ?? '',
          },
        })
      }
    />
  );

  const previewSection = (
    <>
      <MathErrorPanel errors={result?.mathErrors ?? []} onFix={handleFixFormula} />
      {warnings.length > 0 && (
        <div className="alerts">
          {warnings.map((w, i) => (
            <p key={i} className="alert">
              {w}
            </p>
          ))}
        </div>
      )}
      <Preview cards={cards} options={options} variant={variant} />
    </>
  );

  return (
    <div className={`app app--${variant}`}>
      <header className="topbar">
        <div className="brand">
          <span className="brand-dot" />
          <b>文图</b>
          <span className="brand-sub">TextPIC · Markdown 转图文卡片</span>
        </div>
        <div className="topbar-actions">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => fileRef.current?.click()}
            title="支持 .md / .markdown / .txt"
          >
            打开文件
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={!!folderLoading}
            onClick={() => folderRef.current?.click()}
            title="选中笔记所在的整个文件夹，md 和图片一起读进来，笔记里的相对图片路径会自动内联"
          >
            {folderLoading ?? '打开文件夹'}
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setShowSettings(true)}>
            设置
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".md,.markdown,.txt"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void openFile(f);
            e.target.value = '';
          }}
        />
        <input
          ref={folderRef}
          type="file"
          hidden
          // webkitdirectory 不在 React 的类型表里，得手写成属性
          {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
          onChange={(e) => {
            const files = e.target.files;
            if (files?.length) void openFolder(files);
            e.target.value = '';
          }}
        />
      </header>

      {variant === 'web' ? (
        // 三栏：编辑器 | 样式 + 预览（样式在上边） | 文案，参考 Madopic 的左编右预，
        // 加一栏放我们特有的小红书文案（Madopic 没有这个，它没有发布场景）
        <main className="layout layout--3col">
          <section className="col col--edit">
            {notePanel}
            {adPanel}
          </section>
          <section className="col col--preview">
            {stylePanel}
            {watermarkPanel}
            {previewSection}
          </section>
          <section className="col col--copy">{copyPanel}</section>
        </main>
      ) : (
        <main className="layout">
          <section className="col">
            {notePanel}
            {adPanel}
            {stylePanel}
            {watermarkPanel}
            {previewSection}
            {copyPanel}
          </section>
        </main>
      )}

      <footer className="actionbar">
        <button
          type="button"
          className="btn btn--primary"
          disabled={!cards.length || !!busy}
          onClick={handleExport}
        >
          导出 {cards.length} 张 PNG
        </button>
        {isExtension && (
          <button
            type="button"
            className="btn btn--accent"
            disabled={!cards.length || !!busy}
            onClick={handleSendToCreator}
          >
            一键填入小红书创作台
          </button>
        )}
        {busy && <span className="busy">{busy}</span>}
      </footer>

      {showSettings && (
        <SettingsDialog
          config={aiConfig}
          defaultAuthor={defaultAuthor}
          onClose={() => setShowSettings(false)}
          onSave={async (c, author) => {
            setAiConfig(c);
            void saveState(KEYS.ai, c);
            setDefaultAuthor(author);
            void saveState(KEYS.defaultAuthor, author);
            const perm = await ensureHostPermission(c.baseUrl);
            if (!perm.ok && perm.message) showToast(perm.message);
          }}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
