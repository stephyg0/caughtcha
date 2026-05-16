type RuntimeMessage =
  | { type: "PRODUCTIVITY_CAPTCHA_UNLOCK"; score: number; tabId?: number }
  | { type: "PRODUCTIVITY_CAPTCHA_PROCEED"; score: number; tabId?: number; targetUrl: string }
  | { type: "PRODUCTIVITY_CAPTCHA_BLOCKLIST"; hosts: string[] };

const DEFAULT_BLOCKED_HOSTS = [
  "tiktok.com",
  "instagram.com",
  "x.com",
  "twitter.com",
  "reddit.com",
  "netflix.com",
  "youtube.com/shorts"
];

const storageGet = <T>(keys: string | string[] | Record<string, unknown>) =>
  new Promise<T>((resolve) => chrome.storage.local.get(keys, (value) => resolve(value as T)));

const storageSet = (value: Record<string, unknown>) =>
  new Promise<void>((resolve) => chrome.storage.local.set(value, resolve));

function normaliseHost(host: string) {
  return host.replace(/^www\./, "").toLowerCase();
}

function matchesBlockedUrl(urlText: string, hosts: string[]) {
  try {
    const url = new URL(urlText);
    const host = normaliseHost(url.hostname);
    const pathKey = `${host}${url.pathname}`.toLowerCase();

    return hosts.some((entry) => {
      const cleaned = entry.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "");
      if (cleaned.includes("/")) {
        return pathKey.startsWith(cleaned);
      }
      return host === cleaned || host.endsWith(`.${cleaned}`);
    });
  } catch {
    return false;
  }
}

async function shouldAllowTab(tabId: number) {
  const { allowedTabs } = await storageGet<{ allowedTabs?: Record<string, number> }>("allowedTabs");
  const allowedUntil = allowedTabs?.[String(tabId)];
  return typeof allowedUntil === "number" && allowedUntil > Date.now();
}

async function getBlocklist() {
  const { customBlockedHosts } = await storageGet<{ customBlockedHosts?: string[] }>({
    customBlockedHosts: DEFAULT_BLOCKED_HOSTS
  });
  return customBlockedHosts?.length ? customBlockedHosts : DEFAULT_BLOCKED_HOSTS;
}

async function allowTab(tabId: number, score: number) {
  const { allowedTabs = {} } = await storageGet<{ allowedTabs?: Record<string, number> }>("allowedTabs");
  const nextAllowedTabs = { ...allowedTabs, [String(tabId)]: Date.now() + 60_000 };
  await storageSet({ allowedTabs: nextAllowedTabs, lastWorkforceReadinessScore: score });
}

chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId !== 0 || details.tabId < 0) return;
  const blockedHosts = await getBlocklist();

  if (!(await shouldAllowTab(details.tabId)) && matchesBlockedUrl(details.url, blockedHosts)) {
    const redirectUrl = chrome.runtime.getURL(
      `index.html?blocked=${encodeURIComponent(details.url)}&tabId=${details.tabId}&ts=${Date.now()}`
    );
    chrome.tabs.update(details.tabId, { url: redirectUrl });
  }
});

chrome.runtime.onMessage.addListener((message: RuntimeMessage, sender, sendResponse) => {
  if (message.type === "PRODUCTIVITY_CAPTCHA_UNLOCK") {
    const tabId = message.tabId ?? sender.tab?.id;
    if (typeof tabId !== "number") {
      sendResponse({ ok: false });
      return false;
    }
    allowTab(tabId, message.score).then(() => sendResponse({ ok: true, tabId }));
    return true;
  }

  if (message.type === "PRODUCTIVITY_CAPTCHA_PROCEED") {
    const tabId = message.tabId ?? sender.tab?.id;
    if (typeof tabId !== "number") {
      sendResponse({ ok: false });
      return false;
    }
    allowTab(tabId, message.score)
      .then(() => chrome.tabs.update(tabId, { url: message.targetUrl }))
      .then(() => sendResponse({ ok: true, tabId }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message.type === "PRODUCTIVITY_CAPTCHA_BLOCKLIST") {
    const customBlockedHosts = Array.from(new Set(message.hosts.map((host) => host.trim()).filter(Boolean)));
    storageSet({ customBlockedHosts }).then(() => sendResponse({ ok: true, customBlockedHosts }));
    return true;
  }

  return false;
});

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await storageGet<{ customBlockedHosts?: string[] }>("customBlockedHosts");
  if (!existing.customBlockedHosts) {
    await storageSet({ customBlockedHosts: DEFAULT_BLOCKED_HOSTS });
  }
  await storageSet({ unlockUntil: 0, allowedTabs: {} });
});
