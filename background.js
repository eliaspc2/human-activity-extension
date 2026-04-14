const extensionApi = globalThis.browser ?? globalThis.chrome;
const actionApi = extensionApi.action ?? extensionApi.browserAction;
const runtimeApi = extensionApi.runtime;
const storageArea = extensionApi.storage?.local;
const tabsApi = extensionApi.tabs;
const NATIVE_LOCK_HOST = "dev.eliaspc.human_activity_lock";
const SESSION_KEY_PREFIX = "hae-tab-session:";
const ACTIVE_SESSION_STATES = new Set(["RUNNING", "REFRESHING"]);
const NATIVE_PORT_TIMEOUT_MS = 5000;

let pendingManualUpdateInstall = false;
let nativeInhibitPort = null;
let nativeInhibitActive = false;
let nativeInhibitStartPromise = null;
let nativeInhibitStopPromise = null;

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
  if (!storageArea) {
    return null;
  }

  const key = getSessionKey(tabId);
  const result = await storageArea.get(key);
  return result[key] ?? null;
}

async function setTabSession(tabId, sessionState) {
  if (!storageArea) {
    return;
  }

  const key = getSessionKey(tabId);
  await storageArea.set({
    [key]: {
      ...sessionState,
      updatedAt: Date.now()
    }
  });
}

async function clearTabSession(tabId) {
  if (!storageArea) {
    return;
  }

  await storageArea.remove(getSessionKey(tabId));
}

async function listTabSessions() {
  if (!storageArea) {
    return [];
  }

  const allEntries = await storageArea.get(null);
  return Object.entries(allEntries)
    .filter(([key]) => key.startsWith(SESSION_KEY_PREFIX))
    .map(([, value]) => value)
    .filter(Boolean);
}

function sessionNeedsInhibit(session) {
  return ACTIVE_SESSION_STATES.has(session?.statusMode);
}

async function hasActiveSessions() {
  const sessions = await listTabSessions();
  return sessions.some(sessionNeedsInhibit);
}

async function requestManualUpdateCheck() {
  if (typeof runtimeApi.requestUpdateCheck !== "function") {
    return {
      ok: false,
      error: "Manual update checks are not supported in this browser."
    };
  }

  try {
    const result = await runtimeApi.requestUpdateCheck();
    const status = result?.status ?? "unknown";
    const version = result?.version ?? null;

    pendingManualUpdateInstall = status === "update_available";

    return {
      ok: true,
      status,
      version,
      currentVersion: runtimeApi.getManifest?.().version ?? null
    };
  } catch (error) {
    pendingManualUpdateInstall = false;
    return {
      ok: false,
      error: error?.message ?? String(error)
    };
  }
}

async function lockComputer() {
  if (typeof runtimeApi.sendNativeMessage !== "function") {
    return {
      ok: false,
      error: "Native messaging is not supported in this browser."
    };
  }

  try {
    const response = await runtimeApi.sendNativeMessage(NATIVE_LOCK_HOST, {
      action: "lock"
    });

    return {
      ok: response?.ok !== false,
      command: response?.command ?? null,
      locked: Boolean(response?.locked),
      error: response?.error ?? null
    };
  } catch (error) {
    return {
      ok: false,
      error: error?.message ?? String(error)
    };
  }
}

async function pingLockHost() {
  if (typeof runtimeApi.sendNativeMessage !== "function") {
    return {
      ok: false,
      ready: false
    };
  }

  try {
    const response = await runtimeApi.sendNativeMessage(NATIVE_LOCK_HOST, {
      action: "ping"
    });

    return {
      ok: response?.ok === true,
      ready: response?.ok === true,
      idleInhibitSupported: Boolean(response?.idle_inhibit_supported)
    };
  } catch {
    return {
      ok: false,
      ready: false
    };
  }
}

function clearNativeInhibitPort() {
  if (!nativeInhibitPort) {
    nativeInhibitActive = false;
    return;
  }

  try {
    nativeInhibitPort.disconnect();
  } catch {
    // Ignore disconnect races from browsers that already tore the port down.
  }

  nativeInhibitPort = null;
  nativeInhibitActive = false;
}

function ensureNativeInhibitPort() {
  if (typeof runtimeApi.connectNative !== "function") {
    return {
      ok: false,
      error: "Native messaging ports are not supported in this browser."
    };
  }

  if (nativeInhibitPort) {
    return {
      ok: true,
      port: nativeInhibitPort
    };
  }

  try {
    const port = runtimeApi.connectNative(NATIVE_LOCK_HOST);
    port.onDisconnect.addListener(() => {
      if (nativeInhibitPort !== port) {
        return;
      }

      const errorMessage = runtimeApi.lastError?.message ?? null;
      nativeInhibitPort = null;
      nativeInhibitActive = false;

      if (errorMessage) {
        console.warn("Human Activity native inhibit port disconnected.", errorMessage);
      }
    });

    nativeInhibitPort = port;

    return {
      ok: true,
      port
    };
  } catch (error) {
    nativeInhibitPort = null;
    nativeInhibitActive = false;
    return {
      ok: false,
      error: error?.message ?? String(error)
    };
  }
}

