(() => {
  if (window.__humanActivityExtension?.focusPanel) {
    window.__humanActivityExtension.focusPanel();
    return;
  }

  const extensionApi = globalThis.browser ?? globalThis.chrome;

  const STYLE_ID = "human-activity-extension-style";
  const ROOT_ID = "human-activity-extension-root";
  const PANEL_ID = "human-activity-extension-panel";
  const CURSOR_ID = "human-activity-extension-cursor";
  const STATUS = {
    IDLE: "IDLE",
    RUNNING: "RUNNING",
    PAUSED: "PAUSED",
    STOPPED: "STOPPED",
    FINISHED: "FINISHED",
    REFRESHING: "REFRESHING"
  };
  const ACTION_WEIGHTS = Object.freeze({
    scroll: 0.55,
    move: 0.25,
    click: 0.15,
    refresh: 0.05
  });
  const ACTION_LABELS = Object.freeze({
    scroll: "Scroll",
    move: "Mouse move",
    click: "Click",
    refresh: "Refresh"
  });

  let panelOpen = true;
  let statusMode = STATUS.IDLE;
  let sessionTotalMs = 60 * 60 * 1000;
  let accumulatedElapsedMs = 0;
  let currentRunStartedAt = 0;
  let actionCount = 0;
  let nextActionAt = 0;
  let nextActionName = "-";
  let minDelaySeconds = 5;
  let maxDelaySeconds = 30;
  let enabledActions = createDefaultActionState();
  let actionVariancePercent = 20;
  let isDragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  let cursorTimer = null;
  let loopTimer = null;
  let statsTimer = null;
  let wakeLock = null;
  let focusPulseTimer = null;
  let panelPosition = null;
  let extensionVersion = extensionApi.runtime?.getManifest?.().version ?? "?";
  let manualUpdateSupported = false;
  let lockComputerSupported = false;
  let lockComputerReady = false;
  let idleInhibitReady = false;
  let lockComputerWhenFinished = false;
  let updateStatusText = "";

  injectStyles();

  const root = document.createElement("div");
  root.id = ROOT_ID;
  root.dataset.humanActivityRoot = "true";

  const cursor = document.createElement("div");
  cursor.id = CURSOR_ID;
  cursor.setAttribute("aria-hidden", "true");

  const panel = document.createElement("section");
  panel.id = PANEL_ID;
  panel.dataset.humanActivityRoot = "true";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Human Activity Controller");
  panel.innerHTML = `
    <div class="hae-header">
      <button class="hae-icon-button hae-icon-button-primary" id="hae-check-updates" type="button" aria-label="Check updates" title="Check updates">↻</button>
      <div class="hae-dragbar" id="hae-dragbar">
        <span class="hae-title-text">Human Activity</span>
        <span class="hae-version" id="hae-version">v?</span>
      </div>
      <button class="hae-icon-button" id="hae-close" type="button" aria-label="Close controller">×</button>
    </div>
    <div class="hae-progress">
      <div class="hae-progress-bar" id="hae-progress-bar"></div>
    </div>
    <div class="hae-actions">
      <button class="hae-button hae-button-start" id="hae-start" type="button">▶ Start</button>
      <button class="hae-button hae-button-pause" id="hae-pause" type="button">❚❚ Pause</button>
      <button class="hae-button hae-button-stop" id="hae-stop" type="button">■ Stop</button>
    </div>
    <div class="hae-update-note" id="hae-update-note"></div>
    <label class="hae-label" for="hae-minutes">Duration</label>
    <div class="hae-duration-row">
      <div class="hae-number-wrap">
        <input
          id="hae-minutes"
          type="text"
          inputmode="numeric"
          pattern="[0-9]*"
          autocomplete="off"
          spellcheck="false"
          value="60"
        />
        <span class="hae-number-suffix">min</span>
      </div>
      <button class="hae-chip" id="hae-plus-5" type="button">+5</button>
      <button class="hae-chip" id="hae-plus-30" type="button">+30</button>
      <button class="hae-chip" id="hae-plus-60" type="button">+60</button>
    </div>
    <label class="hae-label" for="hae-min-delay">Interval (seconds)</label>
    <div class="hae-slider-stack">
      <div class="hae-slider-row">
        <span class="hae-slider-label">Min.</span>
        <input id="hae-min-delay" type="range" min="1" max="60" value="5" />
        <span class="hae-slider-value" id="hae-min-delay-value">5s</span>
      </div>
      <div class="hae-slider-row">
        <span class="hae-slider-label">Max.</span>
        <input id="hae-max-delay" type="range" min="10" max="180" value="30" />
        <span class="hae-slider-value" id="hae-max-delay-value">30s</span>
      </div>
    </div>
    <label class="hae-label" for="hae-action-variance">Action variance</label>
    <div class="hae-slider-stack">
      <div class="hae-slider-row">
        <span class="hae-slider-label">Var.</span>
        <input id="hae-action-variance" type="range" min="0" max="100" value="20" />
        <span class="hae-slider-value" id="hae-action-variance-value">20%</span>
      </div>
    </div>
    <label class="hae-label">Actions</label>
    <div class="hae-action-grid">
      <label class="hae-action-toggle" for="hae-action-scroll">
        <input id="hae-action-scroll" type="checkbox" checked />
        <span class="hae-action-name">Scroll</span>
        <span class="hae-action-weight">55%</span>
      </label>
      <label class="hae-action-toggle" for="hae-action-move">
        <input id="hae-action-move" type="checkbox" checked />
        <span class="hae-action-name">Mouse</span>
        <span class="hae-action-weight">25%</span>
      </label>
      <label class="hae-action-toggle" for="hae-action-click">
        <input id="hae-action-click" type="checkbox" checked />
        <span class="hae-action-name">Click</span>
        <span class="hae-action-weight">15%</span>
      </label>
      <label class="hae-action-toggle" for="hae-action-refresh">
        <input id="hae-action-refresh" type="checkbox" checked />
        <span class="hae-action-name">Refresh</span>
        <span class="hae-action-weight">5%</span>
      </label>
    </div>
    <label class="hae-checkbox-row" for="hae-lock-on-finish">
      <input id="hae-lock-on-finish" type="checkbox" />
      <span>Lock computer when finished</span>
    </label>
    <div class="hae-status-grid">
      <div class="hae-status-row">
        <span class="hae-status-label">Status</span>
        <strong class="hae-status-value" id="hae-status">IDLE</strong>
        <span class="hae-status-label">Actions</span>
        <strong class="hae-status-value hae-status-value-neutral" id="hae-actions-count">0</strong>
      </div>
      <div class="hae-status-row">
        <span class="hae-status-label">Next</span>
        <strong class="hae-status-value hae-status-value-accent" id="hae-next-action">-</strong>
        <span class="hae-status-label">Elapsed</span>
        <strong class="hae-status-value hae-status-value-neutral" id="hae-time">0s</strong>
      </div>
      <div class="hae-status-row">
        <span class="hae-status-label">Remaining</span>
        <strong class="hae-status-value hae-status-value-warning hae-status-value-neutral" id="hae-countdown">-</strong>
      </div>
    </div>
  `;

  root.appendChild(cursor);
  root.appendChild(panel);
  document.documentElement.appendChild(root);

  const startButton = panel.querySelector("#hae-start");
  const pauseButton = panel.querySelector("#hae-pause");
  const stopButton = panel.querySelector("#hae-stop");
  const checkUpdatesButton = panel.querySelector("#hae-check-updates");
  const closeButton = panel.querySelector("#hae-close");
  const progressBar = panel.querySelector("#hae-progress-bar");
  const minutesInput = panel.querySelector("#hae-minutes");
  const plus5Button = panel.querySelector("#hae-plus-5");
  const plus30Button = panel.querySelector("#hae-plus-30");
  const plus60Button = panel.querySelector("#hae-plus-60");
  const minDelaySlider = panel.querySelector("#hae-min-delay");
  const maxDelaySlider = panel.querySelector("#hae-max-delay");
  const actionVarianceSlider = panel.querySelector("#hae-action-variance");
  const minDelayValue = panel.querySelector("#hae-min-delay-value");
  const maxDelayValue = panel.querySelector("#hae-max-delay-value");
  const actionVarianceValue = panel.querySelector("#hae-action-variance-value");
  const actionToggleInputs = {
    scroll: panel.querySelector("#hae-action-scroll"),
    move: panel.querySelector("#hae-action-move"),
    click: panel.querySelector("#hae-action-click"),
    refresh: panel.querySelector("#hae-action-refresh")
  };
  const lockOnFinishCheckbox = panel.querySelector("#hae-lock-on-finish");
  const versionValue = panel.querySelector("#hae-version");
  const updateNoteValue = panel.querySelector("#hae-update-note");
  const statusValue = panel.querySelector("#hae-status");
  const nextActionValue = panel.querySelector("#hae-next-action");
  const countdownValue = panel.querySelector("#hae-countdown");
  const actionsValue = panel.querySelector("#hae-actions-count");
  const timeValue = panel.querySelector("#hae-time");
  const dragbar = panel.querySelector("#hae-dragbar");

  plus5Button.addEventListener("click", () => void addTime(5));
  plus30Button.addEventListener("click", () => void addTime(30));
  plus60Button.addEventListener("click", () => void addTime(60));
  minutesInput.addEventListener("input", handleMinutesTyping);
  minutesInput.addEventListener("change", () => void handleMinutesChange());
  minDelaySlider.addEventListener("input", () => void syncDelayRange());
  maxDelaySlider.addEventListener("input", () => void syncDelayRange());
  actionVarianceSlider.addEventListener("input", () => void handleActionVarianceChange());
  Object.entries(actionToggleInputs).forEach(([actionName, input]) => {
    input.addEventListener("change", () => void handleActionToggle(actionName));
  });
  lockOnFinishCheckbox.addEventListener("change", () => void handleLockOnFinishToggle());
  startButton.addEventListener("click", () => void handleStartClick());
  pauseButton.addEventListener("click", () => void pauseSession());
  stopButton.addEventListener("click", () => void stopSession(STATUS.STOPPED));
  checkUpdatesButton.addEventListener("click", () => void handleCheckUpdatesClick());
  closeButton.addEventListener("click", () => void destroy());
  dragbar.addEventListener("mousedown", handleDragStart);
  document.addEventListener("mousemove", handleDragMove);
  document.addEventListener("mouseup", handleDragEnd);
  document.addEventListener("visibilitychange", handleVisibilityChange);

  syncDelayRange({ persist: false });
  focusPanel();
  updateUiState();

  window.__humanActivityExtension = {
    destroy,
    focusPanel
  };

  void initialize();

  async function initialize() {
    const runtimeInfo = await loadRuntimeInfo();
    if (runtimeInfo?.ok) {
      extensionVersion = runtimeInfo.version ?? extensionVersion;
      manualUpdateSupported = Boolean(runtimeInfo.manualUpdateSupported);
      lockComputerSupported = Boolean(runtimeInfo.lockComputerSupported);
      lockComputerReady = Boolean(runtimeInfo.lockComputerReady);
      idleInhibitReady = Boolean(runtimeInfo.idleInhibitReady);
      updateStatusText = manualUpdateSupported ? "Manual update check ready." : "Manual update check unavailable.";

      if (!lockComputerReady && !idleInhibitReady) {
        updateStatusText = "Install the native host to enable anti-lock and computer lock.";
      }
    }

    const savedSession = await loadSavedSession();

    if (savedSession?.panelPosition) {
      applyPanelPosition(savedSession.panelPosition);
    }

    if (savedSession) {
      hydrateSession(savedSession);
    } else {
      await persistSession();
    }

    updateUiState();

    if (statusMode === STATUS.RUNNING) {
      startStatsLoop();
      void requestWakeLock();
      scheduleNextAction({ freshCycle: true });
      updateStats();
    }
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${ROOT_ID} {
        all: initial;
      }

      #${CURSOR_ID} {
        position: fixed;
        left: 0;
        top: 0;
        width: 13px;
        height: 13px;
        background: radial-gradient(circle at 30% 30%, #ff9f9f 0%, #ff4d4d 38%, #c91414 100%);
        border-radius: 999px;
        box-shadow: 0 0 18px rgba(255, 77, 77, 0.72);
        z-index: 2147483646;
        pointer-events: none;
        transform: translate(-9999px, -9999px);
        transition: transform 0.58s cubic-bezier(.22, .61, .36, 1);
        display: none;
      }

      #${PANEL_ID} {
        position: fixed;
        top: 70px;
        right: 32px;
        width: 274px;
        box-sizing: border-box;
        padding: 14px 16px 16px;
        border-radius: 18px;
        background:
          radial-gradient(circle at top left, rgba(96, 82, 180, 0.18), transparent 42%),
          linear-gradient(180deg, rgba(24, 22, 39, 0.98), rgba(17, 16, 28, 0.98));
        color: #f4f3ff;
        border: 1px solid rgba(122, 108, 192, 0.26);
        box-shadow:
          0 18px 40px rgba(0, 0, 0, 0.42),
          inset 0 1px 0 rgba(255, 255, 255, 0.03);
        font-family: "Segoe UI", "SF Pro Text", "Noto Sans", sans-serif;
        font-size: 12px;
        line-height: 1.4;
        z-index: 2147483647;
        user-select: none;
        backdrop-filter: blur(10px);
      }

      #${PANEL_ID}.hae-focus {
        box-shadow:
          0 0 0 2px rgba(96, 216, 126, 0.18),
          0 18px 40px rgba(0, 0, 0, 0.42),
          inset 0 1px 0 rgba(255, 255, 255, 0.03);
      }

      #${PANEL_ID} * {
        box-sizing: border-box;
        font-family: inherit;
      }

      #${PANEL_ID} button,
      #${PANEL_ID} input {
        all: revert;
        font-family: inherit;
      }

      #${PANEL_ID} button {
        cursor: pointer;
      }

      #${PANEL_ID} button:disabled {
        opacity: 0.42;
        cursor: not-allowed;
      }

      #${PANEL_ID} .hae-header {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        gap: 10px;
        align-items: center;
        margin-bottom: 14px;
      }

      #${PANEL_ID} .hae-dragbar {
        display: flex;
        align-items: center;
        gap: 12px;
        min-height: 24px;
        min-width: 0;
        cursor: move;
      }

      #${PANEL_ID} .hae-title-text {
        font-size: 14px;
        font-weight: 700;
        letter-spacing: 0.02em;
        min-width: 0;
      }

      #${PANEL_ID} .hae-icon-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        border: 0;
        border-radius: 999px;
        background: transparent;
        color: rgba(244, 243, 255, 0.7);
        font-size: 18px;
        line-height: 1;
      }

      #${PANEL_ID} .hae-icon-button-primary {
        background: rgba(255, 255, 255, 0.07);
        color: #d9d2ff;
      }

      #${PANEL_ID} .hae-icon-button:hover {
        background: rgba(255, 255, 255, 0.06);
        color: #ffffff;
      }

      #${PANEL_ID} .hae-icon-button-primary:hover {
        background: rgba(120, 255, 150, 0.14);
        color: #8bff74;
      }

      #${PANEL_ID} .hae-progress {
        height: 4px;
        margin-bottom: 14px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.1);
        overflow: hidden;
      }

      #${PANEL_ID} .hae-progress-bar {
        width: 0;
        height: 100%;
        background: linear-gradient(90deg, #78ff96, #4fd26c);
        box-shadow: 0 0 12px rgba(120, 255, 150, 0.35);
        transition: width 0.25s ease;
      }

      #${PANEL_ID} .hae-actions {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
        margin-bottom: 10px;
      }

      #${PANEL_ID} .hae-button {
        border: 0;
        border-radius: 10px;
        padding: 10px 0;
        font-size: 12px;
        font-weight: 700;
        color: #fefefe;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
      }

      #${PANEL_ID} .hae-button-start {
        background: linear-gradient(180deg, #59ce68, #43b955);
      }

      #${PANEL_ID} .hae-button-pause {
        background: linear-gradient(180deg, #2f6ead, #25568a);
      }

      #${PANEL_ID} .hae-button-stop {
        background: linear-gradient(180deg, #9a3544, #7b2331);
      }

      #${PANEL_ID} .hae-label {
        display: block;
        margin-bottom: 7px;
        color: rgba(203, 198, 229, 0.76);
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }

      #${PANEL_ID} .hae-duration-row {
        display: grid;
        grid-template-columns: 1fr repeat(3, 50px);
        gap: 8px;
        align-items: center;
        margin-bottom: 14px;
      }

      #${PANEL_ID} .hae-number-wrap {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }

      #${PANEL_ID} #hae-minutes {
        width: 100%;
        min-width: 0;
        min-height: 38px;
        padding: 8px 10px;
        border-radius: 10px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(255, 255, 255, 0.06);
        color: #f7f4ff;
        -webkit-text-fill-color: #f7f4ff;
        opacity: 1;
        text-align: center;
        font-size: 14px;
        font-weight: 700;
        line-height: 1.2;
        font-variant-numeric: tabular-nums;
        caret-color: #8bff74;
      }

      #${PANEL_ID} #hae-minutes::placeholder {
        color: rgba(247, 244, 255, 0.55);
      }

      #${PANEL_ID} .hae-number-suffix {
        color: rgba(203, 198, 229, 0.7);
        font-size: 11px;
      }

      #${PANEL_ID} .hae-chip {
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 10px;
        padding: 8px 0;
        background: rgba(255, 255, 255, 0.05);
        color: rgba(235, 232, 255, 0.92);
        font-size: 11px;
      }

      #${PANEL_ID} .hae-version {
        margin-left: auto;
        color: rgba(203, 198, 229, 0.78);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.04em;
      }

      #${PANEL_ID} .hae-update-note {
        min-height: 16px;
        margin-bottom: 12px;
        color: rgba(203, 198, 229, 0.74);
        font-size: 11px;
      }

      #${PANEL_ID} .hae-slider-stack {
        display: grid;
        gap: 8px;
        margin-bottom: 12px;
      }

      #${PANEL_ID} .hae-slider-row {
        display: grid;
        grid-template-columns: 30px 1fr 34px;
        align-items: center;
        gap: 8px;
      }

      #${PANEL_ID} .hae-slider-label {
        color: rgba(203, 198, 229, 0.68);
        font-size: 11px;
      }

      #${PANEL_ID} .hae-slider-value {
        color: #8bff74;
        font-size: 12px;
        font-weight: 700;
        text-align: right;
      }

      #${PANEL_ID} input[type="range"] {
        width: 100%;
        accent-color: #8bff74;
      }

      #${PANEL_ID} .hae-checkbox-row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 14px;
        color: rgba(228, 223, 250, 0.85);
        font-size: 11px;
      }

      #${PANEL_ID} .hae-action-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
        margin-bottom: 14px;
      }

      #${PANEL_ID} .hae-action-toggle {
        display: grid;
        grid-template-columns: auto 1fr auto;
        align-items: center;
        gap: 8px;
        min-width: 0;
        padding: 8px 10px;
        border-radius: 10px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(255, 255, 255, 0.05);
        color: rgba(228, 223, 250, 0.9);
        font-size: 11px;
      }

      #${PANEL_ID} .hae-action-toggle input {
        margin: 0;
        accent-color: #8bff74;
      }

      #${PANEL_ID} .hae-action-name {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      #${PANEL_ID} .hae-action-weight {
        color: #8bff74;
        font-size: 11px;
        font-weight: 700;
      }

      #${PANEL_ID} .hae-status-grid {
        display: grid;
        gap: 8px;
      }

      #${PANEL_ID} .hae-status-row {
        display: grid;
        grid-template-columns: auto 1fr auto auto;
        gap: 8px;
        align-items: baseline;
      }

      #${PANEL_ID} .hae-status-row:last-child {
        grid-template-columns: auto 1fr;
        align-items: center;
      }

      #${PANEL_ID} .hae-status-label {
        color: rgba(203, 198, 229, 0.68);
        font-size: 11px;
      }

      #${PANEL_ID} .hae-status-value {
        color: #f4f3ff;
        font-size: 12px;
        font-weight: 700;
      }

      #${PANEL_ID} .hae-status-value-neutral {
        text-align: right;
      }

      #${PANEL_ID} .hae-status-value-accent {
        color: #4cb6ff;
      }

      #${PANEL_ID} .hae-status-value-warning {
        color: #ffc94d;
        font-size: 16px;
      }

      #${PANEL_ID} .hae-status-row:last-child .hae-status-value {
        justify-self: end;
        text-align: right;
      }
    `;

    document.documentElement.appendChild(style);
  }

  async function sendRuntimeMessage(message) {
    if (!extensionApi?.runtime?.sendMessage) {
      return {
        ok: false,
        error: "Runtime messaging is unavailable in this browser."
      };
    }

    if (typeof globalThis.browser !== "undefined") {
      try {
        return (await extensionApi.runtime.sendMessage(message)) ?? { ok: true };
      } catch (error) {
        return {
          ok: false,
          error: error?.message ?? String(error)
        };
      }
    }

    return new Promise((resolve) => {
      globalThis.chrome.runtime.sendMessage(message, (response) => {
        if (globalThis.chrome.runtime.lastError) {
          resolve({
            ok: false,
            error: globalThis.chrome.runtime.lastError.message
          });
          return;
        }

        resolve(response ?? { ok: true });
      });
    });
  }

  async function loadSavedSession() {
    const response = await sendRuntimeMessage({ type: "hae:get-tab-session" });
    return response?.ok ? response.session : null;
  }

  async function loadRuntimeInfo() {
    return sendRuntimeMessage({ type: "hae:get-runtime-info" });
  }

  async function persistSession() {
    if (!panelOpen) {
      return;
    }

    await sendRuntimeMessage({
      type: "hae:set-tab-session",
      session: buildSessionSnapshot()
    });
  }

  async function clearSavedSession() {
    await sendRuntimeMessage({ type: "hae:clear-tab-session" });
  }

  function buildSessionSnapshot() {
    return {
      panelOpen,
      statusMode,
      sessionTotalMs,
      accumulatedElapsedMs,
      currentRunStartedAt,
      actionCount,
      nextActionAt,
      nextActionName,
      minDelaySeconds,
      maxDelaySeconds,
      actionVariancePercent,
      enabledActions: { ...enabledActions },
      minutesValue: minutesInput.value,
      lockComputerWhenFinished,
      panelPosition
    };
  }

  function hydrateSession(session) {
    const now = Date.now();

    panelOpen = session.panelOpen !== false;
    minDelaySeconds = Number(session.minDelaySeconds ?? minDelaySeconds);
    maxDelaySeconds = Number(session.maxDelaySeconds ?? maxDelaySeconds);
    actionVariancePercent = Number(session.actionVariancePercent ?? actionVariancePercent);
    actionCount = Number(session.actionCount ?? 0);
    nextActionAt = Number(session.nextActionAt ?? 0);
    nextActionName = session.nextActionName ?? "-";
    enabledActions = normalizeEnabledActions(
      session.enabledActions ?? {
        ...createDefaultActionState(),
        refresh: session.randomRefreshEnabled !== false
      }
    );
    lockComputerWhenFinished = Boolean(session.lockComputerWhenFinished);
    panelPosition = session.panelPosition ?? null;

    if (session.minutesValue) {
      minutesInput.value = String(session.minutesValue);
    }

    if (session.statusMode) {
      statusMode = session.statusMode;
      sessionTotalMs = Number(session.sessionTotalMs ?? sessionTotalMs);
      accumulatedElapsedMs = Number(session.accumulatedElapsedMs ?? 0);
      currentRunStartedAt = Number(session.currentRunStartedAt ?? 0);

      // Treat a persisted refresh as an in-flight running session after reload.
      if (statusMode === STATUS.REFRESHING) {
        statusMode = STATUS.RUNNING;
      }
    } else {
      const legacyStartedAt = Number(session.sessionStartedAt ?? 0);
      const legacyEndsAt = Number(session.sessionEndsAt ?? 0);
      const legacyRunning = Boolean(session.running);
      const inferredTotalMs =
        legacyStartedAt > 0 && legacyEndsAt > legacyStartedAt ? legacyEndsAt - legacyStartedAt : sessionTotalMs;

      sessionTotalMs = inferredTotalMs;
      if (legacyRunning) {
        statusMode = STATUS.RUNNING;
        currentRunStartedAt = now;
        accumulatedElapsedMs = Math.max(0, inferredTotalMs - Math.max(legacyEndsAt - now, 0));
      } else {
        statusMode = STATUS.IDLE;
        accumulatedElapsedMs = 0;
        currentRunStartedAt = 0;
      }
    }

    minDelaySlider.value = String(minDelaySeconds);
    maxDelaySlider.value = String(maxDelaySeconds);
    actionVarianceSlider.value = String(actionVariancePercent);
    minDelayValue.textContent = formatSeconds(minDelaySeconds);
    maxDelayValue.textContent = formatSeconds(maxDelaySeconds);
    actionVarianceValue.textContent = formatPercent(actionVariancePercent);
    syncActionToggles();
    lockOnFinishCheckbox.checked = lockComputerWhenFinished;
    actionsValue.textContent = String(actionCount);

    if (statusMode === STATUS.RUNNING && getRemainingMs(now) <= 0) {
      accumulatedElapsedMs = sessionTotalMs;
      currentRunStartedAt = 0;
      nextActionAt = 0;
      nextActionName = "-";
      statusMode = STATUS.FINISHED;
    }
  }

  function getElapsedMs(now = Date.now()) {
    return accumulatedElapsedMs + (statusMode === STATUS.RUNNING && currentRunStartedAt ? now - currentRunStartedAt : 0);
  }

  function getRemainingMs(now = Date.now()) {
    return Math.max(0, sessionTotalMs - getElapsedMs(now));
  }

  function setStatus(nextStatus) {
    statusMode = nextStatus;
    statusValue.textContent = nextStatus;
    panel.dataset.status = nextStatus.toLowerCase();
  }

  function updateUiState() {
    setStatus(statusMode);
    nextActionValue.textContent = formatActionName(nextActionName);
    actionsValue.textContent = String(actionCount);
    minDelayValue.textContent = formatSeconds(minDelaySeconds);
    maxDelayValue.textContent = formatSeconds(maxDelaySeconds);
    actionVarianceValue.textContent = formatPercent(actionVariancePercent);
    syncActionToggles();
    lockOnFinishCheckbox.checked = lockComputerWhenFinished;
    versionValue.textContent = `v${extensionVersion}`;
    updateNoteValue.textContent = updateStatusText;

    startButton.disabled = statusMode === STATUS.RUNNING;
    pauseButton.disabled = statusMode !== STATUS.RUNNING;
    stopButton.disabled = [STATUS.IDLE, STATUS.STOPPED, STATUS.FINISHED].includes(statusMode);
    checkUpdatesButton.disabled = !manualUpdateSupported;
    lockOnFinishCheckbox.disabled = !lockComputerSupported || !lockComputerReady;

    updateStats();
  }

  async function requestWakeLock() {
    if (statusMode !== STATUS.RUNNING || !("wakeLock" in navigator) || document.visibilityState !== "visible") {
      return;
    }

    try {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => {
        wakeLock = null;
        if (statusMode === STATUS.RUNNING) {
          void requestWakeLock();
        }
      });
    } catch (error) {
      console.debug("Human Activity Extension could not acquire wake lock.", error);
    }
  }

  async function releaseWakeLock() {
    if (!wakeLock) {
      return;
    }

    try {
      await wakeLock.release();
    } catch (error) {
      console.debug("Human Activity Extension wake lock release failed.", error);
    } finally {
      wakeLock = null;
    }
  }

  function jitter(value) {
    return value + (Math.random() - 0.5) * value * 0.3;
  }

  function randomCenterPoint() {
    return {
      x: window.innerWidth * (0.3 + Math.random() * 0.4),
      y: window.innerHeight * (0.25 + Math.random() * 0.5)
    };
  }

  function moveCursor(x, y) {
    cursor.style.transform = `translate(${x}px, ${y}px)`;
  }

  function showCursorForMove(x, y) {
    stopCursorAnimation();
    cursor.style.display = "block";
    moveCursor(x, y);

    cursorTimer = window.setTimeout(() => {
      cursor.style.display = "none";
      cursorTimer = null;
    }, 900);
  }

  function stopCursorAnimation() {
    cursor.style.display = "none";
    if (cursorTimer) {
      window.clearTimeout(cursorTimer);
      cursorTimer = null;
    }
  }

  function randomDelayMs() {
    return (minDelaySeconds + Math.random() * (maxDelaySeconds - minDelaySeconds)) * 1000;
  }

  function chooseScrollDirection() {
    const currentY = window.scrollY;
    const maxY = Math.max(document.body.scrollHeight - window.innerHeight, 0);

    if (currentY < 100) {
      return 1;
    }

    if (currentY > maxY - 100) {
      return -1;
    }

    return Math.random() > 0.5 ? 1 : -1;
  }

  function runReadingScroll() {
    const steps = 3 + Math.floor(Math.random() * 4);
    let completed = 0;
    const direction = chooseScrollDirection();

    function step() {
      if (completed >= steps) {
        return;
      }

      window.scrollBy({
        top: jitter((120 + Math.random() * 180) * direction),
        behavior: "smooth"
      });

      completed += 1;
      window.setTimeout(step, 500 + Math.random() * 900);
    }

    step();
  }

  function runMouseMove() {
    const point = randomCenterPoint();
    const x = jitter(point.x);
    const y = jitter(point.y);
    showCursorForMove(x, y);

    document.dispatchEvent(
      new MouseEvent("mousemove", {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        view: window
      })
    );
  }

  function runSafeClick() {
    const point = randomCenterPoint();
    moveCursor(point.x, point.y);

    const element = document.elementFromPoint(point.x, point.y);
    if (!element || isControllerElement(element)) {
      return;
    }

    const interactiveSelector =
      "a, button, input, textarea, select, label, [role='button'], [role='link']";

    if (
      element.closest(interactiveSelector) ||
      element.isContentEditable ||
      typeof element.onclick === "function"
    ) {
      return;
    }

    for (const eventName of ["mousemove", "mousedown", "mouseup", "click"]) {
      element.dispatchEvent(
        new MouseEvent(eventName, {
          bubbles: true,
          cancelable: true,
          clientX: point.x,
          clientY: point.y,
          view: window
        })
      );
    }
  }

  async function runRefreshAction() {
    setStatus(STATUS.REFRESHING);
    await persistSession();
    window.location.reload();
  }

  function isControllerElement(element) {
    return Boolean(element.closest("[data-human-activity-root='true']"));
  }

  function pickAction() {
    const baseWeights = Object.entries(ACTION_WEIGHTS).filter(([actionName]) => enabledActions[actionName]);
    if (baseWeights.length === 0) {
      return "scroll";
    }

    const varianceFactor = actionVariancePercent / 100;
    const adjustedEntries = baseWeights.map(([name, weight]) => {
      const variance = (Math.random() * 2 - 1) * varianceFactor;
      return [name, Math.max(0.01, weight * (1 + variance))];
    });

    const totalWeight = adjustedEntries.reduce((sum, [, weight]) => sum + weight, 0);
    let roll = Math.random() * totalWeight;

    for (const [name, weight] of adjustedEntries) {
      if (roll < weight) {
        return name;
      }

      roll -= weight;
    }

    return adjustedEntries[adjustedEntries.length - 1][0];
  }

  function handleMinutesTyping() {
    const digitsOnly = minutesInput.value.replace(/[^\d]/g, "");
    minutesInput.value = digitsOnly;
  }

  async function handleCheckUpdatesClick() {
    if (!manualUpdateSupported) {
      updateStatusText = "Manual update check unavailable in this browser.";
      updateUiState();
      return;
    }

    checkUpdatesButton.disabled = true;
    updateStatusText = "Checking for updates...";
    updateUiState();

    const response = await sendRuntimeMessage({ type: "hae:check-updates" });
    if (!response?.ok) {
      updateStatusText = response?.error ?? "Update check failed.";
      updateUiState();
      return;
    }

    if (response.currentVersion) {
      extensionVersion = response.currentVersion;
    }

    if (response.status === "update_available") {
      updateStatusText = response.version
        ? `Installing v${response.version}...`
        : "Installing update...";
    } else if (response.status === "no_update") {
      updateStatusText = `Already up to date (v${extensionVersion}).`;
    } else if (response.status === "throttled") {
      updateStatusText = "Update check throttled. Try again later.";
    } else {
      updateStatusText = `Update status: ${response.status}`;
    }

    updateUiState();
  }

  async function handleMinutesChange() {
    const requestedMinutes = Number.parseFloat(minutesInput.value);
    const normalizedMinutes = Number.isFinite(requestedMinutes) && requestedMinutes > 0 ? requestedMinutes : 60;
    minutesInput.value = String(normalizedMinutes);

    if (statusMode !== STATUS.RUNNING && statusMode !== STATUS.PAUSED) {
      sessionTotalMs = normalizedMinutes * 60 * 1000;
    }

    updateUiState();
    await persistSession();
  }

  async function addTime(minutes) {
    const deltaMs = minutes * 60 * 1000;

    if (statusMode === STATUS.RUNNING || statusMode === STATUS.PAUSED) {
      sessionTotalMs += deltaMs;
      minutesInput.value = String(Math.max(Math.round(sessionTotalMs / 60000), 1));
      updateUiState();
      await persistSession();
      return;
    }

    const current = Number.parseInt(minutesInput.value || "0", 10);
    const nextMinutes = Math.max(current + minutes, 1);
    minutesInput.value = String(nextMinutes);
    sessionTotalMs = nextMinutes * 60 * 1000;
    updateUiState();
    await persistSession();
  }

  async function syncDelayRange({ persist = true } = {}) {
    minDelaySeconds = Number.parseInt(minDelaySlider.value, 10);
    maxDelaySeconds = Number.parseInt(maxDelaySlider.value, 10);

    if (minDelaySeconds > maxDelaySeconds) {
      maxDelaySeconds = minDelaySeconds;
      maxDelaySlider.value = String(maxDelaySeconds);
    }

    if (maxDelaySeconds < minDelaySeconds) {
      minDelaySeconds = maxDelaySeconds;
      minDelaySlider.value = String(minDelaySeconds);
    }

    updateUiState();

    if (persist) {
      await persistSession();
    }
  }

  async function handleActionVarianceChange() {
    actionVariancePercent = Number.parseInt(actionVarianceSlider.value, 10);
    actionVarianceValue.textContent = formatPercent(actionVariancePercent);
    await persistSession();
  }

  async function handleActionToggle(actionName) {
    enabledActions[actionName] = Boolean(actionToggleInputs[actionName]?.checked);

    if (!Object.values(enabledActions).some(Boolean)) {
      enabledActions[actionName] = true;
      actionToggleInputs[actionName].checked = true;
      updateStatusText = "At least one action must stay enabled.";
    }

    if (nextActionName !== "-" && !enabledActions[nextActionName]) {
      nextActionName = pickAction();
      nextActionValue.textContent = formatActionName(nextActionName);
    }

    updateUiState();
    await persistSession();
  }

  async function handleLockOnFinishToggle() {
    lockComputerWhenFinished = lockOnFinishCheckbox.checked;

    if (lockComputerWhenFinished && (!lockComputerSupported || !lockComputerReady)) {
      updateStatusText = "Lock option unavailable until native host is installed.";
      lockComputerWhenFinished = false;
      lockOnFinishCheckbox.checked = false;
    }

    updateUiState();
    await persistSession();
  }

  async function performAction(actionName) {
    if (actionName === "scroll") {
      runReadingScroll();
    } else if (actionName === "move") {
      runMouseMove();
    } else if (actionName === "refresh") {
      actionCount += 1;
      actionsValue.textContent = String(actionCount);
      await persistSession();
      await runRefreshAction();
      return { reloading: true };
    } else {
      runSafeClick();
    }

    actionCount += 1;
    actionsValue.textContent = String(actionCount);
    await persistSession();
    return { reloading: false };
  }

  function scheduleNextAction({ freshCycle = false } = {}) {
    if (statusMode !== STATUS.RUNNING) {
      return;
    }

    if (getRemainingMs() <= 0) {
      void stopSession(STATUS.FINISHED);
      return;
    }

    const delay = freshCycle ? randomDelayMs() : randomDelayMs();
    nextActionAt = Date.now() + delay;
    nextActionName = pickAction();
    nextActionValue.textContent = formatActionName(nextActionName);
    void persistSession();

    if (loopTimer) {
      window.clearTimeout(loopTimer);
    }

    loopTimer = window.setTimeout(async () => {
      if (statusMode !== STATUS.RUNNING) {
        return;
      }

      if (getRemainingMs() <= 0) {
        await stopSession(STATUS.FINISHED);
        return;
      }

      const result = await performAction(nextActionName);
      if (result?.reloading) {
        return;
      }

      scheduleNextAction();
    }, delay);
  }

  function startStatsLoop() {
    stopStatsLoop();
    statsTimer = window.setInterval(updateStats, 250);
  }

  function stopStatsLoop() {
    if (statsTimer) {
      window.clearInterval(statsTimer);
      statsTimer = null;
    }
  }

  function updateStats() {
    const now = Date.now();
    const elapsedMs = getElapsedMs(now);
    const remainingMs = getRemainingMs(now);
    const progress = sessionTotalMs > 0 ? Math.min(100, (elapsedMs / sessionTotalMs) * 100) : 0;

    timeValue.textContent = formatDuration(Math.floor(elapsedMs / 1000));
    countdownValue.textContent =
      statusMode === STATUS.RUNNING || statusMode === STATUS.PAUSED || statusMode === STATUS.FINISHED
        ? formatDuration(Math.ceil(remainingMs / 1000))
        : "-";
    progressBar.style.width = `${progress}%`;

    if (statusMode === STATUS.RUNNING && remainingMs <= 0) {
      void stopSession(STATUS.FINISHED);
    }
  }

  function formatDuration(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    }

    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }

    return `${seconds}s`;
  }

  function formatSeconds(value) {
    return `${value}s`;
  }

  function formatPercent(value) {
    return `${value}%`;
  }

  async function handleStartClick() {
    if (statusMode === STATUS.PAUSED) {
      await resumeSession();
      return;
    }

    if (statusMode === STATUS.RUNNING) {
      return;
    }

    await startSession();
  }

  async function startSession() {
    const requestedMinutes = Number.parseFloat(minutesInput.value);
    const normalizedMinutes = Number.isFinite(requestedMinutes) && requestedMinutes > 0 ? requestedMinutes : 60;

    minutesInput.value = String(normalizedMinutes);
    sessionTotalMs = normalizedMinutes * 60 * 1000;
    accumulatedElapsedMs = 0;
    currentRunStartedAt = Date.now();
    actionCount = 0;
    nextActionAt = 0;
    nextActionName = "-";
    panelOpen = true;

    setStatus(STATUS.RUNNING);
    updateUiState();
    void requestWakeLock();
    startStatsLoop();
    scheduleNextAction({ freshCycle: true });
    await persistSession();
  }

  async function resumeSession() {
    if (statusMode !== STATUS.PAUSED) {
      return;
    }

    currentRunStartedAt = Date.now();
    setStatus(STATUS.RUNNING);
    updateUiState();
    void requestWakeLock();
    startStatsLoop();
    scheduleNextAction({ freshCycle: true });
    await persistSession();
  }

  async function pauseSession() {
    if (statusMode !== STATUS.RUNNING) {
      return;
    }

    accumulatedElapsedMs = getElapsedMs();
    currentRunStartedAt = 0;
    nextActionAt = 0;
    nextActionName = "-";
    setStatus(STATUS.PAUSED);

    if (loopTimer) {
      window.clearTimeout(loopTimer);
      loopTimer = null;
    }

    stopStatsLoop();
    stopCursorAnimation();
    await releaseWakeLock();
    updateUiState();
    await persistSession();
  }

  async function stopSession(nextStatus = STATUS.STOPPED) {
    if (statusMode === STATUS.RUNNING) {
      accumulatedElapsedMs = getElapsedMs();
    }

    currentRunStartedAt = 0;
    nextActionAt = 0;
    nextActionName = "-";

    if (nextStatus === STATUS.FINISHED) {
      accumulatedElapsedMs = sessionTotalMs;
    }

    setStatus(nextStatus);

    if (loopTimer) {
      window.clearTimeout(loopTimer);
      loopTimer = null;
    }

    stopStatsLoop();
    stopCursorAnimation();
    await releaseWakeLock();
    updateUiState();
    await persistSession();

    if (nextStatus === STATUS.FINISHED) {
      await maybeLockComputerWhenFinished();
    }
  }

  async function maybeLockComputerWhenFinished() {
    if (!lockComputerWhenFinished) {
      return;
    }

    updateStatusText = "Locking computer...";
    updateUiState();

    const response = await sendRuntimeMessage({ type: "hae:lock-computer" });
    if (!response?.ok) {
      updateStatusText = response?.error
        ? `Lock failed: ${response.error}`
        : "Lock failed. Check native host installation.";
      updateUiState();
      return;
    }

    updateStatusText = response.command ? `Locked via ${response.command}.` : "Computer locked.";
    updateUiState();
  }

  function handleDragStart(event) {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    isDragging = true;
    dragOffsetX = event.clientX - panel.getBoundingClientRect().left;
    dragOffsetY = event.clientY - panel.getBoundingClientRect().top;
  }

  function handleDragMove(event) {
    if (!isDragging) {
      return;
    }

    panel.style.right = "auto";
    panel.style.left = `${event.clientX - dragOffsetX}px`;
    panel.style.top = `${event.clientY - dragOffsetY}px`;
  }

  async function handleDragEnd() {
    if (!isDragging) {
      return;
    }

    isDragging = false;
    panelPosition = {
      left: panel.style.left || null,
      top: panel.style.top || null
    };
    await persistSession();
  }

  async function handleVisibilityChange() {
    if (document.visibilityState === "visible" && statusMode === STATUS.RUNNING && !wakeLock) {
      await requestWakeLock();
    }
  }

  function applyPanelPosition(position) {
    if (!position?.left || !position?.top) {
      return;
    }

    panel.style.right = "auto";
    panel.style.left = position.left;
    panel.style.top = position.top;
  }

  function focusPanel() {
    panel.classList.add("hae-focus");
    panel.scrollIntoView({ block: "nearest", inline: "nearest" });

    if (focusPulseTimer) {
      window.clearTimeout(focusPulseTimer);
    }

    focusPulseTimer = window.setTimeout(() => {
      panel.classList.remove("hae-focus");
      focusPulseTimer = null;
    }, 1200);
  }

  async function destroy() {
    panelOpen = false;
    await stopSession(STATUS.IDLE);
    document.removeEventListener("mousemove", handleDragMove);
    document.removeEventListener("mouseup", handleDragEnd);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    dragbar.removeEventListener("mousedown", handleDragStart);
    await clearSavedSession();
    root.remove();
    delete window.__humanActivityExtension;
  }

  function createDefaultActionState() {
    return {
      scroll: true,
      move: true,
      click: true,
      refresh: true
    };
  }

  function normalizeEnabledActions(candidate) {
    const normalized = createDefaultActionState();

    for (const actionName of Object.keys(normalized)) {
      if (candidate && Object.prototype.hasOwnProperty.call(candidate, actionName)) {
        normalized[actionName] = Boolean(candidate[actionName]);
      }
    }

    if (!Object.values(normalized).some(Boolean)) {
      normalized.scroll = true;
    }

    return normalized;
  }

  function syncActionToggles() {
    for (const [actionName, input] of Object.entries(actionToggleInputs)) {
      input.checked = enabledActions[actionName];
      input.title = `${ACTION_LABELS[actionName]} (${formatPercent(Math.round(ACTION_WEIGHTS[actionName] * 100))})`;
    }
  }

  function formatActionName(actionName) {
    if (actionName === "-") {
      return actionName;
    }

    return ACTION_LABELS[actionName]?.toLowerCase() ?? actionName;
  }
})();
