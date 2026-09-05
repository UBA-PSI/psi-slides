# Diskussions- und Umsetzungsplan: Lokale Electron-Builder-App

## Status dieses Dokuments

Dieses Dokument beschreibt eine mögliche lokale Desktop-App für
`psi-slides`. Es ist ein Plan zur Diskussion, noch keine beschlossene
Implementierung.

Die erste Version ist bewusst **kein Markdown-Editor** und kein Ersatz für
eine IDE. Sie soll die technische Einstiegshürde beseitigen: Installation per
normalem App-Installer, Projekt per Dateidialog oder Drag-and-drop öffnen,
bei jeder gespeicherten Änderung automatisch bauen und die fertigen Ansichten
per Knopfdruck öffnen. Node.js, `npm` und die Kommandozeile sollen für
Anwenderinnen und Anwender unsichtbar bleiben.

Der Arbeitstitel in diesem Plan ist **psi-slides Builder**.

## Produktthese

Die kleinste nützliche Desktop-App ist kein vollständiges Authoring-Studio,
sondern eine freundliche Hülle um den bereits funktionierenden lokalen
Workflow:

```text
Text in beliebigem Editor speichern
              │
              ▼
┌─────────────────────────────────────────────┐
│ psi-slides Builder                          │
│                                             │
│  Meine Vorlesung                            │
│  …/meine-vorlesung/source.md                │
│                                             │
│  ● Bereit – zuletzt gebaut um 14:32         │
│                                             │
│  [Neu bauen]       [Automatisch bauen ✓]    │
│                                             │
│  [Präsentation]    [Cockpit]                │
│  [Handout]         [Handout mit Notizen]    │
│                                             │
│  [source.md öffnen]  [Ordner anzeigen]      │
│  ▸ Build-Details                            │
└─────────────────────────────────────────────┘
```

Die App löst damit genau die Probleme, für die heute technisches Wissen nötig
ist:

- keine separate Node.js-Installation,
- kein `npm install`,
- kein Terminal und keine Kenntnis der CLI-Flags,
- kein Suchen nach den vier erzeugten HTML-Dateien,
- sichtbare, verständliche Build-Fehler,
- ein dauerhafter Watch-Prozess, der automatisch startet und zuverlässig
  beendet wird.

Die Markdown-Bearbeitung bleibt zunächst bei einem Programm, das die Person
bereits kennt. Das kann ein sehr einfacher Texteditor sein. Ein eingebauter
Editor ist eine spätere, unabhängige Ausbaustufe und keine Voraussetzung für
den Nutzen des Builders.

## Warum Electron für diese Variante sinnvoll ist

Electron ist hier nicht wegen komplexer Web-Oberflächen interessant, sondern
weil es die zurzeit benötigte Laufzeit gleich mitbringt:

- Node.js für den bestehenden Builder,
- eine plattformübergreifende GUI,
- Dateidialoge und Drag-and-drop,
- Prozess- und Fensterverwaltung,
- Installer für macOS, Windows und Linux,
- später bei Bedarf eine integrierte Vorschau oder einen Editor.

Der Nachteil ist eine für den kleinen Funktionsumfang relativ große App.
Dieser Preis ist vertretbar, wenn der entscheidende Produktwert lautet:
„herunterladen, doppelklicken, funktioniert“. Eine kleinere native Hülle
würde weiterhin eine separat installierte oder als Sidecar verteilte
Node-Laufzeit benötigen und erhöht damit die Packaging-Komplexität.

## Ziele der ersten Version

- Installierbare Desktop-App für macOS, Windows und Linux.
- Öffnen einer vorhandenen `source.md` per Dialog oder Drag-and-drop.
- Erstellen eines neuen Projekts an einem frei gewählten Ort.
- Automatischer Build beim Speichern der `source.md`.
- Manueller Build per Knopfdruck.
- Klare Anzeige der Zustände „baut“, „erfolgreich“ und „fehlgeschlagen“.
- Verständliche Build-Fehler mit optional einblendbarem Roh-Log.
- Öffnen aller vier erzeugten Ansichten:
  `audience.html`, `speaker.html`, `print.html` und `print-notes.html`.
- Öffnen der `source.md` im vom Betriebssystem gewählten Texteditor.
- Öffnen des Projektordners im Finder, Explorer oder Dateimanager.
- Funktionierender `::: draw`-Editor einschließlich Write-back und
  Bild-Upload, solange der Builder läuft.
- Liste der zuletzt geöffneten Projekte.
- Kein Bedarf an einer systemweit installierten Node.js-Version.
- Vollständig lokale Verarbeitung; kein Account, Upload oder Cloud-Dienst.

## Nicht-Ziele der ersten Version

- Kein eingebauter Markdown-Texteditor.
- Keine Overleaf-artige Split-View.
- Keine Cloud-Synchronisation oder Zusammenarbeit mehrerer Personen.
- Kein Git-Client.
- Kein allgemeines Terminal und keine frei eingebbaren Build-Kommandos.
- Kein Plugin-System und keine Installation beliebiger npm-Pakete.
- Kein Präsentations-Hosting.
- Kein PDF-Export in Version 1.
- Keine Bildoptimierung, solange sie von externen Programmen wie `cwebp`
  oder ImageMagick abhängt.
- Keine Verwaltung komplexer Workspaces mit mehreren Vorlesungen in einem
  App-Fenster.
- Keine vollständige grafische Bearbeitung des Markdown-Dokuments.

## Primärer Arbeitsablauf

### Erststart

1. Die Person installiert und startet die App wie ein gewöhnliches
   Desktop-Programm.
2. Der Startbildschirm bietet „Neues Projekt“, „Vorhandenes Projekt öffnen“
   und die zuletzt verwendeten Projekte an.
3. Es gibt keine Node-, npm- oder Repository-Einrichtung.

### Vorhandenes Projekt

1. „Projekt öffnen“ wählt eine `source.md` aus; alternativ wird sie auf das
   App-Fenster oder App-Symbol gezogen.
2. Die App validiert, dass die Datei lesbar ist, und startet den Build- und
   Watch-Prozess.
3. Nach einem erfolgreichen Build werden die verfügbaren Ausgabe-Knöpfe
   aktiv.
