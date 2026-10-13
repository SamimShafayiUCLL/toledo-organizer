# Changelog

## 0.3.0 — 2026-10-14

- Nieuw ontwerp: vakken als rustige lijst in plaats van kaarten-in-kaarten, kleuren als bolletje in plaats van gekleurde linkerrand, lijn-iconen in plaats van emoji, knop "Bewerken"/"Klaar".
- Werkt nu ook op smalle schermen zonder horizontaal scrollen.
- Slepen verbeterd: sleep het hele vak (niet alleen het handvat), een lijn toont waar het vak terechtkomt (ook na het laatste vak), ingeklapte groepen gaan open als je erboven blijft hangen, de pagina scrolt mee aan de rand, en een melding bevestigt de verplaatsing.
- Omhoog/omlaag-knoppen werken ook bij vakken met dezelfde volgorde-waarde.
- Nieuw Toledo-thema: heel het Toledo-portaal (bovenbalk, menu, panelen, updates, vakkenlijst) krijgt een rustiger uiterlijk dat bij de organizer past. Uit te zetten via Instellingen → Uiterlijk.
- In Organizer-weergave verdwijnt Toledo's eigen filterbalk (de organizer heeft een eigen zoekveld).
- Vaktitels tonen de vakcode niet meer dubbel (bv. "Hematologie [E0I82a]" → "Hematologie").
- Vaklinks openen weer: Toledo stuurt vakken via andere KU Leuven-adressen door, die worden nu toegelaten.
- Toledo's eigen opmaak (vetgedrukte labels e.d.) lekt niet meer in de organizer.
- Groepen slepen: sleep een groepskop boven of onder een andere groep om de volgorde te wijzigen, of op het midden van een kop om ze erin te plaatsen. Ongeldige plaatsen (meer dan 3 niveaus) worden niet aangeboden.
- Veel snellere start: de organizer verschijnt meteen zodra Toledo de vakkenlijst toont, in plaats van te wachten tot de pagina helemaal stil is. De originele lijst flitst niet meer eerst.
- Zoekveld verliest geen focus meer bij typen.
- Tekstcursor (caret) is weer zichtbaar in invoervelden.
- Organizer verdwijnt niet meer na terug-navigeren binnen Toledo (SPA-navigatie).
- Robuustere import-validatie: kapotte bestanden breken de weergave niet meer.
- Zoekterm wordt niet meer opgeslagen of geëxporteerd.
- Alleen links binnen Toledo worden geopend; Ctrl/Cmd-klik opent in een nieuw tabblad.
- "null"-tekst naast kleurkiezers in bewerkmodus verwijderd.
- Minder werk op Toledo-pagina's zonder vakkenlijst.
- Extensie-icoon toegevoegd.
- Engelse README, MIT-licentie.

## 0.2.0 — 2026-09-16

- Fix JSON-export via background service worker.
- Fix instellingen sluiten met × en Escape.
- Settings-modal wordt niet meer na refresh heropend.
- Bewerkmodus toegevoegd.
- Kleuren voor groepen en vakken toegevoegd.
- Sortering A–Z / Z–A / eigen volgorde toegevoegd.
- Handmatige vakvolgorde verbeterd.
- Eigen displaynaam voor vakken toegevoegd.
- Duidelijkere melding voor onbeschikbare Toledo-versies.
- Import-file input robuuster verborgen.

## 0.1.0

- Eerste prototype.
