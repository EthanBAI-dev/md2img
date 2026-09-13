/**
 * 注入到 creator.xiaohongshu.com 的脚本：把文图生成好的图片和文案填进发布表单。
 *
 * 重要：小红书前端会改版，选择器失效是迟早的事。所有选择器集中放在 SELECTORS 里，
 * 页面右侧抽屉会列出每一步的结果，哪一步红了就改对应那一项即可。
 * 脚本永远不会替你点「发布」，最后一步始终由人确认。
 */
import {
  dataUrlToFile,
  findByText,
  injectFiles,
  alreadyOnEditForm,
  isVisible,
  pickFirstSuggestion,
  replaceEditorText,
  registerFiller,
  setNativeValue,
  sleep,
  typeIntoEditor,
  waitFor,
} from './fill-kit';
import { PUBLISH_TARGETS } from '../src/shared/messages';

const TARGET = PUBLISH_TARGETS.xiaohongshu;

const SELECTORS = {
  /** 「上传图文」标签，按文字匹配 */
  imageTabText: ['上传图文', '图文'],
  /** 图片上传的 file input */
  fileInput: ['input[type="file"][accept*="image"]', 'input.upload-input', 'input[type="file"]'],
  /** 标题输入框 */
  titleInput: ['input[placeholder*="标题"]', '.title-container input', '.d-text[placeholder*="标题"]', 'input[type="text"]'],
  /** 正文富文本编辑器 */
  editor: ['#post-textarea', '.ql-editor', '[contenteditable="true"]'],
  /** 打 # 之后弹出的话题候选 */
  topicOption: ['.mention-list .item', '.topic-list .item', '[class*="mention"] [class*="item"]'],
  /** 判断「已经在编辑表单」用的精确选择器——不能用 titleInput，它末尾有兜底的 input[type=text]，
   *  上传页上随便一个搜索框都会被误认成标题框，导致图片漏传 */
  editFormMarker: ['input[placeholder*="标题"]', '.title-container input'],
  /** 发布按钮，按文字匹配 */
  publishText: ['发布', '发布笔记'],
};

registerFiller('xiaohongshu', async ({ payload, mark }) => {
  // 「重新填写」时页面通常已经在编辑表单那一步：图片之前传过了，再投一次会变成重复的图，
  // 这时只重填文字部分
  const skipUpload = alreadyOnEditForm(SELECTORS.editFormMarker);
  if (skipUpload) mark('上传图片', true, '已在编辑页，跳过上传，只重填文字');

  if (!skipUpload) {
    // 1. 切到「上传图文」
    const imageTab = findByText(SELECTORS.imageTabText);
    if (imageTab) {
      imageTab.click();
      mark('切换到上传图文', true);
      await sleep(900);
    } else {
      mark('切换到上传图文', true, '页面已在图文模式或无需切换');
    }

    // 2. 注入图片
    const input = await waitFor<HTMLInputElement>(SELECTORS.fileInput, 15000);
    if (!input) {
      mark('找到图片上传框', false, '选择器失效，见 content-xhs.ts 的 SELECTORS.fileInput');
      return { ok: false, message: '找不到上传控件' };
    }
    const files = payload.images.map((d, i) => dataUrlToFile(d, `${String(i + 1).padStart(2, '0')}.png`));
    injectFiles(input, files);
    mark('上传图片', true, `已投递 ${files.length} 张，等待网站处理`);
  }

  // 3. 等编辑表单出现
  const titleInput = await waitFor<HTMLInputElement>(SELECTORS.titleInput, 30000, isVisible);
  if (!titleInput) {
    mark('等待编辑表单', false, '图片可能还在上传，或标题框选择器失效');
    return { ok: false, message: '没等到编辑表单' };
  }
  mark('等待编辑表单', true);

  // 4. 标题
  if (payload.title) {
    const title = payload.title.slice(0, TARGET.titleMax);
    setNativeValue(titleInput, title);
    mark('填写标题', true, title);
  }

  // 5. 正文 + 话题
  const editor = await waitFor<HTMLElement>(SELECTORS.editor, 8000, isVisible);
  if (!editor) {
    mark('填写正文', false, '找不到正文编辑器，正文请手动粘贴');
  } else {
    // 有话题时即使正文为空也要先清空编辑器，否则重新填写会把话题再叠一遍
    if (payload.body || payload.tags?.length) {
      replaceEditorText(editor, (payload.body ?? '').slice(0, TARGET.bodyMax));
      if (payload.body) mark('填写正文', true, `${payload.body.length} 字`);
    }

    if (payload.tags?.length) {
      let linked = 0;
      typeIntoEditor(editor, '\n\n');
      for (const tag of payload.tags) {
        typeIntoEditor(editor, `#${tag}`);
        if (await pickFirstSuggestion(SELECTORS.topicOption)) linked++;
        else typeIntoEditor(editor, ' ');
      }
      mark(
        '插入话题标签',
        linked === payload.tags.length,
        linked === payload.tags.length
          ? `${linked} 个已关联为话题`
          : `${linked}/${payload.tags.length} 个关联成功，其余是纯文本，可手动重打一遍`,
      );
    }
  }

  // 6. 定位发布按钮但不点，交给人确认
  const publish = findByText(SELECTORS.publishText);
  if (publish) {
    publish.scrollIntoView({ behavior: 'smooth', block: 'center' });
    publish.style.outline = '3px solid #ff2e4d';
    publish.style.outlineOffset = '3px';
  }
  return { ok: true, message: '已填好，检查无误后自己点「发布」' };
});