4. „source.md öffnen“ startet den Standard-Texteditor des Systems.
5. Nach jedem Speichern baut die App erneut. Bereits geöffnete
   Präsentationsseiten laden nach einem erfolgreichen Build neu.
6. Bei einem Syntax- oder Asset-Fehler bleibt der letzte erfolgreiche Build
   erhalten. Die App zeigt den Fehler, statt die Vorschau durch eine defekte
   Ausgabe zu ersetzen.

### Neues Projekt

1. „Neues Projekt“ fragt nach Titel beziehungsweise kurzem Projektnamen und
   Zielordner.
2. Die App legt einen Projektordner mit `source.md` und `assets/` an.
3. Die Vorlage muss sofort erfolgreich bauen und einen kleinen
   `::: draw`-Block enthalten, damit der grafische Editor direkt ausprobiert
   werden kann.
4. Das neue Projekt öffnet sich anschließend im gleichen Projektfenster wie
   ein vorhandenes.

Der bestehende CLI-Befehl `node build.js --new <slug>` schreibt relativ zum
aktuellen Arbeitsverzeichnis nach `lectures/<slug>`. Für eine Desktop-App
reicht diese Schnittstelle nicht, und zwar aus drei Gründen, nicht nur aus dem
einen:

- Der Zielpfad ist fest.
- Die Vorlage trägt den Namen des Maintainers fest im Frontmatter
  (`presenter: Prof. Dr. Dominik Herrmann`). Für ein verteiltes Produkt muss
  der Presenter Parameter oder ein `TODO`-Platzhalter sein.
- `build.js` ruft `main()` beim Laden des Moduls auf. `scaffoldSource()` ist
  eine gewöhnliche Funktion, aber nichts aus `build.js` lässt sich importieren,
  ohne dass die CLI mitläuft. Ein Export allein hilft also nicht, solange der
  Modul-Seiteneffekt bleibt.

Die Lösung, die zur Architektur „die App wickelt die CLI ein“ passt, ist eine
CLI-Erweiterung statt eines Imports: `--new` nimmt einen Zielordner entgegen
(etwa `--new <slug> --into <dir>`), und die Vorlage bleibt die eine kanonische
aus `build.js`. Siehe „Änderungen an build.js vor Phase 1“.

## Doppelklick- und Dateizuordnung

„Doppelklick-fähig“ soll in Version 1 Folgendes bedeuten:

- Ein Doppelklick auf die App öffnet den Startbildschirm und die Liste der
  letzten Projekte.
- Eine `source.md` kann auf das App-Symbol gezogen werden.
- Über „Öffnen mit …“ kann eine `source.md` an den Builder übergeben werden.
- Unter Windows und Linux wird der Dateipfad aus den Prozessargumenten
  gelesen; unter macOS wird zusätzlich das `open-file`-Ereignis behandelt.
- Wird eine zweite Datei an eine bereits laufende Instanz übergeben, wird sie
  dort geöffnet, nicht in einem konkurrierenden Watch-Prozess.

Eine globale Zuordnung aller `.md`-Dateien zu psi-slides wäre zu aggressiv
und soll nicht voreingestellt werden. Auch ein eigenes Projektdateiformat wie
`.psislides` ist für den ersten Test nicht nötig. Falls später mehrere
Einstellungen, Ausgabeprofile oder zusätzliche Quelldateien dauerhaft zum
Projekt gehören, kann eine kleine Projektdatei ergänzt werden.

## Vorgeschlagene Oberfläche

### Startfenster

- „Neues Projekt“
- „Projekt öffnen“
- Drop-Zone für `source.md`
- zuletzt geöffnete Projekte mit Pfad und Zeitpunkt
- deutlicher Hinweis „Alles bleibt auf diesem Computer“

Nicht mehr vorhandene Dateien bleiben erkennbar in der Liste und können dort
entfernt werden. Die App soll nicht ungefragt im Dateisystem nach Projekten
suchen.

### Projektfenster

- Projekttitel und vollständiger oder verkürzter Pfad
- Build-Status mit Zeitpunkt und Dauer
- Hauptaktion „Jetzt bauen“
- Schalter „Bei Änderungen automatisch bauen“; standardmäßig an
- vier eindeutig benannte Ausgabeaktionen
- „Quelldatei öffnen“ und „Projektordner anzeigen“
- einklappbarer Bereich „Build-Details“
- bei Fehlern eine kurze Erklärung und das relevante Log
- Aktion „Watch neu starten“, falls der Hintergrundprozess endet

Der Normalzustand soll ohne Konsole auskommen. Das vollständige Log bleibt
trotzdem erreichbar, weil es bei unbekannten Fehlern für Bugreports wichtig
ist.

### Ausgabeaktionen

| Knopf | Datei | Zweck |
| --- | --- | --- |
| Präsentation | `audience.html` | Projektion und Einstieg in die Präsentation |
| Cockpit | `speaker.html` | Presenter-Ansicht |
| Handout | `print.html` | Lesefassung ohne Sprechernotizen |
| Handout mit Notizen | `print-notes.html` | Lesefassung einschließlich Notizen |

Ein Knopf ist nur aktiv, wenn die zugehörige Datei erfolgreich gebaut wurde.
Ein fehlgeschlagener Neubau darf einen noch vorhandenen letzten guten Build
nicht unbrauchbar machen; der sichtbare Status muss dann aber klar sagen,
dass die Ausgabe nicht dem aktuellen Quelltext entspricht.

Heute gilt das nur meistens. `buildOnce` rendert und schreibt die vier Views
nacheinander (print, print-notes, audience, speaker). Parse-Fehler und der
Pre-Flight kommen vor dem ersten Schreiben, aber ein Fehler, der erst in einem
Renderer auftritt, hinterlässt zwei neue und zwei alte Dateien. Damit die
Zusage oben stimmt, rendert `buildOnce` erst alle Views in den Speicher und
schreibt dann. Das ist eine Änderung von wenigen Zeilen und steht in
„Änderungen an build.js vor Phase 1“.

## Vorschau und Browserstrategie

Für Version 1 sollen die Ausgaben im **normalen Standardbrowser** geöffnet
werden. Das hat drei Vorteile:

- Die Präsentation verhält sich genauso wie eine später weitergegebene
  HTML-Datei.
