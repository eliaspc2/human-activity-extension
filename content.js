(() => {
  if (window.__humanActivityExtension?.focusPanel) {
    window.__humanActivityExtension.focusPanel();
    return;
  }

  const STYLE_ID = "human-activity-extension-style";
  const ROOT_ID = "human-activity-extension-root";
  const PANEL_ID = "human-activity-extension-panel";
  const CURSOR_ID = "human-activity-extension-cursor";

  let panelOpen = true;
  let running = false;
  let sessionStartedAt = 0;
  let sessionEndsAt = 0;
  let actionCount = 0;
  let nextActionAt = 0;
  let nextActionName = "-";
  let minDelaySeconds = 5;
  let maxDelaySeconds = 30;
  let randomRefreshEnabled = false;
  let isDragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  let cursorTimer = null;
  let loopTimer = null;
  let statsTimer = null;
  let wakeLock = null;
  let focusPulseTimer = null;
  let panelPosition = null;

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
    <div class="hae-dragbar" id="hae-dragbar">
      <span>Human Activity</span>
      <button class="hae-icon-button" id="hae-close" type="button" aria-label="Close controller">x</button>
    </div>
    <div class="hae-actions">
      <button id="hae-start" type="button">Start</button>
      <button id="hae-stop" type="button">Stop</button>
    </div>
    <div class="hae-progress">
      <div class="hae-progress-bar" id="hae-progress-bar"></div>
    </div>
    <label class="hae-label" for="hae-minutes">Duration (minutes)</label>
    <div class="hae-row">
      <input id="hae-minutes" type="number" min="1" step="1" value="60" />
      <button id="hae-plus-5" type="button">+5</button>
      <button id="hae-plus-30" type="button">+30</button>
      <button id="hae-plus-60" type="button">+60</button>
    </div>
    <label class="hae-label" for="hae-min-delay">Interval range (seconds)</label>
    <div class="hae-slider-row">
      <span>Min</span>
      <input id="hae-min-delay" type="range" min="1" max="60" value="5" />
      <span id="hae-min-delay-value">5</span>
    </div>
    <div class="hae-slider-row">
      <span>Max</span>
      <input id="hae-max-delay" type="range" min="10" max="180" value="30" />
      <span id="hae-max-delay-value">30</span>
    </div>
    <label class="hae-checkbox-row" for="hae-random-refresh">
      <input id="hae-random-refresh" type="checkbox" />
      <span>Allow random refreshes</span>
    </label>
    <div class="hae-status-grid">
      <div>Status: <strong id="hae-status">Idle</strong></div>
      <div>Next action: <strong id="hae-next-action">-</strong></div>
      <div>In: <strong id="hae-countdown">-</strong></div>
      <div>Actions: <strong id="hae-actions-count">0</strong></div>
      <div>Elapsed: <strong id="hae-time">0s</strong></div>
    </div>
  `;

  root.appendChild(cursor);
  root.appendChild(panel);
  document.documentElement.appendChild(root);

  const startButton = panel.querySelector("#hae-start");
  const stopButton = panel.querySelector("#hae-stop");
  const closeButton = panel.querySelector("#hae-close");
  const progressBar = panel.querySelector("#hae-progress-bar");
  const minutesInput = panel.querySelector("#hae-minutes");
  const plus5Button = panel.querySelector("#hae-plus-5");
  const plus30Button = panel.querySelector("#hae-plus-30");
  const plus60Button = panel.querySelector("#hae-plus-60");
  const minDelaySlider = panel.querySelector("#hae-min-delay");
  const maxDelaySlider = panel.querySelector("#hae-max-delay");
  const minDelayValue = panel.querySelector("#hae-min-delay-value");
  const maxDelayValue = panel.querySelector("#hae-max-delay-value");
  const randomRefreshCheckbox = panel.querySelector("#hae-random-refresh");
  const statusValue = panel.querySelector("#hae-status");
  const nextActionValue = panel.querySelector("#hae-next-action");
  const countdownValue = panel.querySelector("#hae-countdown");
  const actionsValue = panel.querySelector("#hae-actions-count");
  const timeValue = panel.querySelector("#hae-time");
  const dragbar = panel.querySelector("#hae-dragbar");

  plus5Button.addEventListener("click", () => void addTime(5));
  plus30Button.addEventListener("click", () => void addTime(30));
  plus60Button.addEventListener("click", () => void addTime(60));
  minDelaySlider.addEventListener("input", () => void syncDelayRange());
  maxDelaySlider.addEventListener("input", () => void syncDelayRange());
  randomRefreshCheckbox.addEventListener("change", () => void handleRandomRefreshToggle());
  startButton.addEventListener("click", () => void startSession());
  stopButton.addEventListener("click", () => void stopSession("STOPPED"));
  closeButton.addEventListener("click", () => void destroy());
  dragbar.addEventListener("mousedown", handleDragStart);
  document.addEventListener("mousemove", handleDragMove);
  document.addEventListener("mouseup", handleDragEnd);
  document.addEventListener("visibilitychange", handleVisibilityChange);

  syncDelayRange({ persist: false });
  focusPanel();

  window.__humanActivityExtension = {
    destroy,
    focusPanel
  };

  void initialize();

  async function initialize() {
    const savedSession = await loadSavedSession();

    if (savedSession?.panelPosition) {
      applyPanelPosition(savedSession.panelPosition);
    }

    if (savedSession) {
      hydrateSession(savedSession);
    } else {
      await persistSession();
    }

    if (running) {
      statusValue.textContent = "RUNNING";
      startCursorAnimation();
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
        width: 12px;
        height: 12px;
        background: #ff3b3b;
        border-radius: 999px;
        box-shadow: 0 0 0 2px rgba(255, 59, 59, 0.18);
        z-index: 2147483646;
        pointer-events: none;
        transform: translate(-9999px, -9999px);
        transition: transform 0.6s cubic-bezier(.22, .61, .36, 1);
        display: none;
      }

      #${PANEL_ID} {
        position: fixed;
        top: 70px;
        right: 40px;
        width: 320px;
        box-sizing: border-box;
        background: #ffffff;
        color: #111827;
        border: 1px solid #d1d5db;
        border-radius: 14px;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.28);
        padding: 14px;
        font-family: Arial, sans-serif;
        font-size: 13px;
        line-height: 1.45;
        z-index: 2147483647;
        user-select: none;
      }

      #${PANEL_ID}.hae-focus {
        box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.24), 0 20px 40px rgba(0, 0, 0, 0.28);
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

      #${PANEL_ID} input[type="number"] {
        width: 78px;
        padding: 6px 8px;
        border: 1px solid #9ca3af;
        border-radius: 8px;
        text-align: center;
      }

      #${PANEL_ID} input[type="range"] {
        width: 100%;
      }

      #${PANEL_ID} .hae-dragbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 12px;
        padding: 8px 10px;
        border-radius: 10px;
        background: #f3f4f6;
        cursor: move;
        font-weight: 700;
      }

      #${PANEL_ID} .hae-icon-button {
        padding: 0;
        width: 22px;
        height: 22px;
        border: 0;
        background: transparent;
        color: #374151;
        font-size: 16px;
        line-height: 1;
      }

      #${PANEL_ID} .hae-actions,
      #${PANEL_ID} .hae-row {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      #${PANEL_ID} .hae-actions {
        justify-content: center;
        margin-bottom: 12px;
      }

      #${PANEL_ID} .hae-row {
        margin-bottom: 12px;
      }

      #${PANEL_ID} .hae-progress {
        height: 6px;
        border-radius: 999px;
        background: #e5e7eb;
        overflow: hidden;
        margin-bottom: 12px;
      }

      #${PANEL_ID} .hae-progress-bar {
        width: 0;
        height: 100%;
        background: #4caf50;
        transition: width 0.25s ease;
      }

      #${PANEL_ID} .hae-label {
        display: block;
        margin-bottom: 6px;
        color: #374151;
        font-weight: 600;
      }

      #${PANEL_ID} .hae-slider-row {
        display: grid;
        grid-template-columns: 34px 1fr 30px;
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;
      }

      #${PANEL_ID} .hae-checkbox-row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 10px;
        color: #374151;
        font-weight: 600;
      }

      #${PANEL_ID} .hae-status-grid {
        display: grid;
        gap: 6px;
        margin-top: 10px;
        padding-top: 10px;
        border-top: 1px solid #e5e7eb;
      }
    `;

    document.documentElement.appendChild(style);
  }

  async function sendRuntimeMessage(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          resolve({
            ok: false,
            error: chrome.runtime.lastError.message
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
      running,
      sessionStartedAt,
      sessionEndsAt,
      actionCount,
      nextActionAt,
      nextActionName,
      minDelaySeconds,
      maxDelaySeconds,
      minutesValue: minutesInput.value,
      randomRefreshEnabled,
      panelPosition
    };
  }

  function hydrateSession(session) {
    panelOpen = session.panelOpen !== false;
    running = Boolean(session.running);
    sessionStartedAt = Number(session.sessionStartedAt ?? 0);
    sessionEndsAt = Number(session.sessionEndsAt ?? 0);
    actionCount = Number(session.actionCount ?? 0);
    nextActionAt = Number(session.nextActionAt ?? 0);
    nextActionName = session.nextActionName ?? "-";
    minDelaySeconds = Number(session.minDelaySeconds ?? minDelaySeconds);
    maxDelaySeconds = Number(session.maxDelaySeconds ?? maxDelaySeconds);
    randomRefreshEnabled = Boolean(session.randomRefreshEnabled);
    panelPosition = session.panelPosition ?? null;

    if (session.minutesValue) {
      minutesInput.value = String(session.minutesValue);
    }

    minDelaySlider.value = String(minDelaySeconds);
    maxDelaySlider.value = String(maxDelaySeconds);
    minDelayValue.textContent = String(minDelaySeconds);
    maxDelayValue.textContent = String(maxDelaySeconds);
    randomRefreshCheckbox.checked = randomRefreshEnabled;
    actionsValue.textContent = String(actionCount);
    nextActionValue.textContent = nextActionName;

    if (running && Date.now() >= sessionEndsAt) {
      running = false;
      nextActionName = "-";
      nextActionAt = 0;
      statusValue.textContent = "FINISHED";
      countdownValue.textContent = "-";
      nextActionValue.textContent = "-";
      void persistSession();
      return;
    }

    statusValue.textContent = running ? "RUNNING" : "Idle";
  }

  async function requestWakeLock() {
    if (!running || !("wakeLock" in navigator) || document.visibilityState !== "visible") {
      return;
    }

    try {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => {
        wakeLock = null;
        if (running) {
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

  function startCursorAnimation() {
    stopCursorAnimation();
    cursor.style.display = "block";

    const point = randomCenterPoint();
    moveCursor(jitter(point.x), jitter(point.y));

    cursorTimer = window.setInterval(() => {
      const nextPoint = randomCenterPoint();
      moveCursor(jitter(nextPoint.x), jitter(nextPoint.y));
    }, 900 + Math.random() * 600);
  }

  function stopCursorAnimation() {
    cursor.style.display = "none";
    if (cursorTimer) {
      window.clearInterval(cursorTimer);
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
    moveCursor(jitter(point.x), jitter(point.y));

    document.dispatchEvent(
      new MouseEvent("mousemove", {
        bubbles: true,
        cancelable: true,
        clientX: point.x,
        clientY: point.y,
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
    statusValue.textContent = "REFRESHING";
    await persistSession();
    window.location.reload();
  }

  function isControllerElement(element) {
    return Boolean(element.closest("[data-human-activity-root='true']"));
  }

  function pickAction() {
    const roll = Math.random();

    if (randomRefreshEnabled) {
      if (roll < 0.5) {
        return "scroll";
      }

      if (roll < 0.75) {
        return "move";
      }

      if (roll < 0.9) {
        return "click";
      }

      return "refresh";
    }

    if (roll < 0.55) {
      return "scroll";
    }

    if (roll < 0.8) {
      return "move";
    }

    return "click";
  }

  async function addTime(minutes) {
    if (running) {
      sessionEndsAt += minutes * 60 * 1000;
      updateStats();
      await persistSession();
      return;
    }

    const current = Number.parseInt(minutesInput.value || "0", 10);
    minutesInput.value = String(Math.max(current + minutes, 1));
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

    minDelayValue.textContent = String(minDelaySeconds);
    maxDelayValue.textContent = String(maxDelaySeconds);

    if (persist) {
      await persistSession();
    }
  }

  async function handleRandomRefreshToggle() {
    randomRefreshEnabled = randomRefreshCheckbox.checked;
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
    if (!running) {
      return;
    }

    const now = Date.now();
    if (now >= sessionEndsAt) {
      void stopSession("FINISHED");
      return;
    }

    const delay = freshCycle ? randomDelayMs() : randomDelayMs();
    nextActionAt = now + delay;
    nextActionName = pickAction();
    nextActionValue.textContent = nextActionName;
    void persistSession();

    if (loopTimer) {
      window.clearTimeout(loopTimer);
    }

    loopTimer = window.setTimeout(async () => {
      if (!running) {
        return;
      }

      if (Date.now() >= sessionEndsAt) {
        await stopSession("FINISHED");
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
    if (!running) {
      return;
    }

    const now = Date.now();
    const elapsedSeconds = Math.max(0, Math.floor((now - sessionStartedAt) / 1000));
    const remainingSeconds = Math.max(0, Math.round((sessionEndsAt - now) / 1000));
    const totalDuration = Math.max(sessionEndsAt - sessionStartedAt, 1);
    const completedDuration = Math.max(now - sessionStartedAt, 0);
    const progress = Math.min(100, (completedDuration / totalDuration) * 100);

    timeValue.textContent = formatDuration(elapsedSeconds);
    countdownValue.textContent = `${remainingSeconds}s`;
    progressBar.style.width = `${progress}%`;

    if (now >= sessionEndsAt) {
      void stopSession("FINISHED");
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

  async function startSession() {
    const requestedMinutes = Number.parseFloat(minutesInput.value);
    if (!Number.isFinite(requestedMinutes) || requestedMinutes <= 0) {
      minutesInput.value = "60";
    }

    await syncDelayRange();

    actionCount = 0;
    sessionStartedAt = Date.now();
    sessionEndsAt = sessionStartedAt + Math.max(requestedMinutes || 60, 1) * 60 * 1000;
    running = true;
    panelOpen = true;

    statusValue.textContent = "RUNNING";
    actionsValue.textContent = "0";
    progressBar.style.width = "0%";

    void requestWakeLock();
    startCursorAnimation();
    startStatsLoop();
    scheduleNextAction({ freshCycle: true });
    updateStats();
    await persistSession();
  }

  async function stopSession(nextStatus = "STOPPED") {
    running = false;
    statusValue.textContent = nextStatus;
    nextActionAt = 0;
    nextActionName = "-";
    nextActionValue.textContent = "-";
    countdownValue.textContent = "-";

    if (loopTimer) {
      window.clearTimeout(loopTimer);
      loopTimer = null;
    }

    stopStatsLoop();
    stopCursorAnimation();
    await releaseWakeLock();
    await persistSession();
  }

  function handleDragStart(event) {
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
    if (document.visibilityState === "visible" && running && !wakeLock) {
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
    await stopSession("IDLE");
    document.removeEventListener("mousemove", handleDragMove);
    document.removeEventListener("mouseup", handleDragEnd);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    dragbar.removeEventListener("mousedown", handleDragStart);
    await clearSavedSession();
    root.remove();
    delete window.__humanActivityExtension;
  }
})();
