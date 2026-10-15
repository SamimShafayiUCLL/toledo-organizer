# Productivity + appearance (v0.4)

Goal: make the Toledo home page the place to plan study work, not just a course list.

## Appearance
- Mode: Systeem / Licht / Donker (`state.appearance.mode`), applied as `html.to-dark`.
- Accent colour: presets + custom (`state.appearance.accent`, hex), exposed as `--to-user-accent` on `<html>`;
  every accent shade (soft fill, hover, accent text, top bar) is derived in CSS with `color-mix()`.
- Dark mode covers the organizer, the dashboard and (when the Toledo theme is on) the Toledo portal.

## Dashboard (right column, above Informatie)
- **Taken**: local to-do list. Add with Enter, optional due date, check off, delete, clear done.
  Ordered: open before done, then by due date (none last), then creation time. Overdue / today highlighted.
- **Binnenkort**: future-dated items parsed from Toledo's "Updates en communicatie" feed
  (`.tol-event` with a `dd/mm/yyyy` date >= today; due/test items), soonest first, max 6,
  coloured dot from Toledo's course colour, "+" turns one into a task (text, due date, course tag).
- Toggles: show Taken, show Binnenkort, hide Toledo's Informatie panel.
- Shortcuts: `/` focuses the organizer search, `n` focuses the new-task field (not while typing).

## Storage
`tasks[]` `{ id, text, done, due: "YYYY-MM-DD"|null, tag: string|null, createdAt, doneAt }`,
`appearance { mode, accent }`, `dashboard { showTasks, showUpcoming, hideInfoPanel }`.
All local (extension storage), included in settings export/import, validated on import.

## Out of scope
Blackboard Ultra course pages, syncing tasks to other devices, notifications.