- Präsentationsfenster und Speaker-Cockpit funktionieren mit der vorhandenen
  Browserlogik.
- Nicht vertrauenswürdiger Inhalt aus Markdown landet nicht in einem
  privilegierten Electron-Renderer.

Standardmäßig kann die App die erzeugten Dateien als `file://` öffnen. Der
vorhandene `--watch`-Modus injiziert bereits Live-Reload und die abgesicherte
`window.psiWatch`-Brücke für den Draw-Editor.

„Standardbrowser“ ist dabei nicht so neutral, wie es klingt. Die README legt
sich fest: Entwicklung und Einsatz finden in Chrome statt, andere Browser sind
ungetestet, nicht unsupported. Auf einem Mac der Zielgruppe ist der
Standardbrowser Safari, und dort laufen dann drei Dinge zusammen, die nur in
Chrome geprüft sind: `file://`-Seiten, der WebSocket zur Watch-Brücke und die
`window.opener`-Synchronisation zwischen Präsentation und Cockpit. Die App
sollte deshalb entweder Chrome oder Edge bevorzugt öffnen, wenn eines
installiert ist, oder die Frage als Einstellung stellen und die Einschränkung
im Startfenster nennen. Das ist offene Produktentscheidung 7.

Für Präsentationen mit Hosted Embeds wird ein echter Origin benötigt. Dafür
gibt es zwei mögliche Produktentscheidungen:

1. Die App bietet einen expliziten Modus „Lokal bereitstellen“ und startet
   zusätzlich das bestehende `--serve` auf Loopback.
2. Die App nutzt `--watch --serve` grundsätzlich und öffnet immer eine
   `http://localhost:<port>/…`-Adresse.

Für den MVP wird Variante 1 empfohlen. Sie hält den lokalen HTTP-Server aus,
wenn er nicht gebraucht wird, und entspricht dem heutigen Verhalten. Die App
kann die Build-Ausgabe zu Hosted Embeds erkennen und den Modus gezielt
vorschlagen.

Der vorhandene Server ist bereits auf `127.0.0.1` begrenzt und prüft, dass
angeforderte Dateien im Projektordner liegen. Vor einer standardmäßigen
Aktivierung sollte trotzdem entschieden werden, ob wirklich der ganze
Projektordner einschließlich `source.md` auslieferbar sein soll oder ob ein
engerer App-spezifischer Server nur bekannte Ausgabe- und Asset-Dateien
freigibt.

## `::: draw`-Editor im Builder-Workflow

Der grafische Editor ist auch ohne eingebauten Markdown-Editor sinnvoll:

1. Der Builder läuft im vorhandenen `--watch`-Modus.
2. Die gebaute `audience.html` enthält die lokale Watch-Brücke.
3. Ein Klick auf eine Draw-Figur öffnet den vorhandenen grafischen Editor.
4. „Apply to source“ schreibt ausschließlich den validierten Draw-Block in
   die lokale `source.md` zurück.
5. Ein Bild-Upload schreibt eine validierte Datei nach `assets/`.
6. Die Dateiänderung löst den normalen Rebuild aus und alle offenen Ansichten
   laden neu.

Die vorhandene Implementierung bringt dafür bereits wichtige
Sicherheits- und Konsistenzprüfungen mit:

- WebSocket nur auf Loopback,
- zufälliger Nonce pro Watch-Prozess,
- akzeptiert nur Ranges tatsächlich gebauter Draw-Blöcke,
- vergleicht den erwarteten alten Text vor dem Schreiben,
- lehnt veraltete parallele Änderungen ab,
- begrenzt Asset-Namen, Dateitypen und Größe.

Die Desktop-App darf diese Brücke nicht durch eine allgemeinere
Dateisystem-API ersetzen. Ihr enger Vertrag ist gerade der Grund, warum eine
im Browser laufende Präsentation nicht beliebige lokale Dateien schreiben
kann.

Ein verbleibender UX-Konflikt muss getestet werden: Ein externer Texteditor
kann melden, dass `source.md` außerhalb des Editors geändert wurde, nachdem
der Draw-Editor zurückgeschrieben hat. Das ist korrekt und sicherer als das
stille Überschreiben eines ungespeicherten Editorpuffers. Die Dokumentation
soll erklären, dass vor einer grafischen Bearbeitung offene Textänderungen
gespeichert werden sollten.

## Technische Architektur

```text
Electron Main Process
  ├── Fenster- und App-Lebenszyklus
  ├── Dateidialoge / Recent Projects
  ├── validierte IPC-Kommandos
  ├── Öffnen im Systembrowser/-editor
  └── Build-Prozess-Manager
             │
             │ feste Argumentliste, keine Shell
             ▼
      isolierter Node-Build-Prozess
        ├── verpacktes build.js + Abhängigkeiten
        ├── --watch für Rebuild/Draw-Write-back
        └── optional --serve auf Loopback

Electron Renderer
  ├── statische, gepackte Builder-Oberfläche
  ├── kein Node-Zugriff
  └── kleine API aus dem Preload-Script

Systembrowser
  └── gebaute HTML-Ausgaben
```

### Main Process

Der Main Process besitzt die wenigen privilegierten Fähigkeiten der App. Er
soll:

- ausgewählte Pfade kanonisieren und prüfen,
- pro Projekt höchstens einen Build-Prozess verwalten,
- stdout und stderr in strukturierte Statusereignisse übersetzen,
- Kindprozesse beim Projektwechsel und App-Ende sauber beenden,
- Systemaktionen wie „Datei öffnen“ und „Ordner anzeigen“ ausführen,
- Recent Projects in den normalen App-Einstellungen speichern.

### Build-Prozess

Für den ersten Prototyp darf die App den bestehenden CLI-Einstieg verpacken
und als separaten Node-Prozess starten. Wichtig ist:

- direkte Argumentübergabe als Array,
- niemals `shell: true` und niemals ein zusammengesetzter Kommando-String,
- Arbeitsverzeichnis und Quellpfad explizit setzen; das Arbeitsverzeichnis
  ist der Projektordner, weil `build.js` Dateinamen im Log relativ zu
  `process.cwd()` ausgibt und die App sonst Pfade parsen müsste,
