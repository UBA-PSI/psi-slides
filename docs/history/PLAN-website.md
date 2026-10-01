# Plan: Die Website in Seiten aufteilen

## Befund

Die Startseite `docs/site/index.html` ist zu lang für eine Startseite, und was
in den letzten Slices dazukam, steht noch gar nicht darauf. Beides hat
denselben Grund: Es gibt nur eine Seite, also landet alles dort.

Gemessen als sichtbare Prosa – Markup, die SVG-Figur, Code-Blöcke und
Skripte abgezogen; die Messvorschrift steht unter *Mechanik*:

| Abschnitt | Prosawörter | Was er ist |
|---|---|---|
| Die Kurzfassung (Film) | 80 | Argument |
| Drei Sorten Text | 210 | Argument, das Herz der Seite, plus die große SVG-Figur |
| Was aus dem Markdown wird | 260 | Argument, mit den fünf Screenshots |
| Titelfolien und Trenner | 400 | Katalog (10 Cover, 6 Trenner, 2 Varianten) |
| Vorlesungen selbst öffnen | 350 | Tabelle mit 18 Links und die Erklärung darüber |
| Loslegen | 870 | zwei Versionen, dann ein Null-auf-Tutorial-Walkthrough für Leute ohne Terminal |
| Auch eine Abbildung ist Text | 390 | Argument plus Preview-Hinweis plus Installationsblock |
| Dokumentation | 100 | Linkliste |
| Quellcode | 50 | Link |
| **Summe** | **≈ 3.000** | |

Drei Dinge fallen auf.

**Die Seite macht zwei Jobs, und der zweite ist der größere.** Das Argument
(Film, drei Sorten Text, was aus dem Markdown wird) ist mit 550 Wörtern
kompakt. Die anderen 2.400 sind Nachschlagen und Anleitung: Katalog,
Linktabelle, Installation, Figuren-Installation. Wer das Argument liest,
scrollt durch 600 Wörter Windows-Installationshinweise; wer installieren
will, sucht den Abschnitt in der Mitte einer langen Seite. „Loslegen“ allein
ist fast ein Drittel der Seite.

**Der Hinweis „Preview, nicht in 1.0.0“ steht viermal.** Bei den Titelfolien,
bei den Figuren, in der Linktabelle und in „Loslegen“. Jeder ist richtig, und
zusammen tragen sie die Seite. Das ist kein Website-Problem, sondern die
Release-Frage; entschieden ist, dass das Release nach der Aufteilung kommt,
also hält der Plan die vier Hinweise an einer Stelle, damit das Release sie
an einer Stelle löscht.

**Die Stunde vor dem Raum fehlt.** Die Seite zeigt Cockpit, Übersicht und
Suche als Screenshots, mit je einem Absatz. Was seit 1.0.0 dazukam, steht
nirgends: die Cue Cards (`K`), die Live-Demo (`D`), die Annotation, die die
Folie füllt (`N`), das Schwarzschalten (`B`), der Laser (Mausbewegung über
der Bühne im Cockpit, keine Taste), das Einfrieren (`V`), Panels und Docks,
die Beats unterhalb der obersten Ebene. Dabei ist das der Teil, der
psi-slides von einem Markdown-zu-HTML-Konverter unterscheidet.

**Zwei Dinge sind unterwegs und ändern die Seite nochmal.** Der
Desktop-Builder (Branch `desktop-builder`, Worktree
`../psi-slides-builder/`, **noch nicht auf `main`**: 21 Commits voraus, 30
dahinter) ersetzt für die Zielgruppe die Node-Installation: ein Fenster, das
neben dem Editor offen bleibt und sagt, ob der letzte Speichervorgang gebaut
hat. Damit ist der Walkthrough nicht mehr der Hauptweg, sondern der
Entwicklerweg. Sein Workflow `desktop.yml` läuft pfadgefiltert (`desktop/**`,
`build.js` und die Engine-Dateien) auf Push, PR und von Hand, und baut drei
Pakete – macOS (dmg, zip), Windows (nsis), Linux (AppImage, deb); der letzte
Lauf war auf allen dreien grün. Die Pakete hängen als Run-Artefakte am Lauf,
nicht an einem Release, und der Workflow hat nur `contents: read`. Getestet
ist davon nur macOS; Windows und Linux sind gebaut, aber nie gestartet
worden. Und der PDF-Export (Branch `pdf-export`, 17 voraus, **99 hinter**
`main`; Flag `--slides-pdf`, Ausgabe `slides.pdf` neben `source.md`, eigenes
Modul `pdf-export.mjs` als zweite dokumentierte Ausnahme vom Ein-Datei-Build,
80 Specs in `test/pdf-export.mjs`) ist eine fünfte Ausgabe, die den Hero-Satz
„vier HTML-Dateien“ und die Tabelle der Vorlesungen berührt.

