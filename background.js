const RESTRICTED_URL_PREFIXES = [
  "about:",
  "brave://",
  "chrome-extension://",
  "chrome://",
  "devtools://",
  "edge://",
  "opera://",
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
  const result = await chrome.storage.local.get(key);
  return result[key] ?? null;
}

async function setTabSession(tabId, sessionState) {
  const key = getSessionKey(tabId);
  await chrome.storage.local.set({
    [key]: {
      ...sessionState,
      updatedAt: Date.now()
    }
  });
}

async function clearTabSession(tabId) {
  await chrome.storage.local.remove(getSessionKey(tabId));
}

async function injectController(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"]
    });
  } catch (error) {
    console.error("Failed to inject Human Activity controller.", error);
  }
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!isSupportedTab(tab)) {
    console.warn("Human Activity Extension cannot run on this page.", tab?.url);
    return;
  }

  await injectController(tab.id);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !isSupportedTab(tab)) {
    return;
  }

  const session = await getTabSession(tabId);
  if (!session?.panelOpen) {
    return;
  }

  await injectController(tabId);
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  await clearTabSession(tabId);
});
