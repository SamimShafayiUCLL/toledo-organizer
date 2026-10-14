# v0.5: own layout, own updates feed, smart sorting

## Layout (CSS, toledo-theme.css)
- Page no longer bound to Toledo's Bootstrap grid: centered container up to 1400px, main column + fixed 380px sidebar.
- Sidebar (Taken, Binnenkort, Updates) is sticky under the top bar with its own scroll; stacks under the main column below 992px.
- Hero header across both columns: greeting, date, three stats (tasks for today, deadlines this week, unread updates).
- Footer follows the theme (was white in dark mode).

## Updates feed (dashboard.js)
- Toledo's "Updates en communicatie" widget stays in the DOM (source of truth) but is hidden; we render our own feed from it.
- Reworded per type (from `notifications-*`): Nieuwe inhoud, Mededeling, Deadline, Toets, Nieuw cijfer, Vakupdate.
- Grouped Gepland (future dates) / Vandaag / Gisteren / Eerder; filters Alles · Inhoud · Mededelingen · Toetsen & deadlines · Cijfers; 25 at a time.
- Clicking an item clicks Toledo's original link, so Toledo still marks it read and handles navigation.
- Setting: "Eigen updates-overzicht" (on by default); off shows Toledo's widget again.

## Smart sorting (ui.js)
- "Slim indelen" dialog with strategies: Instelling > Semester, Instelling > Opleiding (code prefix), Academiejaar > Instelling, Actueel / Archief.
- One is marked recommended (several institutions -> Instelling > Semester; one institution over several years -> Actueel / Archief; else Instelling > Opleiding).
- Live preview tree with counts and sample courses; by default only unassigned courses move; communities go to Overig.
- Reuses existing groups with the same name; max 3 levels.
- Suggested from the "Niet ingedeeld" section when 3+ courses are unassigned.

## Wording
- Organizer header becomes "Mijn vakken" with a live "N vakken · M groepen" line.