**Die Seite ist dicht und schmal.** `main` und `.wrap` sind auf 48rem
begrenzt, bei 21px Grundschrift also rund 1000px. Screenshots (`figure.shot`),
das Bildpaar und die Drei-Sorten-Figur brechen heute schon auf `min(94vw,
66rem)` aus, und die Cover-Galerie steht dreispaltig; aber Tabellen, Code
neben Ergebnis und alle Prosa bleiben eine Spalte im Lesemaß. Auf einem
1440er oder 1920er Desktop steht ein Textband in der Mitte mit leeren
Flanken, und weil die Bänder ohne Pause ineinander übergehen, wirkt die Seite
voller, als sie ist. Ein Lesemaß von 48rem ist für Prosa richtig; für
Vergleiche, Tabellen und Code-neben-Bild ist es der Fehler.

Dazu ein Kostenfaktor: `index.de.html` ist eine vollständige Übersetzung der
Startseite. Jede Änderung ist zwei Änderungen, und die Übersetzung hinkt
nach, sobald man das einmal vergisst. Entschieden ist trotzdem: **alle Seiten
zweisprachig**, nicht nur die Startseite. Der Plan muss also sagen, wie die
Übersetzung nicht nachhinkt (siehe *Mechanik*).

## Ziel

Die Startseite macht das Argument und verlinkt für alles andere. Drei neue
Unterseiten tragen, was heute die Startseite aufbläht, und eine davon, was
heute fehlt. Richtwert für die Startseite: unter 1.400 Prosawörter, kein
Abschnitt über 400, gemessen mit der Vorschrift unter *Mechanik*.

Entschieden: **Das Release kommt nach der Aufteilung.** Die Website wird also
so gebaut, wie sie nach dem Release aussehen soll, mit dem einen
Preview-Kasten als letztem Rest, den das Release löscht. Der Desktop-Builder
und der PDF-Export werden in der Struktur schon vorgesehen, mit ihrem Inhalt
aber erst geschrieben, wenn ihre Branches auf `main` sind; die Website soll
nichts beschreiben, was `main` nicht baut.

### Startseite `index.html`

Bleibt, gekürzt:

1. Hero. Die App wird Teil des Arguments: der Hero nennt sie als den Weg
   für Leute ohne Terminal, „Node 20“ verschwindet von der Startseite und
   steht nur noch im Kommandozeilen-Weg auf „Loslegen“. Bis zum
   Builder-Merge bleibt der Hero, wie er ist.
2. Der Film.
3. Drei Sorten Text, in voller Länge.
4. Was aus dem Markdown wird: das Quellbeispiel und die fünf Screenshots,
   das Markdown links und die Folie rechts. Die Absätze zu Cockpit,
   Übersicht, Suche und Handout auf je zwei Sätze kürzen, mit Link auf die
   neue Seite „Im Raum“.
5. Ein neuer, kurzer Abschnitt **„Im Raum“**: drei bis vier Sätze und ein
   Screenshot (Cockpit in der Cue-Cards-Anordnung, weil das die Anordnung ist,
   die man auf keinem anderen Bild sieht), Link auf die Unterseite.
6. **Titelfolien und Trenner**: nur `classic`, `panel`, `hero` als drei
   Kacheln plus ein Satz, Link auf die Galerie-Seite. Die anderen sieben Cover,
   die sechs Trenner und die zwei Varianten ziehen um.
7. **Vorlesungen selbst öffnen**: Tabelle bleibt (sie ist der Grund, warum
   Leute wiederkommen), die 200 Wörter Erklärung darüber auf einen Absatz.
8. **Loslegen**: nach dem Builder-Merge zwei Wege in je einem Absatz: die
   App (herunterladen, `source.md` öffnen, fertig) und die Kommandozeile
   (`git clone`, `npm install`, `build.js`). Bis dahin der heutige
   Zwei-Versionen-Absatz mit `curl` und `git clone`. Der Walkthrough für
   Leute ohne Terminal zieht in jedem Fall um. Link.
