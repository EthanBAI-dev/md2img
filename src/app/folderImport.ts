import type { ImageMap } from '../core/images';
import { blobToDataUrl, imageToDataUrl } from './fileUtils';

const NOTE_EXT = ['.md', '.markdown', '.txt'];
const IMAGE_EXT = ['.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif'];

export interface FolderNote {
  /** 显示用的文件名 */
  name: string;
  /** 相对文件夹根目录的路径，用来解析笔记里的相对图片路径 */
  path: string;
  text: string;
}

export interface FolderImport {
  notes: FolderNote[];
  /** 相对路径（去掉最外层文件夹名）→ data URL */
  images: ImageMap;
  /** 体积太大被跳过的图片，读完提示用户 */
  skipped: string[];
}

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i < 0 ? '' : name.slice(i).toLowerCase();
}

/**
 * webkitRelativePath 形如「零基础版_01-05/figures/desktop/01-pipeline.svg」，
 * 第一段是用户选中的那个文件夹本身，去掉之后才和笔记里写的相对路径对得上。
 */
function stripRoot(relPath: string): string {
  const i = relPath.indexOf('/');
  return i < 0 ? relPath : relPath.slice(i + 1);
}

/** 单张图的体积上限：内联成 data URL 之后大约膨胀 4/3，太大会把存储和渲染拖垮 */
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/**
 * 读取用户通过 <input webkitdirectory> 选中的整个文件夹：
 * 笔记原样读成文本，图片转成 data URL 备用。
 * SVG 不走压缩——它是矢量文本，光栅化只会更大更糊。
 */
export async function readFolder(fileList: FileList | File[]): Promise<FolderImport> {
  const files = Array.from(fileList);
  const notes: FolderNote[] = [];
  const images: ImageMap = new Map();
  const skipped: string[] = [];

  await Promise.all(
    files.map(async (file) => {
      const rel = stripRoot(file.webkitRelativePath || file.name);
      const ext = extOf(file.name);
      if (NOTE_EXT.includes(ext)) {
        notes.push({ name: file.name, path: rel, text: await file.text() });
        return;
      }
      if (!IMAGE_EXT.includes(ext)) return;
      if (file.size > MAX_IMAGE_BYTES) {
        skipped.push(rel);
        return;
      }
      try {
        // SVG 是矢量，走 imageToDataUrl 会被 canvas 光栅化成 JPEG，白白丢清晰度
        images.set(rel, ext === '.svg' ? await blobToDataUrl(file) : await imageToDataUrl(file));
      } catch {
        skipped.push(rel);
      }
    }),
  );

  notes.sort((a, b) => a.path.localeCompare(b.path, 'zh'));
  return { notes, images, skipped };
}