- stdout/stderr vollständig erfassen,
- Exit, Absturz und Neustart als eigene Zustände behandeln,
- Node-Laufzeit aus Electron verwenden, nicht vom Hostsystem erwarten.

Vier Eigenschaften des heutigen `--watch` muss der Prozess-Manager kennen,
weil sie im Terminal nie aufgefallen sind:

- **Nur `source.md` wird beobachtet.** Ein Bild, das jemand nach `assets/`
  legt, oder eine Schrift in `fonts/` löst keinen Rebuild aus; erst der
  nächste Save der Quelle baut. Für V1 ist das in Ordnung, weil die Person
  ohnehin die Quelle ändert, um das Bild zu referenzieren. Der Knopf „Jetzt
  bauen“ ist der Ausweg. Phase 3 (Bilder per Drag-and-drop) braucht dann
  entweder diesen Knopf oder einen zweiten Watcher.
- **`fs.watch` sitzt auf der Datei, nicht auf dem Ordner.** Unter Linux folgt
  inotify dem Inode; ein Editor, der atomar per Rename speichert, lässt den
  Watcher stumm zurück, ohne dass der Prozess endet. macOS mit FSEvents zeigt
  das nicht. Das Abnahmekriterium „ein Save, ein Build, auch bei atomarem
  Speichern“ hängt genau daran. Fix in `build.js`: den Ordner beobachten und
  auf den Dateinamen filtern.
- **Der Watch fängt jeden Fehler, auch Defekte.** `rebuild()` fängt alles,
  was `buildOnce` wirft, und meldet nur die Nachricht. Ein `userFacing`-Fehler
  und ein Bug im Renderer sehen im Log gleich aus, und der Stack fehlt. Für
  einen Bugreport aus der App muss das strukturierte Log die Unterscheidung
  tragen.
- **Ein Kill genügt.** `build.js` installiert keine Signal-Handler; der
  WebSocket-Server und der Watcher sterben mit dem Prozess. Unter Windows ist
  `kill()` ein hartes `TerminateProcess`, was hier unbedenklich ist, weil der
  Prozess nichts zu flushen hat, das nicht schon auf der Platte liegt.

Je nach Electron-Packaging kann dafür ein Utility Process oder ein
entsprechend gestarteter Node-Child-Process verwendet werden. Die endgültige
Wahl soll anhand eines kleinen signierten Testpakets auf allen drei
Plattformen validiert werden; entscheidend ist die Isolation vom
UI-Renderer, nicht der Name der Electron-API.

Mittelfristig ist eine kleine Trennung im bestehenden Builder sinnvoll:

```text
CLI-Adapter ─┐
             ├── build core: buildOnce / watch / scaffold / lint
Electron ────┘
```

Der MVP soll aber nicht von einem großen Umbau des derzeitigen `build.js`
abhängen. Erst wenn der Prozess-Wrapper unzuverlässig oder die
Log-Auswertung zu fragil wird, wird eine programmgesteuerte Build-API zur
Voraussetzung.

### Renderer und Preload

Die Builder-Oberfläche benötigt nur eine kleine, typisierte Brücke, zum
Beispiel konzeptionell:

```text
chooseSource()
createProject(options)
openProject(path)
buildNow(projectId)
setWatching(projectId, enabled)
openOutput(projectId, kind)
openSource(projectId)
showProjectFolder(projectId)
subscribeToBuildStatus(projectId)
```

Es gibt absichtlich kein `readFile(path)`, `writeFile(path, data)`,
`spawn(command)` oder allgemeines IPC-Passthrough. Jeder Aufruf wird im Main
Process erneut validiert; Vertrauen in Werte aus dem Renderer reicht nicht.

## Sicherheitsmodell

Eine lokale App hat nicht die Missbrauchsrisiken eines öffentlichen Builders,
aber sie verarbeitet weiterhin potenziell fremde Markdown-Dateien und öffnet
daraus erzeugtes HTML. Deshalb gelten folgende Regeln:

- `nodeIntegration: false` in allen Renderern.
- `contextIsolation: true`.
- Electron-Sandbox für die GUI aktivieren.
- Nur eine schmale, explizite Preload-API exponieren.
- Keine Navigation der GUI auf externe Seiten.
- Externe Links ausschließlich kontrolliert im Systembrowser öffnen.
- Eine später integrierte HTML-Vorschau immer als nicht vertrauenswürdigen
  Inhalt in einem getrennten, nicht privilegierten WebContents behandeln.
- Kein Electron-/Node-Zugriff für gebaute Präsentationen.
- Build-Prozess getrennt vom GUI-Renderer ausführen.
- Build-Aufruf ohne Shell und ohne frei eingebbare Flags.
- Watch- und Serve-Sockets ausschließlich an Loopback binden.
- Projektzugriff auf die vom Nutzer ausgewählte `source.md` und ihren
  Projektordner begrenzen.
- Keine Secrets, Tokens oder Update-Credentials an den Build-Prozess geben.
- App-interne Webseiten mit einer restriktiven Content Security Policy
  ausliefern.

Der Builder besitzt naturgemäß Schreibrechte auf die vier Ausgabedateien und,
für Draw-Write-back und Asset-Upload, auf `source.md` und `assets/`. Die GUI
soll diese Möglichkeiten ehrlich erklären. Dateien außerhalb des gewählten
Projektordners dürfen nicht über Renderer-Kommandos adressiert werden.

Symlinks benötigen eine bewusste Regel. Die einfachste sichere V1-Regel ist:
Projektpfad kanonisieren, den realen Pfad anzeigen und keine App-eigenen
Schreiboperationen durch Symlinks aus dem Projektordner heraus zulassen. Der
bestehende Builder muss daraufhin geprüft werden, bevor die App fremde
Projektarchive als unbedenklich darstellen darf.

## Build-Zustandsmodell

Eine belastbare GUI braucht klarere Zustände als bloßes Parsen einer letzten
Konsolenzeile:

```text
closed
  └── starting
        ├── building
        │     ├── ready
        │     └── build-error
        └── process-error

ready / build-error
  ├── building       bei Dateiänderung oder manuellem Build
  ├── stopped        Watch bewusst ausgeschaltet
  └── process-error  Prozess unerwartet beendet
```