9. **Eine Abbildung ist Text**: der Argumentabsatz und das Bild, der
   Quellblock neben dem gezeichneten Ergebnis. Der Installationsblock und der
   Preview-Kasten ziehen nach „Loslegen“.
10. Dokumentation und Quellcode, als eine Sektion.

### Unterseiten

Alle liegen in `docs/site/`, teilen `site.css` und `site.js`, bekommen die
Universitätsleiste über `landing()` in `build-site.js` (eine Closure in
`main()`, die den Marker durch die Leiste ersetzt) und die umgebaute
Navigation in dieser Leiste (siehe *Mechanik*).

**`getting-started.html` – Loslegen.** Zwei Wege, in dieser Reihenfolge,
sobald der Builder auf `main` ist:

1. *Die App.* Der Desktop-Builder für macOS, Windows und Linux: Download von
   der Releases-Seite, öffnen, `source.md` öffnen oder aufs Fenster ziehen,
   und das Fenster baut bei jedem Speichern nach. Ein Screenshot des Fensters
   (aus `desktop/DESIGN.md` folgt, wie es aussieht), drei Sätze, was die App
   nicht ist (kein Editor, kein Account, nichts verlässt den Rechner – die
   Fünf-Zeilen-Sicherheitsbeschreibung aus `desktop/README.md`). Dann „Eine
   eigene Vorlesung schreiben“: `--new` ist in der App der Knopf „New
   lecture…“, `--watch` ist ihr Normalzustand. Lint-Befunde zeigt sie nicht,
   nur die Fehlermeldung des Builds; `lint.js` bleibt Kommandozeile.
2. *Die Kommandozeile.* Für Leute, die ohnehin ein Terminal offen haben, und
   für CI: `git clone`, `npm install`, `build.js`, `lint.js`, `--watch`,
   `--serve`. Der heutige Null-auf-Tutorial-Walkthrough (Node installieren,
   Terminal, `cd`, Linux-Absatz) bleibt als aufklappbarer Block darunter,
   weil ihn die App zwar überflüssig macht, aber nicht für jeden.

Bis zum Builder-Merge steht hier der heutige Text in voller Länge. Dazu
**ein** Kasten „Was der Download nicht hat“, der die vier Preview-Hinweise
ersetzt: Figuren, Titelfolien, Karten, Editor, mit dem `git clone`-Block.
Das ist die Stelle, die das Release streicht.

**`in-the-room.html` – Im Raum.** Die neue Seite, das Cockpit als Erzählung
einer Vorlesungsstunde, nicht als Tastentabelle (die hat `?`). Jeder Absatz
neben dem Screenshot, den er beschreibt, mit wechselnder Seite:

- Die zwei Fenster und wie sie sich abstimmen, ohne Server.
- Die Notiz, das Kommende, der Timer und die Uhr.
- `K`: die Cue Cards, die dritte Anordnung des Cockpits. Eine `> note:` ist
  eine Karte, ihre Fettungen sind die Stichpunkte, ihre Position zwischen den
  `---` sagt, auf welchem Beat sie gesagt wird; Space geht erst die Karten
  durch, dann die Reveals; `@12:30` legt die Drift neben die Uhr. Der
  Anlass war eine Keynote mit ausgeschriebenem Skript und minimalen Folien,
  und das ist der Satz, mit dem die Seite es einführt. Screenshot aus dem
  Tutorial, das Notizen mit Fettungen und eine `@mm:ss`-Marke hat; der Chunk
  ist auszuwählen, `shoot.mjs` adressiert `speaker.html` per Fragment.
- `Space` und die Beats: Segmente, Schritte in Figuren, Beats in Panes,
  Karten und Zeilen.
- `C` und die gekürzte Folie; `#` Auto-Fit.
- `O` Übersicht, `/` Suche.
- `B` schwarz, der Laser, `V` einfrieren.
- `N`: die Annotation, die die Folie füllt, mit QR-Code für eine Adresse.
- `D`: die Live-Demo, mit dem Hinweis auf die erste Aufnahme unter macOS.
  Der Screenshot zeigt kein fremdes Fenster, sondern etwas Bekanntes: die
  psi-slides-Website selbst als Demo-Bild. Technisch so, wie `test/demo.mjs`
  es macht – `getDisplayMedia` wird durch einen Canvas-Stream ersetzt; für
  den Shot wird ein Screenshot der Website in den Canvas gezeichnet und mit
  `captureStream()` eingespeist.
