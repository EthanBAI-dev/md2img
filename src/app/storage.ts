/** 扩展环境用 chrome.storage.local，纯网页环境退回 localStorage */
export const isExtension = typeof chrome !== 'undefined' && !!chrome.runtime?.id;

export async function loadState<T>(key: string, fallback: T): Promise<T> {
  try {
    if (isExtension) {
      const got = await chrome.storage.local.get(key);
      return (got[key] as T) ?? fallback;
    }
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export async function saveState<T>(key: string, value: T): Promise<void> {
  try {
    if (isExtension) {
      await chrome.storage.local.set({ [key]: value });
    } else {
      localStorage.setItem(key, JSON.stringify(value));
    }
  } catch {
    /* 存不下就算了，不影响主流程 */
  }
}

/**
 * 订阅某个 key 在「别的标签页/侧边栏」里发生的变化。
 *
 * 之前的问题：侧边栏和全屏编辑页各自只在挂载时读一次存储，读完就再也不看了——
 * 两边各自往同一个 key 里存，但谁也不知道对方存了新内容，所以编辑完切回侧边栏看到的还是旧的。
 * 这里补上实时订阅：扩展环境用 chrome.storage.onChanged，纯网页环境用浏览器原生的 storage 事件
 * （注意这个事件只会在“别的标签页”触发，当前标签页自己 setItem 不会收到，天然不会自己触发自己）。
 */
export function subscribeState<T>(key: string, onChange: (value: T) => void): () => void {
  if (isExtension && chrome.storage?.onChanged) {
    const handler = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local' || !(key in changes)) return;
      onChange(changes[key].newValue as T);
    };
    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  }
  const handler = (e: StorageEvent) => {
    if (e.key !== key || e.newValue == null) return;
    try {
      onChange(JSON.parse(e.newValue) as T);
    } catch {
      /* 解析失败就跳过，不影响当前页面 */
    }
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}

/**
 * 扩展里向任意 AI 服务发请求需要对应域名的 host 权限，
 * manifest 里只声明成 optional，用的时候再向用户申请（必须在用户手势里调用）。
 */
export async function ensureHostPermission(baseUrl: string): Promise<{ ok: boolean; message?: string }> {
  if (!isExtension || !chrome.permissions) return { ok: true };
  try {
    const origin = `${new URL(baseUrl).origin}/*`;
    if (await chrome.permissions.contains({ origins: [origin] })) return { ok: true };
    const granted = await chrome.permissions.request({ origins: [origin] });
    return granted ? { ok: true } : { ok: false, message: `没有拿到 ${origin} 的访问权限，AI 文案会失败` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export const KEYS = {
  markdown: 'pm.markdown',
  options: 'pm.options',
  /** 独立广告推广页的内容与插入位置 */
  ad: 'pm.adOptions',
  ai: 'pm.aiConfig',
  copy: 'pm.copy',
  /** 默认署名，笔记没写 author 时兜底用这个，不用每篇都手写 */
  defaultAuthor: 'pm.defaultAuthor',
  /** 「去 AI 味」的文风档位，正文改写和小红书文案共用 */
  tone: 'pm.tone',
  /** 待注入创作平台的载荷 */
  payload: 'pm.publishPayload',
} as const;
