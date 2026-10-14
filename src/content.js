(() => {
  const NS = (window.ToledoOrganizer = window.ToledoOrganizer || {});
  const ROOT_ID = "toledo-organizer-root";
  const ENROLLMENT_SELECTOR = ".enrollment-list-item.tol-enrollment";

  let state;
  let enrollments = [];
  let courses = [];
  let ui;
  let scanTimer = null;
  let pendingForce = false;
  let prehideTimer;
  let lastSignature = "";
  let lastUrl = location.href;
  let observer;
  let dashboard;
  let darkQuery = null;

  function signatureFor(items) {
    return items
      .map((v) => `${v.rawId}|${v.available ? 1 : 0}|${v.href || ""}`)
      .sort()
      .join("\n");
  }

  async function persist(nextState) {
    state = nextState;
    applyAppearance();
    await NS.storage.saveState(state);
    applySourceVisibility();
    dashboard?.render();
  }

  // styles/toledo-theme.css is scoped to html:not(.to-theme-off); dark mode and accent are driven from here.
  function applyAppearance() {
    const root = document.documentElement;
    root.classList.toggle("to-theme-off", state?.themeEnabled === false);
    const mode = state?.appearance?.mode || "system";
    if (!darkQuery && window.matchMedia) {
      darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
      darkQuery.addEventListener?.("change", () => applyAppearance());
    }
    const dark = mode === "dark" || (mode === "system" && Boolean(darkQuery?.matches));
    root.classList.toggle("to-dark", dark);
    root.style.setProperty("--to-user-accent", state?.appearance?.accent || "#00627f");
    root.classList.toggle("to-hide-info", Boolean(state?.dashboard?.hideInfoPanel));
  }

  // Dashboard persistence: merge a patch into state, save, and refresh both dashboard and organizer UI.
  async function dashboardSetState(patch) {
    const next = { ...state, ...patch, search: ui?.state?.search || "" };
    if (ui) ui.state = next;
    await persist(next); // also re-renders the dashboard
    ui?.render();
  }

  function dashboardContainer() {
    return document.querySelector(".tol-events-widget")?.parentElement || null;
  }

  function ensureDashboard() {
    if (!state) return;
    const container = dashboardContainer();
    if (!container) return;
    if (!dashboard) {
      dashboard = new NS.dashboard.Dashboard({
        getState: () => state,
        setState: dashboardSetState,
        getCourses: () => courses
      });
    }
    if (!document.getElementById("to-dashboard") || container.firstElementChild?.id !== "to-dashboard") dashboard.mount(container);
    else dashboard.refreshIfChanged();
  }

  function isTypingTarget(target) {
    return Boolean(target?.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) || Boolean(target?.isContentEditable);
  }

  function onShortcut(event) {
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || isTypingTarget(event.target)) return;
    let node = null;
    if (event.key === "/") node = document.querySelector('#toledo-organizer-root [data-role="search"]');
    else if (event.key === "n") node = document.querySelector('#to-dashboard [data-role="task-text"]');
    if (!node) return;
    event.preventDefault();
    node.focus();
  }

  function ensureCourseDefaults() {
    let changed = false;
    const settings = { ...state.courseSettings };
    const overigExists = state.groups.some((g) => g.id === NS.storage.OVERIG_ID);

    courses.forEach((course, index) => {
      if (!settings[course.key]) {
        settings[course.key] = {
          groupId: course.type === "community" && overigExists ? NS.storage.OVERIG_ID : null,
          hidden: false,
          defaultVersion: null,
          versionNames: {},
          customTitle: null,
          color: null,
          order: index
        };
        changed = true;
      } else {
        const current = settings[course.key];
        const normalized = {
          ...current,
          color: /^#[0-9a-f]{6}$/i.test(current.color || "") ? current.color : null,
          order: Number.isFinite(current.order) ? current.order : index
        };
        if (normalized.color !== current.color || normalized.order !== current.order) {
          settings[course.key] = normalized;
          changed = true;
        }
      }
    });

    if (changed) {
      state = { ...state, courseSettings: settings };
      NS.storage.saveState(state);
    }
  }

  function applySourceVisibility() {
    const wrappers = NS.detector.sourceWrappers(enrollments);
    const hide = state?.viewMode === "organizer";
    wrappers.forEach((wrapper) => wrapper.classList.toggle("to-source-hidden", hide));
    document.documentElement.classList.toggle("to-organizer-shown", hide && wrappers.length > 0);
  }

  function clearSourceHidden() {
    document.querySelectorAll(".to-source-hidden").forEach((node) => node.classList.remove("to-source-hidden"));
  }

  function findMountPoint() {
    const wrapper = NS.detector.sourceWrappers(enrollments)[0];
    return wrapper || document.querySelector(".tol-enrollment-container") || document.body.firstElementChild;
  }

  // Mounts (or re-renders) the UI. Keeps the live search text, which is transient and not persisted.
  function mountUi(mountPoint) {
    const nextState = { ...state, search: ui?.state?.search || "" };
    if (!ui) {
      ui = new NS.ui.OrganizerUI({
        state: nextState,
        onStateChange: persist,
        getCourses: () => courses,
        getEnrollments: () => enrollments
      });
      ui.mount(mountPoint);
      return;
    }
    ui.state = nextState;
    if (!document.getElementById(ROOT_ID)) ui.mount(mountPoint);
    else ui.render();
  }

  // Hide Toledo's own list until the organizer is ready, so it doesn't flash first. Always released within 3s.
  function prehide() {
    if (state?.viewMode !== "organizer") return;
    document.documentElement.classList.add("to-prehide");
    clearTimeout(prehideTimer);
    prehideTimer = setTimeout(releasePrehide, 3000);
  }

  function releasePrehide() {
    clearTimeout(prehideTimer);
    document.documentElement.classList.remove("to-prehide");
  }

  function resetWhenNoEnrollments() {
    lastSignature = "";
    enrollments = [];
    courses = [];
    document.getElementById(ROOT_ID)?.remove();
    clearSourceHidden();
    document.documentElement.classList.remove("to-organizer-shown");
  }

  async function scan({ force = false } = {}) {
    lastUrl = location.href;

    ensureDashboard();

    // Cheap short-circuit: no enrollment items on this page -> nothing to organise, nothing hidden.
    if (!document.querySelector(ENROLLMENT_SELECTOR)) {
      if (lastSignature || enrollments.length || document.querySelector(".to-source-hidden")) resetWhenNoEnrollments();
      return;
    }

    const detected = NS.detector.detectEnrollments();
    if (!detected.length) {
      resetWhenNoEnrollments();
      return;
    }
    const signature = signatureFor(detected);
    if (!force && signature === lastSignature) {
      // Toledo may have re-rendered the list: refresh DOM references and remount if our root is gone.
      enrollments = detected;
      if (ui && !document.getElementById(ROOT_ID)) mountUi(findMountPoint());
      applySourceVisibility();
      releasePrehide();
      return;
    }
    lastSignature = signature;
    enrollments = detected;
    courses = NS.matcher.combineCourses(enrollments);
    ensureCourseDefaults();

    mountUi(findMountPoint());
    applySourceVisibility();
    releasePrehide();
  }

  // Throttle, not debounce: Toledo mutates the DOM constantly while loading, and a debounce that
  // restarts on every mutation kept postponing the first scan until the page went quiet.
  function scheduleScan(force = false) {
    pendingForce = pendingForce || force;
    if (scanTimer) return;
    scanTimer = setTimeout(() => {
      scanTimer = null;
      const forced = pendingForce;
      pendingForce = false;
      scan({ force: forced });
    }, ui ? 150 : 30);
  }

  // Blackboard Ultra navigates with history.pushState, which fires no event: detect it by URL comparison.
  function checkUrlChange() {
    if (location.href === lastUrl) return false;
    lastUrl = location.href;
    prehide();
    scheduleScan(true);
    return true;
  }

  function isRelevantMutation(mutation) {
    const target = mutation.target.nodeType === Node.ELEMENT_NODE ? mutation.target : mutation.target.parentElement;
    if (!target || target.closest?.(`#${ROOT_ID}, #to-dashboard`)) return false;
    // Class/href changes only matter on enrollment items.
    if (mutation.type === "attributes") return Boolean(target.closest?.(".enrollment-list-item, .tol-enrollment-container"));
    return true;
  }

  async function init() {
    state = await NS.storage.loadState();
    applyAppearance();
    prehide();
    document.addEventListener("keydown", onShortcut);

    // Observe before the first scan so nothing Toledo renders in between is missed.
    observer = new MutationObserver((mutations) => {
      if (checkUrlChange()) return;
      if (mutations.some(isRelevantMutation)) scheduleScan(false);
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "href"] });
    await scan({ force: true });

    window.addEventListener("hashchange", () => scheduleScan(true));
    window.addEventListener("popstate", () => scheduleScan(true));
  }

  init().catch((error) => console.error("[Toledo Organizer] Initialisatie mislukt", error));
})();