- Links: Adresse plus QR-Code auf beiden Bildschirmen statt Browserfenster
  auf dem Beamer; Video und Embeds in einem Satz.
- Shift-E und `--integrate-annotations`: was man mitgeschrieben hat, kommt
  zurück ins Markdown.
- Der Screencast (`docs/TODO-screencast-script.md`), sobald es ihn gibt, als
  Film am Kopf der Seite, wie die Kurzfassung auf der Startseite.

Screenshots: `cockpit.webp` gibt es; neu wären Cue Cards, Annotation-Layer
auf der Projektion, Cockpit mit DEMO-Badge, Laser, Schwarzbild. `shoot.mjs`
kennt pro Shot schon `lecture:`, `target:` und `act:` mit Tastendruck, neue
Shots aus anderen Lectures passen ohne Umbau hinein (der Dateikopf sagt acht
Shots, `SHOTS` hat neun; beim Ergänzen den Kopf mitziehen).

**`decoration.html` – Titelfolien, Trenner, Karten, Hintergründe.** Die
heutige Galerie komplett (zehn Cover, sechs Trenner, `cover-align`,
`cover-ratio`), plus das, was die Decoration-Vorlesung zeigt und die Website
bisher nur in einem Satz nennt: Karten und Zeilen, `::: backdrop`, Overlay,
Panel, Dock. `shoot-gallery.mjs` schießt die Cover heute schon; für Karten,
Backdrop und Dock je einen Shot aus `lectures/decoration` dazu.

**`figures.html`** bleibt, wie sie ist. Ihr Preview-Kasten verweist auf den
einen Kasten in „Loslegen“ statt ihn zu wiederholen. **`comparison.html`**
bleibt, wie sie ist.

**Der PDF-Export, wenn er gemergt ist.** Eine fünfte Ausgabe: ein Foliensatz
mit jedem Beat als Seite, für Räume ohne Browser und zum Weitergeben. Auf der
Website berührt das drei Stellen: den Hero-Satz („vier HTML-Dateien“ wird
„vier HTML-Dateien und auf Wunsch ein PDF“), einen Absatz in „Was aus dem
Markdown wird“, und eine fünfte Spalte in der Tabelle der Vorlesungen. Er
bekommt keine eigene Seite; die Abgrenzung zu den Handouts (das PDF ist die
Folie, `print.html` ist der Text) ist ein Absatz in „Loslegen“, wo der
Export aufgerufen wird. Für die Tabelle müsste `pages.yml` die PDFs bauen:
Chrome liegt im Runner-Image (`/usr/bin/google-chrome`, so nehmen es
`browser.yml` und `release.yml`), das ist ein weiterer Schritt, kein
vorhandener. Jeder Beat ist eine Seite, also nicht für alle fünf Decks:
Tutorial und das kurze Beispiel reichen.

### Nicht auf die Website

`speaker.md`, `PRD.md`, `HANDOFF.md` bleiben draußen, aus dem Grund, der in
`build-site.js` steht. Das Tastenverzeichnis kommt nicht auf die Website,
weil `?` es in jeder Vorlesung hat und eine Kopie veraltet.

## Mechanik

**Messvorschrift für die Wortzahl.** Ein kleines Skript neben
`build-site.js` (oder ein Modus darin): pro Seite die sichtbare Prosa ab
`<main>`, nach Entfernen von `<svg>`, `<pre>`, `<script>`, `<style>` und
Kommentaren, Tags gestrippt, Entities aufgelöst, an `<h2>` in Abschnitte
geteilt. Es gibt die Tabelle oben aus und ist das, womit der Richtwert
geprüft wird. Ohne die Vorschrift ist „unter 1.400“ eine Meinung.

**Seiten registrieren.** `build-site.js` hat `landing(src, out, lang, base)`
für handgeschriebene Seiten und `PAGES` für aus Markdown gerenderte. Die drei
neuen Seiten sind handgeschrieben (Screenshots, Kacheln, Tabellen), also drei
`landing()`-Aufrufe je Sprache. Der Marker für die Universitätsleiste muss
in jeder Datei stehen; das Skript wirft sonst, das ist gut so.