Zu jedem Status gehören mindestens Zeitpunkt, kurze Nutzermeldung und
optional technische Details. Ein Build-Fehler ist nicht dasselbe wie ein
abgestürzter Watch-Prozess: Im ersten Fall soll Watch weiterlaufen und nach
dem nächsten Speichern erneut bauen.

Für den Prototyp kann die App die vorhandenen Logzeilen erkennen. Das sind
heute genau diese, und nur diese tragen Zustand:

```text
Watching <rel> – live-reload active (open the HTML files in Chrome)
[initial] audience.html, speaker.html, print.html, print-notes.html (<shape>)
[rebuild] audience.html, … (<shape>)
[rebuild] build failed: <message>
Serving <rel> on http://localhost:<port>          nur mit --serve
Watch failed: <message>                            gefolgt von exit 1
```

Die Dateiliste ist relativ zu `process.cwd()`, daher der Projektordner als
Arbeitsverzeichnis. Der Port des Watch-Sockets erscheint nirgends im Log; er
steht nur in den gebauten Seiten, und die App braucht ihn nicht. Der
Serve-Port steht ausschließlich in der `Serving`-Zeile. Alles andere auf
stdout (`[fonts]`, `[math]`, `[embed]`, `[video]`, `[qr]`, `[patch]`,
`[asset]`) ist Information für die Build-Details, kein Zustand. Die
`[embed]`-Zeile ist die, an der die App erkennt, dass ein Deck Hosted Embeds
hat und den Serve-Modus vorschlagen sollte.

Vor einem stabilen Release ist ein maschinenlesbarer Modus empfehlenswert,
etwa newline-delimited JSON auf einem separaten IPC-Kanal oder stdout:

```json
{"type":"build-start","reason":"change"}
{"type":"build-success","written":["audience.html"],"durationMs":412}
{"type":"build-error","message":"…","userFacing":true}
```

Dies vermeidet, dass kleine Änderungen an menschlich lesbaren Logtexten die
Desktop-App beschädigen. Das Feld `userFacing` ist dabei nicht Dekoration:
`build.js` setzt es heute auf Fehlern, auf die der Autor reagieren kann, und
lässt es auf Defekten weg. Die App zeigt das eine als Erklärung und das
andere als „Fehler in psi-slides, bitte melden“ mit Stack im Roh-Log.

## Packaging und Distribution

Die App soll den Builder, seine npm-Abhängigkeiten, Fonts und alle benötigten
statischen Dateien selbst enthalten. Was das konkret ist, steht im Repo,
nicht in einer Manifestliste:

- `build.js`, `diagram-core.mjs`, `tails.mjs`, `editor.mjs`, `editor.css`.
  Die drei letzten liest `build.js` zur Laufzeit über `import.meta.url`
  relativ zu sich selbst und inlined sie in die Views.
- Der produktive `node_modules`-Baum **neben `build.js`**. Die gebündelten
  Fonts (`@fontsource-variable/*`, gut 20 MB) und das KaTeX-Stylesheet werden
  per `nodeRequire.resolve` gefunden, Shiki lädt seine Oniguruma-Engine als
  WASM per `import()`. Das sind rund 40 MB und die Hälfte davon Schriften.
- **`ws` ist heute eine devDependency.** `--watch` lädt es per `import('ws')`.
  Ein `npm ci --omit=dev` im Packaging-Schritt lässt den Watch beim ersten
  Start sterben. Es muss nach `dependencies`, und das ist auch für Nutzer des
  Content-Repos richtig, weil `--watch` ein dokumentierter Befehl ist.
- Das asar-Archiv ist hier eher im Weg als nützlich. `createRequire`,
  dynamische `import()`s und ein WASM-Load aus einem Kindprozess heraus sind
  drei Stellen, an denen Electrons asar-Patch greifen muss. Für den Spike
  bleibt die Engine ausgepackt (`asarUnpack` oder ganz ohne asar); ob das
  Archiv später etwas bringt, ist eine Messung, keine Annahme.
- Electron-Untergrenze: `build.js` ist ESM und verlangt Node 20 (`engines`
  in `package.json`). `utilityProcess.fork` kann ESM-Einstiege erst ab
  Electron 28; die Node-Version der gewählten Electron-Version muss die
  Untergrenze halten.
- PATH: Eine GUI-App erbt unter macOS nicht den Shell-PATH. Der Build sucht
  `cwebp` und `magick` für die WebP-Transkodierung beim Inlinen, findet sie
  in der App nicht und nimmt die Originalbytes. Kein Fehler, aber die
  Ausgaben aus der App werden auf derselben Maschine größer als aus dem
  Terminal. Der Build sagt das einmal im Log; die App sollte es in den
  Build-Details wiedergeben und nicht verschweigen.

Die Build-Pipeline erzeugt mindestens:

- macOS-Paket für die tatsächlich unterstützten Architekturen,
- signierten Windows-Installer,
- ein klar benanntes Linux-Paketformat für die erste unterstützte
  Distribution sowie optional AppImage.

Vor einem öffentlichen Release sind Code Signing und bei macOS Notarisierung
praktisch Teil des Produkts. Ohne sie erzeugt gerade die Zielgruppe, die
keine Terminal-Hürden überwinden soll, schwer verständliche
Sicherheitswarnungen.

Automatische Updates sind nicht zwingend Teil des MVP. Version 1 kann eine
sichtbare Versionsnummer und einen Link zur Download-Seite bieten. Ein
Auto-Updater wird erst ergänzt, wenn Release-Infrastruktur, Signierung und
Rollback geklärt sind.

Die Lizenz- und Notice-Dateien aller mitverpackten Abhängigkeiten und Fonts
müssen im Distributionsartefakt enthalten sein.

### Ort im Repository und Anschluss an die Release-Kette

Die App lebt im Engine-Repo, als eigenes Unterpaket `desktop/` mit eigener
`package.json` und eigenem Lockfile. Die Gründe stehen oben verteilt: Engine
und App werden gemeinsam versioniert (Entscheidung 6), drei der nötigen
Änderungen sind Änderungen an `build.js`, und die Engine ist nicht auf npm,
sodass ein zweites Repo sie nur als Submodule oder kopierten Tarball bekäme.
Ein separates Repo wird erst richtig, wenn die App eine eigene
Release-Kadenz bekommt oder mehrere Engine-Versionen tragen soll.