function postNativePortMessage(port, message, timeoutMs = NATIVE_PORT_TIMEOUT_MS) {
  return new Promise((resolve) => {
    let settled = false;

    const cleanup = () => {
      port.onMessage.removeListener(handleMessage);
      port.onDisconnect.removeListener(handleDisconnect);
      clearTimeout(timer);
    };

    const finish = (payload) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      resolve(payload);
    };

    const handleMessage = (response) => {
      finish(response ?? { ok: true });
    };

    const handleDisconnect = () => {
      finish({
        ok: false,
        error: runtimeApi.lastError?.message ?? "Native inhibit port disconnected."
      });
    };

    const timer = setTimeout(() => {
      finish({
        ok: false,
        error: "Timed out while waiting for the native helper."
      });
    }, timeoutMs);

    port.onMessage.addListener(handleMessage);
    port.onDisconnect.addListener(handleDisconnect);

    try {
      port.postMessage(message);
    } catch (error) {
      finish({
        ok: false,
        error: error?.message ?? String(error)
      });
    }
  });
}

async function startNativeInhibit() {
  if (nativeInhibitActive && nativeInhibitPort) {
    return {
      ok: true,
      active: true,
      alreadyActive: true
    };
  }

  if (nativeInhibitStartPromise) {
    return nativeInhibitStartPromise;
  }

  nativeInhibitStartPromise = (async () => {
    const connection = ensureNativeInhibitPort();
    if (!connection.ok) {
      return connection;
    }

    const response = await postNativePortMessage(connection.port, {
      action: "start_inhibit"
    });

    if (!response?.ok) {
      clearNativeInhibitPort();
      return response ?? {
        ok: false,
        error: "Native inhibit start failed."
      };
    }

    nativeInhibitActive = true;
    return {
      ok: true,
      active: true,
      backend: response.backend ?? null
    };
  })().finally(() => {
    nativeInhibitStartPromise = null;
  });

  return nativeInhibitStartPromise;
}

async function stopNativeInhibit() {
  if (!nativeInhibitPort) {
    nativeInhibitActive = false;
    return {
      ok: true,
      active: false,
      alreadyStopped: true
    };
  }

  if (nativeInhibitStopPromise) {
    return nativeInhibitStopPromise;
  }

  nativeInhibitStopPromise = (async () => {
    const port = nativeInhibitPort;
    let response;

    try {
      response = await postNativePortMessage(port, {
        action: "stop_inhibit"
      });
    } finally {
      clearNativeInhibitPort();
      nativeInhibitActive = false;
    }

    return response ?? {
      ok: true,
      active: false
    };
  })().finally(() => {
    nativeInhibitStopPromise = null;
  });

  return nativeInhibitStopPromise;
}

async function syncSystemInhibit() {
  if (await hasActiveSessions()) {
    return startNativeInhibit();
  }

  return stopNativeInhibit();
}

async function getRuntimeInfo() {
  const hostStatus = await pingLockHost();

  return {
    ok: true,
    version: runtimeApi.getManifest?.().version ?? null,
    manualUpdateSupported: typeof runtimeApi.requestUpdateCheck === "function",
    lockComputerSupported: typeof runtimeApi.sendNativeMessage === "function",
    lockComputerReady: hostStatus.ready === true,
    idleInhibitSupported: typeof runtimeApi.connectNative === "function" && hostStatus.ready === true,
    idleInhibitReady: hostStatus.ready === true && hostStatus.idleInhibitSupported !== false,
    idleInhibitActive: nativeInhibitActive
  };
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
      await syncSystemInhibit();
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === "hae:clear-tab-session") {
      if (!tabId) {
        sendResponse({ ok: false, error: "Missing sender tab." });
        return;
      }

      await clearTabSession(tabId);
      await syncSystemInhibit();
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === "hae:get-runtime-info") {
      sendResponse(await getRuntimeInfo());
      return;
    }

    if (message?.type === "hae:check-updates") {
      sendResponse(await requestManualUpdateCheck());
      return;
    }

    if (message?.type === "hae:lock-computer") {
      sendResponse(await lockComputer());
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
  await syncSystemInhibit();
});

runtimeApi.onStartup?.addListener(() => {
  void syncSystemInhibit();
});

runtimeApi.onInstalled?.addListener(() => {
  void syncSystemInhibit();
});

if (runtimeApi.onUpdateAvailable?.addListener) {
  runtimeApi.onUpdateAvailable.addListener((details) => {
    if (!pendingManualUpdateInstall) {
      return;
    }

    pendingManualUpdateInstall = false;
    console.info("Installing Human Activity Extension update.", details?.version);
    runtimeApi.reload();
  });
}

void syncSystemInhibit();