**Navigation: die vorhandene umbauen, keine zweite.** `topbar()` in
`build-site.js` trägt heute schon vier Links (Vorlesungen, Loslegen, Figuren,
Vergleich, ab 60rem sichtbar) und ein Burger-Menü mit denselben Einträgen
und dem Sprachwechsel. Die neue Navigation ist diese Leiste mit neuen
Einträgen: Start · Im Raum · Titelfolien · Figuren · Loslegen · Vergleich.
Dafür bekommt `topbar()` die aktuelle Seite als Parameter, damit
`aria-current` gesetzt wird und der Sprachschalter auf die Zwillingsseite
zeigt statt immer auf `index.html` – heute kennt die Funktion keine Seite,
und `SHELL` (für `comparison.html`) und `figures.html` rufen sie fest mit
`('en', '')`. Das ist eine Signaturänderung, die alle Aufrufer mitnimmt.

**Anker.** `#getting-started` und `#open-them-yourself` werden von außen nur
aus der eigenen Leiste verlinkt, `#figures` gar nicht; README, package.json
und CHANGELOG zeigen auf die Wurzel. Einzig `#covers` wird dreimal aus
`lectures/decoration/source.md` verlinkt, **mit eingebackenen QR-Codes** in
den getrackten Views. Ein Code vom Beamer, der auf drei Kacheln plus Link
landet, ist schlecht; also die drei Links in der Vorlesung auf
`decoration.html#covers` umbiegen und die getrackten Views neu bauen. Die
Startseite behält die Ids auf den gekürzten Abschnitten, mehr braucht es
nicht.

**Layout: breiter, luftiger, zwei Spalten wo es zwei Dinge gibt.** Das ist
der zweite Grund für den Umbau, und er wird **an der heutigen Startseite
geprobt, bevor eine zweite Seite entsteht** (Schritt 0 unten), weil fünf
Seiten, die alle das Layout bekommen, fünf Stellen für dieselbe Korrektur
sind:

- Zwei Breiten statt einer. Prosa bleibt im Lesemaß (48rem). Alles andere
  bekommt einen breiten Rahmen, etwa 72rem: die Tabelle der Vorlesungen, die
  Codebeispiele neben ihrem Ergebnis, und die Screenshots, die heute schon
  auf 66rem ausbrechen. `main.banded` und `.wrap` gibt es; es fehlt ein
  `.wrap-wide`, und die Bänder entscheiden, welchen sie nehmen.
- Zwei Spalten ab etwa 64rem Viewport, wo die Seite heute untereinander
  stapelt, was nebeneinander gehört: das Markdown links, die Folie rechts
  („Was aus dem Markdown wird“); der Quellblock der Figur neben dem
  gezeichneten Ergebnis; auf „Im Raum“ der Absatz neben dem Screenshot; auf
  „Loslegen“ App und Kommandozeile als zwei Spalten mit demselben Ziel
  darunter. Unter 64rem stapelt alles wieder, wie heute.
- Luft. Der Zeilenabstand (1.62) ist gut, aber die Bänder gehen ohne Pause
  ineinander über. Mehr Abstand zwischen Bändern, weniger innerhalb, und pro
  Band ein Bild oder ein Block, nicht drei. Das Ordnungsmittel sind Weißraum
  und der Bandwechsel `band-read` / `band-do`, die es schon gibt; nichts
  anderes.
- Die Prüfung ist ein Blick auf 1440 und 1920 Pixel, nicht nur auf dem
  Laptop.

**Handwerk, und was nicht passieren darf.** Die Regeln für jede Seite, die
in diesem Umbau angefasst wird:

- Die Reihenfolge pro Seite ist fest: englischer Text fertig im fertigen
  Layout, dann `prose-passes` (Jargon, Mehrdeutigkeit, umgekehrte Pyramide)
  auf dem Englischen, dann die deutsche Übersetzung aus dem gepassten
  Englischen, dann `prose-passes` auf dem Deutschen, dann das Zwillings-Gate.
  Nicht anders herum und nicht parallel, sonst laufen drei Fassungen
  auseinander. Nicht vor dem Layout, weil eine Zeile neben einem Screenshot
  eine andere Länge verträgt als eine im Lesemaß.
- Das Weblayout entsteht mit dem `frontend-design`-Skill, unter diesen
  Grenzen: **kein AI-Slop-Design.** Keine Accent-Borders an der linken Kante,
  keine übertriebenen Eyebrows (kleine Kapitälchen-Vorzeilen über jeder
  Überschrift), keine Karten mit Schatten für alles, keine Gradient-Blobs,
  keine Icon-Reihe mit drei Nutzenversprechen. Und positiv: das eine
  Ordnungsmittel ist Weißraum plus der Bandwechsel, siehe oben. Das ist
  dieselbe Regel, die für die Folien gilt: die Komposition trägt, nicht das
  Ornament.
