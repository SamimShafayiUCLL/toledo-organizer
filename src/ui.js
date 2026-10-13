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

  // Stroke icons (24px grid). Constant markup only; never interpolate page data into these.
  const ICONS = {
    chevron: '<path d="m6 9 6 6 6-6"/>',
    pencil: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>',
    settings:
      '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
    up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    down: '<path d="M12 5v14M18 13l-6 6-6-6"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.8"/>',
    eyeOff:
      '<path d="M3 3l18 18M10.6 5.6A9 9 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-2.9 3.7M6.4 6.9C3.9 8.6 2.5 12 2.5 12S6 18.5 12 18.5a8.8 8.8 0 0 0 4.3-1.1M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M9 7V4.5h6V7M6 7l1 13h10l1-13"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    reset: '<path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5"/><path d="M4 4v4.5h4.5"/>',
    star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9Z"/>',
    alert: '<path d="M12 9v4M12 16.5v.01"/><path d="M10.3 4.2 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z"/>',
    grip:
      '<circle cx="9" cy="6" r="1.2"/><circle cx="15" cy="6" r="1.2"/><circle cx="9" cy="12" r="1.2"/><circle cx="15" cy="12" r="1.2"/><circle cx="9" cy="18" r="1.2"/><circle cx="15" cy="18" r="1.2"/>',
    open: '<path d="M8 16 16 8M9 8h7v7"/>'
  };

  function icon(name, className = "") {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("class", `to-icon ${className}`.trim());
    svg.innerHTML = ICONS[name] || "";
    return svg;
  }

  function iconButton(name, action, title, className = "", label = "") {
    const node = el("button", {
      class: `to-btn ${label ? "with-icon" : "icon"} ${className}`.trim(),
      type: "button",
      "data-action": action,
      title,
      "aria-label": title
    });
    node.append(icon(name));
    if (label) node.append(el("span", { text: label }));
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
      this.dropTarget = null;
      this.expandTimer = null;
      this.flashKey = null;
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
      this.root.addEventListener("dragleave", (event) => {
        if (!this.root.contains(event.relatedTarget)) this.setDropTarget(null);
      });
      this.root.addEventListener("drop", (event) => this.handleDrop(event));
      this.root.addEventListener("dragend", () => {
        this.endDrag();
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
      const custom = this.courseSetting(course.key).customTitle;
      if (custom) return custom;
      // Toledo often repeats the code in the title ("Hematologie [E0I82a]"); the meta line already shows it.
      const suffix = course.code ? ` [${course.code}]` : "";
      const title = course.title || "";
      if (suffix && title.toLowerCase().endsWith(suffix.toLowerCase())) return title.slice(0, -suffix.length).trim() || title;
      return title;
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

      const editButton = iconButton(
        "pencil",
        "toggle-edit-mode",
        this.state.editMode ? "Bewerkmodus sluiten" : "Bewerk groepen, kleuren en volgorde",
        this.state.editMode ? "active" : "",
        this.state.editMode ? "Klaar" : "Bewerken"
      );

      header.append(brand, viewSwitch, editButton, iconButton("settings", "settings", "Instellingen", "ghost"));
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
      if (this.state.editMode) controls.append(iconButton("plus", "add-root-group", "Maak een hoofdgroep", "", "Nieuwe groep"));

      const hiddenInput = controls.querySelector('[data-role="show-hidden"]');
      hiddenInput.checked = Boolean(this.state.showHidden);
      this.root.append(controls);

      if (this.state.editMode) {
        this.root.append(
          el("div", { class: "to-edit-hint" }, [
            el("strong", { text: "Bewerkmodus" }),
            document.createTextNode(" Sleep vakken en groepen, klik op een bolletje om een kleur te kiezen. Klik op Klaar als je klaar bent.")
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
            el("span", { class: "to-group-title", text: "Niet ingedeeld" }),
            el("span", { class: "to-count", text: String(unassigned.length) }),
            el("span", { class: "to-group-hint", text: "Nieuwe vakken komen hier" })
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
        class: `to-group depth-${depth}${group.collapsed ? " collapsed" : ""}${this.flashGroupId === group.id ? " just-moved" : ""}`,
        "data-group-id": group.id,
        "data-drop-type": this.state.editMode ? "course-group" : null
      });

      const titleChildren = [];
      if (this.state.editMode) {
        const grip = el("span", { class: "to-group-drag", title: "Sleep om te verplaatsen", "aria-hidden": "true" });
        grip.append(icon("grip", "fill"));
        titleChildren.push(grip);
      }
      titleChildren.push(
        iconButton("chevron", "toggle-group", group.collapsed ? "Uitklappen" : "Inklappen", "ghost tiny to-chevron"),
        this.swatch("group-color", group.color, "Kleur van groep"),
        el("span", { class: "to-group-title", "data-action": "toggle-group", text: group.name }),
        el("span", { class: "to-count", text: String(groupCourses.length + descendantCourseCount) })
      );

      const actions = el("div", { class: "to-group-actions" });
      if (this.state.editMode) {
        if (depth < 3) actions.append(iconButton("plus", "add-subgroup", "Voeg een subgroep toe", "ghost small", "Subgroep"));
        actions.append(
          ...[
            iconButton("up", "group-up", "Verplaats omhoog", "ghost tiny"),
            iconButton("down", "group-down", "Verplaats omlaag", "ghost tiny"),
            iconButton("pencil", "rename-group", "Hernoem groep", "ghost tiny"),
            hasColor ? iconButton("reset", "clear-group-color", "Verwijder groepskleur", "ghost tiny") : null,
            iconButton("trash", "delete-group", "Verwijder groep", "ghost tiny danger")
          ].filter(Boolean)
        );
      }

      const header = el(
        "div",
        {
          class: "to-group-header",
          "data-drop-type": this.state.editMode ? "group-target" : null,
          "data-drag-type": this.state.editMode ? "group" : null,
          draggable: this.state.editMode ? true : null,
          "data-group-id": group.id
        },
        [el("div", { class: "to-group-title-wrap" }, titleChildren.filter(Boolean)), actions]
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

    // Colour marker: a plain dot when browsing, a clickable colour input in edit mode.
    swatch(role, value, title) {
      const hasColor = validColor(value);
      if (!this.state.editMode) {
        // An empty slot keeps titles aligned whether or not a colour is set.
        return el("span", { class: `to-dot${hasColor ? "" : " is-none"}`, style: colorStyle(value), "aria-hidden": "true" });
      }
      return el("input", {
        class: `to-color-picker${hasColor ? "" : " is-empty"}`,
        type: "color",
        value: hasColor ? value : "#244b8f",
        "data-role": role,
        title: hasColor ? title : `${title} kiezen`
      });
    }

    renderCourse(course, groupId) {
      const setting = this.courseSetting(course.key);
      const defaultVersion = NS.matcher.getDefaultVersion(course, setting);
      const newestVersion = course.versions[0] || null;
      const expanded = this.expandedCourses.has(course.key);
      const hasColor = validColor(setting.color);
      const card = el("article", {
        class: `to-course${setting.hidden ? " is-hidden" : ""}${expanded ? " is-expanded" : ""}`,
        "data-course-key": course.key,
        "data-group-id": groupId || "",
        "data-drop-type": this.state.editMode && this.state.organizerMode === "structure" ? "course-order" : null
      });
      if (this.state.editMode && this.state.organizerMode === "structure") {
        card.draggable = true;
        card.dataset.dragType = "course";
      }
      if (this.flashKey === course.key) card.classList.add("just-moved");

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
        const status = el("div", {
          class: "to-course-status warning",
          title: "Toledo markeert deze cursusversie momenteel als niet beschikbaar."
        });
        status.append(
          icon("alert"),
          el("span", {
            text: `${this.versionLabel(course, newestVersion)} is niet beschikbaar op Toledo (${institutionLabel(newestVersion)}).`
          })
        );
        mainChildren.push(status);
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
      if (this.state.editMode) {
        if (this.state.organizerMode === "structure" && this.state.courseSort === "custom") {
          actions.append(
            iconButton("up", "course-up", "Vak omhoog", "ghost tiny"),
            iconButton("down", "course-down", "Vak omlaag", "ghost tiny")
          );
        }
        actions.append(
          ...[
            iconButton("pencil", "rename-course", "Geef het vak een eigen naam", "ghost tiny"),
            hasColor ? iconButton("reset", "clear-course-color", "Verwijder vakkleur", "ghost tiny") : null,
            iconButton(
              setting.hidden ? "eye" : "eyeOff",
              "toggle-hidden",
              setting.hidden ? "Maak opnieuw zichtbaar" : "Verberg vak",
              "ghost tiny"
            )
          ].filter(Boolean)
        );
      }
      actions.append(
        iconButton("chevron", "toggle-course", expanded ? "Verberg academiejaren" : "Toon academiejaren", "ghost tiny to-chevron")
      );

      const headChildren = [];
      if (this.state.editMode) {
        const grip = el("span", { class: "to-drag-handle", title: "Sleep om te verplaatsen", "aria-hidden": "true" });
        grip.append(icon("grip", "fill"));
        headChildren.push(grip);
      }
      headChildren.push(
        this.swatch("course-color", setting.color, "Kleur van vak"),
        el("div", { class: "to-course-main" }, mainChildren),
        actions
      );
      card.append(el("div", { class: "to-course-head" }, headChildren.filter(Boolean)));

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
        row.append(
          iconButton(
            "star",
            "set-default-version",
            isDefault ? "Standaardversie" : "Maak standaardversie",
            `ghost tiny to-star${isDefault ? " is-default" : ""}`
          )
        );
      } else {
        const slot = el("span", { class: "to-default-star", title: isDefault ? "Standaardversie" : null });
        if (isDefault) slot.append(icon("star", "fill"));
        row.append(slot);
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

      if (this.state.editMode) row.append(iconButton("pencil", "rename-version", "Geef deze versie een eigen naam", "ghost tiny"));
      row.append(
        version.available
          ? iconButton("open", "open-version", `Open ${label}`, "small", "Openen")
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
          iconButton("close", "close-settings", "Sluiten", "ghost")
        ]),
        el("div", { class: "to-settings-grid" }, [
          this.settingsCard("Back-up", "Bewaar of herstel je groepen, kleuren, volgorde en standaardversies.", [
            button("Exporteer instellingen", "export-settings"),
            button("Importeer instellingen", "import-settings")
          ]),
          this.settingsCard("Debug", "Exporteer alleen de vakken die momenteel op Toledo gedetecteerd worden.", [
            button("Exporteer gedetecteerde vakken", "export-detected")
          ]),
          this.settingsCard("Uiterlijk", "Geef heel Toledo een rustiger, moderner uiterlijk dat bij de organizer past.", [
            button(
              this.state.themeEnabled === false ? "Toledo-thema aanzetten" : "Toledo-thema uitzetten",
              "toggle-theme",
              "",
              this.state.themeEnabled === false ? "primary" : ""
            )
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
      if (action === "toggle-theme") return this.patchState({ themeEnabled: this.state.themeEnabled === false });
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
      const dragEl = event.target.closest?.('[draggable="true"]');
      if (!dragEl || !this.root.contains(dragEl)) return;
      if (dragEl.dataset.dragType === "course") {
        this.dragData = { type: "course", key: dragEl.dataset.courseKey, fromGroup: dragEl.dataset.groupId || null };
      } else if (dragEl.dataset.dragType === "group") {
        this.dragData = { type: "group", id: dragEl.dataset.groupId };
      } else {
        return;
      }
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", JSON.stringify(this.dragData));
      const source = this.dragData.type === "group" ? dragEl.closest(".to-group") : dragEl;
      requestAnimationFrame(() => {
        source?.classList.add("dragging");
        this.root.classList.add("is-dragging");
      });
    }

    // Works out what a drop at the pointer would do: insert before/after a course, or move into a group.
    resolveDrop(event) {
      const zone = event.target.closest?.("[data-drop-type]");
      const drag = this.dragData;
      if (drag.type === "group") return this.resolveGroupDrop(event);
      if (!zone || !this.root.contains(zone)) return null;
      const type = zone.dataset.dropType;

      if (drag.type === "course") {
        if (type === "course-order") {
          if (zone.dataset.courseKey === drag.key) return null;
          if (this.state.courseSort !== "custom") {
            // Alphabetical view: order is automatic, so a course row just means "this group".
            return this.groupDrop(zone.closest('[data-drop-type="course-group"]'));
          }
          // Measure against the title row so an expanded course (with its versions below) still splits sensibly.
          const rect = (zone.querySelector(".to-course-head") || zone).getBoundingClientRect();
          const position = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
          return {
            el: zone,
            cls: `drop-${position}`,
            kind: "order",
            position,
            targetKey: zone.dataset.courseKey,
            groupId: zone.dataset.groupId || null
          };
        }
        if (type === "group-target") return this.groupDrop(zone.closest(".to-group"));
        if (type === "course-group") return this.groupDrop(zone);
        return null;
      }

      return null;
    }

    // Group drags: top of a header = before it, middle = inside it, bottom = after it
    // (bottom only when the group is closed; for an open group "after" is its bottom edge).
    resolveGroupDrop(event) {
      const drag = this.dragData;
      const target = event.target;
      const dropzone = target.closest?.('[data-drop-type="root-groups"]');
      if (dropzone) return { el: dropzone, cls: "drop-into", kind: "group-into", groupId: null };

      const header = target.closest?.(".to-group-header");
      if (header && this.root.contains(header)) {
        const section = header.closest(".to-group");
        if (section.classList.contains("to-unassigned")) return this.groupGapDrop(event);
        const rect = header.getBoundingClientRect();
        const rel = (event.clientY - rect.top) / rect.height;
        const open = !section.classList.contains("collapsed");
        if (rel < 0.33) return this.groupLineDrop(section, "before");
        if (rel > 0.67 && !open) return this.groupLineDrop(section, "after");
        return this.groupIntoDrop(section) || this.groupLineDrop(section, rel < 0.5 ? "before" : "after");
      }

      const section = target.closest?.(".to-group");
      if (section && !section.classList.contains("to-unassigned") && this.root.contains(section)) {
        const rect = section.getBoundingClientRect();
        return event.clientY > rect.bottom - 14 ? this.groupLineDrop(section, "after") : null;
      }
      if (target.closest?.(".to-structure")) return this.groupGapDrop(event);
      return null;
    }

    // Pointer between top-level cards (or on "Niet ingedeeld"): place relative to the nearest root group.
    groupGapDrop(event) {
      const roots = [...this.root.querySelectorAll(".to-structure > .to-group.depth-1")];
      const next = roots.find((section) => event.clientY < section.getBoundingClientRect().top + 8);
      if (next) return this.groupLineDrop(next, "before");
      return roots.length ? this.groupLineDrop(roots[roots.length - 1], "after") : null;
    }

    canPlaceGroup(groupId, parentId) {
      if (!parentId) return this.maxSubtreeDepth(groupId) <= 3;
      if (parentId === groupId || NS.matcher.descendants(groupId, this.state.groups).has(parentId)) return false;
      return NS.matcher.groupDepth(parentId, this.state.groups) + this.maxSubtreeDepth(groupId) <= 3;
    }

    groupLineDrop(section, position) {
      const refId = section.dataset.groupId;
      if (!refId || refId === this.dragData.id) return null;
      const ref = this.state.groups.find((g) => g.id === refId);
      if (!ref || !this.canPlaceGroup(this.dragData.id, ref.parentId || null)) return null;
      return { el: section, line: position, kind: "group-line", position, refId, groupId: ref.parentId || null };
    }

    groupIntoDrop(section) {
      const groupId = section.dataset.groupId;
      if (!groupId || !this.canPlaceGroup(this.dragData.id, groupId)) return null;
      return { el: section, cls: "drop-into", kind: "group-into", groupId };
    }

    groupDrop(section) {
      if (!section) return null;
      return { el: section, cls: "drop-into", kind: "into", groupId: section.dataset.groupId || null };
    }

    setDropTarget(target) {
      const prev = this.dropTarget;
      if (!(prev && target && prev.el === target.el && prev.cls === target.cls && prev.line === target.line)) {
        if (prev?.cls) prev.el.classList.remove(prev.cls);
        if (target?.cls) target.el.classList.add(target.cls);
        this.dropTarget = target;
      }
      this.placeDropLine(target?.line ? target : null);
    }

    // A group's insertion line lives outside the group (between cards), so it is a positioned element, not a pseudo.
    placeDropLine(target) {
      if (!target) {
        this.dropLine?.remove();
        return;
      }
      if (!this.dropLine) this.dropLine = el("div", { class: "to-drop-line", "aria-hidden": "true" });
      if (!this.dropLine.isConnected) this.root.append(this.dropLine);
      const rootRect = this.root.getBoundingClientRect();
      const rect = target.el.getBoundingClientRect();
      const outside = target.el.classList.contains("depth-1") ? 6 : 0;
      const y = target.line === "before" ? rect.top - outside - 1 : rect.bottom + outside - 1;
      const indent = parseFloat(getComputedStyle(target.el).getPropertyValue("--to-indent")) || 0;
      this.dropLine.style.top = `${y - rootRect.top}px`;
      this.dropLine.style.left = `${rect.left - rootRect.left + indent + 8}px`;
      this.dropLine.style.width = `${Math.max(40, rect.width - indent - 16)}px`;
    }

    handleDragOver(event) {
      if (!this.dragData || !this.state.editMode) return;
      this.autoScroll(event.clientY);
      const target = this.resolveDrop(event);
      this.setDropTarget(target);
      if (!target) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      this.scheduleAutoExpand(target);
    }

    autoScroll(clientY) {
      const edge = 70;
      if (clientY < edge) window.scrollBy(0, -Math.ceil((edge - clientY) / 4));
      else if (clientY > window.innerHeight - edge) window.scrollBy(0, Math.ceil((clientY - (window.innerHeight - edge)) / 4));
    }

    // Hovering a collapsed group opens it (visually only, until the drop) so you can drop between its courses.
    scheduleAutoExpand(target) {
      const section = target.kind === "into" || target.kind === "group-into" ? target.el : null;
      const collapsed = section?.classList.contains("collapsed") ? section : null;
      if (this.expandTimer?.section === collapsed) return;
      clearTimeout(this.expandTimer?.id);
      this.expandTimer = null;
      if (!collapsed) return;
      const id = setTimeout(() => {
        collapsed.classList.remove("collapsed");
        collapsed.dataset.autoExpanded = "1";
      }, 650);
      this.expandTimer = { id, section: collapsed };
    }

    async handleDrop(event) {
      if (!this.dragData || !this.state.editMode) return;
      const target = this.resolveDrop(event) || this.dropTarget;
      if (!target) return this.endDrag();
      event.preventDefault();
      const drag = this.dragData;
      const expandedIds = [...this.root.querySelectorAll('[data-auto-expanded="1"]')].map((node) => node.dataset.groupId);
      this.endDrag();

      if (drag.type === "course") {
        if (target.kind === "order") {
          await this.placeCourse(drag.key, target.groupId, target.targetKey, target.position, expandedIds);
        } else if (target.kind === "into") {
          await this.placeCourse(drag.key, target.groupId, null, "end", expandedIds);
        }
      } else if (drag.type === "group") {
        if (target.kind === "group-into") await this.placeGroup(drag.id, target.groupId, null, "end", expandedIds);
        else if (target.kind === "group-line") await this.placeGroup(drag.id, target.groupId, target.refId, target.position);
      }
    }

    endDrag() {
      clearTimeout(this.expandTimer?.id);
      this.expandTimer = null;
      this.setDropTarget(null);
      this.dropLine?.remove();
      this.dragData = null;
      this.clearDragStyles();
    }

    clearDragStyles() {
      this.root?.classList.remove("is-dragging");
      this.root
        ?.querySelectorAll(".dragging,.drop-into,.drop-before,.drop-after")
        .forEach((node) => node.classList.remove("dragging", "drop-into", "drop-before", "drop-after"));
      // Groups opened only for the drag close again unless something was dropped into them.
      this.root?.querySelectorAll('[data-auto-expanded="1"]').forEach((node) => {
        node.classList.add("collapsed");
        delete node.dataset.autoExpanded;
      });
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
      await this.placeGroup(groupId, group.parentId || null, target.id, delta < 0 ? "before" : "after");
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
      // Toledo course links redirect via other KU Leuven hosts (e.g. icts-p-toledo-journey.cloud.icts.kuleuven.be),
      // so allow https links on KU Leuven / UCLL domains, not just this origin.
      const trusted = /(^|\.)(kuleuven\.be|kuleuven\.cloud|ucll\.be)$/i;
      if (!url || url.protocol !== "https:" || !trusted.test(url.hostname)) {
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

    async reorderCourse(courseKey, delta) {
      const setting = this.courseSetting(courseKey);
      const groupId = setting.groupId || null;
      const siblings = this.sortCourses(
        this.getCourses().filter((course) => (this.courseSetting(course.key).groupId || null) === groupId)
      );
      const index = siblings.findIndex((course) => course.key === courseKey);
      const target = siblings[index + delta];
      if (!target) return;
      // Renumbers the whole group, so duplicate order values can't make the swap a no-op.
      await this.placeCourse(courseKey, groupId, target.key, delta < 0 ? "before" : "after");
    }

    // Moves a course into groupId, before/after targetKey or at the end, and renumbers that group.
    async placeCourse(sourceKey, targetGroupId, targetKey, position, expandGroupIds = []) {
      const source = this.findCourse(sourceKey);
      if (!source) return;
      const groupId = targetGroupId || null;
      const fromGroupId = this.courseSetting(sourceKey).groupId || null;
      const siblings = this.sortCourses(
        this.getCourses().filter(
          (course) => course.key !== sourceKey && (this.courseSetting(course.key).groupId || null) === groupId
        )
      );
      let index = siblings.length;
      if (targetKey) {
        const targetIndex = siblings.findIndex((course) => course.key === targetKey);
        if (targetIndex >= 0) index = position === "after" ? targetIndex + 1 : targetIndex;
      }
      siblings.splice(index, 0, source);

      const courseSettings = { ...this.state.courseSettings };
      siblings.forEach((course, order) => {
        courseSettings[course.key] = { ...this.courseSetting(course.key), groupId, order };
      });
      const groups = expandGroupIds.length
        ? this.state.groups.map((g) => (expandGroupIds.includes(g.id) && g.id === groupId ? { ...g, collapsed: false } : g))
        : this.state.groups;

      this.flash(sourceKey);
      await this.patchState({ courseSettings, groups });
      if (fromGroupId !== groupId) {
        const name = groupId ? this.state.groups.find((g) => g.id === groupId)?.name : "Niet ingedeeld";
        this.toast(`${this.courseTitle(source)} verplaatst naar ${name || "groep"}.`);
      }
    }

    flash(courseKey) {
      this.flashKey = courseKey;
      clearTimeout(this.flashTimer);
      this.flashTimer = setTimeout(() => {
        this.flashKey = null;
      }, 1200);
    }

    // Moves a group under parentId, before/after refId or at the end, and renumbers its new siblings.
    async placeGroup(groupId, parentId, refId = null, position = "end", expandGroupIds = []) {
      const group = this.state.groups.find((g) => g.id === groupId);
      if (!group) return;
      const parent = parentId || null;
      if (parent && (parent === groupId || NS.matcher.descendants(groupId, this.state.groups).has(parent))) {
        return this.toast("Een groep kan niet in een eigen subgroep worden geplaatst.");
      }
      if (!this.canPlaceGroup(groupId, parent)) return this.toast("Deze verplaatsing zou meer dan 3 niveaus maken.");

      const siblings = this.state.groups
        .filter((g) => (g.parentId || null) === parent && g.id !== groupId)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      let index = siblings.length;
      if (refId) {
        const refIndex = siblings.findIndex((g) => g.id === refId);
        if (refIndex >= 0) index = position === "after" ? refIndex + 1 : refIndex;
      }
      siblings.splice(index, 0, group);
      const order = new Map(siblings.map((g, i) => [g.id, i]));

      const groups = this.state.groups.map((g) => {
        let next = g;
        if (g.id === groupId) next = { ...g, parentId: parent };
        if (order.has(g.id)) next = { ...next, order: order.get(g.id) };
        if (g.id === parent && expandGroupIds.includes(g.id)) next = { ...next, collapsed: false };
        return next;
      });
      this.flashGroup(groupId);
      await this.patchState({ groups });
    }

    flashGroup(groupId) {
      this.flashGroupId = groupId;
      clearTimeout(this.flashGroupTimer);
      this.flashGroupTimer = setTimeout(() => {
        this.flashGroupId = null;
      }, 1200);
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