Damit der Engine-Teil nichts abbekommt:

- Electron und `electron-builder` kommen **nicht** in die Root-`package.json`.
  Das Content-Repo macht `npm install` im Engine-Repo, und ein
  Electron-Download von über 100 MB für jemanden, der nur Folien baut, wäre
  genau die Hürde, die die App abbauen soll.
- Ein eigener Workflow `desktop.yml`, pfadgefiltert auf `desktop/`, sonst
  wirft jeder Lecture-Commit eine Drei-Plattform-Matrix an.
- `release.yml` packt per `git archive` alles Getrackte, also auch
  `desktop/`. Ein `export-ignore` in `.gitattributes` hält es aus dem
  Engine-Tarball heraus. Die Desktop-Pakete werden zusätzliche Assets am
  selben Tag; `psi-slides.tar.gz` und `psi-slides.zip` behalten ihre Namen,
  weil die Site auf `releases/latest/download/` verlinkt.
- Der Ordner heißt `desktop/`, nicht `electron-builder/`: das ist der Name
  des npm-Packagers, und ein Pfad, der wie eine Abhängigkeit aussieht,
  liest sich falsch.

## Auswirkungen auf das bisherige Deliverable

Was heute veröffentlicht wird, ist der Tarball mit `build.js`, ein
`npm install` und `node build.js <source.md>`. Die App ist ein zweiter Weg
dorthin, kein Ersatz, und der erste Weg darf sich durch sie nicht ändern.
Das ist eine Zusage in zwei Richtungen: nichts, was die App braucht, verändert
die Ausgabe von `node build.js` für Terminal-Nutzer, und nichts, was die App
mitbringt, macht den Tarball oder das `npm install` schwerer.

### Was sich nicht ändern darf, und wie das gesichert wird

- **Byte-identische Ausgaben.** Von den fünf build.js-Änderungen unten
  verändert keine eine gebaute View: Punkt 1 ist `package.json`, Punkt 2
  greift nur mit `--into`, Punkt 3 ändert die Reihenfolge des Schreibens,
  Punkt 4 den Watcher, Punkt 5 nur mit `--events`. Die getrackten Views der
  drei Referenz-Lectures sind der Beleg: `release.yml` prüft sie auf
  Staleness, und ein Diff dort wäre ein Fehler in dieser Zusage.
- **Root-`package.json` bekommt nur den `ws`-Umzug.** Kein Electron, kein
  `electron-builder`, kein Script, das `desktop/` anfasst. `npm install` im
  Engine-Repo bleibt so schnell wie heute; das ist die Prüfung.
- **`git archive` bleibt der Engine-Tarball.** `desktop/` steht per
  `export-ignore` in `.gitattributes`, sonst wächst das Archiv um den
  App-Quelltext und `cd psi-slides && npm install` sieht einen Ordner, den
  die README nicht erklärt.
- **`test/` bleibt die Browser-Suite, `test/gates/` bleiben die Gates.**
  Tests der App liegen unter `desktop/test/`, mit eigenem Runner. `npm test`
  im Root läuft sie nicht; `desktop.yml` tut es. `test/README.md` braucht
  deshalb nur einen Satz, der sagt, dass es einen dritten Ort gibt.
- **`.gitignore`** bekommt `desktop/node_modules/` und `desktop/dist/`.
- **`pages.yml` deployt bei jedem Push auf `main`.** Ein Commit, der nur
  `desktop/` berührt, deployt die Site trotzdem neu. Das ist harmlos, weil
  der Inhalt derselbe bleibt, aber ein `paths-ignore: [desktop/**]` spart
  den Lauf. `gates.yml` läuft bei jedem Push und ist in Sekunden durch;
  dort lohnt kein Filter.
- **`lint.js` ist nicht betroffen.** Keine der Änderungen berührt das
  Vokabular, das die beiden Dateien spiegeln.

### Wo die App erwähnt werden muss, und wann

Zwei Zeitpunkte, weil zwei Leserschaften. Was Entwickler betrifft, kommt mit
dem Branch. Was Anwender betrifft, kommt erst, wenn es signierte Pakete gibt;
vorher verweist die Dokumentation auf etwas, das genau die Zielgruppe der App
nicht installieren kann.

Mit dem Branch, weil es Entwickler betrifft:

- **`CLAUDE.md`**: ein Absatz „Desktop app (`desktop/`)“ mit dem, was nicht
  aus dem Code hervorgeht. Eigenes Paket, nichts davon ins Root. Und die neue
  Kopplung, die es vorher nicht gab: die App liest die Logzeilen aus dem
  Build-Zustandsmodell, also bricht eine Umformulierung von `[rebuild] …`
  oder `Serving … on` in `build.js` die App, so wie ein neues Vokabel ohne
  `lint.js`-Spiegel den Linter bricht. Bis `--events` existiert, ist das
  die Regel, die `CLAUDE.md` tragen muss.
- **`desktop/README.md`**: das README des Unterpakets. Was die App ist und
  was sie nicht ist (kein Editor), Installation für Anwender, Entwicklung
  (`npm install` in `desktop/`, Start, Paketbau), das Sicherheitsmodell in
  fünf Zeilen, und der Verweis auf diesen Plan.
- **`CONTRIBUTING.md`** unter „Building and releasing“: was `desktop.yml`
  tut, welche Secrets die Signierung braucht und dass die Desktop-Pakete
  zusätzliche Assets am selben Tag sind.
- **`CHANGELOG.md`** unter `[Unreleased]`: die Engine-Änderungen
  (`ws`-Umzug, `--new … --into`, Ordner-Watch, „erst rendern, dann
  schreiben“) als eigene Einträge, weil sie auch ohne App gelten. Die App
  selbst bekommt ihren Eintrag, wenn sie im Release ist.

Mit den ersten signierten Paketen, weil es Anwender betrifft:

- **`README.md`**: „Quickstart“ sagt heute „Requires Node 20 or newer.
  Nothing else“; daneben kommt der zweite Weg, ohne den ersten zu
  verdrängen. „Requirements“ bekommt „Node 20+ to build, or the desktop
  app“. „Documentation“ verlinkt `desktop/README.md`. „What is stable“
  ergänzt einen Satz: App und Engine tragen dieselbe Versionsnummer, und die
  App verspricht nichts, was die Engine nicht verspricht. „Command
  reference“ bleibt unverändert; die App hat keine Kommandos.
