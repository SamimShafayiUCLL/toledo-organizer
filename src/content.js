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

  function signatureFor(items) {
    return items
      .map((v) => `${v.rawId}|${v.available ? 1 : 0}|${v.href || ""}`)
      .sort()
      .join("\n");
  }

  async function persist(nextState) {
    state = nextState;
    await NS.storage.saveState(state);
    applySourceVisibility();
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
  }

  async function scan({ force = false } = {}) {
    lastUrl = location.href;

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
    if (!target || target.closest?.(`#${ROOT_ID}`)) return false;
    // Class/href changes only matter on enrollment items.
    if (mutation.type === "attributes") return Boolean(target.closest?.(".enrollment-list-item, .tol-enrollment-container"));
    return true;
  }

  async function init() {
    state = await NS.storage.loadState();
    prehide();

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
