/**
 * 注入到 creator.douyin.com 的脚本：把文图生成好的图片和文案填进抖音「发布图文」表单。
 *
 * 流程和小红书一样：上传图片 → 等编辑页 → 填标题 → 填作品描述 → 逐个打 # 话题并从下拉里选中 →
 * 高亮发布按钮，**不替你点发布**。
 *
 * 注意：这份选择器是按抖音创作者中心图文发布页的常见结构写的，没有在真实账号上跑过。
 * 第一次用时如果右侧抽屉里某一步是红的，打开 F12 找到对应元素，改下面 SELECTORS 里那一项即可。
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

const TARGET = PUBLISH_TARGETS.douyin;

const SELECTORS = {
  /** 上传页顶部的「发布图文」切换，按文字匹配（打开的链接已经带了 default-tab=3，一般不用切） */
  imageTabText: ['发布图文', '图文'],
  /** 图片上传的 file input；同页可能还有视频上传框，优先认 accept 里带 image 的 */
  fileInput: ['input[type="file"][accept*="image"]', 'input[type="file"][multiple]', 'input[type="file"]'],
  /** 上传后跳转到编辑页的「作品标题」 */
  titleInput: ['input[placeholder*="作品标题"]', 'input[placeholder*="标题"]', '[class*="title"] input[type="text"]'],
  /** 「作品描述」富文本 */
  editor: [
    '.zone-container[contenteditable="true"]',
    '[data-placeholder*="作品描述"]',
    '[class*="editor"] [contenteditable="true"]',
    '[contenteditable="true"]',
  ],
  /** 打 # 之后弹出的话题候选 */
  topicOption: [
    '[class*="mention-suggest"] [class*="item"]',
    '[class*="topic"] [class*="item"]',
    '[class*="suggest"] [class*="item"]',
    '[class*="mention"] [class*="item"]',
  ],
  /** 判断「已经在编辑页」用的精确选择器——不含宽泛兜底，免得上传页的其他输入框被误认，导致图片漏传 */
  editFormMarker: ['input[placeholder*="作品标题"]', 'input[placeholder*="标题"]'],
  /** 发布按钮，按文字匹配 */
  publishText: ['发布', '立即发布'],
};

registerFiller('douyin', async ({ payload, mark }) => {
  // 「重新填写」时页面通常已经在编辑表单那一步：图片之前传过了，再投一次会变成重复的图，
  // 这时只重填文字部分
  const skipUpload = alreadyOnEditForm(SELECTORS.editFormMarker);
  if (skipUpload) mark('上传图片', true, '已在编辑页，跳过上传，只重填文字');

  if (!skipUpload) {
    // 1. 确认在「发布图文」
    const imageTab = findByText(SELECTORS.imageTabText);
    if (imageTab) {
      imageTab.click();
      mark('切换到发布图文', true);
      await sleep(900);
    } else {
      mark('切换到发布图文', true, '页面已在图文模式或无需切换');
    }

    // 2. 注入图片
    const input = await waitFor<HTMLInputElement>(SELECTORS.fileInput, 15000);
    if (!input) {
      mark('找到图片上传框', false, '选择器失效，见 content-douyin.ts 的 SELECTORS.fileInput');
      return { ok: false, message: '找不到上传控件' };
    }
    if (input.accept && !/image/i.test(input.accept)) {
      mark('找到图片上传框', false, `找到的是 accept="${input.accept}" 的上传框，可能是视频入口，请先手动切到「发布图文」`);
      return { ok: false, message: '当前不在图文上传页' };
    }
    const files = payload.images.map((d, i) => dataUrlToFile(d, `${String(i + 1).padStart(2, '0')}.png`));
    injectFiles(input, files);
    mark('上传图片', true, `已投递 ${files.length} 张，等待抖音处理`);
  }

  // 3. 抖音传完图会跳到编辑页，等标题框出现（图片多时会比较慢）
  const titleInput = await waitFor<HTMLInputElement>(SELECTORS.titleInput, 45000, isVisible);
  if (!titleInput) {
    mark('等待编辑页', false, '图片可能还在上传，或标题框选择器失效');
    return { ok: false, message: '没等到编辑页' };
  }
  mark('等待编辑页', true);

  // 4. 作品标题
  if (payload.title) {
    const title = payload.title.slice(0, TARGET.titleMax);
    setNativeValue(titleInput, title);
    mark('填写作品标题', true, title);
  }

  // 5. 作品描述 + 话题
  const editor = await waitFor<HTMLElement>(SELECTORS.editor, 10000, (el) => isVisible(el) && el !== titleInput);
  if (!editor) {
    mark('填写作品描述', false, '找不到描述编辑器，请手动粘贴');
  } else {
    // 有话题时即使正文为空也要先清空编辑器，否则重新填写会把话题再叠一遍
    if (payload.body || payload.tags?.length) {
      replaceEditorText(editor, (payload.body ?? '').slice(0, TARGET.bodyMax));
      if (payload.body) mark('填写作品描述', true, `${payload.body.length} 字`);
    }

    if (payload.tags?.length) {
      let linked = 0;
      typeIntoEditor(editor, '\n');
      for (const tag of payload.tags) {
        typeIntoEditor(editor, `#${tag}`);
        if (await pickFirstSuggestion(SELECTORS.topicOption)) linked++;
        else typeIntoEditor(editor, ' ');
      }
      mark(
        '插入话题',
        linked === payload.tags.length,
        linked === payload.tags.length
          ? `${linked} 个已关联为话题`
          : `${linked}/${payload.tags.length} 个关联成功，其余是纯文本，可手动重打一遍`,
      );
    }
  }

  // 6. 定位发布按钮但不点
  const publish = findByText(SELECTORS.publishText, ['button']);
  if (publish) {
    publish.scrollIntoView({ behavior: 'smooth', block: 'center' });
    publish.style.outline = '3px solid #ff2e4d';
    publish.style.outlineOffset = '3px';
  }
  return { ok: true, message: '已填好，检查无误后自己点「发布」' };
});