- **Projektseite** (`docs/site/index.html` und `index.de.html`): der
  Download-Absatz mit dem `curl`-Block bekommt darüber oder daneben den
  App-Download, in beiden Sprachen. Ob ein Screenshot des Projektfensters in
  die Galerie gehört, entscheidet sich, wenn es eines gibt; `shoot.mjs`
  fotografiert Lectures, nicht Electron-Fenster, also wäre es ein manuell
  aufgenommenes Bild mit derselben Breite wie die übrigen.
- **`docs/comparison.md`**, falls die Seite Installationswege der anderen
  Werkzeuge nennt: ein Satz, dass es psi-slides auch ohne Node gibt.

### Arbeitsweise: Branch und Worktree

Die Arbeit geschieht auf einem eigenen Branch `desktop-builder`, abgezweigt
vom aktuellen `main`, und in einem eigenen Worktree unter
`../psi-slides-builder/`, so wie `pdf-export` in `../psi-slides-pdfexport/`
liegt. Dieser Plan wandert mit in den Worktree.

Die fünf build.js-Änderungen werden auf demselben Branch gemacht, aber als
eigene Commits vor der App, damit sie einzeln nach `main` können, wenn sich
das anbietet: der `ws`-Umzug und der Ordner-Watch sind für Terminal-Nutzer
unter Linux heute schon richtig. Die App selbst kommt erst nach `main`, wenn
Phase 1 steht; `pages.yml` würde sonst einen halben `desktop/`-Ordner
veröffentlichen, den die README nicht erklärt.

## Änderungen an build.js vor Phase 1

Der Plan sagt oben, dass der MVP nicht von einem Umbau von `build.js`
abhängen soll. Das bleibt so. Vier kleine Eingriffe braucht er trotzdem, und
jeder davon ist auch ohne die App richtig; sie sind hier gesammelt, damit
niemand sie aus den Abschnitten oben zusammensuchen muss. Ein fünfter ist
für den Spike nötig und für V1 nicht.

1. **`ws` nach `dependencies`.** Eine Zeile in `package.json`. Ohne sie
   startet der verpackte Watch nicht.
2. **`--new` mit Zielordner und ohne festen Presenter.** Etwa
   `--new <slug> --into <dir>`; ohne `--into` bleibt das heutige Verhalten.
   Der Presenter wird `TODO – presenter`, wie die übrigen Platzhalter der
   Vorlage. Die Vorlage selbst bleibt die eine in `scaffoldSource()`, damit
   CLI und App nicht auseinanderlaufen.
3. **Erst alle Views rendern, dann schreiben.** In `buildOnce` die Schleife
   über `targets` in zwei Durchgänge teilen. Danach ist „der letzte gute
   Build bleibt erhalten“ eine Eigenschaft und kein Regelfall.
4. **Den Ordner beobachten, nicht die Datei.** `fs.watch` auf
   `path.dirname(absIn)` und im Callback auf den Basisnamen filtern. Die
   Debounce bleibt. Das ist der Linux-Fall aus den Abnahmekriterien.
5. **`--events` für NDJSON auf stdout**, erst wenn die Logzeilen-Erkennung
   aus dem Prototyp zu fragil wird. Die Ereignisse sind die aus dem
   Zustandsmodell; `userFacing` kommt vom Fehlerobjekt. Das lesbare Log
   bleibt daneben unverändert, weil es das Roh-Log der Build-Details ist.

Nicht auf dieser Liste, obwohl es nahe liegt: eine importierbare Build-API.
`build.js` ruft `main()` beim Laden auf, und `lint.js` tut dasselbe; beide
sind Kommandos, keine Module. Die Trennung in CLI-Adapter und Build-Kern
bleibt das Abbruchkriterium von Phase 0 und wird nicht vorsorglich gebaut.

Für jede der Änderungen gilt die Regel aus `CLAUDE.md`: `lint.js` spiegelt
die Parser-Vokabeln von `build.js`, nicht seine CLI. Keine der fünf berührt
das Quellformat, also ist keine ein Major.

## Gestufte Umsetzung

### Phase 0: Technischer Spike

Ziel: Die risikoreichsten Packaging-Annahmen mit Wegwerf-UI prüfen.

- Electron-App startet einen verpackten Build ohne systemweites Node.js.
- Eine frei gewählte `source.md` wird erfolgreich gebaut.
- `--watch` bleibt über längere Zeit aktiv und beendet sich sauber.
- `audience.html` öffnet im Standardbrowser und lädt nach einem Save neu.
- Draw-Editor schreibt einen Block zurück und lädt ein Bild nach `assets/`.
- Unter Linux: ein Editor mit atomarem Speichern (vim, gedit, VS Code mit
  Standardeinstellung) löst nach dem fünften Save immer noch einen Rebuild
  aus. Das ist die Prüfung für Punkt 4 der build.js-Änderungen und die
  einzige, die auf macOS nicht zu sehen ist.
- Die Engine läuft aus dem Paket heraus mit Shiki-Highlighting, gebündelten
  Fonts und einer Formel, also mit allen drei Abhängigkeiten, die zur
  Laufzeit aus `node_modules` lesen.
- Testpakete laufen auf mindestens einem aktuellen macOS-, Windows- und
  Linux-System.

Abbruchkriterium: Wenn der bestehende CLI-Prozess nicht zuverlässig
verpackbar oder steuerbar ist, wird vor der GUI-Arbeit eine kleine interne
Build-API extrahiert.

### Phase 1: Nutzbarer Builder-MVP

- Startfenster, Öffnen, Drag-and-drop und Recent Projects.
- Projektfenster mit Build-Status und vier Ausgabeaktionen.
- Auto-Build und manueller Build.
- Source und Projektordner über Systemfunktionen öffnen.
- Neues Projekt an frei gewähltem Ort.
- verständliche Fehler plus vollständiges Log.
- Prozess-Lifecycle einschließlich Single Instance und Projektwechsel.
- lokale Einstellungen ohne Telemetrie.

