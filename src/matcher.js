(() => {
  const NS = (window.ToledoOrganizer = window.ToledoOrganizer || {});

  function versionSort(a, b) {
    if (!a.year && !b.year) return a.rawId.localeCompare(b.rawId);
    if (!a.year) return 1;
    if (!b.year) return -1;
    return b.year.localeCompare(a.year);
  }

  function combineCourses(enrollments) {
    const byKey = new Map();

    for (const enrollment of enrollments) {
      if (!byKey.has(enrollment.key)) {
        byKey.set(enrollment.key, {
          key: enrollment.key,
          title: enrollment.title,
          type: enrollment.type,
          institution: enrollment.institution,
          code: enrollment.code,
          semester: enrollment.semester,
          versions: []
        });
      }

      const combined = byKey.get(enrollment.key);
      combined.versions.push(enrollment);

      // Prefer metadata/title from the newest version.
      if (
        !combined._titleYear ||
        (enrollment.year && enrollment.year.localeCompare(combined._titleYear) > 0)
      ) {
        combined.title = enrollment.title;
        combined.semester = enrollment.semester || combined.semester;
        combined._titleYear = enrollment.year || combined._titleYear;
      }
    }

    return [...byKey.values()]
      .map((course) => {
        course.versions.sort(versionSort);
        delete course._titleYear;
        return course;
      })
      .sort((a, b) => a.title.localeCompare(b.title, "nl", { sensitivity: "base" }));
  }

  function getDefaultVersion(course, setting) {
    if (!course?.versions?.length) return null;
    if (setting?.defaultVersion) {
      const exact = course.versions.find((v) => v.year === setting.defaultVersion);
      if (exact) return exact;
    }
    return course.versions.find((v) => v.available) || course.versions[0];
  }

  function groupDepth(groupId, groups) {
    if (!groupId) return 0;
    const map = new Map(groups.map((g) => [g.id, g]));
    let depth = 0;
    let current = map.get(groupId);
    const guard = new Set();
    while (current && !guard.has(current.id)) {
      guard.add(current.id);
      depth += 1;
      current = current.parentId ? map.get(current.parentId) : null;
    }
    return depth;
  }

  function descendants(groupId, groups) {
    const out = new Set();
    const visit = (id) => {
      for (const g of groups) {
        if (g.parentId === id && !out.has(g.id)) {
          out.add(g.id);
          visit(g.id);
        }
      }
    };
    visit(groupId);
    return out;
  }

  function groupsAsTree(groups) {
    const children = new Map();
    for (const group of groups) {
      const key = group.parentId || "__root__";
      if (!children.has(key)) children.set(key, []);
      children.get(key).push(group);
    }
    for (const list of children.values()) {
      list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name, "nl"));
    }
    return children;
  }

  NS.matcher = {
    combineCourses,
    getDefaultVersion,
    groupDepth,
    descendants,
    groupsAsTree
  };
})();
