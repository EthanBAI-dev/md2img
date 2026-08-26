export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsDataURL(blob);
  });
}

const MAX_DIM = 1600;
// 小于这个体积、尺寸也不超标就不折腾：原样保留格式（比如带透明通道的 PNG）
const SMALL_ENOUGH = 700 * 1024;

function probeImageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('图片解析失败'));
    img.src = dataUrl;
  });
}

async function resizeToDataUrl(file: File, maxDim: number): Promise<string> {
  const original = await blobToDataUrl(file);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('图片解析失败'));
    el.src = original;
  });
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return original; // 拿不到 2d context 就退回原图，好歹能用
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', 0.85);
}

/**
 * 把选中/拖入的图片文件转成能直接嵌进 Markdown 的 data URL。
 * 笔记文本里存的是纯文本，图片太大会让文本框和导出都变卡，
 * 所以超过体积或尺寸阈值的图会先等比缩小、转成 JPEG 再嵌入。
 */
export async function imageToDataUrl(file: File): Promise<string> {
  if (file.size <= SMALL_ENOUGH) {
    const dataUrl = await blobToDataUrl(file);
    const dims = await probeImageSize(dataUrl).catch(() => null);
    if (dims && dims.width <= MAX_DIM && dims.height <= MAX_DIM) return dataUrl;
  }
  return resizeToDataUrl(file, MAX_DIM);
}