### Phase 2: Verteilbares Produkt

- Plattformpakete, Signierung und Notarisierung.
- Smoke-Tests auf sauberen Maschinen ohne Node.js.
- Update- und Kompatibilitätsdokumentation.
- Crash- und Bugreport-Export, der Pfade und persönliche Inhalte vor dem
  Teilen sichtbar macht beziehungsweise redigiert.
- Barrierefreiheit und Tastaturbedienung der gesamten Builder-GUI.

### Phase 3: Gezielte Komfortfunktionen

Nur auf Basis echten Nutzerfeedbacks:

- integrierte, unprivilegierte Vorschau,
- ein expliziter lokaler Serve-Modus für Hosted Embeds,
- Lint-Aktion mit strukturierten Fundstellen,
- Bilder per Drag-and-drop nach `assets/`, ohne Markdown automatisch zu
  verändern,
- PDF-Export, sofern Browserdruck zuverlässig automatisiert werden kann,
- optional ein kleiner eingebauter Editor als eigener Produktmodus.

Die Phasen sollen nicht vorab zu einem vollständigen Studio zusammengezogen
werden. Der Builder-MVP beantwortet zuerst die Produktfrage, ob die fehlende
Node-/CLI-Kompetenz tatsächlich die wesentliche Einstiegshürde ist.

## Tests und Abnahmekriterien

### Kernworkflow

- Eine Person ohne Node.js kann die App installieren, ein Projekt erstellen,
  Text extern ändern und alle vier Ansichten öffnen.
- Ein Save löst genau einen Build aus, auch bei atomarem Speichern durch den
  Texteditor.
- Mehrere schnelle Saves führen nicht zu konkurrierenden Builds.
- Nach einem Build-Fehler baut der nächste gültige Save wieder erfolgreich.
- Ein Fehler in einem Renderer hinterlässt keinen gemischten Satz aus neuen
  und alten Views; entweder alle vier oder keine.
- Beim Beenden bleiben keine Node-, Watch- oder Serve-Prozesse zurück.
- Pfade mit Leerzeichen, Umlauten und langen Verzeichnisnamen funktionieren.

### Plattformfälle

- macOS: App-Doppelklick, Drag auf App-Symbol, `open-file`, Signierung und
  Notarisierung.
- Windows: Installer, Startmenü, Pfade mit Laufwerksbuchstaben und „Öffnen
  mit …“.
- Linux: Paketinstallation, Desktop-Datei, Dateimanager und Standardbrowser.
- Auf keiner Plattform ist ein bereits installiertes `node` oder `npm`
  Voraussetzung.

### Draw-Editor

- Block bearbeiten, speichern, Rebuild sehen.
- Veralteten Block aus zweitem Tab ablehnen.
- erlaubtes Bild hochladen und anschließend verwenden.
- zu großes oder unzulässiges Asset mit verständlicher Meldung ablehnen.
- Watch-Neustart macht alte Seiten unschreibbar, bis sie neu geladen wurden.

### Sicherheit

- Ein präpariertes Projekt erhält keinen Zugriff auf Electron- oder Node-APIs.
- IPC lehnt unbekannte Kommandos und Pfade außerhalb des aktiven Projekts ab.
- Dateinamen und CLI-ähnliche Pfade werden als Daten, nicht als Shellcode
  behandelt.
- Serve und Watch sind von einem zweiten Rechner im Netz nicht erreichbar.
- Externe Navigation übernimmt nicht das Builder-Fenster.
- Ein abgestürzter oder hängender Build blockiert nicht dauerhaft die GUI.

## Offene Produktentscheidungen

Vor Phase 1 müssen nur wenige Entscheidungen verbindlich fallen:

1. Soll die App stets genau ein Projektfenster verwalten oder mehrere Fenster
   zulassen? Empfehlung für V1: genau ein aktives Projekt pro App-Instanz.
2. Öffnet „Präsentation“ standardmäßig `file://` oder einen lokalen Server?
   Empfehlung: `file://`, Serve nur bei Bedarf.
3. Welcher externe Texteditor wird bei fehlender `.md`-Zuordnung empfohlen?
   Die App sollte keinen konkreten Editor voraussetzen.
4. Woher stammt die Vorlage für neue Projekte, damit CLI und App nicht
   auseinanderlaufen? Empfehlung: gemeinsame exportierte Scaffold-Funktion.
5. Welche Plattformen blockieren den ersten öffentlichen Release, und welche
   dürfen zunächst als experimentell gelten?
6. Soll die App mehrere psi-slides-Engine-Versionen unterstützen?
   Empfehlung für V1: Engine und App werden gemeinsam versioniert.
7. Öffnet „Präsentation“ den Standardbrowser oder bevorzugt Chrome/Edge?
   Die README nennt Chrome als den Browser, in dem entwickelt und
   präsentiert wird; Safari und Firefox sind ungetestet. Empfehlung: Chrome
   oder Edge, wenn eines gefunden wird, sonst Standardbrowser mit einem
   Hinweis im Projektfenster. Die Wahl ist eine Einstellung, kein Zwang.

Später, aber nicht für den MVP, ist zu entscheiden:

- integrierte Vorschau versus Systembrowser,
- optionaler eingebauter Editor,
- automatisches Update,
- eigenes Projektdateiformat,
- PDF-Export,
- Diagnose- oder Telemetriedaten; standardmäßig soll nichts übertragen
  werden.

## Empfohlene erste Produktfassung

Die empfohlene erste Veröffentlichung ist ein **Builder, kein Studio**:

- ein Projekt öffnen oder neu anlegen,
- externen Texteditor verwenden,
- automatisch lokal bauen,
- klare Fehler sehen,
- vier Ausgaben öffnen,
- Draw-Figuren direkt in der Browseransicht bearbeiten,
- keine Node- oder Terminalkenntnisse benötigen.

Diese Fassung nutzt die bereits stärksten Teile von `psi-slides`, verändert
das Authoring-Modell nicht und testet mit vergleichsweise wenig neuer
Oberfläche die wichtigste Annahme: Ob ein verlässlicher Doppelklick-Workflow
genug Reibung entfernt, damit deutlich mehr Menschen das System tatsächlich
ausprobieren und weiterverwenden.