- An den Schriften ändert sich nichts Grundsätzliches. Die Seite setzt die
  Familien, die auch die Vorlesungen setzen, und das ist ein Argument der
  Seite, kein Zufall. Größen und Abstände dürfen sich ändern, die Familien
  nicht.
- Die Farb-Tokens in `site.css` (`--ink`, `--paper`, `--rule`, …) bleiben,
  wie sie sind: `figures.html` zeichnet seine Diagramme ungemappt mit ihnen
  (Kommentar in `refresh-figures.mjs`), eine Palettenänderung färbt die
  Figuren um.
- Typographische Anführungszeichen und Halbgeviertstriche gelten auch für
  die Website-Prosa, in beiden Sprachen.
- Code-Blöcke auf der deutschen Seite dürfen ihre `#`-Kommentare
  übersetzen, die Befehle nicht. Das ist genau die Grenze, die das
  Zwillings-Gate prüft.
- Zur Orientierung, nicht zum Kopieren: Seiten wie typst.app und obsidian.md
  zeigen, wie ein Werkzeug für Text sich auf einem breiten Viewport
  präsentiert, ohne dass die Prosa darunter leidet. Ein Layout-Klon davon ist
  ausdrücklich nicht gewollt.

**Die deutsche Seite: alles parallel, mit Ausnahmeliste.** Jede
handgeschriebene Seite hat eine `.de.html`-Zwillingsdatei, die `landing()`
nach `de/` baut, wie heute die Startseite: `index`, `in-the-room`,
`decoration`, `getting-started`. **Einsprachig bleiben** `figures.html`
(seine Figuren spleißt `refresh-figures.mjs` zwischen Marker, ein Zwilling
müsste vom Spleiß-Skript mitversorgt werden), das Handbuch
`docs/artifact/figures-you-write.html` und `comparison.html` (aus Markdown
über `SHELL`). Alle drei tragen die Navigation; ihr Sprachschalter zeigt auf
die deutsche Startseite. Das Handbuch bekommt dafür die Leiste: es geht
künftig durch `landing()`, und `refresh-figures.mjs` setzt den Marker, den
`landing()` ersetzt.

Damit die Übersetzung nicht nachhinkt, prüft `build-site.js` die Struktur
der Zwillinge gegeneinander und wirft, wenn sie abweicht. Realistisch
definiert, weil die heutige deutsche Seite die naive Fassung schon verletzt:
Tags gestrippt; gleiche Anzahl und Ebene der `h2`/`h3` (nur 5 von 17
Überschriften haben heute Ids – entweder alle bekommen eine, oder das Gate
zählt); gleiche Bilder in gleicher Reihenfolge, Pfade um das `../` der
deutschen Seite normalisiert; gleiche Code-Blöcke nach Abschneiden der
`#`-Kommentare und Strippen der Syntax-Spans; gleiche Link-Ziele. Der Text
dazwischen darf frei sein. Es läuft in `pages.yml`, wo es die Site vor dem
Deploy stoppt. **Timing:** Das Gate landet erst, wenn alle Zwillinge
existieren (Schritt 7), sonst ist die Site zwischendurch nicht baubar; bis
dahin kommt jede neue Seite mit ihrem Zwilling im selben Commit.

**Link-Gate.** `build-site.js` löst jeden `href` auf eine `.html` im
Ausgabeordner auf. Die Vorlesungs-Views werden in `pages.yml` heute **nach**
`build-site.js` nach `_site/` kopiert; das Gate fände sie nicht. Also die
Kopie vorziehen, oder das Gate kennt die Lecture-Ordner.

**Dev-Binaries vor 2.0.0.** Ja, das geht, mit einem GitHub-Pre-Release, aber
nur unter einem Tag, das `release.yml` nicht sieht: **`builder-0.1.0`**.
`release.yml` triggert auf `v*`, prüft das Tag gegen `package.json` und ruft
`gh release create` ohne `--prerelease`; ein `v2.0.0-beta.1` würde „Latest“
und `releases/latest/download/psi-slides.tar.gz`, das die Startseite
verlinkt, zeigte auf eine Beta-Engine. Beim `builder-`-Tag also:

- `desktop.yml` bekommt einen Job, der bei einem Tag-Push die drei Pakete
  ans Release hängt (`gh release create --prerelease` plus Upload), mit
  `contents: write` und mit `artifactName` in der electron-builder-Config,
  damit die Asset-Namen keine Versionsnummer tragen und die Links auf der
  Website stehen bleiben.
