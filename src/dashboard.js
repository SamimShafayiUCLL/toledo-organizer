(() => {
  const NS = (window.ToledoOrganizer = window.ToledoOrganizer || {});
  const DASH_ID = "to-dashboard";
  const MAX_UPCOMING = 6;
  const TRUSTED_HOST = /(^|\.)(kuleuven\.be|kuleuven\.cloud|ucll\.be)$/i;
  const WEEKDAYS = ["zo", "ma", "di", "wo", "do", "vr", "za"];
  const MONTHS = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
  // Toledo's course colour classes (color-N) -> hex.
  const PALETTE = {
    1: "#90514e",
    2: "#c66f48",
    3: "#d92d2d",
    4: "#f26d50",
    5: "#d39425",
    7: "#dec586",
    8: "#f2cf3b",
    9: "#5a9b4f",
    10: "#7abf1e",
    11: "#1e7069",
    12: "#32c3b5",
    13: "#4a6d88",
    15: "#915ed0",
    16: "#d2649d"
  };

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value == null) continue;
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else if (key === "type") node.type = value;
      else if (key === "title") node.title = value;
      else if (key === "placeholder") node.placeholder = value;
      else if (key === "value") node.value = value;
      else node.setAttribute(key, value);
    }
    for (const child of Array.isArray(children) ? children : [children]) {
      if (child == null) continue;
      node.append(child.nodeType ? child : document.createTextNode(String(child)));
    }
    return node;
  }

  // ---- date helpers (all local time) ----
  const pad = (n) => String(n).padStart(2, "0");
  const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const startOfToday = () => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  };
  function fromISO(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const dayDiff = (a, b) => Math.round((a - b) / 86400000);

  function dueLabel(iso, today = startOfToday()) {
    const date = fromISO(iso);
    if (!date) return "";
    const diff = dayDiff(date, today);
    if (diff === 0) return "Vandaag";
    if (diff === 1) return "Morgen";
    if (diff === -1) return "Gisteren";
    const short = `${date.getDate()} ${MONTHS[date.getMonth()]}`;
    if (diff >= 2 && diff <= 6) return `${WEEKDAYS[date.getDay()]} ${short}`;
    return date.getFullYear() === today.getFullYear() ? short : `${short} ${date.getFullYear()}`;
  }

  function relativeLabel(diff) {
    if (diff <= 0) return "vandaag";
    if (diff === 1) return "morgen";
    return `over ${diff} dagen`;
  }

  function newId() {
    return `task-${crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)}`;
  }

  function sortTasks(tasks) {
    const open = tasks.filter((t) => !t.done);
    const done = tasks.filter((t) => t.done);
    open.sort((a, b) => {
      if (a.due !== b.due) {
        if (!a.due) return 1;
        if (!b.due) return -1;
        return a.due < b.due ? -1 : 1;
      }
      return (a.createdAt || 0) - (b.createdAt || 0);
    });
    done.sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
    return [...open, ...done];
  }

  // ---- upcoming items scraped from Toledo's "Updates en communicatie" feed ----
  function colorOf(eventNode) {
    const holder = /\bcolor-\d+\b/.test(eventNode.className) ? eventNode : eventNode.querySelector('[class*="color-"]');
    const match = /\bcolor-(\d+)\b/.exec(holder?.className || "");
    return (match && PALETTE[Number(match[1])]) || null;
  }

  function safeHref(raw) {
    if (!raw) return null;
    try {
      const url = new URL(raw, location.href);
      return url.protocol === "https:" && TRUSTED_HOST.test(url.hostname) ? url.href : null;
    } catch {
      return null;
    }
  }

  function scanUpcoming(today = startOfToday()) {
    const seen = new Set();
    const items = [];
    document.querySelectorAll(".tol-events-widget .tol-event").forEach((node) => {
      const dateText = node.querySelector(".tol-date")?.textContent || "";
      const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(dateText);
      if (!m) return;
      const date = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
      if (Number.isNaN(date.getTime()) || date < today) return;
      const title = (node.querySelector(".tol-title")?.textContent || "").replace(/\s+/g, " ").trim();
      if (!title) return;
      const iso = toISO(date);
      const dedupe = `${title}|${iso}`;
      if (seen.has(dedupe)) return;
      seen.add(dedupe);
      items.push({
        title,
        iso,
        date,
        course: (node.querySelector(".tol-source")?.textContent || "").replace(/\s+/g, " ").trim(),
        href: safeHref(node.querySelector("a")?.getAttribute("href")),
        color: colorOf(node)
      });
    });
    items.sort((a, b) => a.date - b.date);
    return items.slice(0, MAX_UPCOMING);
  }

  const upcomingSignature = (items) => `${toISO(startOfToday())}#${items.map((i) => `${i.title}|${i.iso}|${i.href || ""}|${i.color || ""}`).join("\n")}`;

  function iconNode(name) {
    return NS.ui?.icon ? NS.ui.icon(name) : document.createTextNode(name === "plus" ? "+" : "×");
  }

  class Dashboard {
    constructor({ getState, setState, getCourses }) {
      this.getState = getState;
      this.setState = setState;
      this.getCourses = getCourses;
      this.section = null;
      this.signature = null;
    }

    isMounted() {
      return Boolean(this.section && this.section.isConnected);
    }

    mount(container) {
      if (!container) return;
      let section = document.getElementById(DASH_ID);
      if (!section) section = el("section", { id: DASH_ID, class: "to-dash" });
      if (container.firstElementChild !== section) container.insertBefore(section, container.firstChild);
      this.section = section;
      this.bindEvents();
      this.render();
    }

    bindEvents() {
      const section = this.section;
      if (section.dataset.bound === "1") return;
      section.dataset.bound = "1";
      section.addEventListener("submit", (event) => {
        if (!event.target.matches(".to-task-form")) return;
        event.preventDefault();
        this.addFromForm(event.target);
      });
      section.addEventListener("change", (event) => {
        if (!event.target.matches('[data-role="task-done"]')) return;
        const id = event.target.closest("[data-task-id]")?.dataset.taskId;
        this.toggleTask(id, event.target.checked);
      });
      section.addEventListener("click", (event) => {
        const actionEl = event.target.closest("[data-action]");
        if (!actionEl || !section.contains(actionEl)) return;
        const action = actionEl.dataset.action;
        if (action === "delete-task") {
          const id = actionEl.closest("[data-task-id]")?.dataset.taskId;
          this.patchTasks((tasks) => tasks.filter((t) => t.id !== id));
        } else if (action === "clear-done") {
          this.patchTasks((tasks) => tasks.filter((t) => !t.done));
        } else if (action === "upcoming-to-task") {
          this.upcomingToTask(Number(actionEl.closest("[data-upcoming-index]")?.dataset.upcomingIndex));
        }
      });
    }

    tasks() {
      return this.getState()?.tasks || [];
    }

    patchTasks(fn) {
      return this.setState({ tasks: fn(this.tasks()) });
    }

    addFromForm(form) {
      const textInput = form.querySelector('[data-role="task-text"]');
      const dueInput = form.querySelector('[data-role="task-due"]');
      const text = textInput.value.trim().slice(0, 300);
      if (!text) return;
      const due = /^\d{4}-\d{2}-\d{2}$/.test(dueInput.value) ? dueInput.value : null;
      textInput.value = "";
      dueInput.value = "";
      this.patchTasks((tasks) => [...tasks, { id: newId(), text, done: false, due, tag: null, createdAt: Date.now(), doneAt: null }]);
      textInput.focus({ preventScroll: true });
    }

    toggleTask(id, done) {
      this.patchTasks((tasks) => tasks.map((t) => (t.id === id ? { ...t, done, doneAt: done ? Date.now() : null } : t)));
    }

    upcomingToTask(index) {
      const item = this.currentUpcoming?.[index];
      if (!item) return;
      const text = item.title.slice(0, 300);
      if (this.tasks().some((t) => !t.done && t.text === text && t.due === item.iso)) return;
      const tag = item.course ? item.course.slice(0, 120) : null;
      this.patchTasks((tasks) => [...tasks, { id: newId(), text, done: false, due: item.iso, tag, createdAt: Date.now(), doneAt: null }]);
    }

    // Re-renders only when the scraped feed (or the date) changed. Cheap enough for every scan.
    refreshIfChanged() {
      if (!this.isMounted()) return;
      if (upcomingSignature(scanUpcoming()) !== this.signature) this.render();
    }

    render() {
      if (!this.section) return;
      const state = this.getState();
      if (!state) return;
      const dash = state.dashboard || {};

      const active = document.activeElement;
      const taskInputFocus =
        active?.matches?.('[data-role="task-text"]') && this.section.contains(active)
          ? { start: active.selectionStart, end: active.selectionEnd }
          : null;
      const draft = {
        text: this.section.querySelector('[data-role="task-text"]')?.value || "",
        due: this.section.querySelector('[data-role="task-due"]')?.value || ""
      };

      const upcoming = scanUpcoming();
      this.currentUpcoming = upcoming;
      this.signature = upcomingSignature(upcoming);

      this.section.textContent = "";
      if (dash.showTasks !== false) this.section.append(this.renderTasks(state, draft));
      if (dash.showUpcoming !== false) this.section.append(this.renderUpcoming(upcoming));

      if (taskInputFocus) {
        const input = this.section.querySelector('[data-role="task-text"]');
        if (input) {
          input.focus({ preventScroll: true });
          input.setSelectionRange(taskInputFocus.start, taskInputFocus.end);
        }
      }
    }

    renderTasks(state, draft) {
      const today = startOfToday();
      const todayISO = toISO(today);
      const tasks = sortTasks(state.tasks || []);
      const openCount = tasks.filter((t) => !t.done).length;
      const hasDone = tasks.some((t) => t.done);

      const actions = el("div", { class: "to-dash-head-actions" });
      if (hasDone) actions.append(el("button", { class: "to-btn ghost small", type: "button", "data-action": "clear-done", text: "Afgewerkte wissen" }));

      const form = el("form", { class: "to-task-form" }, [
        el("input", {
          class: "to-task-input",
          type: "text",
          placeholder: "Nieuwe taak…",
          maxlength: "300",
          "aria-label": "Nieuwe taak",
          "data-role": "task-text",
          autocomplete: "off",
          value: draft.text
        }),
        el("input", { class: "to-task-date", type: "date", "data-role": "task-due", "aria-label": "Deadline", value: draft.due }),
        el("button", { class: "to-btn primary small", type: "submit", text: "Toevoegen" })
      ]);

      const card = el("div", { class: "to-dash-card to-tasks" }, [
        el("div", { class: "to-dash-head" }, [
          el("h3", { class: "to-dash-title", text: "Taken" }),
          el("span", { class: "to-count", text: String(openCount) }),
          actions
        ]),
        form
      ]);

      const list = el("ul", { class: "to-task-list" });
      for (const task of tasks) list.append(this.renderTask(task, todayISO));
      card.append(list);
      if (!tasks.length) card.append(el("div", { class: "to-dash-empty", text: "Nog geen taken. Typ hierboven en druk op Enter." }));
      return card;
    }

    renderTask(task, todayISO) {
      const classes = ["to-task"];
      if (task.done) classes.push("is-done");
      else if (task.due && task.due < todayISO) classes.push("is-overdue");
      else if (task.due === todayISO) classes.push("is-today");

      const check = el("input", { type: "checkbox", "data-role": "task-done", "aria-label": task.text });
      check.checked = task.done;
      const main = el("div", { class: "to-task-main" }, [el("span", { class: "to-task-text", text: task.text })]);
      if (task.due || task.tag) {
        const meta = el("span", { class: "to-task-meta" });
        if (task.due) meta.append(el("span", { class: "to-task-due", text: dueLabel(task.due) }));
        if (task.due && task.tag) meta.append(document.createTextNode(" · "));
        if (task.tag) meta.append(el("span", { class: "to-task-tag", text: task.tag }));
        main.append(meta);
      }
      const del = el("button", {
        class: "to-btn ghost tiny icon to-task-delete",
        type: "button",
        "data-action": "delete-task",
        title: "Verwijder taak",
        "aria-label": "Verwijder taak"
      });
      del.append(iconNode("trash"));
      return el("li", { class: classes.join(" "), "data-task-id": task.id }, [
        el("label", { class: "to-task-check" }, [check, el("span", { class: "to-task-box" })]),
        main,
        del
      ]);
    }

    renderUpcoming(items) {
      const today = startOfToday();
      const card = el("div", { class: "to-dash-card to-upcoming" }, [
        el("div", { class: "to-dash-head" }, [
          el("h3", { class: "to-dash-title", text: "Binnenkort" }),
          el("span", { class: "to-count", text: String(items.length) })
        ])
      ]);
      if (!items.length) {
        card.append(el("div", { class: "to-dash-empty", text: "Geen deadlines gevonden in je updates." }));
        return card;
      }
      const list = el("ul", { class: "to-upcoming-list" });
      items.forEach((item, index) => {
        const diff = dayDiff(item.date, today);
        const dot = item.color
          ? el("span", { class: "to-dot", style: `--to-item-color:${item.color}`, "aria-hidden": "true" })
          : el("span", { class: "to-dot is-none", "aria-hidden": "true" });
        const title = item.href
          ? el("a", { class: "to-upcoming-title", href: item.href, text: item.title })
          : el("span", { class: "to-upcoming-title", text: item.title });
        const meta = [item.course, relativeLabel(diff)].filter(Boolean).join(" · ");
        const add = el("button", {
          class: "to-btn ghost tiny icon",
          type: "button",
          "data-action": "upcoming-to-task",
          title: "Als taak toevoegen",
          "aria-label": "Als taak toevoegen"
        });
        add.append(iconNode("plus"));
        list.append(
          el("li", { class: `to-upcoming-item${diff <= 2 ? " is-soon" : ""}`, "data-upcoming-index": String(index) }, [
            dot,
            el("div", { class: "to-upcoming-main" }, [title, el("span", { class: "to-upcoming-meta", text: meta })]),
            add
          ])
        );
      });
      card.append(list);
      return card;
    }
  }

  NS.dashboard = { Dashboard };
})();
