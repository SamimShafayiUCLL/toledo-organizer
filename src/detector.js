(() => {
  const NS = (window.ToledoOrganizer = window.ToledoOrganizer || {});

  function text(el) {
    return (el?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function yearCodeFromText(value) {
    if (!value) return null;
    const compact = value.match(/\b(20\d{2})\s*[-–]\s*(20\d{2})\b/);
    if (compact) return `${compact[1].slice(-2)}${compact[2].slice(-2)}`;
    const code = value.match(/(?:^|[-\s\[])((?:2\d){2})(?:$|[\]\s])/);
    return code ? code[1] : null;
  }

  function formatAcademicYear(code) {
    if (!/^\d{4}$/.test(code || "")) return code || NS.i18n.t("detector.unknownYear");
    const a = Number(code.slice(0, 2));
    const b = Number(code.slice(2, 4));
    return `20${String(a).padStart(2, "0")}-20${String(b).padStart(2, "0")}`;
  }

  function normalizeTitle(title) {
    return (title || "")
      .replace(/\s*\[(?:2\d){2}\]\s*$/i, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function parseId(rawId, title, type) {
    const clean = (rawId || "").trim();

    // ULTRA-B-KUL-E0I54a-2526 / ULTRA-B-UCLL-QM1359-2627
    const course = clean.match(/^ULTRA-B-(KUL|UCLL)-(.+?)-(\d{4})$/i);
    if (course) {
      return {
        institution: course[1].toUpperCase(),
        code: course[2],
        year: course[3],
        stableKey: `${course[1].toUpperCase()}:${course[2]}`
      };
    }

    // Communities can also have year suffixes, e.g. ULTRA-C-30415441-K-2627.
    const community = clean.match(/^ULTRA-C-(.+?)(?:-(\d{4}))?$/i);
    if (community) {
      const base = community[1].replace(/-(?:2\d){3}$/i, "");
      return {
        institution: "COMMUNITY",
        code: base,
        year: community[2] || yearCodeFromText(title),
        stableKey: `COMMUNITY:${base}`
      };
    }

    const fallbackYear = yearCodeFromText(clean) || yearCodeFromText(title);
    const fallbackBase = clean.replace(/-(?:2\d){3}$/i, "") || normalizeTitle(title);
    return {
      institution: type === "community" ? "COMMUNITY" : "UNKNOWN",
      code: fallbackBase,
      year: fallbackYear,
      stableKey: `${type === "community" ? "COMMUNITY" : "UNKNOWN"}:${fallbackBase}`
    };
  }

  function detectEnrollments() {
    const items = [...document.querySelectorAll(".enrollment-list-item.tol-enrollment")];
    const seen = new Set();
    const result = [];

    for (const item of items) {
      const titleEl = item.querySelector(".learning-unit-title");
      const idEl = item.querySelector(".learning-unit-id");
      if (!titleEl || !idEl) continue;

      const title = text(titleEl) || titleEl.getAttribute("title") || NS.i18n.t("detector.unknownCourse");
      const rawId = text(idEl).replace(/^\s+/, "");
      if (!rawId || seen.has(rawId)) continue;
      seen.add(rawId);

      const type = item.classList.contains("learningunit-type-community")
        ? "community"
        : item.classList.contains("learningunit-type-course")
          ? "course"
          : "other";

      const parsed = parseId(rawId, title, type);
      const yearFromIndicator = text(item.querySelector(".color-indicator span"));
      const year = parsed.year || yearCodeFromText(yearFromIndicator) || yearCodeFromText(title);
      const semesterEl = item.querySelector('[title^="Semester"]');
      const semesterMatch = semesterEl?.getAttribute("title")?.match(/Semester\s*(\d+)/i);
      const semester = semesterMatch ? Number(semesterMatch[1]) : null;
      const linkEl = item.querySelector("a.enrollment-clickable-area[href]");
      const href = linkEl?.href || null;
      const available = item.classList.contains("enabled") && Boolean(href);
      const wrapper = item.closest(".tol-enrollment-container")?.parentElement || item.parentElement;

      result.push({
        rawId,
        key: parsed.stableKey,
        title: normalizeTitle(title),
        originalTitle: title,
        type,
        institution: parsed.institution,
        code: parsed.code,
        year,
        academicYear: year ? formatAcademicYear(year) : null,
        semester,
        href,
        available,
        unavailable: item.classList.contains("enrollment-unavailable"),
        favorite: Boolean(item.querySelector(".favorite-indicator .fa-solid.fa-star")),
        sourceItem: item,
        sourceWrapper: wrapper
      });
    }

    return result;
  }

  function sourceWrappers(enrollments) {
    return [...new Set(enrollments.map((e) => e.sourceWrapper).filter(Boolean))];
  }

  NS.detector = {
    detectEnrollments,
    sourceWrappers,
    normalizeTitle,
    yearCodeFromText,
    formatAcademicYear
  };
})();
