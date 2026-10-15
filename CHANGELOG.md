# Changelog

## 0.6.0 — 2026-10-16

- Engelse versie: alle teksten bestaan nu in het Nederlands en het Engels. De taal volgt automatisch je Toledo/browser, of kies zelf onder Instellingen > Uiterlijk.
- Updates en deadlines begrijpen ook een Engelstalige Toledo ("Today", "Yesterday").
- Groepen die Slim indelen aanmaakt krijgen namen in de gekozen taal.

## 0.5.0 — 2026-10-14

- Eigen pagina-indeling: bredere pagina, vakken links en een vaste zijbalk rechts die meescrolt.
- Begroeting bovenaan met datum en drie cijfers: taken voor vandaag, deadlines deze week, ongelezen updates.
- Eigen updates-overzicht in plaats van dat van Toledo: duidelijkere teksten (Nieuwe inhoud, Mededeling, Deadline, Toets, Nieuw cijfer), gegroepeerd per dag, met filters. Klikken gaat nog steeds via Toledo, dus berichten worden als gelezen gemarkeerd.
- Slim indelen: stelt een groepsindeling voor op basis van instelling, semester, opleidingscode of academiejaar, met een voorbeeld vooraf. "Niet ingedeeld" raadt het aan zodra er vakken wachten.
- Kop van de organizer heet nu "Mijn vakken", met het aantal vakken en groepen.
- Voettekst volgt het thema (was wit in donkere modus); gekleurde bolletjes bij updates verschijnen weer.

## 0.4.0 — 2026-10-14

- Donkere modus: Systeem, Licht of Donker, voor de organizer, het dashboard en heel het Toledo-portaal.
- Eigen accentkleur: kies een van de voorinstellingen of een eigen kleur; knoppen, links en de bovenbalk passen zich aan.
- Takenlijst in de rechterkolom: taken toevoegen met Enter, optionele deadline, afvinken, verwijderen, afgewerkte wissen. Te laat en vandaag vallen op. Alles blijft lokaal.
- "Binnenkort": deadlines en toetsen uit Toledo's updates, de eerstvolgende bovenaan, met één klik om te zetten in een taak.
- Sneltoetsen: `/` om te zoeken, `n` voor een nieuwe taak.
- Optie om Toledo's informatiepaneel te verbergen.
- De gekleurde bolletjes bij updates hebben weer de juiste vorm en kleur.

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