- Die Website verlinkt das Tag ausdrücklich
  (`releases/download/builder-0.1.0/…`), weil `releases/latest/download/`
  Pre-Releases überspringt und weil ein Link so immer das Paket bezeichnet,
  das getestet wurde.
- Das macOS-Paket aus CI ist unsigniert; das signierte und notarisierte
  kommt von deinem Rechner (`npm run dist:signed`) und wird von Hand ans
  Release gehängt, bis ein Zertifikat in CI liegt.
- Die Website sagt beim Pre-Release dazu, was `desktop/README.md` sagt:
  unsigniert außer macOS, Windows warnt einmal, Windows und Linux ungetestet,
  Rückmeldung erbeten.

## Reihenfolge

Zwei Stränge, weil zwei Branches noch nicht auf `main` sind. Der erste
braucht sie nicht und kann sofort losgehen; der zweite wartet auf die Merges.

Strang A, jetzt:

0. ~~**Layout an der heutigen Startseite proben.**~~ Erledigt, in beiden
   Sprachen. Was dabei herauskam und für die Unterseiten gilt:
   - Ein Rahmen statt Ausbruch: `--frame: 68rem` auf `.wrap`, die vier
     `translateX`-Ausbrüche sind weg, alles steht auf einer linken Kante.
     Prosa behält ihr Maß (`--measure: 40rem`, über `p, li`).
   - `.beside`: Prosa (`.beside-prose`) neben dem Ding, 3:4 ab 1216px,
     darunter gestapelt. `.beside.halves` für zwei Gleiche (die zwei
     Versionen). Ein `pre` in einem `.beside` bricht um statt zu scrollen.
     Sechs Stellen auf der Startseite tragen es: Markdown | Code, Prosa |
     drei Kacheln, Prosa | Tabelle, Release | Repository, Prosa | Befehle,
     Prosa | gezeichnete Figur.
   - Bänder: `clamp(4.5rem, 7vw, 6.5rem)`; zwei Bänder gleicher Farbe in
     Folge schließen auf, und das zweite bekommt die schwere Linie über der
     Überschrift, sonst entsteht ein 270px-Loch.
   - Media Queries rechnen `rem` mit 16px, nicht mit den 21px der Seite.
     Jeder Breakpoint in `site.css` ist in Sechzehnteln.
   - Gesehen, nicht gemacht: `figures.html` erbt den Rahmen und sieht mit
     großen Figuren gut aus, hat aber noch kein `.beside`; die Prosa steht
     links in einem breiten Rahmen. Bekommt den Zweispalter mit der
     Navigation in Schritt 1. Und das Markdown-Beispiel hat harte Umbrüche
     aus der Quelle, die neben dem weichen Umbruch der Spalte ausfransen;
     beim Kürzen in Schritt 5 die Zeilen des Beispiels neu setzen.
0b. ~~**Der Neuentwurf.**~~ Erledigt und gemergt. Aus drei verworfenen
   Layouts wurde ein Prinzip, das in `docs/site/DESIGN.md` steht: ein
   Rahmen, eine linke Kante, zwei Anschläge nach rechts; jedes Bild auf
   einer Bühne mit einem Satz davor; nie eine halbleere Zeile; die Seite
   nicht weiß, damit die weißen Screenshots Objekte darauf sind. Die
   Startseite ist dabei schon gekürzt und neu erzählt worden, Schritt 5
   des alten Plans ist damit erledigt. **Lies `DESIGN.md`, bevor du eine
   Unterseite baust** – sie erbt dasselbe Stylesheet und muss dieselben
   Regeln tragen.
1. ~~Navigation, Messskript, Link-Gate, Zwillings-Gate.~~ Erledigt. Eine
   Tabelle `SITE_PAGES` in `build-site.js` trägt je Seite eine Zeile; eine
   neue Seite ist dort eine Zeile plus ein Label, Sprachschalter und
   Link-Gate lesen dieselbe Tabelle. Die Leiste hält sechs Einträge bis
   1328 px (gemessen: 1272 englisch, 1306 deutsch), zwei alte
   Breakpoint-Fehler sind dabei weggefallen. `--words` zählt die Prosa je
   Abschnitt: Startseite heute 2.503 Wörter englisch, 2.333 deutsch, und
   „Getting started“ ist mit 758 der einzige Abschnitt über 400.
