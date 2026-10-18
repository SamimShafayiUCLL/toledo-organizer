(() => {
  const NS = (window.ToledoOrganizer = window.ToledoOrganizer || {});
  const STORAGE_KEY = "toledoOrganizerState";
  const OVERIG_ID = "builtin-overig";

  const DEFAULT_ACCENT = "#00627f";
  const MAX_TASKS = 500;
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  const DASH_ORDER = ["tasks", "upcoming", "feed"];
  const MAX_PINNED = 50;

  const defaultState = () => ({
    schemaVersion: 2,
    viewMode: "organizer",
    organizerMode: "structure",
    showHidden: false,
    search: "",
    editMode: false,
    courseSort: "custom",
    themeEnabled: true,
    appearance: { mode: "system", accent: DEFAULT_ACCENT },
    language: "auto",
    tasks: [],
    dashboard: { showTasks: true, showUpcoming: true, hideInfoPanel: false, showHero: true, replaceFeed: true, order: [...DASH_ORDER] },
    groups: [
      {
        id: OVERIG_ID,
        name: "Overig",
        parentId: null,
        order: 0,
        collapsed: true,
        builtIn: true,
        color: null
      }
    ],
    courseSettings: {},
    pinned: [],
    ui: {
      settingsOpen: false
    }
  });

  const MAX_GROUP_DEPTH = 3;
  const COLOR_RE = /^#[0-9a-f]{6}$/i;

  function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function normalizeGroup(group, index) {
    return {
      id: group.id,
      name: group.name,
      parentId: typeof group.parentId === "string" ? group.parentId : null,
      order: Number.isFinite(group.order) ? group.order : index,
      collapsed: Boolean(group.collapsed),
      builtIn: group.id === OVERIG_ID ? true : undefined,
      color: COLOR_RE.test(group.color || "") ? group.color : null
    };
  }

  // Drops malformed groups, then repairs parent links (missing parent, cycles, depth > MAX_GROUP_DEPTH).
  function sanitizeGroups(rawGroups) {
    const seen = new Set();
    const groups = [];
    rawGroups.forEach((group, index) => {
      if (!isPlainObject(group)) return;
      if (typeof group.id !== "string" || !group.id || typeof group.name !== "string") return;
      if (seen.has(group.id)) return;
      seen.add(group.id);
      const normalized = normalizeGroup(group, index);
      if (normalized.builtIn === undefined) delete normalized.builtIn;
      groups.push(normalized);
    });

    const byId = new Map(groups.map((g) => [g.id, g]));
    for (const group of groups) {
      if (group.parentId && (group.parentId === group.id || !byId.has(group.parentId))) group.parentId = null;
    }
    // Break cycles.
    for (const group of groups) {
      const visited = new Set([group.id]);
      let current = byId.get(group.parentId);
      while (current) {
        if (visited.has(current.id)) {
          group.parentId = null;
          break;
        }
        visited.add(current.id);
        current = byId.get(current.parentId);
      }
    }
    // Enforce max depth: re-parent too-deep groups under their level-(MAX-1) ancestor.
    const chainOf = (group) => {
      const chain = [group];
      let current = byId.get(group.parentId);
      while (current) {
        chain.push(current);
        current = byId.get(current.parentId);
      }
      return chain;
    };
    const byDepth = [...groups].sort((a, b) => chainOf(a).length - chainOf(b).length);
    for (const group of byDepth) {
      const chain = chainOf(group);
      if (chain.length > MAX_GROUP_DEPTH) group.parentId = chain[chain.length - MAX_GROUP_DEPTH + 1].id;
    }
    return groups;
  }

  function sanitizeCourseSettings(raw, groupIds) {
    const out = {};
    if (!isPlainObject(raw)) return out;
    for (const [key, value] of Object.entries(raw)) {
      if (key === "__proto__" || !isPlainObject(value)) continue;
      out[key] = {
        ...value,
        groupId: typeof value.groupId === "string" && groupIds.has(value.groupId) ? value.groupId : null,
        color: COLOR_RE.test(value.color || "") ? value.color : null
      };
    }
    return out;
  }

  function sanitizePinned(raw) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    for (const key of raw) {
      if (out.length >= MAX_PINNED) break;
      if (typeof key !== "string" || !key || key === "__proto__" || out.includes(key)) continue;
      out.push(key);
    }
    return out;
  }

  function sanitizeDashOrder(raw) {
    const ok = Array.isArray(raw) && raw.length === DASH_ORDER.length && DASH_ORDER.every((k) => raw.includes(k)) && new Set(raw).size === DASH_ORDER.length;
    return ok ? [...raw] : [...DASH_ORDER];
  }

  function sanitizeTasks(raw) {
    if (!Array.isArray(raw)) return [];
    const seen = new Set();
    const tasks = [];
    for (const task of raw) {
      if (tasks.length >= MAX_TASKS) break;
      if (!isPlainObject(task)) continue;
      if (typeof task.id !== "string" || !task.id || seen.has(task.id)) continue;
      if (typeof task.text !== "string") continue;
      const text = task.text.trim();
      if (!text || text.length > 300) continue;
      if (typeof task.done !== "boolean") continue;
      if (task.due != null && !(typeof task.due === "string" && DATE_RE.test(task.due))) continue;
      if (task.tag != null && !(typeof task.tag === "string" && task.tag.length <= 120)) continue;
      seen.add(task.id);
      tasks.push({
        id: task.id,
        text,
        done: task.done,
        due: task.due ?? null,
        tag: task.tag ?? null,
        createdAt: Number.isFinite(task.createdAt) ? task.createdAt : Date.now(),
        doneAt: Number.isFinite(task.doneAt) ? task.doneAt : null
      });
    }
    return tasks;
  }

  function mergeState(saved) {
    const base = defaultState();
    if (!isPlainObject(saved)) return base;

    const groups = Array.isArray(saved.groups) ? sanitizeGroups(saved.groups) : base.groups;

    if (!groups.some((group) => group.id === OVERIG_ID)) {
      groups.push({ ...base.groups[0], order: groups.length });
    }
    const groupIds = new Set(groups.map((g) => g.id));

    // Only known keys from defaultState() are kept; unknown keys are dropped on purpose.
    return {
      ...base,
      // A newer schemaVersion than we know is still loaded (best effort) and its value is kept.
      schemaVersion: Number.isFinite(saved.schemaVersion) && saved.schemaVersion > 2 ? saved.schemaVersion : 2,
      viewMode: ["organizer", "original"].includes(saved.viewMode) ? saved.viewMode : base.viewMode,
      organizerMode: ["structure", "all"].includes(saved.organizerMode) ? saved.organizerMode : base.organizerMode,
      showHidden: Boolean(saved.showHidden),
      search: "", // transient: never restored
      editMode: Boolean(saved.editMode),
      courseSort: ["custom", "az", "za"].includes(saved.courseSort) ? saved.courseSort : "custom",
      themeEnabled: saved.themeEnabled !== false,
      appearance: {
        mode: ["system", "light", "dark"].includes(saved.appearance?.mode) ? saved.appearance.mode : "system",
        accent: COLOR_RE.test(saved.appearance?.accent || "") ? saved.appearance.accent : DEFAULT_ACCENT
      },
      language: ["auto", "nl", "en"].includes(saved.language) ? saved.language : "auto",
      tasks: sanitizeTasks(saved.tasks),
      dashboard: {
        showTasks: saved.dashboard?.showTasks !== false,
        showUpcoming: saved.dashboard?.showUpcoming !== false,
        hideInfoPanel: Boolean(saved.dashboard?.hideInfoPanel),
        showHero: saved.dashboard?.showHero !== false,
        replaceFeed: saved.dashboard?.replaceFeed !== false,
        order: sanitizeDashOrder(saved.dashboard?.order)
      },
      groups,
      courseSettings: sanitizeCourseSettings(saved.courseSettings, groupIds),
      pinned: sanitizePinned(saved.pinned),
      ui: {
        ...base.ui,
        // Modals are intentionally transient: never reopen after a refresh.
        settingsOpen: false
      }
    };
  }

  function stateForPersistence(state) {
    const { search, ...rest } = state; // search is transient
    return {
      ...rest,
      schemaVersion: Number.isFinite(state.schemaVersion) && state.schemaVersion > 2 ? state.schemaVersion : 2,
      ui: {
        ...(state.ui || {}),
        settingsOpen: false
      }
    };
  }

  async function loadState() {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    return mergeState(result[STORAGE_KEY]);
  }

  async function saveState(state) {
    await chrome.storage.local.set({ [STORAGE_KEY]: stateForPersistence(state) });
  }

  async function resetState() {
    const state = defaultState();
    await saveState(state);
    return state;
  }

  function exportState(state) {
    return JSON.stringify(stateForPersistence(state), null, 2);
  }

  function validateImportedState(value) {
    if (!isPlainObject(value)) {
      throw new Error(NS.i18n.t("error.invalidFile"));
    }
    if (!Array.isArray(value.groups) || !isPlainObject(value.courseSettings)) {
      throw new Error(NS.i18n.t("error.notConfig"));
    }
    return mergeState(value);
  }

  NS.storage = {
    STORAGE_KEY,
    OVERIG_ID,
    defaultState,
    loadState,
    saveState,
    resetState,
    exportState,
    validateImportedState
  };
})();
