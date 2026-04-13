const extensionApi = globalThis.browser ?? globalThis.chrome;
const actionApi = extensionApi.action ?? extensionApi.browserAction;
const runtimeApi = extensionApi.runtime;
const storageArea = extensionApi.storage?.local;
const tabsApi = extensionApi.tabs;

const RESTRICTED_URL_PREFIXES = [
  "about:",
  "brave://",
  "chrome-extension://",
  "chrome://",
  "devtools://",
  "edge://",
  "moz-extension://",
  "opera://",
  "resource://",
  "vivaldi://"
];

const SESSION_KEY_PREFIX = "hae-tab-session:";

function isSupportedTab(tab) {
  return Boolean(
    tab?.id &&
      tab?.url &&
      !RESTRICTED_URL_PREFIXES.some((prefix) => tab.url.startsWith(prefix))
  );
}

function getSessionKey(tabId) {
  return `${SESSION_KEY_PREFIX}${tabId}`;
}

async function getTabSession(tabId) {
  const key = getSessionKey(tabId);
  const result = await storageArea.get(key);
  return result[key] ?? null;
}

async function setTabSession(tabId, sessionState) {
  const key = getSessionKey(tabId);
  await storageArea.set({
    [key]: {
      ...sessionState,
      updatedAt: Date.now()
    }
  });
}

async function clearTabSession(tabId) {
  await storageArea.remove(getSessionKey(tabId));
}

async function injectController(tabId) {
  try {
    if (extensionApi.scripting?.executeScript) {
      await extensionApi.scripting.executeScript({
        target: { tabId },
        files: ["content.js"]
      });
      return;
    }

    if (tabsApi.executeScript) {
      await tabsApi.executeScript(tabId, {
        file: "content.js"
      });
      return;
    }

    throw new Error("No supported executeScript API is available.");
  } catch (error) {
    console.error("Failed to inject Human Activity controller.", error);
  }
}

actionApi.onClicked.addListener(async (tab) => {
  if (!isSupportedTab(tab)) {
    console.warn("Human Activity Extension cannot run on this page.", tab?.url);
    return;
  }

  await injectController(tab.id);
});

runtimeApi.onMessage.addListener((message, sender, sendResponse) => {
  void (async () => {
    const tabId = sender.tab?.id;

    if (message?.type === "hae:get-tab-session") {
      if (!tabId) {
        sendResponse({ ok: false, error: "Missing sender tab." });
        return;
      }

      sendResponse({
        ok: true,
        session: await getTabSession(tabId)
      });
      return;
    }

    if (message?.type === "hae:set-tab-session") {
      if (!tabId) {
        sendResponse({ ok: false, error: "Missing sender tab." });
        return;
      }

      await setTabSession(tabId, message.session ?? {});
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === "hae:clear-tab-session") {
      if (!tabId) {
        sendResponse({ ok: false, error: "Missing sender tab." });
        return;
      }

      await clearTabSession(tabId);
      sendResponse({ ok: true });
      return;
    }

    sendResponse({ ok: false, error: "Unsupported message type." });
  })();

  return true;
});

tabsApi.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !isSupportedTab(tab)) {
    return;
  }

  const session = await getTabSession(tabId);
  if (!session?.panelOpen) {
    return;
  }

  await injectController(tabId);
});

tabsApi.onRemoved.addListener(async (tabId) => {
  await clearTabSession(tabId);
});
