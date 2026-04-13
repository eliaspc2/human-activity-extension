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

function isSupportedTab(tab) {
  return Boolean(
    tab?.id &&
      tab?.url &&
      !RESTRICTED_URL_PREFIXES.some((prefix) => tab.url.startsWith(prefix))
  );
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!isSupportedTab(tab)) {
    console.warn("Human Activity Extension cannot run on this page.", tab?.url);
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"]
    });
  } catch (error) {
    console.error("Failed to inject Human Activity controller.", error);
  }
});
