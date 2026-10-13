(() => {
  const NS = (window.ToledoOrganizer = window.ToledoOrganizer || {});
  const UI_ID = "toledo-organizer-root";

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value == null) continue;
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else if (key === "style") node.setAttribute("style", value);
      else if (key === "hidden") node.hidden = Boolean(value);
      else if (key.startsWith("data-")) node.setAttribute(key, value);
      else if (key === "title") node.title = value;
      else if (key === "type") node.type = value;
      else if (key === "placeholder") node.placeholder = value;
      else if (key === "value") node.value = value;
      else if (key === "draggable") node.draggable = Boolean(value);
      else node.setAttribute(key, value);
    }
    for (const child of Array.isArray(children) ? children : [children]) {
      if (child == null) continue;
      node.append(child.nodeType ? child : document.createTextNode(String(child)));
    }
    return node;
  }

  function button(text, action, title = "", className = "") {
    return el("button", {
      class: `to-btn ${className}`.trim(),
      type: "button",
      "data-action": action,
      title,
      text
    });
  }

  function option(value, label, selected = false) {
    const node = el("option", { value, text: label });
    node.selected = selected;
    return node;
  }

  function validColor(value) {
    return /^#[0-9a-f]{6}$/i.test(value || "");
  }

  function colorStyle(value) {
    return validColor(value) ? `--to-item-color:${value};` : "";
  }

  function institutionLabel(courseOrVersion) {
    const institution = courseOrVersion?.institution;
    if (institution === "KUL") return "KU Leuven";
    if (institution === "UCLL") return "UCLL";
    if (institution === "COMMUNITY" || courseOrVersion?.type === "community") return "Community";
    return institution || "Toledo";
  }

  async function downloadJson(filename, data) {
    const json = typeof data === "string" ? data : JSON.stringify(data, null, 2);
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: "TOLEDO_ORGANIZER_DOWNLOAD_JSON",
          filename,
          json
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (!response?.ok) {
            reject(new Error(response?.error || "Download kon niet gestart worden."));
            return;
          }
          resolve(response);
        }
      );
    });
  }

  class OrganizerUI {
    constructor({ state, onStateChange, getCourses, getEnrollments }) {
      this.state = state;
      this.onStateChange = onStateChange;
      this.getCourses = getCourses;
      this.getEnrollments = getEnrollments;
      this.expandedCourses = new Set();
      this.root = null;
      this.workspace = null;
      this.toastTimer = null;
      this.dragData = null;
      this.searchTimer = null;
      this.documentListenerBound = false;
      this.documentKeyHandler = (event) => {
        if (event.key === "Escape" && this.state.ui?.settingsOpen) {
          this.updateUIState({ settingsOpen: false });
        }
      };
    }

    mount(beforeNode) {
      let root = document.getElementById(UI_ID);
      if (!root) {
        root = el("section", { id: UI_ID, class: "to-root" });
        beforeNode?.parentNode?.insertBefore(root, beforeNode);
      }
      this.root = root;
      this.bindEvents();
      this.render();
    }

    bindEvents() {
      if (!this.documentListenerBound) {
        this.documentListenerBound = true;
        document.addEventListener("keydown", this.documentKeyHandler);
      }
      if (this.root.dataset.bound === "1") return;
      this.root.dataset.bound = "1";

      this.root.addEventListener("click", (event) => this.handleClick(event));
      this.root.addEventListener("input", (event) => this.handleInput(event));
      this.root.addEventListener("change", (event) => this.handleChange(event));
      this.root.addEventListener("dragstart", (event) => this.handleDragStart(event));
      this.root.addEventListener("dragover", (event) => this.handleDragOver(event));
      this.root.addEventListener("dragleave", (event) => this.handleDragLeave(event));
      this.root.addEventListener("drop", (event) => this.handleDrop(event));
      this.root.addEventListener("dragend", () => {
        this.dragData = null;
        this.clearDragStyles();
      });
    }

    async setState(nextState) {
      this.state = nextState;
      await this.onStateChange(nextState);
      this.render();
    }

    async patchState(patch) {
      await this.setState({ ...this.state, ...patch });
    }

    courseSetting(key) {
      return this.state.courseSettings[key] || {};
    }

    courseTitle(course) {
      return this.courseSetting(course.key).customTitle || course.title;
    }

    versionLabel(course, version) {
      const custom = this.courseSetting(course.key).versionNames?.[version.year || version.rawId];
      return custom || version.academicYear || version.year || "Zonder academiejaar";
    }

    sortCourses(courses) {
      const mode = this.state.courseSort || "custom";
      const list = [...courses];
      if (mode === "az" || mode === "za") {
        const direction = mode === "az" ? 1 : -1;
        return list.sort(
          (a, b) =>
            direction *
            this.courseTitle(a).localeCompare(this.courseTitle(b), "nl", {
              sensitivity: "base",
              numeric: true
            })
        );
      }

      return list.sort((a, b) => {
        const aOrder = this.courseSetting(a.key).order;
        const bOrder = this.courseSetting(b.key).order;
        const aSafe = Number.isFinite(aOrder) ? aOrder : Number.MAX_SAFE_INTEGER;
        const bSafe = Number.isFinite(bOrder) ? bOrder : Number.MAX_SAFE_INTEGER;
        return aSafe - bSafe || this.courseTitle(a).localeCompare(this.courseTitle(b), "nl", { sensitivity: "base" });
      });
    }

    render() {
      if (!this.root) return;
      const active = document.activeElement;
      const searchFocus =
        active?.matches?.('[data-role="search"]') && this.root.contains(active)
          ? { start: active.selectionStart, end: active.selectionEnd }
          : null;
      this.root.innerHTML = "";
      this.renderContent();
      if (searchFocus) {
        const search = this.root.querySelector('[data-role="search"]');
        if (search) {
          search.focus({ preventScroll: true });
          search.setSelectionRange(searchFocus.start, searchFocus.end);
        }
      }
    }

    renderContent() {
      this.root.classList.toggle("to-edit-mode", Boolean(this.state.editMode));

      const header = el("div", { class: "to-topbar" });
      const brand = el("div", { class: "to-brand" }, [
        el("div", { class: "to-brand-title", text: "Toledo Organizer" }),
        el("div", { class: "to-brand-sub", text: "Eigen structuur bovenop Toledo" })
      ]);

      const viewSwitch = el("div", { class: "to-segment" }, [
        button("Organizer", "view-organizer", "Gebruik je eigen indeling", this.state.viewMode === "organizer" ? "active" : ""),
        button("Originele Toledo", "view-original", "Toon de ongewijzigde Toledo-lijst", this.state.viewMode === "original" ? "active" : "")
      ]);

      const editButton = button(
        "✎",
        "toggle-edit-mode",
        this.state.editMode ? "Bewerkmodus sluiten" : "Bewerk groepen, kleuren en volgorde",
        `icon${this.state.editMode ? " active" : ""}`
      );

      header.append(brand, viewSwitch, editButton, button("⚙", "settings", "Instellingen", "icon"));
      this.root.append(header);

      if (this.state.viewMode === "original") {
        this.root.append(
          el("div", { class: "to-original-note" }, [
            el("strong", { text: "Originele Toledo-weergave actief." }),
            document.createTextNode(" De extensie laat de oorspronkelijke lijst hieronder volledig met rust.")
          ])
        );
        if (this.state.ui?.settingsOpen) this.root.append(this.renderSettingsModal());
        return;
      }

      const controls = el("div", { class: "to-controls" });
      const sortSelect = el("select", { class: "to-select", "data-role": "course-sort", title: "Sorteer vakken" }, [
        option("custom", "Eigen volgorde", this.state.courseSort === "custom"),
        option("az", "Alfabetisch A–Z", this.state.courseSort === "az"),
        option("za", "Alfabetisch Z–A", this.state.courseSort === "za")
      ]);

      controls.append(
        el("div", { class: "to-segment compact" }, [
          button("Structuur", "mode-structure", "Toon je groepen", this.state.organizerMode === "structure" ? "active" : ""),
          button("Alle vakken", "mode-all", "Toon alle gedetecteerde vakken", this.state.organizerMode === "all" ? "active" : "")
        ]),
        el("input", {
          class: "to-search",
          type: "search",
          placeholder: "Zoek vak, code of instelling…",
          value: this.state.search || "",
          "data-role": "search"
        }),
        el("label", { class: "to-sort-control" }, [el("span", { text: "Sorteren" }), sortSelect]),
        el("label", { class: "to-checkbox" }, [
          el("input", { type: "checkbox", "data-role": "show-hidden" }),
          el("span", { text: "Verborgen tonen" })
        ])
      );
      if (this.state.editMode) controls.append(button("+ Groep", "add-root-group", "Maak een hoofdgroep"));

      const hiddenInput = controls.querySelector('[data-role="show-hidden"]');
      hiddenInput.checked = Boolean(this.state.showHidden);
      this.root.append(controls);

      if (this.state.editMode) {
        this.root.append(
          el("div", { class: "to-edit-hint" }, [
            el("strong", { text: "Bewerkmodus" }),
            document.createTextNode(" · versleep vakken, pas kleuren aan en beheer groepen. Klik opnieuw op ✎ om de knoppen te verbergen.")
          ])
        );
      }

      const workspace = el("div", { class: "to-workspace" });
      this.workspace = workspace;
      workspace.append(this.state.organizerMode === "all" ? this.renderAllCourses() : this.renderStructure());
      this.root.append(workspace);

      if (this.state.ui?.settingsOpen) this.root.append(this.renderSettingsModal());
    }

    getFilteredCourses() {
      const query = (this.state.search || "").trim().toLocaleLowerCase("nl");
      return this.getCourses().filter((course) => {
        const setting = this.courseSetting(course.key);
        if (setting.hidden && !this.state.showHidden) return false;
        if (!query) return true;
        const haystack = [
          this.courseTitle(course),
          course.code,
          course.institution,
          ...course.versions.map((v) => `${v.rawId} ${v.originalTitle}`)
        ]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase("nl");
        return haystack.includes(query);
      });
    }

    renderAllCourses() {
      const section = el("section", { class: "to-section" });
      const courses = this.sortCourses(this.getFilteredCourses());
      section.append(
        el("div", { class: "to-section-heading" }, [
          el("h2", { text: `Alle vakken (${courses.length})` }),
          el("span", { class: "to-muted", text: "Gebruik Structuur om vakken in groepen te plaatsen." })
        ])
      );
      const list = el("div", { class: "to-course-list" });
      courses.forEach((course) => list.append(this.renderCourse(course, this.courseSetting(course.key).groupId || null)));
      if (!courses.length) list.append(el("div", { class: "to-empty", text: "Geen vakken gevonden." }));
      section.append(list);
      return section;
    }

    renderStructure() {
      const wrap = el("div", { class: "to-structure" });
      const groupsMap = NS.matcher.groupsAsTree(this.state.groups);
      const courses = this.getFilteredCourses();
      const byGroup = new Map();
      const unassigned = [];

      for (const course of courses) {
        const setting = this.courseSetting(course.key);
        const groupId = setting.groupId || null;
        if (groupId && this.state.groups.some((g) => g.id === groupId)) {
          if (!byGroup.has(groupId)) byGroup.set(groupId, []);
          byGroup.get(groupId).push(course);
        } else {
          unassigned.push(course);
        }
      }

      if (this.state.editMode) {
        wrap.append(
          el("div", {
            class: "to-root-dropzone",
            "data-drop-type": "root-groups",
            text: "Sleep een groep hierheen om ze op hoofdniveau te plaatsen"
          })
        );
      }

      const rootGroups = groupsMap.get("__root__") || [];
      for (const group of rootGroups) wrap.append(this.renderGroup(group, 1, groupsMap, byGroup));

      const unassignedSection = el("section", {
        class: "to-group to-unassigned",
        "data-drop-type": this.state.editMode ? "course-group" : null,
        "data-group-id": ""
      });
      unassignedSection.append(
        el("div", { class: "to-group-header" }, [
          el("div", { class: "to-group-title-wrap" }, [
            el("span", { class: "to-group-title", text: `Niet ingedeeld (${unassigned.length})` }),
            el("span", { class: "to-pill", text: "Nieuwe vakken komen hier" })
          ])
        ])
      );
      const unassignedList = el("div", { class: "to-course-list to-unassigned-list" });
      this.sortCourses(unassigned).forEach((course) => unassignedList.append(this.renderCourse(course, null)));
      if (!unassigned.length) unassignedList.append(el("div", { class: "to-empty", text: "Alles is ingedeeld." }));
      unassignedSection.append(unassignedList);
      wrap.append(unassignedSection);
      return wrap;
    }

    renderGroup(group, depth, groupsMap, byGroup) {
      const groupCourses = this.sortCourses(byGroup.get(group.id) || []);
      const childGroups = groupsMap.get(group.id) || [];
      const descendantCourseCount = this.countDescendantCourses(group.id, groupsMap, byGroup);
      const hasColor = validColor(group.color);
      const section = el("section", {
        class: `to-group depth-${depth}${group.collapsed ? " collapsed" : ""}${hasColor ? " has-color" : ""}`,
        "data-group-id": group.id,
        "data-drop-type": this.state.editMode ? "course-group" : null,
        style: colorStyle(group.color)
      });

      const titleChildren = [
        button(group.collapsed ? "▸" : "▾", "toggle-group", group.collapsed ? "Uitklappen" : "Inklappen", "icon tiny")
      ];
      if (this.state.editMode) {
        titleChildren.push(
          el("span", {
            class: "to-group-drag",
            draggable: true,
            "data-drag-type": "group",
            "data-group-id": group.id,
            title: "Sleep groep",
            text: "⋮⋮"
          })
        );
      }
      titleChildren.push(
        el("span", { class: "to-group-title", text: group.name }),
        el("span", { class: "to-count", text: String(groupCourses.length + descendantCourseCount) })
      );

      const actions = el("div", { class: "to-group-actions" });
      if (this.state.editMode) {
        if (depth < 3) actions.append(button("+ subgroep", "add-subgroup", "Voeg een subgroep toe", "small"));
        actions.append(
          ...[
            button("↑", "group-up", "Verplaats omhoog", "icon tiny"),
            button("↓", "group-down", "Verplaats omlaag", "icon tiny"),
            button("✎", "rename-group", "Hernoem groep", "icon tiny"),
            this.colorPicker("group-color", group.color, "Kleur van groep"),
            hasColor ? button("↺", "clear-group-color", "Verwijder groepskleur", "icon tiny") : null,
            button("×", "delete-group", "Verwijder groep", "icon tiny danger")
          ].filter(Boolean)
        );
      }

      const header = el(
        "div",
        {
          class: "to-group-header",
          "data-drop-type": this.state.editMode ? "group-target" : null,
          "data-group-id": group.id
        },
        [el("div", { class: "to-group-title-wrap" }, titleChildren), actions]
      );
      section.append(header);

      const body = el("div", { class: "to-group-body" });
      const list = el("div", { class: "to-course-list" });
      groupCourses.forEach((course) => list.append(this.renderCourse(course, group.id)));
      body.append(list);

      for (const child of childGroups) body.append(this.renderGroup(child, depth + 1, groupsMap, byGroup));

      if (!groupCourses.length && !childGroups.length) {
        body.append(
          el("div", {
            class: "to-empty",
            text: this.state.editMode ? "Sleep hier vakken of maak een subgroep." : "Deze groep is leeg."
          })
        );
      }
      section.append(body);
      return section;
    }

    countDescendantCourses(groupId, groupsMap, byGroup) {
      let count = 0;
      const children = groupsMap.get(groupId) || [];
      for (const child of children) {
        count += (byGroup.get(child.id) || []).length;
        count += this.countDescendantCourses(child.id, groupsMap, byGroup);
      }
      return count;
    }

    colorPicker(role, value, title) {
      return el("input", {
        class: "to-color-picker",
        type: "color",
        value: validColor(value) ? value : "#244b8f",
        "data-role": role,
        title
      });
    }

    renderCourse(course, groupId) {
      const setting = this.courseSetting(course.key);
      const defaultVersion = NS.matcher.getDefaultVersion(course, setting);
      const newestVersion = course.versions[0] || null;
      const expanded = this.expandedCourses.has(course.key);
      const hasColor = validColor(setting.color);
      const card = el("article", {
        class: `to-course${setting.hidden ? " is-hidden" : ""}${hasColor ? " has-color" : ""}`,
        "data-course-key": course.key,
        "data-group-id": groupId || "",
        "data-drop-type": this.state.editMode && this.state.organizerMode === "structure" ? "course-order" : null,
        style: colorStyle(setting.color)
      });

      const metaBits = [institutionLabel(course)];
      if (course.semester) metaBits.push(`Semester ${course.semester}`);
      if (course.code) metaBits.push(course.code);

      const titleButton = el("button", {
        class: "to-course-title",
        type: "button",
        "data-action": "open-default",
        text: this.courseTitle(course),
        title: defaultVersion?.available
          ? `Open standaardversie ${this.versionLabel(course, defaultVersion)}`
          : "Standaardversie is niet beschikbaar; klik om versies te bekijken"
      });

      const mainChildren = [
        titleButton,
        el("div", { class: "to-course-meta", text: metaBits.filter(Boolean).join(" · ") })
      ];

      if (newestVersion && !newestVersion.available) {
        mainChildren.push(
          el("div", {
            class: "to-course-status warning",
            text: `⚠ ${this.versionLabel(course, newestVersion)} is niet beschikbaar op Toledo (${institutionLabel(newestVersion)}).`,
            title: "Toledo markeert deze cursusversie momenteel als niet beschikbaar."
          })
        );
      }

      const actions = el("div", { class: "to-course-actions" });
      if (defaultVersion) {
        actions.append(
          el("span", {
            class: `to-year-badge${defaultVersion.available ? "" : " unavailable"}`,
            text: this.versionLabel(course, defaultVersion),
            title: "Standaardversie"
          })
        );
      }
      actions.append(button(expanded ? "▴" : "▾", "toggle-course", "Toon academiejaren", "icon"));

      if (this.state.editMode) {
        if (this.state.organizerMode === "structure" && this.state.courseSort === "custom") {
          actions.append(
            button("↑", "course-up", "Vak omhoog", "icon tiny"),
            button("↓", "course-down", "Vak omlaag", "icon tiny")
          );
        }
        actions.append(
          ...[
            button("✎", "rename-course", "Geef het vak een eigen naam", "icon tiny"),
            this.colorPicker("course-color", setting.color, "Kleur van vak"),
            hasColor ? button("↺", "clear-course-color", "Verwijder vakkleur", "icon tiny") : null,
            button(setting.hidden ? "👁" : "⊘", "toggle-hidden", setting.hidden ? "Maak opnieuw zichtbaar" : "Verberg vak", "icon")
          ].filter(Boolean)
        );
      }

      const headChildren = [];
      if (this.state.editMode) {
        headChildren.push(
          el("span", {
            class: "to-drag-handle",
            draggable: true,
            "data-drag-type": "course",
            "data-course-key": course.key,
            title: "Sleep vak",
            text: "⋮⋮"
          })
        );
      }
      headChildren.push(el("div", { class: "to-course-main" }, mainChildren), actions);
      card.append(el("div", { class: "to-course-head" }, headChildren));

      if (expanded) {
        const versions = el("div", { class: "to-versions" });
        for (const version of course.versions) versions.append(this.renderVersion(course, version, setting));
        card.append(versions);
      }
      return card;
    }

    renderVersion(course, version, setting) {
      const key = version.year || version.rawId;
      const defaultResolved = NS.matcher.getDefaultVersion(course, setting);
      const isDefault = (setting.defaultVersion || defaultResolved?.year) === version.year;
      const label = this.versionLabel(course, version);
      const row = el("div", { class: `to-version${version.available ? "" : " unavailable"}` });

      if (this.state.editMode) {
        row.append(button(isDefault ? "★" : "☆", "set-default-version", isDefault ? "Standaardversie" : "Maak standaardversie", "icon star"));
      } else if (isDefault) {
        row.append(el("span", { class: "to-default-star", text: "★", title: "Standaardversie" }));
      }

      const versionMeta = version.available
        ? version.rawId
        : `${version.rawId} · Niet beschikbaar op Toledo (${institutionLabel(version)})`;

      row.append(
        el("div", { class: "to-version-info" }, [
          el("div", { class: "to-version-title", text: label }),
          el("div", { class: "to-version-meta", text: versionMeta })
        ])
      );

      if (this.state.editMode) row.append(button("✎", "rename-version", "Geef deze versie een eigen naam", "icon"));
      row.append(
        version.available
          ? button("Open", "open-version", `Open ${label}`, "primary small")
          : el("span", { class: "to-disabled-label", text: "Niet beschikbaar" })
      );

      row.dataset.courseKey = course.key;
      row.dataset.versionKey = key;
      row.dataset.year = version.year || "";
      return row;
    }

    renderSettingsModal() {
      const overlay = el("div", { class: "to-modal-overlay", "data-action": "close-settings-overlay" });
      const modal = el("div", { class: "to-modal", role: "dialog", "aria-modal": "true", "aria-label": "Instellingen" });
      modal.append(
        el("div", { class: "to-modal-head" }, [
          el("div", {}, [
            el("h2", { text: "Instellingen" }),
            el("p", { class: "to-muted", text: "Alles wordt lokaal in Edge bewaard. Toledo-login en cookies worden niet geëxporteerd." })
          ]),
          button("×", "close-settings", "Sluiten", "icon")
        ]),
        el("div", { class: "to-settings-grid" }, [
          this.settingsCard("Back-up", "Bewaar of herstel je groepen, kleuren, volgorde en standaardversies.", [
            button("Exporteer instellingen", "export-settings"),
            button("Importeer instellingen", "import-settings")
          ]),
          this.settingsCard("Debug", "Exporteer alleen de vakken die momenteel op Toledo gedetecteerd worden.", [
            button("Exporteer gedetecteerde vakken", "export-detected")
          ]),
          this.settingsCard("Reset", "Verwijder alleen Toledo Organizer-instellingen. Toledo zelf wordt niet aangepast.", [
            button("Reset Organizer", "reset-organizer", "", "danger")
          ])
        ]),
        el("input", {
          type: "file",
          accept: "application/json,.json",
          class: "to-file-input",
          "data-role": "import-file",
          hidden: true,
          style: "display:none!important"
        })
      );
      overlay.append(modal);
      setTimeout(() => modal.querySelector('[data-action="close-settings"]')?.focus(), 0);
      return overlay;
    }

    settingsCard(title, description, actions) {
      return el("section", { class: "to-settings-card" }, [
        el("h3", { text: title }),
        el("p", { text: description }),
        el("div", { class: "to-settings-actions" }, actions)
      ]);
    }

    async handleClick(event) {
      const actionEl = event.target.closest("[data-action]");
      if (!actionEl) return;
      const action = actionEl.dataset.action;

      // The backdrop itself closes the modal. Clicks inside the modal must not.
      if (action === "close-settings-overlay" && event.target !== actionEl) return;

      const courseEl = actionEl.closest("[data-course-key]");
      const courseKey = courseEl?.dataset.courseKey;
      const groupEl = actionEl.closest("[data-group-id]");
      const groupId = groupEl?.dataset.groupId;

      if (action === "view-organizer") return this.patchState({ viewMode: "organizer" });
      if (action === "view-original") return this.patchState({ viewMode: "original" });
      if (action === "mode-structure") return this.patchState({ organizerMode: "structure" });
      if (action === "mode-all") return this.patchState({ organizerMode: "all" });
      if (action === "toggle-edit-mode") return this.patchState({ editMode: !this.state.editMode });
      if (action === "settings") return this.updateUIState({ settingsOpen: true });
      if (action === "close-settings" || action === "close-settings-overlay") return this.updateUIState({ settingsOpen: false });
      if (action === "add-root-group") return this.createGroup(null);
      if (action === "add-subgroup") return this.createGroup(groupId);
      if (action === "rename-group") return this.renameGroup(groupId);
      if (action === "delete-group") return this.deleteGroup(groupId);
      if (action === "group-up") return this.reorderGroup(groupId, -1);
      if (action === "group-down") return this.reorderGroup(groupId, 1);
      if (action === "clear-group-color") return this.setGroupColor(groupId, null);
      if (action === "toggle-group") return this.toggleGroup(groupId);
      if (action === "toggle-course") return this.toggleCourse(courseKey);
      if (action === "toggle-hidden") return this.toggleHidden(courseKey);
      if (action === "rename-course") return this.renameCourse(courseKey);
      if (action === "clear-course-color") return this.setCourseColor(courseKey, null);
      if (action === "course-up") return this.reorderCourse(courseKey, -1);
      if (action === "course-down") return this.reorderCourse(courseKey, 1);
      if (action === "open-default") return this.openDefault(courseKey, event);
      if (action === "set-default-version") return this.setDefaultVersion(actionEl.closest(".to-version"));
      if (action === "rename-version") return this.renameVersion(actionEl.closest(".to-version"));
      if (action === "open-version") return this.openVersion(actionEl.closest(".to-version"), event);
      if (action === "export-settings") return this.exportSettings();
      if (action === "export-detected") return this.exportDetected();
      if (action === "import-settings") return this.root.querySelector('[data-role="import-file"]')?.click();
      if (action === "reset-organizer") return this.resetOrganizer();
    }

    handleInput(event) {
      if (event.target.matches('[data-role="search"]')) {
        this.state.search = event.target.value;
        clearTimeout(this.searchTimer);
        // Search is transient: re-render only, never persist.
        this.searchTimer = setTimeout(() => this.render(), 120);
      }
    }

    async handleChange(event) {
      if (event.target.matches('[data-role="show-hidden"]')) {
        return this.patchState({ showHidden: event.target.checked });
      }
      if (event.target.matches('[data-role="course-sort"]')) {
        return this.patchState({ courseSort: event.target.value });
      }
      if (event.target.matches('[data-role="group-color"]')) {
        const groupId = event.target.closest("[data-group-id]")?.dataset.groupId;
        return this.setGroupColor(groupId, event.target.value);
      }
      if (event.target.matches('[data-role="course-color"]')) {
        const courseKey = event.target.closest("[data-course-key]")?.dataset.courseKey;
        return this.setCourseColor(courseKey, event.target.value);
      }
      if (event.target.matches('[data-role="import-file"]')) {
        const file = event.target.files?.[0];
        if (!file) return;
        try {
          const value = JSON.parse(await file.text());
          const imported = NS.storage.validateImportedState(value);
          imported.ui = { ...(imported.ui || {}), settingsOpen: false };
          await this.setState(imported);
          this.toast("Instellingen geïmporteerd.");
        } catch (error) {
          alert(`Importeren mislukt: ${error.message}`);
        } finally {
          event.target.value = "";
        }
      }
    }

    handleDragStart(event) {
      if (!this.state.editMode) return;
      const dragEl = event.target.closest('[draggable="true"]');
      if (!dragEl) return;
      if (dragEl.dataset.dragType === "course") {
        this.dragData = { type: "course", key: dragEl.dataset.courseKey };
      } else if (dragEl.dataset.dragType === "group") {
        this.dragData = { type: "group", id: dragEl.dataset.groupId };
      } else {
        return;
      }
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", JSON.stringify(this.dragData));
      requestAnimationFrame(() => dragEl.classList.add("dragging"));
    }

    handleDragOver(event) {
      if (!this.dragData || !this.state.editMode) return;
      const zone = event.target.closest("[data-drop-type]");
      if (!zone) return;
      const type = zone.dataset.dropType;
      if (this.dragData.type === "course" && ["course-group", "group-target", "course-order"].includes(type)) {
        event.preventDefault();
        zone.classList.add("drop-active");
      }
      if (this.dragData.type === "group" && ["group-target", "root-groups"].includes(type)) {
        event.preventDefault();
        zone.classList.add("drop-active");
      }
    }

    handleDragLeave(event) {
      const zone = event.target.closest("[data-drop-type]");
      zone?.classList.remove("drop-active");
    }

    async handleDrop(event) {
      const zone = event.target.closest("[data-drop-type]");
      if (!zone || !this.dragData || !this.state.editMode) return;
      event.preventDefault();
      zone.classList.remove("drop-active");

      if (this.dragData.type === "course") {
        if (zone.dataset.dropType === "course-order") {
          const targetKey = zone.dataset.courseKey;
          const targetGroupId = zone.dataset.groupId || null;
          if (targetKey && targetKey !== this.dragData.key) {
            await this.reorderCourseBefore(this.dragData.key, targetKey, targetGroupId);
          }
        } else if (zone.dataset.dropType === "course-group" || zone.dataset.dropType === "group-target") {
          await this.moveCourse(this.dragData.key, zone.dataset.groupId || null);
        }
      } else if (this.dragData.type === "group") {
        if (zone.dataset.dropType === "root-groups") {
          await this.moveGroup(this.dragData.id, null);
        } else if (zone.dataset.dropType === "group-target") {
          await this.moveGroup(this.dragData.id, zone.dataset.groupId || null);
        }
      }

      this.dragData = null;
      this.clearDragStyles();
    }

    clearDragStyles() {
      this.root?.querySelectorAll(".dragging,.drop-active").forEach((node) => node.classList.remove("dragging", "drop-active"));
    }

    async updateUIState(patch) {
      await this.setState({ ...this.state, ui: { ...(this.state.ui || {}), ...patch } });
    }

    async createGroup(parentId) {
      const depth = parentId ? NS.matcher.groupDepth(parentId, this.state.groups) + 1 : 1;
      if (depth > 3) return alert("Maximaal 3 niveaus zijn toegestaan.");
      const name = prompt("Naam van de groep:");
      if (!name?.trim()) return;
      const siblings = this.state.groups.filter((g) => (g.parentId || null) === (parentId || null));
      const group = {
        id: `group-${crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)}`,
        name: name.trim(),
        parentId: parentId || null,
        order: siblings.length ? Math.max(...siblings.map((g) => g.order ?? 0)) + 1 : 0,
        collapsed: false,
        color: null
      };
      await this.patchState({ groups: [...this.state.groups, group] });
    }

    async renameGroup(groupId) {
      const group = this.state.groups.find((g) => g.id === groupId);
      if (!group) return;
      const name = prompt("Nieuwe groepsnaam:", group.name);
      if (!name?.trim()) return;
      const groups = this.state.groups.map((g) => (g.id === groupId ? { ...g, name: name.trim() } : g));
      await this.patchState({ groups });
    }

    async setGroupColor(groupId, color) {
      if (!groupId) return;
      const normalized = validColor(color) ? color : null;
      const groups = this.state.groups.map((g) => (g.id === groupId ? { ...g, color: normalized } : g));
      await this.patchState({ groups });
    }

    async deleteGroup(groupId) {
      const group = this.state.groups.find((g) => g.id === groupId);
      if (!group) return;
      const descendantIds = NS.matcher.descendants(groupId, this.state.groups);
      const removeIds = new Set([groupId, ...descendantIds]);
      const ok = confirm(`Groep “${group.name}”${descendantIds.size ? " en alle subgroepen" : ""} verwijderen? Vakken worden naar Niet ingedeeld verplaatst.`);
      if (!ok) return;
      const groups = this.state.groups.filter((g) => !removeIds.has(g.id));
      const courseSettings = { ...this.state.courseSettings };
      for (const [key, setting] of Object.entries(courseSettings)) {
        if (removeIds.has(setting.groupId)) courseSettings[key] = { ...setting, groupId: null };
      }
      await this.setState({ ...this.state, groups, courseSettings });
    }

    async reorderGroup(groupId, delta) {
      const group = this.state.groups.find((g) => g.id === groupId);
      if (!group) return;
      const siblings = this.state.groups
        .filter((g) => (g.parentId || null) === (group.parentId || null))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const index = siblings.findIndex((g) => g.id === groupId);
      const target = siblings[index + delta];
      if (!target) return;
      const groups = this.state.groups.map((g) => {
        if (g.id === group.id) return { ...g, order: target.order ?? index + delta };
        if (g.id === target.id) return { ...g, order: group.order ?? index };
        return g;
      });
      await this.patchState({ groups });
    }

    async toggleGroup(groupId) {
      const groups = this.state.groups.map((g) => (g.id === groupId ? { ...g, collapsed: !g.collapsed } : g));
      await this.patchState({ groups });
    }

    toggleCourse(courseKey) {
      if (this.expandedCourses.has(courseKey)) this.expandedCourses.delete(courseKey);
      else this.expandedCourses.add(courseKey);
      this.render();
    }

    async toggleHidden(courseKey) {
      const setting = this.courseSetting(courseKey);
      const courseSettings = {
        ...this.state.courseSettings,
        [courseKey]: { ...setting, hidden: !setting.hidden }
      };
      await this.patchState({ courseSettings });
    }

    async renameCourse(courseKey) {
      const course = this.findCourse(courseKey);
      if (!course) return;
      const setting = this.courseSetting(courseKey);
      const current = setting.customTitle || course.title;
      const name = prompt("Eigen naam voor dit vak (leeg = Toledo-naam):", current);
      if (name == null) return;
      const courseSettings = {
        ...this.state.courseSettings,
        [courseKey]: { ...setting, customTitle: name.trim() || null }
      };
      await this.patchState({ courseSettings });
    }

    async setCourseColor(courseKey, color) {
      if (!courseKey) return;
      const setting = this.courseSetting(courseKey);
      const courseSettings = {
        ...this.state.courseSettings,
        [courseKey]: { ...setting, color: validColor(color) ? color : null }
      };
      await this.patchState({ courseSettings });
    }

    findCourse(key) {
      return this.getCourses().find((c) => c.key === key);
    }

    navigateTo(href, event) {
      let url = null;
      try {
        url = new URL(href, location.href);
      } catch {
        url = null;
      }
      if (!url || url.origin !== location.origin) {
        this.toast("Deze link wijst naar een andere website en wordt niet geopend.");
        return;
      }
      if (event && (event.ctrlKey || event.metaKey)) window.open(url.href, "_blank", "noopener");
      else window.location.href = url.href;
    }

    openDefault(courseKey, event) {
      const course = this.findCourse(courseKey);
      if (!course) return;
      const version = NS.matcher.getDefaultVersion(course, this.courseSetting(courseKey));
      if (version?.available && version.href) {
        this.navigateTo(version.href, event);
      } else {
        this.expandedCourses.add(courseKey);
        this.render();
        this.toast(`De gekozen standaardversie is niet beschikbaar op Toledo (${institutionLabel(course)}).`);
      }
    }

    async setDefaultVersion(versionRow) {
      if (!versionRow) return;
      const courseKey = versionRow.dataset.courseKey;
      const year = versionRow.dataset.year || null;
      if (!year) return this.toast("Deze versie heeft geen academiejaar en kan niet als standaard worden vastgezet.");
      const setting = this.courseSetting(courseKey);
      const courseSettings = {
        ...this.state.courseSettings,
        [courseKey]: { ...setting, defaultVersion: year }
      };
      this.expandedCourses.add(courseKey);
      await this.patchState({ courseSettings });
    }

    async renameVersion(versionRow) {
      if (!versionRow) return;
      const course = this.findCourse(versionRow.dataset.courseKey);
      if (!course) return;
      const version = course.versions.find((v) => (v.year || v.rawId) === versionRow.dataset.versionKey);
      if (!version) return;
      const setting = this.courseSetting(course.key);
      const current = this.versionLabel(course, version);
      const name = prompt("Eigen naam voor deze versie (leeg = standaard jaartal):", current);
      if (name == null) return;
      const versionNames = { ...(setting.versionNames || {}) };
      const key = version.year || version.rawId;
      if (name.trim()) versionNames[key] = name.trim();
      else delete versionNames[key];
      const courseSettings = {
        ...this.state.courseSettings,
        [course.key]: { ...setting, versionNames }
      };
      this.expandedCourses.add(course.key);
      await this.patchState({ courseSettings });
    }

    openVersion(versionRow, event) {
      if (!versionRow) return;
      const course = this.findCourse(versionRow.dataset.courseKey);
      if (!course) return;
      const version = course.versions.find((v) => (v.year || v.rawId) === versionRow.dataset.versionKey);
      if (version?.available && version.href) this.navigateTo(version.href, event);
    }

    nextOrderForGroup(groupId, excludingKey = null) {
      const orders = this.getCourses()
        .filter((course) => course.key !== excludingKey && (this.courseSetting(course.key).groupId || null) === (groupId || null))
        .map((course) => this.courseSetting(course.key).order)
        .filter(Number.isFinite);
      return orders.length ? Math.max(...orders) + 1 : 0;
    }

    async moveCourse(courseKey, groupId) {
      const setting = this.courseSetting(courseKey);
      const target = groupId || null;
      const courseSettings = {
        ...this.state.courseSettings,
        [courseKey]: {
          ...setting,
          groupId: target,
          order: this.nextOrderForGroup(target, courseKey)
        }
      };
      await this.patchState({ courseSettings });
    }

    async reorderCourse(courseKey, delta) {
      const setting = this.courseSetting(courseKey);
      const groupId = setting.groupId || null;
      const siblings = this.sortCourses(
        this.getCourses().filter((course) => (this.courseSetting(course.key).groupId || null) === groupId)
      );
      const index = siblings.findIndex((course) => course.key === courseKey);
      const target = siblings[index + delta];
      if (!target) return;
      const targetSetting = this.courseSetting(target.key);
      const courseSettings = {
        ...this.state.courseSettings,
        [courseKey]: { ...setting, order: targetSetting.order },
        [target.key]: { ...targetSetting, order: setting.order }
      };
      await this.patchState({ courseSettings });
    }

    async reorderCourseBefore(sourceKey, targetKey, targetGroupId) {
      const source = this.findCourse(sourceKey);
      const target = this.findCourse(targetKey);
      if (!source || !target) return;
      const groupId = targetGroupId || null;
      const siblings = this.sortCourses(
        this.getCourses().filter(
          (course) => course.key !== sourceKey && (this.courseSetting(course.key).groupId || null) === groupId
        )
      );
      const targetIndex = Math.max(0, siblings.findIndex((course) => course.key === targetKey));
      siblings.splice(targetIndex, 0, source);

      const courseSettings = { ...this.state.courseSettings };
      siblings.forEach((course, index) => {
        courseSettings[course.key] = {
          ...this.courseSetting(course.key),
          groupId,
          order: index
        };
      });
      await this.patchState({ courseSettings });
    }

    async moveGroup(groupId, targetParentId) {
      if (!groupId || groupId === targetParentId) return;
      const group = this.state.groups.find((g) => g.id === groupId);
      if (!group) return;
      const descendants = NS.matcher.descendants(groupId, this.state.groups);
      if (targetParentId && descendants.has(targetParentId)) {
        return this.toast("Een groep kan niet in een eigen subgroep worden geplaatst.");
      }
      const targetDepth = targetParentId ? NS.matcher.groupDepth(targetParentId, this.state.groups) : 0;
      const subtreeDepth = this.maxSubtreeDepth(groupId);
      if (targetDepth + subtreeDepth > 3) {
        return this.toast("Deze verplaatsing zou meer dan 3 niveaus maken.");
      }
      const siblings = this.state.groups.filter((g) => (g.parentId || null) === (targetParentId || null) && g.id !== groupId);
      const nextOrder = siblings.length ? Math.max(...siblings.map((g) => g.order ?? 0)) + 1 : 0;
      const groups = this.state.groups.map((g) => (g.id === groupId ? { ...g, parentId: targetParentId || null, order: nextOrder } : g));
      await this.patchState({ groups });
    }

    maxSubtreeDepth(groupId) {
      const walk = (id) => {
        const children = this.state.groups.filter((g) => g.parentId === id);
        if (!children.length) return 1;
        return 1 + Math.max(...children.map((g) => walk(g.id)));
      };
      return walk(groupId);
    }

    async exportSettings() {
      try {
        await downloadJson("toledo-organizer-instellingen.json", NS.storage.exportState(this.state));
        this.toast("Instellingen geëxporteerd naar Downloads.");
      } catch (error) {
        console.error("[Toledo Organizer] Export mislukt", error);
        this.toast(`Export mislukt: ${error.message}`);
      }
    }

    async exportDetected() {
      const clean = this.getEnrollments().map((v) => ({
        title: v.title,
        originalTitle: v.originalTitle,
        rawId: v.rawId,
        stableKey: v.key,
        institution: v.institution,
        code: v.code,
        type: v.type,
        year: v.year,
        academicYear: v.academicYear,
        semester: v.semester,
        available: v.available,
        unavailable: v.unavailable,
        href: v.href
      }));
      try {
        await downloadJson(`toledo-detected-${new Date().toISOString().slice(0, 10)}.json`, clean);
        this.toast("Gedetecteerde vakken geëxporteerd naar Downloads.");
      } catch (error) {
        console.error("[Toledo Organizer] Debug-export mislukt", error);
        this.toast(`Export mislukt: ${error.message}`);
      }
    }

    async resetOrganizer() {
      const ok = confirm("Alle Toledo Organizer-instellingen resetten? Dit verandert niets aan Toledo zelf.");
      if (!ok) return;
      const fresh = await NS.storage.resetState();
      await this.setState(fresh);
      this.toast("Organizer is gereset.");
    }

    toast(message) {
      this.root.querySelector(".to-toast")?.remove();
      const toast = el("div", { class: "to-toast", text: message });
      this.root.append(toast);
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => toast.remove(), 3600);
    }
  }

  NS.ui = { OrganizerUI, downloadJson };
})();
