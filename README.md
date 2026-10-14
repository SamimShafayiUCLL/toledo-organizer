<img src="icons/icon128.png" width="64" alt="">

# Toledo Organizer

A browser extension for `https://toledo.kuleuven.be/` that shows your Toledo courses in your own structure, without removing the original Toledo list.

![Toledo Organizer](docs/screenshot-organizer.png)

> **Disclaimer:** This is an unofficial project. It is not affiliated with or endorsed by KU Leuven or Anthology/Blackboard. It depends on Toledo's page structure and may break when Toledo changes.

## Features

- Custom groups and subgroups, up to 3 levels deep
- Drag and drop courses and groups into other groups
- Merge academic years of the same course into one card, with a default version
- Custom names for courses and versions (e.g. "Full course" / "Current year")
- Colors for groups and courses
- Sorting: own order, A-Z or Z-A
- Hide and unhide courses
- Search
- New courses appear under "Not assigned"
- Recognition of KU Leuven and UCLL courses via the Toledo ID
- Edit mode: management controls, colors and renaming stay hidden until you turn it on
- Import and export settings as JSON
- Toggle between the Organizer and the original Toledo view
- Its own page layout: wider page, your courses on the left and a sticky sidebar on the right
- A greeting header with today's numbers: tasks due today, deadlines this week, unread updates
- A rewritten updates feed: clearer wording per type (new content, announcement, deadline, test, grade), grouped by day, with filters; clicking still goes through Toledo so items get marked as read
- Smart sorting ("Slim indelen"): proposes groups by institution, semester, programme code or academic year, with a preview before anything moves
- Dashboard in the right column: a local to-do list (Enter to add, optional due date, overdue and today highlighted) and "Binnenkort", the upcoming deadlines and tests from Toledo's updates feed, each one click away from becoming a task
- Light, dark or system appearance and your own accent colour, applied to the organizer, the dashboard and the Toledo theme
- Keyboard shortcuts: `/` focuses search, `n` starts a new task
- Optional Toledo theme: a calmer look for the whole Toledo portal (top bar, menus, panels, updates, course list) that matches the organizer. Turn it off under Settings > Appearance (Instellingen > Uiterlijk).

![Dark mode with a custom accent](docs/screenshot-dark.png)

![Smart sorting](docs/screenshot-autosort.png)

![Edit mode](docs/screenshot-edit-mode.png)

## Installation

1. Download the repository (Code > Download ZIP) or clone it, and extract it to a folder that will stay in place.
2. Open `edge://extensions` or `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the folder that contains `manifest.json`.
5. Open https://toledo.kuleuven.be.

### Updating

Extension storage is tied to the extension ID, and for unpacked extensions that ID depends on the folder path. Export your settings first as a backup, then:

1. Replace the files in the **same** folder with the new version.
2. Go to the extensions page and click **Reload**.
3. Refresh Toledo.

## Privacy

No data leaves your browser. The extension uses these permissions:

- `storage`: saves your settings and tasks locally
- `downloads`: JSON export only
- Host access only to `https://toledo.kuleuven.be/*`

## Development

The extension is plain JavaScript with no build step. To try the UI without Toledo, run a local server from the repository root:

```
python -m http.server
```

Then open http://localhost:8000/test/demo.html (add `?edit=1` for edit mode, `?settings=1` for the settings dialog, `?autosort=1` for smart sorting, `?dark=1` for dark mode). `test/ui-fixture.html` runs a few UI checks, and `test/toledo-sim.html` simulates a slow-loading Toledo page and reports how quickly the organizer appears.

## License

MIT. See [LICENSE](LICENSE).

---

## Nederlands


Een lokale Edge/Chromium-extensie voor `https://toledo.kuleuven.be/` die Toledo-vakken in een eigen structuur toont zonder de originele Toledo-lijst te verwijderen.

### Nieuw in v0.2.0