2. `getting-started.html` mit Zwilling herausziehen. Der Builder ist
   inzwischen auf `main` und als `builder-0.1.0` vorveröffentlicht, also
   wird der App-Weg gleich richtig geschrieben statt als Platzhalter, mit
   Windows und Linux als experimentell markiert.
3. `in-the-room.html` und `in-the-room.de.html` schreiben, mit Cue Cards,
   Annotation, Live-Demo, und den vorhandenen Screenshots. Das ist die
   Seite, die fehlt.
4. `decoration.html` mit Zwilling herausziehen, Karten, Backdrop, Dock
   ergänzen, neue Shots; die drei `#covers`-Links in
   `lectures/decoration/source.md` umbiegen, Views neu bauen.
5. Startseite auf die Unterseiten verlinken und die umgezogenen Abschnitte
   dort auf einen Absatz kürzen.
6. Neue Shots in `shoot.mjs`, einmal schießen, committen.
7. Zwillings-Gate scharf schalten, in `pages.yml`.

Strang B, nach den Merges:

8. ~~`desktop-builder` auf `main` mergen.~~ Erledigt: ein Konflikt im
   Changelog, `build.js` automatisch sauber, die getrackten Views bauen
   byte-identisch, Gates, Lint, die 32 Unit-Tests und der Smoke-Test des
   Builders grün.
9. ~~Pre-Release `builder-0.1.0`.~~ Erledigt: `desktop-release.yml` auf
   `builder-*`-Tags, ruft `desktop.yml` per `workflow_call`, hängt die
   Pakete mit versionsfreien Namen an ein Pre-Release; CONTRIBUTING und
   `desktop/README.md` beschreiben das Schema.
10. **Zurückgestellt.** Windows und Linux werden vorerst nicht auf einer VM
    gestartet. Die Website verlinkt alle drei Pakete und markiert Windows
    und Linux als **experimentell** (gebaut, nicht ausprobiert), mit der
    Bitte um Rückmeldung; die Release-Notes sagen dasselbe. Das
    VM-Starten bleibt als Aufgabe vor 2.0.0.
11. Den App-Weg in „Loslegen“ schreiben, den Walkthrough aufklappbar machen,
    die Startseite auf „App oder Kommandozeile“ umstellen. Beide Sprachen.
12. `pdf-export` auf `main` mergen – 99 Commits hinter `main`, dieselbe
    Warnung wie bei Schritt 8 – dann Hero-Satz, Absatz, fünfte
    Tabellenspalte, `pages.yml` baut die PDFs für Tutorial und Beispiel.
13. Release 2.0.0. Preview-Kasten löschen, die zwei Fußnoten in der Tabelle
    löschen, `figures.html` und `decoration.html` verlieren ihren
    Preview-Hinweis, die Builder-Links wechseln vom Pre-Release-Tag auf
    `releases/latest/download/`.

Jeder Schritt lässt die Site baubar und verlinkt; `node docs/site/build-site.js
_site` nach jedem.

## Entschieden

- Die App wird Teil des Arguments der Startseite; „Node 20“ wandert in den
  Kommandozeilen-Weg.
- Das Figuren-Handbuch bekommt Leiste und Navigation über `landing()`.
- Die Arbeit beginnt mit Schritt 8, dem Builder-Merge, damit „Loslegen“ von
  Anfang an mit beiden Wegen geschrieben wird; danach Strang A ab Schritt 0.

- Das Release kommt nach der Aufteilung.
- Alle handgeschriebenen Seiten zweisprachig, mit dem Struktur-Gate als
  Preis; `figures`, das Handbuch und `comparison` bleiben englisch.
- „Im Raum“ bekommt auf der Startseite einen Screenshot und trägt den
  Screencast, sobald es ihn gibt.
- Dev-Binaries des Builders vor 2.0.0 als GitHub-Pre-Release unter
  `builder-0.1.0`; Windows und Linux werden verlinkt, aber als
  experimentell markiert, das VM-Starten ist auf vor 2.0.0 verschoben.
- Das Layout ist neu entworfen und gemergt; das Prinzip und die drei
  verworfenen Vorgänger stehen in `docs/site/DESIGN.md`.
- Der Live-Demo-Screenshot zeigt etwas Bekanntes (die Website selbst), kein
  fremdes Fenster.
- Die Website beschreibt nur, was `main` baut: Builder und PDF-Export erst
  nach ihrem Merge.
