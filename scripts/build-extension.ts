import { build } from 'esbuild';
import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { textpicIcon } from './make-icons';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const out = join(root, 'dist-extension');

async function main() {
  await rm(out, { recursive: true, force: true });
  await mkdir(join(out, 'icons'), { recursive: true });

  // 1. 侧边栏 + 网页版页面都要打进去：index.html 现在是「全屏编辑」新标签页的落地页，
  // 侧边栏本身太窄，全屏编辑靠它在一个完整标签页里跑同一套编辑器/预览。
  // headless.html 只给 CLI 用，扩展里用不到，跳过。
  const skip = new Set(['headless.html']);
  const files = await readdir(dist);
  for (const name of files) {
    if (skip.has(name)) continue;
    await cp(join(dist, name), join(out, name), { recursive: true });
  }

  // 2. background 走 ESM（manifest 里声明了 type: module）
  await build({
    entryPoints: [join(root, 'extension/background.ts')],
    outfile: join(out, 'background.js'),
    bundle: true,
    format: 'esm',
    target: 'chrome114',
    minify: true,
  });

  // 3. content script 必须是单个 IIFE，MV3 不支持 module 形式的内容脚本。
  // 每个平台一份，公用的 fill-kit 会被分别打进去
  for (const name of ['content-xhs', 'content-douyin']) {
    await build({
      entryPoints: [join(root, `extension/${name}.ts`)],
      outfile: join(out, `${name}.js`),
      bundle: true,
      format: 'iife',
      target: 'chrome114',
      minify: false, // 选择器要靠人改，保持可读
    });
  }

  // 4. manifest 和图标
  await cp(join(root, 'extension/manifest.json'), join(out, 'manifest.json'));
  for (const size of [16, 48, 128]) {
    await writeFile(join(out, 'icons', `icon${size}.png`), textpicIcon(size));
  }

  console.log(`\n扩展已打包到 ${out}`);
  console.log('装载方式：Chrome → 扩展程序 → 打开开发者模式 → 加载已解压的扩展程序 → 选这个目录\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
