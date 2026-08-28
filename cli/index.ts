#!/usr/bin/env -S npx tsx
import { Command } from 'commander';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { serveStatic } from './server';
import { generateCopy, formatTags, type AiConfig } from '../src/core/ai';
import { THEMES } from '../src/core/themes';
import { CARD_H, CARD_W, DEFAULT_RENDER_OPTIONS, type RenderOptions } from '../src/core/types';
import type { HeadlessResult } from '../src/main-headless';

const ROOT = resolve(import.meta.dirname, '..');
const DIST = join(ROOT, 'dist');

function safeName(s: string): string {
  return s.replace(/[\\/:*?"<>|\n\r\t]/g, '').trim().slice(0, 40) || 'note';
}

interface BuildOpts {
  out: string;
  theme: string;
  fontScale: string;
  imageHeight: string;
  pageNumber: boolean;
  author: boolean;
  keepHeading: boolean;
  copy?: boolean;
}

async function renderFiles(inputs: string[], opts: BuildOpts) {
  if (!existsSync(join(DIST, 'headless.html'))) {
    console.error('还没构建产物，先跑一次：pnpm build');
    process.exit(1);
  }
  if (!THEMES.some((t) => t.id === opts.theme)) {
    console.error(`主题 ${opts.theme} 不存在，可选：${THEMES.map((t) => t.id).join(' / ')}`);
    process.exit(1);
  }

  const options: RenderOptions = {
    ...DEFAULT_RENDER_OPTIONS,
    themeId: opts.theme,
    fontScale: Number(opts.fontScale),
    imageMaxHeight: Number(opts.imageHeight),
    pageNumber: opts.pageNumber,
    showAuthor: opts.author,
    keepHeadingWithBody: opts.keepHeading,
  };

  const server = await serveStatic(DIST);
  const browser = await chromium.launch();

  try {
    const page = await browser.newPage({
      viewport: { width: CARD_W, height: CARD_H },
      deviceScaleFactor: 1,
    });
    await page.goto(`${server.url}/headless.html`, { waitUntil: 'networkidle' });

    for (const input of inputs) {
      const markdown = await readFile(input, 'utf8');
      const result: HeadlessResult = await page.evaluate(
        ([md, o]) => window.textpic.render(md as string, o as Partial<RenderOptions>),
        [markdown, options] as const,
      );

      const dir = join(resolve(opts.out), safeName(result.title));
      await mkdir(dir, { recursive: true });

      const cards = await page.locator('#cards .pm-card').all();
      for (let i = 0; i < cards.length; i++) {
        await cards[i].screenshot({ path: join(dir, `${String(i + 1).padStart(2, '0')}.png`) });
      }

      const lines = [
        `${basename(input)} → ${dir}`,
        `  ${result.count} 张图，主题 ${options.themeId}`,
      ];
      for (const w of result.warnings) lines.push(`  提醒：${w}`);

      if (opts.copy) {
        const config: AiConfig = {
          baseUrl: process.env.TEXTPIC_BASE_URL ?? 'https://api.deepseek.com/v1',
          apiKey: process.env.TEXTPIC_API_KEY ?? '',
          model: process.env.TEXTPIC_MODEL ?? 'deepseek-chat',
        };
        try {
          const generated = await generateCopy(
            { title: result.title, subtitle: result.subtitle, tags: result.tags, body: '' },
            result.plainText,
            config,
          );
          const text = [
            '【备选标题】',
            ...generated.titles.map((t, i) => `${i + 1}. ${t}`),
            '',
            '【正文】',
            generated.body,
            '',
            '【标签】',
            formatTags(generated.tags),
          ].join('\n');
          await writeFile(join(dir, 'copy.txt'), text, 'utf8');
          lines.push('  已生成 copy.txt');
        } catch (err) {
          lines.push(`  文案生成失败：${err instanceof Error ? err.message : String(err)}`);
        }
      }

      console.log(lines.join('\n'));
    }
  } finally {
    await browser.close();
    await server.close();
  }
}

const program = new Command();

program
  .name('textpic')
  .description('文图 TextPIC —— 把 Markdown 笔记批量渲染成图文卡片')
  .version('0.1.0');

program
  .command('build', { isDefault: true })
  .description('渲染一个 .md 文件或一整个目录')
  .argument('<input...>', '.md 文件路径，或包含 .md 的目录')
  .option('-o, --out <dir>', '输出目录', './out')
  .option('-t, --theme <id>', `模板：${THEMES.map((t) => t.id).join(' / ')}`, 'cream')
  .option('-s, --font-scale <n>', '正文字号缩放 0.7~1.3', '1')
  .option('--image-height <px>', '图片高度上限（卡片内像素，竖图太高会挤掉正文）', '900')
  .option('--no-page-number', '不显示页码')
  .option('--no-author', '不显示署名')
  .option('--no-keep-heading', '允许标题留在页尾，每页尽量塞满、减少空白')
  .option('--copy', '同时用 AI 生成标题文案标签（需要 TEXTPIC_API_KEY）')
  .action(async (inputs: string[], opts: BuildOpts) => {
    const files: string[] = [];
    for (const input of inputs) {
      const path = resolve(input);
      const isDir = existsSync(path) && (await readdir(path).then(() => true).catch(() => false));
      if (isDir) {
        const entries = await readdir(path);
        files.push(
          ...entries.filter((f) => ['.md', '.markdown', '.txt'].includes(extname(f))).map((f) => join(path, f)),
        );
      } else {
        files.push(path);
      }
    }
    if (!files.length) {
      console.error('没找到 .md/.txt 文件');
      process.exit(1);
    }
    await renderFiles(files, opts);
  });

program
  .command('themes')
  .description('列出所有模板')
  .action(() => {
    for (const t of THEMES) console.log(`${t.id.padEnd(10)} ${t.name.padEnd(8)} ${t.desc}`);
  });

program.parseAsync().catch((err) => {
  console.error(err);
  process.exit(1);
});
