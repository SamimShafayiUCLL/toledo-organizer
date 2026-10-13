(() => {
  const NS = (window.ToledoOrganizer = window.ToledoOrganizer || {});
  const STORAGE_KEY = "toledoOrganizerState";
  const OVERIG_ID = "builtin-overig";

  const defaultState = () => ({
    schemaVersion: 2,
    viewMode: "organizer",
    organizerMode: "structure",
    showHidden: false,
    search: "",
    editMode: false,
    courseSort: "custom",
    themeEnabled: true,
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
      groups,
      courseSettings: sanitizeCourseSettings(saved.courseSettings, groupIds),
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
      throw new Error("Ongeldig instellingenbestand.");
    }
    if (!Array.isArray(value.groups) || !isPlainObject(value.courseSettings)) {
      throw new Error("Dit bestand lijkt geen Toledo Organizer-configuratie te zijn.");
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
