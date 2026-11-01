// 掘掘熊 DigBear —— 浏览器扩展
//
// 右键菜单 →「用掘掘熊翻找这一页」，通过 digbear:// 协议把网址交给应用。
// 应用没装、或者协议没注册时，浏览器会提示找不到处理程序。

const DIGBEAR_SCHEME = "digbear://crawl?url=";
const MENU_ID = "digbear-crawl";

function digbearUrl(target) {
  return DIGBEAR_SCHEME + encodeURIComponent(target);
}

/**
 * 把网址交给应用。
 *
 * Chrome 不允许在扩展里直接用 location 打开未知协议，
 * 只能开一个标签页让系统接管；协议被接管后这个标签页会变成空白页，
 * 所以过一会儿把它关掉。
 */
function sendToDigBear(target) {
  if (!target) return;
  chrome.tabs.create({ url: digbearUrl(target), active: false }, (tab) => {
    if (!tab || chrome.runtime.lastError) return;
    setTimeout(() => {
      chrome.tabs.remove(tab.id, () => void chrome.runtime.lastError);
    }, 1500);
  });
}

function targetFromInfo(info, tab) {
  if (info.linkUrl) return info.linkUrl;
  if (info.mediaType === "image" && info.srcUrl) return info.srcUrl;
  if (info.mediaType === "video" && info.srcUrl) return info.srcUrl;
  if (info.frameUrl) return info.frameUrl;
  if (info.pageUrl) return info.pageUrl;
  return tab && tab.url ? tab.url : null;
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: "用掘掘熊翻找这一页",
      contexts: ["page", "link", "image", "video", "selection", "frame"],
    });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  sendToDigBear(targetFromInfo(info, tab));
});

// 点扩展图标：翻找当前标签页
chrome.action.onClicked.addListener((tab) => {
  sendToDigBear(tab && tab.url ? tab.url : null);
});