- **Export hersteld:** JSON-downloads lopen nu via een Manifest V3 background service worker en `chrome.downloads`.
- **Instellingenmodal hersteld:** de ×-knop werkt, Escape sluit het venster en het venster blijft niet meer open na refresh.
- **Bewerkmodus (✎):** beheerknoppen, kleuren, drag-and-drop en hernoemen zijn standaard verborgen voor een rustigere dagelijkse weergave.
- **Custom kleuren:** geef groepen én individuele vakken een kleur. De kleur wordt subtiel als linkeraccent gebruikt.
- **Sorteren:** Eigen volgorde, Alfabetisch A–Z of Alfabetisch Z–A.
- **Eigen volgorde verbeteren:** in Bewerkmodus kun je vakken omhoog/omlaag zetten of ze op een ander vak slepen.
- **Eigen vaknaam:** vakken kunnen naast versies en groepen ook een eigen displaynaam krijgen.
- **Duidelijkere beschikbaarheid:** wanneer de nieuwste versie nog niet beschikbaar is, staat dit zichtbaar op de kaart, inclusief instelling (bv. KU Leuven).
- **Verbeterde versie-weergave:** een onbeschikbare versie vermeldt expliciet dat Toledo ze momenteel als niet beschikbaar markeert.
- Het verborgen JSON-importveld is nu ook hard verborgen zodat Toledo-CSS het niet zichtbaar kan maken.

### Bestaande functies

- Schakelaar **Organizer / Originele Toledo**.
- Zelf groepen en subgroepen maken, maximaal **3 niveaus**.
- Vakken naar groepen verslepen.
- Groepen naar andere groepen verslepen.
- UCLL en KU Leuven herkennen via de Toledo-ID.
- Academiejaren van hetzelfde vak automatisch combineren, bv.:
  - `ULTRA-B-KUL-E0I54a-2526`
  - `ULTRA-B-KUL-E0I54a-2627`
  - worden samen `KUL:E0I54a`.
- Gecombineerde vakkaart uitklappen om academiejaren te zien.
- Eén academiejaar als standaardversie instellen.
- De titel van het vak opent de standaardversie.
- Eigen naam per versie, bv. `Volledige cursus` / `Huidig jaar`.
- Nieuwe vakken verschijnen onder **Niet ingedeeld**.
- Communities worden bij eerste detectie onder **Overig** geplaatst.
- Vakken verbergen en terug zichtbaar maken.
- Zoeken.
- Instellingen importeren/exporteren als JSON.
- Gedetecteerde Toledo-vakken exporteren als debug-JSON.
- Alles wordt lokaal bewaard via `chrome.storage.local`.

### Updaten van v0.1 naar v0.2 zonder je indeling kwijt te raken

`chrome.storage.local` hoort bij de **extensie-ID**. Bij een unpacked extensie kan die ID veranderen wanneer je de extensie vanuit een andere map laadt. Omdat export in v0.1 bij jou niet werkte, is de veiligste update daarom:

1. Zoek de **bestaande map** die je bij v0.1 via **Load unpacked** hebt geladen.
2. Maak voor de zekerheid eerst een gewone kopie van die map.
3. Pak `toledo-organizer-v0.2.0.zip` uit.
4. Kopieer de nieuwe bestanden **in dezelfde bestaande v0.1-map** en laat de oude bestanden vervangen. Houd dus exact hetzelfde mappad voor de extensie.
5. Ga naar `edge://extensions` en klik bij Toledo Organizer op **Reload / Opnieuw laden**.
6. Vernieuw Toledo.

Verwijder v0.1 voorlopig niet uit Edge en laad v0.2 niet vanuit een compleet andere map als je je huidige groepen wilt behouden. Zodra v0.2 draait, kun je via **Instellingen → Exporteer instellingen** meteen een JSON-back-up maken.

### Dagelijks gebruik

Laat **Bewerkmodus** uit voor een rustige lijst. Klik bovenaan op **✎** wanneer je groepen wilt aanpassen, vakken wilt verplaatsen, kleuren wilt kiezen of namen wilt wijzigen.

Bijvoorbeeld:

- Geneeskunde
  - 1ste fase
    - 1ste semester
    - 2de semester
- MLT / Biomedische Laboratoriumtechnologie
  - 1ste fase
  - 2de fase

### Beschikbaarheid

Een melding zoals:

`2026-2027 is niet beschikbaar op Toledo (KU Leuven)`

betekent alleen dat Toledo die specifieke cursusversie op dat moment als niet beschikbaar rendert (`enrollment-unavailable` / geen klikbare cursuslink). De extensie doet geen uitspraak over de reden waarom.

### Privacy

De extensie stuurt geen Toledo-data naar een server en vraagt niet om je wachtwoord. De permissies zijn beperkt tot Toledo, lokale opslag en lokale JSON-downloads.
