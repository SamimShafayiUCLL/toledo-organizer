(() => {
  const NS = (window.ToledoOrganizer = window.ToledoOrganizer || {});
  const DASH_ID = "to-dashboard";
  const tr = (key, vars) => NS.i18n.t(key, vars);
  const trPlural = (key, n, vars) => NS.i18n.plural(key, n, vars);
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

  // "5 mrt" / "5 Mar" (day + short month), optionally with a short weekday in front.
  function shortDate(date, withWeekday) {
    const locale = NS.i18n.locale();
    if (locale.startsWith("nl")) {
      const short = `${date.getDate()} ${MONTHS[date.getMonth()]}`;
      return withWeekday ? `${WEEKDAYS[date.getDay()]} ${short}` : short;
    }
    const opts = withWeekday ? { weekday: "short", day: "numeric", month: "short" } : { day: "numeric", month: "short" };
    return date.toLocaleDateString(locale, opts);
  }

  function dueLabel(iso, today = startOfToday()) {
    const date = fromISO(iso);
    if (!date) return "";
    const diff = dayDiff(date, today);
    if (diff === 0) return tr("due.today");
    if (diff === 1) return tr("due.tomorrow");
    if (diff === -1) return tr("due.yesterday");
    if (diff >= 2 && diff <= 6) return shortDate(date, true);
    const short = shortDate(date, false);
    return date.getFullYear() === today.getFullYear() ? short : `${short} ${date.getFullYear()}`;
  }

  function relativeLabel(diff) {
    if (diff <= 0) return tr("rel.today");
    if (diff === 1) return tr("rel.tomorrow");
    return tr("rel.inDays", { n: diff });
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

  // ---- parsed copy of Toledo's whole updates feed (can be 500+ items; parsed only when it changes) ----
  const KINDS = ["notifications-content", "announcement", "due", "test", "gradebook", "course"];
  const KIND_NAMES = { "notifications-content": "content" };
  const KIND_ICONS = { content: "file", announcement: "megaphone", due: "clock", test: "checkSquare", gradebook: "award", course: "book", other: "sparkle" };
  const FEED_FILTERS = ["all", "content", "announcement", "deadline", "grade"];
  const FEED_PAGE = 25;
  const clean = (text) => (text || "").replace(/\s+/g, " ").trim();

  function kindOf(node) {
    const holder = node.className + " " + (node.querySelector('[class*="notifications-"]')?.className || "");
    const m = /\bnotifications-(content|announcement|due|test|gradebook|course)\b/.exec(holder);
    return m ? m[1] : "other";
  }

  // Returns { date, numeric } for "dd/mm/yyyy" or relative words (Dutch or English), else null.
  function parseFeedDate(text, today) {
    const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(text);
    if (m) {
      const date = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
      return Number.isNaN(date.getTime()) ? null : { date, numeric: true };
    }
    const word = text.trim().toLowerCase();
    const offset = { vandaag: 0, gisteren: -1, morgen: 1, today: 0, yesterday: -1, tomorrow: 1 }[word];
    if (offset == null) return null;
    return { date: new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset), numeric: false };
  }

  function parseFeed(today = startOfToday()) {
    const items = [];
    document.querySelectorAll(".tol-events-widget .tol-event").forEach((node) => {
      const title = clean(node.querySelector(".tol-title")?.textContent);
      if (!title) return;
      const dateText = clean(node.querySelector(".tol-date")?.textContent);
      const parsed = parseFeedDate(dateText, today);
      const rawKind = kindOf(node);
      items.push({
        kind: KIND_NAMES[rawKind] || rawKind,
        title,
        dateText,
        date: parsed?.date || null,
        numeric: Boolean(parsed?.numeric),
        author: clean(node.querySelector(".tol-what-happened strong")?.textContent),
        course: clean(node.querySelector(".tol-source")?.textContent),
        unread: node.classList.contains("tol-unread-item"),
        color: colorOf(node),
        anchor: node.matches("a") ? node : node.querySelector("a")
      });
    });
    return items;
  }

  function feedSignature(today = startOfToday()) {
    const nodes = document.querySelectorAll(".tol-events-widget .tol-event");
    const first = nodes[0];
    const unread = document.querySelectorAll(".tol-events-widget .tol-event.tol-unread-item").length;
    return `${toISO(today)}#${nodes.length}#${clean(first?.querySelector(".tol-title")?.textContent)}|${clean(first?.querySelector(".tol-date")?.textContent)}#${unread}`;
  }

  function scanUpcoming(feed, today = startOfToday()) {
    const seen = new Set();
    const items = [];
    for (const item of feed) {
      if (!item.date || item.date < today) continue;
      if (!item.numeric && item.kind !== "due" && item.kind !== "test") continue;
      const iso = toISO(item.date);
      const dedupe = `${item.title}|${iso}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      items.push({
        title: item.title,
        iso,
        date: item.date,
        course: item.course,
        href: safeHref(item.anchor?.getAttribute("href")),
        color: item.color
      });
    }
    items.sort((a, b) => a.date - b.date);
    return items;
  }

  const upcomingSignature = (items) => `${toISO(startOfToday())}#${items.map((i) => `${i.title}|${i.iso}|${i.href || ""}|${i.color || ""}`).join(";")}`;

  const greeting = (now = new Date()) =>
    tr(now.getHours() < 12 ? "hero.greeting.morning" : now.getHours() < 18 ? "hero.greeting.afternoon" : "hero.greeting.evening");

  function feedTimeLabel(item, today) {
    if (!item.date) return item.dateText.toLowerCase();
    const diff = dayDiff(item.date, today);
    if (diff === 0) return tr("rel.today");
    if (diff === 1) return tr("rel.tomorrow");
    if (diff === -1) return tr("rel.yesterday");
    if (diff > 1) return tr("rel.inD", { n: diff });
    const short = shortDate(item.date, false);
    return item.date.getFullYear() === today.getFullYear() ? short : `${short} ${item.date.getFullYear()}`;
  }

  const feedCourseName = (course) => course.replace(/\s*\[[^\]]+\]\s*$/, "").trim();

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
      this.hero = null;
      this.feedCache = { sig: null, items: [] };
      this.feedFilter = "all";
      this.feedLimit = FEED_PAGE;
      this.feedShown = [];
    }

    // Parsed feed, re-parsed only when the cheap signature changes (or when forced).
    getFeed(force = false) {
      const sig = feedSignature();
      if (force || sig !== this.feedCache.sig) this.feedCache = { sig, items: parseFeed() };
      return this.feedCache.items;
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
        } else if (action === "feed-filter") {
          this.feedFilter = actionEl.dataset.value || "all";
          this.feedLimit = FEED_PAGE;
          this.render();
        } else if (action === "feed-more") {
          this.feedLimit += FEED_PAGE;
          this.render();
        }
      });
      section.addEventListener("click", (event) => {
        const itemEl = event.target.closest(".to-feed-item");
        if (itemEl && section.contains(itemEl)) this.openFeedItem(Number(itemEl.dataset.feedIndex));
      });
    }

    openFeedItem(index) {
      const item = this.feedShown[index];
      if (!item) return;
      let anchor = item.anchor;
      if (!anchor?.isConnected) {
        const fresh = this.getFeed(true).find((x) => x.title === item.title && x.dateText === item.dateText);
        anchor = fresh?.anchor;
      }
      if (anchor?.isConnected) anchor.click();
    }

    bindHero(hero) {
      if (hero.dataset.bound === "1") return;
      hero.dataset.bound = "1";
      const activate = (stat) => {
        const kind = stat.dataset.kind;
        if (kind === "tasks") {
          const input = this.section?.querySelector('[data-role="task-text"]');
          if (input) {
            input.scrollIntoView({ behavior: "smooth", block: "center" });
            input.focus({ preventScroll: true });
          }
        } else if (kind === "deadlines") {
          this.section?.querySelector(".to-upcoming")?.scrollIntoView({ behavior: "smooth", block: "start" });
        } else if (kind === "unread") {
          this.feedFilter = "all";
          this.feedLimit = FEED_PAGE;
          this.render();
          this.section?.querySelector(".to-feed")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      };
      hero.addEventListener("click", (event) => {
        const stat = event.target.closest(".to-stat");
        if (stat && hero.contains(stat)) activate(stat);
      });
      hero.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        const stat = event.target.closest(".to-stat");
        if (!stat || !hero.contains(stat)) return;
        event.preventDefault();
        activate(stat);
      });
    }

    heroContainer() {
      return document.querySelector(".main-content > .container-fluid");
    }

    renderHero(state, feed, upcomingAll, today) {
      const existing = document.getElementById("to-hero");
      if (state.dashboard?.showHero === false) {
        existing?.remove();
        this.hero = null;
        return;
      }
      const container = this.heroContainer();
      if (!container) return;
      const hero = existing || el("section", { id: "to-hero", class: "to-hero" });
      if (container.firstElementChild !== hero) container.insertBefore(hero, container.firstChild);
      this.hero = hero;
      this.bindHero(hero);

      const todayISO = toISO(today);
      const taskCount = (state.tasks || []).filter((t) => !t.done && t.due && t.due <= todayISO).length;
      const weekCount = upcomingAll.filter((i) => dayDiff(i.date, today) <= 6).length;
      const unreadCount = feed.filter((i) => i.unread).length;
      const stat = (kind, value, label) =>
        el("li", { class: "to-stat", "data-kind": kind, role: "button", tabindex: "0" }, [
          el("span", { class: "to-stat-value", text: String(value) }),
          el("span", { class: "to-stat-label", text: label })
        ]);

      hero.textContent = "";
      hero.append(
        el("div", { class: "to-hero-text" }, [
          el("h1", { class: "to-hero-title", text: greeting() }),
          el("p", { class: "to-hero-date", text: new Date().toLocaleDateString(NS.i18n.locale(), { weekday: "long", day: "numeric", month: "long" }) })
        ]),
        el("ul", { class: "to-hero-stats" }, [
          stat("tasks", taskCount, trPlural("hero.tasks", taskCount)),
          stat("deadlines", weekCount, trPlural("hero.deadlines", weekCount)),
          stat("unread", unreadCount, trPlural("hero.unread", unreadCount))
        ])
      );
    }

    // Called when the dashboard can no longer be mounted (e.g. navigated away).
    unmount() {
      document.getElementById("to-hero")?.remove();
      this.hero = null;
      document.documentElement.classList.remove("to-feed-replaced");
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
      const dash = this.getState()?.dashboard || {};
      const heroMissing =
        dash.showHero !== false &&
        this.heroContainer() &&
        !(this.hero && this.hero.isConnected && this.hero.parentElement?.firstElementChild === this.hero);
      if (heroMissing || this.currentSignature() !== this.signature) this.render();
    }

    currentSignature(today = startOfToday()) {
      return `${greeting()}#${feedSignature(today)}#${upcomingSignature(scanUpcoming(this.getFeed(), today))}`;
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

      const today = startOfToday();
      const feed = this.getFeed();
      const upcomingAll = scanUpcoming(feed, today);
      const upcoming = upcomingAll.slice(0, MAX_UPCOMING);
      this.currentUpcoming = upcoming;
      this.signature = `${greeting()}#${feedSignature(today)}#${upcomingSignature(upcomingAll)}`;

      const focusedChip = active?.matches?.(".to-chip") && this.section.contains(active) ? active.dataset.value : null;

      this.renderHero(state, feed, upcomingAll, today);

      this.section.textContent = "";
      const showFeed = dash.replaceFeed !== false;
      const order = Array.isArray(dash.order) && dash.order.length === 3 ? dash.order : ["tasks", "upcoming", "feed"];
      for (const card of order) {
        if (card === "tasks" && dash.showTasks !== false) this.section.append(this.renderTasks(state, draft));
        else if (card === "upcoming" && dash.showUpcoming !== false) this.section.append(this.renderUpcoming(upcoming));
        else if (card === "feed" && showFeed) this.section.append(this.renderFeed(feed, today));
      }
      document.documentElement.classList.toggle("to-feed-replaced", showFeed);
      if (focusedChip) this.section.querySelector(`.to-chip[data-value="${focusedChip}"]`)?.focus({ preventScroll: true });

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
      if (hasDone) actions.append(el("button", { class: "to-btn ghost small", type: "button", "data-action": "clear-done", text: tr("tasks.clearDone") }));

      const form = el("form", { class: "to-task-form" }, [
        el("input", {
          class: "to-task-input",
          type: "text",
          placeholder: tr("tasks.placeholder"),
          maxlength: "300",
          "aria-label": tr("tasks.new"),
          "data-role": "task-text",
          autocomplete: "off",
          value: draft.text
        }),
        el("input", { class: "to-task-date", type: "date", "data-role": "task-due", "aria-label": tr("tasks.deadline"), value: draft.due }),
        el("button", { class: "to-btn primary small", type: "submit", text: tr("tasks.add") })
      ]);

      const card = el("div", { class: "to-dash-card to-tasks" }, [
        el("div", { class: "to-dash-head" }, [
          el("h3", { class: "to-dash-title", text: tr("tasks.title") }),
          el("span", { class: "to-count", text: String(openCount) }),
          actions
        ]),
        form
      ]);

      const list = el("ul", { class: "to-task-list" });
      for (const task of tasks) list.append(this.renderTask(task, todayISO));
      card.append(list);
      if (!tasks.length) card.append(el("div", { class: "to-dash-empty", text: tr("tasks.empty") }));
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
        title: tr("tasks.delete"),
        "aria-label": tr("tasks.delete")
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
          el("h3", { class: "to-dash-title", text: tr("upcoming.title") }),
          el("span", { class: "to-count", text: String(items.length) })
        ])
      ]);
      if (!items.length) {
        card.append(el("div", { class: "to-dash-empty", text: tr("upcoming.empty") }));
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
        const meta = [feedCourseName(item.course || ""), relativeLabel(diff)].filter(Boolean).join(" · ");
        const add = el("button", {
          class: "to-btn ghost tiny icon",
          type: "button",
          "data-action": "upcoming-to-task",
          title: tr("upcoming.addTask"),
          "aria-label": tr("upcoming.addTask")
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

    renderFeed(feed, today) {
      const unreadCount = feed.filter((i) => i.unread).length;
      const matches = {
        all: () => true,
        content: (i) => i.kind === "content",
        announcement: (i) => i.kind === "announcement",
        deadline: (i) => i.kind === "due" || i.kind === "test",
        grade: (i) => i.kind === "gradebook"
      };
      if (!matches[this.feedFilter]) this.feedFilter = "all";
      const filtered = feed.filter(matches[this.feedFilter]);

      const planned = [];
      const todayItems = [];
      const yesterday = [];
      const earlier = [];
      for (const item of filtered) {
        const diff = item.date ? dayDiff(item.date, today) : null;
        if (diff != null && diff > 0) planned.push(item);
        else if (diff === 0) todayItems.push(item);
        else if (diff === -1) yesterday.push(item);
        else earlier.push(item);
      }
      planned.sort((a, b) => a.date - b.date);
      const sections = [
        [tr("feed.day.planned"), planned],
        [tr("feed.day.today"), todayItems],
        [tr("feed.day.yesterday"), yesterday],
        [tr("feed.day.earlier"), earlier]
      ].filter(([, list]) => list.length);

      const chips = el(
        "div",
        { class: "to-feed-filters", role: "tablist" },
        FEED_FILTERS.map((value) =>
          el("button", {
            class: `to-chip${this.feedFilter === value ? " active" : ""}`,
            type: "button",
            "data-action": "feed-filter",
            "data-value": value,
            role: "tab",
            "aria-selected": this.feedFilter === value ? "true" : "false",
            text: tr(`feed.filter.${value}`)
          })
        )
      );

      const card = el("div", { class: "to-dash-card to-feed" }, [
        el("div", { class: "to-dash-head" }, [
          el("h3", { class: "to-dash-title", text: tr("feed.title") }),
          el("span", { class: `to-count${unreadCount ? "" : " is-zero"}`, text: String(unreadCount) })
        ]),
        chips
      ]);

      const list = el("div", { class: "to-feed-list" });
      this.feedShown = [];
      let remaining = this.feedLimit;
      let total = 0;
      for (const [label, items] of sections) {
        total += items.length;
        if (remaining <= 0) continue;
        const slice = items.slice(0, remaining);
        remaining -= slice.length;
        list.append(el("div", { class: "to-feed-day", text: label }));
        for (const item of slice) {
          list.append(this.renderFeedItem(item, this.feedShown.length, today));
          this.feedShown.push(item);
        }
      }
      card.append(list);
      if (!filtered.length) card.append(el("div", { class: "to-dash-empty", text: tr("feed.empty") }));
      if (total > this.feedShown.length) {
        card.append(el("button", { class: "to-btn ghost small to-feed-more", type: "button", "data-action": "feed-more", text: tr("feed.more") }));
      }
      return card;
    }

    renderFeedItem(item, index, today) {
      const kind = KIND_ICONS[item.kind] ? item.kind : "other";
      const iconEl = el("span", { class: "to-feed-icon", "data-kind": kind, style: item.color ? `--to-item-color:${item.color}` : null });
      iconEl.append(iconNode(KIND_ICONS[kind]));
      const meta = [tr(`feed.kind.${kind}`), feedCourseName(item.course), item.author].filter(Boolean).join(" · ");
      return el("button", { class: `to-feed-item${item.unread ? " is-unread" : ""}`, type: "button", "data-feed-index": String(index) }, [
        iconEl,
        el("span", { class: "to-feed-main" }, [
          el("span", { class: "to-feed-title", text: item.title }),
          el("span", { class: "to-feed-meta", text: meta })
        ]),
        el("span", { class: "to-feed-time", text: feedTimeLabel(item, today) })
      ]);
    }
  }

  NS.dashboard = { Dashboard };
})();
