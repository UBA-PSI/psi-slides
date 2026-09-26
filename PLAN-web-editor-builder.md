# Diskussionsplan: Öffentlicher Web-Editor und Builder

## Status dieses Dokuments

Dieses Dokument beschreibt ein mögliches Feature, noch keine beschlossene
Implementierung. Es trennt deshalb zwischen:

- bereits aus dem bestehenden System ableitbaren Randbedingungen,
- einem vorgeschlagenen Zielbild,
- Entscheidungen, die vor der Umsetzung getroffen werden müssen,
- und einer gestuften Umsetzung, mit der sich die riskanten Annahmen früh
  überprüfen lassen.

Der geplante Dienst wäre öffentlich erreichbar und würde Inhalte beliebiger,
zunächst anonymer Nutzer verarbeiten. Das ist eine andere Vertrauensgrenze als
der gegenwärtige lokale Aufruf von `node build.js source.md` und muss als
Verarbeitung nicht vertrauenswürdiger Eingaben entworfen werden.

## Ausgangslage

`psi-slides` baut heute eine lokale `source.md` in vier HTML-Ansichten. Der
lokale Workflow besitzt bereits zwei Eigenschaften, die für einen Web-Editor
nützlich sind:

1. Ein Audience-only-Build ist schnell und erzeugt eine direkt im Browser
   darstellbare Vorschau.
2. Der grafische `::: draw`-Editor kennt den Quelltext, die Byte-Range und den
   bisherigen Inhalt jedes Diagrammblocks. Über `window.psiWatch` kann er den
   Block zurückschreiben sowie Assets auflisten und hochladen.

Die bestehende Implementierung von `window.psiWatch` ist jedoch ausdrücklich
für einen lokalen `--watch`-Prozess gedacht. Sie verbindet sich mit einem
WebSocket auf `127.0.0.1`, schreibt unmittelbar in die lokale `source.md` und
ist keine geeignete öffentliche API. Auch der bestehende `--serve`-Server ist
absichtlich nur an Loopback gebunden und soll nicht nach außen geöffnet
werden.

Der neue Dienst soll deshalb weder `--watch` noch `--serve` veröffentlichen.
Er erhält stattdessen eine eigene Projekt-, Build- und Preview-Schicht.

## Zielbild

Die primäre Oberfläche ist eine zweigeteilte Authoring-Ansicht:

```text
┌────────────────────────────────┬────────────────────────────────┐
│ Markdown-Editor                │ Live-Vorschau                  │
│                                │                                │
│ source.md                      │ audience.html                  │
│                                │                                │
│ ## figure: …                   │ Klick auf eine Draw-Figur      │
│                                │ öffnet den vorhandenen         │
│ ::: draw                       │ grafischen Editor innerhalb    │
│ box a "Client"                │ der rechten Seite.             │
│ box b "Server"                │                                │
│ edge a -> b                    │                                │
│ :::                            │                                │
└────────────────────────────────┴────────────────────────────────┘
```

Der gewünschte Arbeitsablauf ist:

1. Ein Besucher öffnet den Dienst und erhält ein anonymes, zeitlich
   begrenztes Projekt.
2. Links bearbeitet er `source.md` in einem vollwertigen Texteditor.
3. Nach einer kurzen Tipp-Pause oder auf Knopfdruck wird serverseitig eine
   neue Audience-Ansicht gebaut.
4. Ein erfolgreicher Build ersetzt rechts die Vorschau. Bei einem Fehler
   bleibt der letzte erfolgreiche Build sichtbar und der Fehler erscheint
   beim Editor.
5. Ein Klick auf eine `::: draw`-Figur öffnet den bestehenden grafischen
   Editor in der Vorschau.
6. „Apply to source“ beziehungsweise `Ctrl/Cmd-S` überträgt den geänderten
   Diagrammblock als eine Editor-Transaktion in den linken Markdown-Text.
7. Autosave und Rebuild laufen danach über denselben Weg wie bei einer
   manuellen Textänderung.
8. Das Ergebnis kann als selbstständige HTML-Datei heruntergeladen werden.

## Ziele

- Öffentlich erreichbarer Editor ohne lokale Node-Installation.
- Nutzung durch beliebige Personen, zunächst ohne verpflichtendes Konto.
- Overleaf-artige Aufteilung in Quelltext und Vorschau.
- Automatischer Build nach einer Tipp-Pause sowie manueller Build.
- Sichtbare Build- und Lint-Fehler ohne Verlust der letzten guten Vorschau.
- Bestehender `::: draw`-Editor inklusive direktem Write-back in den
  Markdown-Editor.
- Rasterbild-Upload mit Verwendung in Markdown und Draw-Figuren.
- Download eines portablen `audience.html`; später optional aller vier
  Ansichten.
- Harte Trennung zwischen Editor, nicht vertrauenswürdiger Vorschau und
  Build-Prozess.
- Begrenzte, automatisch gelöschte Projekte und Builds.

## Nicht-Ziele der ersten Version

- Kein im Browser zugängliches Terminal oder allgemeiner Dateisystemzugriff.
- Keine beliebigen Node-Pakete, Plugins, Preprocessor oder Build-Kommandos.
- Kein öffentliches Durchreichen von CLI-Flags.
- Kein Öffnen der bestehenden `--watch`- oder `--serve`-Ports.
- Keine gleichzeitige kollaborative Bearbeitung wie in Google Docs.
- Keine dauerhafte, hochverfügbare Hosting-Plattform für Präsentationen.
- Keine öffentliche Suche, Galerie oder Auflistung fremder Projekte.
- Keine SVG-, Video-, Font- oder ZIP-Uploads in Version 1.
- Keine vollständige Speaker-/Audience-Zwei-Fenster-Sitzung innerhalb der
  eingebetteten Editor-Vorschau.
- Keine Garantie, dass beliebiges lokales psi-slides-Markdown unverändert im
  öffentlichen Webdienst angenommen wird. Unsichere lokale Möglichkeiten
  dürfen im Webprofil abgelehnt werden.

## Drei strikt getrennte Ausgabearten

Eine wichtige Architekturentscheidung ist, nicht jedes gebaute
`audience.html` gleich zu behandeln.

### 1. Edit-Preview

- Nur innerhalb der aktuellen Editor-Sitzung sichtbar.
- Läuft in einem Sandbox-Iframe.
- Darf über eine eng begrenzte Browser-Brücke Patch- und Asset-Anfragen an
  den übergeordneten Editor senden.
- Ist kein teilbarer und kein dauerhaft adressierbarer Build.
- Darf zusätzliche Metadaten wie Source-Hash, Build-ID und Block-Ranges
  enthalten.

### 2. Share-Preview

- Optionaler späterer Feature-Schritt.
- Besitzt ein eigenes, widerrufbares Lesetoken mit Ablaufdatum.
- Läuft ebenfalls in einem Sandbox-Iframe auf einem getrennten
  Preview-Origin.
- Enthält niemals die Edit-Brücke.
- Soll keine Cookies, lokalen Entwürfe oder Schreibrechte erhalten.

### 3. Download/Export

- Selbstständiges HTML-Artefakt wie beim lokalen Build.
- Enthält keine Webdienst-Credentials oder Edit-Brücke.
- Wird als Download ausgeliefert, nicht auf dem Editor-Origin ausgeführt.
- Kann den Draw-Editor optional weiterhin als lokalen Editor enthalten; sein
  Write-back fällt dann wie heute auf Clipboard/File-Access zurück.

Diese Trennung verhindert, dass ein geteilter Preview-Link versehentlich
auch Schreibrechte oder eine aktive Editor-Sitzung teilt.

## Vorgeschlagene Gesamtarchitektur

```text
Browser
  │
  │ HTTPS
  ▼
Editor-Anwendung
  ├── Markdown-Editor
  ├── anonyme Sitzung
  ├── Autosave
  └── Sandbox-Preview
        │
        │ MessageChannel mit begrenztem Protokoll
        ▼
      Draw-Editor

Editor/API
  ├── Projekt- und Revisionsverwaltung
  ├── Asset-Annahme
  ├── Build-Queue
  ├── Retention und Quotas
  └── optional Share-Capabilities
        │
        ▼
isolierter Build-Job
  ├── read-only Engine und node_modules
  ├── genau ein kopiertes Projekt
  ├── beschränktes /work
  ├── kein Netzwerk
  ├── keine Secrets
  └── CPU/RAM/Zeit/Output begrenzt
        │
        ▼
Artefaktspeicher außerhalb des Webroots
```

Editor/API, Builder und Preview sollen getrennte Verantwortlichkeiten und
nach Möglichkeit getrennte Prozesse beziehungsweise Origins besitzen. Der
Build-Prozess erhält insbesondere weder Session-Cookies noch Datenbank- oder
Storage-Credentials.

## Anonymes Projekt- und Berechtigungsmodell

Für die erste Version ist ein Capability-Modell ohne Benutzerkonto denkbar.
Beim Erstellen eines Projekts erzeugt der Server mindestens:

- eine zufällige interne `project_id`,
- ein geheimes `edit_token`,
- eine aktuelle `source_revision`,
- ein Erstellungs- und Ablaufdatum,
- später optional getrennte `view_token` pro freigegebenem Build.

Das `edit_token` soll nicht als normale Projekt-ID in jeder URL erscheinen.
Bevorzugt liegt es in einem `HttpOnly; Secure; SameSite=Strict`-Cookie. Der
Server prüft Projekt und Berechtigung bei jedem Lesen, Speichern, Hochladen,
Bauen und Löschen.

`localStorage` ist kein Autorisierungsmechanismus. Er kann Layout-, Theme-
und Editorpräferenzen halten, aber der Server darf niemals allein aufgrund
einer dort gespeicherten Projekt-ID Zugriff geben.

Folgen eines anonymen Modells müssen in der Oberfläche ehrlich benannt
werden:

- Wer Session-Cookie und Recovery-Daten verliert, verliert den Zugriff.
- Es gibt ohne Konto keine Identitätsprüfung und keine klassische Recovery.
- Ein Share-Link ist ein Bearer-Token: Wer ihn kennt, kann lesen.
- Projekte und Share-Links laufen automatisch ab.
- Export beziehungsweise Projekt-Download ist der verlässlichste Weg, die
  eigene Arbeit dauerhaft zu sichern.

Zu diskutieren ist, ob zusätzlich ein einmal angezeigter Recovery-Code
angeboten wird und ob später optional Accounts ergänzt werden.

## Editor-Modell

### Kandidat für den Texteditor

Für die erste Version ist CodeMirror 6 voraussichtlich der passendere
Kandidat als Monaco:

- kleinerer Client-Payload,
- gute Markdown-Unterstützung,
- kontrollierbare Transaktionen,
- leichtes Einbetten in eine spezialisierte Oberfläche,
- weniger Erwartung, einen vollständigen VS-Code-Arbeitsplatz nachzubauen.

Monaco bleibt eine Option, falls Dateibaum, Multi-File-Editing und eine
VS-Code-nahe Bedienung früh Priorität erhalten. Diese Entscheidung soll durch
einen kleinen UI-Spike getroffen werden, nicht allein anhand der Bibliotheks-
Featurelisten.

### Quelltext als einzige Wahrheit

Der im linken Editor gehaltene Text ist die Authoring-Wahrheit. Weder das
Preview-Iframe noch der Draw-Editor schreiben direkt in eine Projektdatei auf
dem Server.

Alle Änderungen laufen durch Editor-Transaktionen:

- Tastatureingaben,
- programmatische ID- oder Scaffold-Änderungen,
- Write-back eines Draw-Blocks,
- spätere strukturierte Authoring-Hilfen.

Dadurch bleiben Undo/Redo, Dirty-State, Autosave, Revisionen und Konflikte an
einer Stelle. Ein Draw-Write-back soll genau eine Undo-Einheit sein.

### Speichern und Revisionen

Jeder Save trägt die Revision, gegen die er erstellt wurde. Der Server
akzeptiert die Änderung nur, wenn diese Revision noch aktuell ist, und gibt
danach eine neue Revision und einen Source-Hash zurück.

Für Version 1 reicht optimistische Konkurrenzkontrolle:

```text
PUT source.md
If-Match: <revision>
```

Ein Konflikt überschreibt niemals still einen neueren Stand. Echte
Mehrbenutzer-Kollaboration mit CRDT/OT ist ein separates späteres Feature.

## Build-Modell

### Auslösung

Vorgeschlagen werden:

- automatischer Build nach ungefähr 600–1000 ms Tipp-Pause,
- sichtbarer manueller Build-Button,
- Schalter zum Deaktivieren des Auto-Builds,
- sofortiger Build nach einem angewandten Draw-Patch,
- kein neuer Build bei Änderungen, die bereits durch einen neueren
  ausstehenden Build überholt sind.

Die exakte Debounce-Zeit ist eine UX- und Lastentscheidung und soll im
Prototyp gemessen werden.

### Revisionsbindung

Jeder Build-Job erhält:

- Projekt-ID,
- Source-Revision,
- Source-Hash,
- feste Build-Optionen,
- eine serverseitig erzeugte Build-ID.

Das Ergebnis darf nur angezeigt werden, wenn es noch zum erwarteten
Source-Hash gehört. Trifft währenddessen ein neuerer Build ein, wird das alte
Ergebnis gespeichert oder verworfen, aber nicht als aktuelle Vorschau
angezeigt.

### Queue-Verhalten

- Höchstens ein aktiver Build pro Projekt.
- Während eines aktiven Builds wird höchstens der neueste Folgeauftrag
  aufgehoben; dazwischenliegende Revisionen müssen nicht gebaut werden.
- Globale Parallelitätsgrenze schützt die VM.
- Volle Queue führt zu einer ehrlichen „busy“-Antwort statt zu ungebremstem
  Prozesswachstum.
- Polling oder Server-Sent Events reichen für Statusmeldungen. Ein
  bidirektionaler öffentlicher WebSocket ist für Version 1 nicht nötig.

### Vorgesehener Build-Aufruf

Der Server konstruiert den Prozessaufruf vollständig selbst. Der Nutzer darf
weder Pfad noch Flags liefern. Konzeptionell:

```text
node /app/build.js /work/source.md --audience-only --inline-images --web-safe
```

`--web-safe` ist zunächst ein Arbeitstitel für ein noch zu definierendes
Build-Profil. `--inline-images` ist nur dann vertretbar, wenn der Dienst vorab
ein Gesamtlimit erzwingt; andernfalls könnten viele jeweils erlaubte Dateien
ein unverhältnismäßig großes HTML erzeugen.

Für den finalen Download kann ein separater Auftrag später alle vier Ansichten
bauen. Die Live-Schleife soll nur `audience.html` rendern.

### Prozessisolation

`build.js` verwendet heute veränderlichen Modulzustand und ist nicht für
parallele Builds im selben Node-Prozess ausgelegt. Jeder öffentliche Build
soll deshalb in einem frischen Prozess und einer isolierten Job-Umgebung
laufen. Ein langlebiger Prozesspool wäre erst nach einer expliziten
Reentrancy-Überarbeitung vertretbar.

## Live-Preview

### Preview ohne öffentliche HTML-Route

Die Edit-Preview muss nicht als öffentlich aufrufbare Datei gehostet werden.
Die API liefert das gebaute HTML als Daten zurück. Der Editor setzt es als
`srcdoc` in ein Sandbox-Iframe.

Die Antwort des Editor-Origins soll nicht als direkt navigierbares
`text/html` ausgeliefert werden. Geeignet sind eine strukturierte
Build-Antwort oder ein nicht ausführbarer Download-/Text-Content-Type, den
die Editor-Anwendung bewusst als Text liest.

Vorgesehene Sandbox für den ersten Prototyp:

```html
<iframe
  sandbox="allow-scripts allow-presentation"
  referrerpolicy="no-referrer">
</iframe>
```

Insbesondere fehlen:

- `allow-same-origin`,
- `allow-top-navigation`,
- `allow-forms`,
- zunächst `allow-popups`.

Damit funktionieren Speaker-Popup und einige Export-/Clipboard-Fallbacks in
der Edit-Preview absichtlich nicht vollständig. Der Draw-Write-back braucht
sie nicht, weil er über die eigene Brücke läuft.

### Fehlertolerantes Aktualisieren

Die letzte erfolgreiche Vorschau bleibt sichtbar, während ein neuer Build
läuft oder fehlschlägt. Ein optionales Double-Buffering vermeidet Flackern:

1. aktuelles Iframe bleibt sichtbar,
2. neues HTML startet in einem versteckten Iframe,
3. das neue Iframe meldet `preview-ready`,
4. der Parent überträgt den darstellbaren Zustand,
5. beide Iframes werden getauscht.

Zu bewahrender Zustand umfasst mindestens:

- aktuellen Chunk,
- Reveal-/Diagramm-Step,
- Collapse-Modus,
- Theme und Schriftmodus,
- Overview-/Focus-Zustand soweit sinnvoll,
- bei Draw-Write-back die wieder zu öffnende Figur.

Da ein Iframe ohne `allow-same-origin` keinen verlässlichen normalen
`localStorage` besitzt, soll der Parent den Preview-Zustand halten. Die
Preview-Runtime muss fehlenden Storage weiterhin tolerieren.

### Gemessene Größenordnung

Ein lokaler orientierender Lauf auf dem aktuellen Entwicklungsstand ergab:

| Lecture | Audience-only Build | HTML | gzip |
| --- | ---: | ---: | ---: |
| Tutorial, 58 Chunks | 0,28 s | 1,9 MB | 0,89 MB |
| Network Security, 37 Chunks | 0,25 s | 2,3 MB | 0,90 MB |

Die Werte sind keine Server-SLO: VM, Sandbox-Start, Queue und Hardware kommen
hinzu. Sie zeigen aber, dass ein Overleaf-artiger Takt grundsätzlich
realistisch ist. Wahrscheinlich wird bei größerer Nutzung der wiederholte
Transfer der vollständig selbstständigen HTML-Datei früher zum Problem als
die reine Compilerzeit.

### Spätere Preview-Optimierung

Ein mögliches `--web-preview`-Profil könnte unveränderliche Teile als
versionierte Assets laden, statt sie in jedem Build neu zu übertragen:

- Audience-Runtime,
- Diagramm-Compiler,
- Draw-Editor,
- Stylesheets,
- gebündelte Fonts,
- KaTeX-Fonts.

Der finale Download bleibt selbstständig. Die Edit-Preview muss dieses
Versprechen nicht erfüllen. Eine solche Aufteilung ist jedoch ein
nachgelagerter Performance-Schritt; Version 1 darf zunächst das vollständige
HTML transportieren.

## Integration des Draw-Editors

### Bestehender Vertrag

Der Draw-Editor verwendet bereits eine kleine Außenwelt-Schnittstelle:

```text
ready()
patch(range, text, was)
assets()
putAsset(name, data, replace)
```

Diese Abstraktion soll erhalten bleiben. Neben dem lokalen WebSocket-Adapter
kommt ein Web-Editor-Adapter hinzu. Lokaler Workflow und Webworkflow dürfen
sich nicht gegenseitig ersetzen.

### Transport per MessageChannel

Der Parent erzeugt für jedes Preview-Iframe einen neuen `MessageChannel` und
übergibt genau einen Port an die vertrauenswürdige Preview-Brücke. Darüber
werden ausschließlich schemavalidierte Nachrichten ausgetauscht.

Vorteile gegenüber direktem API-Zugriff aus dem Iframe:

- keine Session-Cookies oder Edit-Tokens in der Vorschau,
- keine allgemeine API-Berechtigung,
- klare Bindung an genau das aktuelle Iframe,
- leichter Austausch beim nächsten Build,
- kontrollierbare Größen- und Frequenzlimits.

Die Brücke ist eine begrenzte Capability und kein allgemeiner RPC-Kanal.

### Patch-Protokoll

Ein Patch-Vorschlag soll mindestens enthalten:

- Build-ID und Source-Hash der Vorschau,
- ursprüngliche Range,
- bisherigen Blockinhalt `was`,
- vorgeschlagenen neuen Blockinhalt,
- Chunk-ID,
- Diagrammnummer innerhalb des Chunks.

Der Parent versucht in dieser Reihenfolge:

1. Wenn Source-Hash und Range noch passen, exakt dort ersetzen.
2. Wenn nur Text außerhalb des Blocks die Offsets verschoben hat, denselben
   `chunk + diagram number + old body` eindeutig wiederfinden.
3. Wenn der Block selbst verändert wurde oder die Zuordnung mehrdeutig ist,
   einen Konflikt melden und nichts überschreiben.

Der neue Block wird als eine CodeMirror-Transaktion angewandt. Danach folgen
Save und Build über den normalen Editorpfad.

### Draw-Draft über einen Rebuild retten

Das aktuelle lokale Verhalten nutzt teilweise `sessionStorage`, um nach dem
Watch-Reload dieselbe Figur wieder zu öffnen. In einer Sandbox mit opakem
Origin ist darauf nicht zuverlässig Verlass.

Der Parent muss deshalb vor dem Iframe-Tausch wissen:

- welche Figur geöffnet war,
- ob es einen noch nicht angewandten Draft gab,
- welchen Step und welche Auswahl der Editor zeigte.

Mindestens der angewandte Block und die wieder zu öffnende Figur gehören in
den Parent-Zustand. Ob Auswahl, Zoom, Undo-Stack und noch nicht angewandte
Drafts vollständig migriert werden, ist eine UX-Entscheidung. Für Version 1
kann „Apply“ den Draft zunächst festschreiben und anschließend dieselbe Figur
im neuen Build wieder öffnen.

### Sicherheitsgrenze der Brücke

- Nur die Edit-Preview erhält die Brücke.
- Share- und Download-Builds erhalten sie nie.
- Der Parent besitzt die Autorität; das Iframe liefert nur Vorschläge.
- Jede Nachricht hat ein Größenlimit und ein projektbezogenes Schema.
- Ein Patch darf ausschließlich den im Parent geöffneten Projektext ändern.
- Asset-Methoden dürfen nur auf das aktuelle Projekt zugreifen.
- Das Iframe erhält keine Methode für beliebige URLs, Dateipfade,
  Build-Flags oder Serverkommandos.

## Asset-Upload

### Version 1

Vorgeschlagene erlaubte Typen:

- PNG,
- JPEG,
- WebP,
- optional GIF nach gesonderter Prüfung.

Zunächst ausgeschlossen:

- SVG wegen aktiver Inhalte und direktem Inline-Markup,
- Video wegen Größe und Preview-/Range-Komplexität,
- Fonts wegen Browser-Parsern, Lizenz- und Größenfragen,
- ZIP und beliebige Archive,
- alle nicht benötigten Dateitypen.

### Upload-Ablauf aus dem Draw-Editor

1. Der Nutzer wählt im bestehenden Draw-Editor eine Datei.
2. Das Iframe sendet eine begrenzte Upload-Anfrage über den MessageChannel.
3. Der Parent ruft authentifiziert die Projekt-Asset-API auf.
4. Der Server prüft Größe und tatsächlichen Dateityp.
5. Das Bild wird in einer isolierten Umgebung decodiert und neu encodiert.
6. Der Server vergibt einen internen Namen und liefert ID, Maße und Metadaten
   zurück.
7. Der Draw-Editor setzt die passende `image`-Referenz in den Block.
8. „Apply“ schreibt den gesamten Draw-Block in den linken Editor.
9. Der nächste Build bettet das echte Asset ein.

### Noch festzulegende Limits

Zu bestimmen und anschließend lastzutesten sind:

- maximale Source-Größe,
- maximale Größe eines Uploads,
- maximale Zahl von Assets,
- maximale Projektgröße,
- maximale Pixelzahl und Dimension,
- maximale Größe des gebauten HTML,
- maximale Upload- und Buildrate.

Der Build darf sich nicht allein auf die bestehenden per-file Inline-Limits
verlassen. Der Webdienst braucht zusätzlich ein Gesamtbudget.

## Web-sicheres Compilerprofil

Ein öffentlicher Dienst darf nicht automatisch jede lokal erlaubte Quelle
verarbeiten. Vorgeschlagen wird ein klar benanntes Webprofil, das mindestens
folgende Regeln erzwingt:

- Raw HTML im Markdown ablehnen oder sicher als Text behandeln.
- SVG-Referenzen und -Uploads in Version 1 ablehnen.
- Absolute Dateipfade ablehnen.
- `..`-Segmente ablehnen.
- Nach `realpath` jeden gelesenen Pfad auf das Projektverzeichnis begrenzen.
- Symlinks ablehnen oder ihre aufgelösten Ziele strikt prüfen.
- Externe Embeds und Remote-Media zunächst ablehnen.
- Keine Child Processes und keine Bildoptimierungs-CLI im Preview-Build.
- Keine Netzwerkzugriffe während des Builds.
- Source-, AST-/Struktur-, Asset- und Output-Limits erzwingen.
- `editor` für Edit-Preview, Share und Download explizit serverseitig setzen,
  statt blind dem Frontmatter zu vertrauen.

Zu entscheiden ist, ob `--web-safe` eine dokumentierte lokale CLI-Option,
eine nur intern verwendete Renderoption oder ein separater Wrapper wird. Die
Sicherheitsregeln selbst sollen testbar im Compiler beziehungsweise in einer
gemeinsam verwendeten Eingabeschicht liegen und nicht nur in der HTTP-Route.

## Build-Sandbox

Für beliebige öffentliche Nutzer soll jeder Job mindestens erhalten:

- frischen Prozess und frisches Arbeitsverzeichnis,
- Ausführung als nicht privilegierter Benutzer,
- read-only Engine und `node_modules`,
- ausschließlich das aktuelle Projekt in `/work`,
- nur dort Schreibrechte,
- kein Netzwerk,
- keine Secrets und keine Deployment-Credentials,
- keine Mounts von Host-Home, Repository oder Docker-Socket,
- alle unnötigen Linux-Capabilities entfernt,
- `no-new-privileges`, Seccomp und Host-MAC wie AppArmor/SELinux,
- CPU-, RAM-, Prozess-, Dateideskriptor-, Zeit- und Output-Limit,
- vollständiges Verwerfen nach Jobende.

Als Laufzeitoptionen sind zu diskutieren:

1. Rootless Container als Minimum.
2. Rootless Container unter gVisor als bevorzugte öffentliche Isolation.
3. Micro-VM pro Job bei höherem Schutzbedarf und tragbarer Startzeit.

Da der normale psi-slides-Build aktuell keinen benutzerdefinierten Code
serverseitig ausführt, dürfte gVisor ein plausibler Startpunkt sein. Diese
Annahme gilt nur, solange Plugins, beliebige Node-Module, Shell-Kommandos und
native Konverter ausgeschlossen bleiben.

Nodes Permission Model kann Dateizugriffe, Netzwerk und Child Processes
zusätzlich einschränken. Es ist Defense in Depth, nicht die primäre
Sandboxgrenze.

## Preview- und Browser-Sicherheit

Das erzeugte HTML ist auch bei sicherem Node-Build aktiver Browserinhalt. Die
Schutzmaßnahmen müssen deshalb unabhängig vom Builder gelten:

- Editor-Origin und Preview-Origin trennen.
- Edit-Preview zusätzlich ohne `allow-same-origin` sandboxen.
- Strikte Content Security Policy für Preview-Shell und statische Assets.
- `object-src 'none'`, `base-uri 'none'`, `form-action 'none'`.
- Keine Editor- oder Session-Cookies auf dem Preview-Origin.
- Keine Top-Level-Navigation aus dem eingebetteten Inhalt.
- Keine allgemeine `postMessage`-Verarbeitung; nur der übertragene
  MessagePort und ein enges Schema.
- Share-Preview zeigt sichtbar an, dass es nutzergenerierter Inhalt ist.
- Direkte Ausführung eines Roh-Artefakts auf dem Editor-Origin verhindern.

Ein späterer Share-Link könnte über eine vertrauenswürdige Preview-Shell
arbeiten. Ein Lesetoken im URL-Fragment wird von der Shell gegen ein
kurzlebiges Artefakt eingelöst; das Artefakt selbst landet wieder nur in
einem Sandbox-Iframe. Eine lange zufällige URL allein ist kein Ersatz für
Ablauf, Widerruf, serverseitige Rechteprüfung und Origin-Isolation.

## Missbrauchs- und Verfügbarkeitsmodell

Ein anonymer öffentlicher Builder wird automatisiert ausprobiert und muss
damit rechnen, dass einzelne Nutzer bewusst maximale Kosten erzeugen.

Notwendige Kontrollen:

- Rate Limit pro anonymer Sitzung und ergänzend pro IP/Netzbereich.
- Globale und projektbezogene Parallelitätsgrenze.
- Begrenzte Queue mit Backpressure.
- Build-Timeout und hartes Beenden der Job-Umgebung.
- Storage-Quota und kurze Retention.
- Automatisches Löschen abgelaufener Projekte, Uploads und Artefakte.
- Keine öffentliche Enumeration von Projekten.
- Keine ausgehenden Netzwerkverbindungen aus Build-Jobs.
- Metriken für Buildzeit, Fehler, Queue, RAM, Output und Uploadvolumen.
- Redigierte Logs ohne Source-Inhalte, Tokens und komplette Uploadnamen.
- Optional Challenge/CAPTCHA erst bei verdächtigem oder hohem Verbrauch.
- Klarer Abuse-Kontakt, bevor Share-Hosting angeboten wird.

## Datenmodell als Diskussionsgrundlage

### Project

- interne ID
- gehashte Edit-Capability beziehungsweise Session-Zuordnung
- Erstellungs- und Ablaufzeit
- aktuelle Source-Revision und Source-Hash
- Gesamtgröße und Quota-Zähler
- Status: active, expired, blocked, deleting

### SourceRevision

- Project-ID
- monotone Revision
- Source-Hash
- Quelltext oder Verweis auf Objektspeicher
- Erstellungszeit
- optional Herkunft: text edit, draw patch, restore

### Asset

- Project-ID
- interne ID und sicherer Storage-Key
- ursprünglicher Anzeigename
- normalisierter Typ
- Byte- und Pixeldimensionen
- Content-Hash
- Erstellungszeit

### Build

- Project-ID und Source-Revision
- Build-ID
- Status und Zeitstempel
- begrenzte, bereinigte Diagnostik
- Output-Hash und Größe
- Ablaufzeit

### ShareCapability

- Build-ID
- gehashtes Lesetoken
- Ablaufzeit
- Widerrufsstatus
- niemals Schreibrechte

Für einen Einzel-VM-Prototyp kann dieses Modell auf SQLite/PostgreSQL plus
Dateispeicher abgebildet werden. Die API darf trotzdem nie einen Storage-Pfad
direkt aus einer Nutzerangabe konstruieren.

## API-Skizze

Die konkreten Pfade sind offen; funktional werden ungefähr diese Operationen
benötigt:

```text
POST   /api/projects
GET    /api/projects/current
GET    /api/projects/:id/source
PUT    /api/projects/:id/source        If-Match: <revision>

GET    /api/projects/:id/assets
POST   /api/projects/:id/assets
DELETE /api/projects/:id/assets/:asset

POST   /api/projects/:id/builds
GET    /api/projects/:id/builds/:build
GET    /api/projects/:id/builds/:build/output-as-data

POST   /api/projects/:id/exports
GET    /api/projects/:id/exports/:export/download

POST   /api/projects/:id/builds/:build/shares
DELETE /api/projects/:id/builds/:build/shares/:share
```

Für jede Operation gelten serverseitige Projektberechtigung, Größenlimit,
Schema und Rate Limit. Es gibt keinen allgemeinen „read file“, „write file“
oder „run command“-Endpoint.

## Compiler- und Repository-Änderungen

Voraussichtlich notwendige Änderungen in oder um `build.js`:

1. Web-sicheres Eingabeprofil und zentrale Pfad-Containment-Helfer.
2. Strukturierter, maschinenlesbarer Build-Report mit Source-Hash,
   Diagnostics und Draw-Manifest.
3. Trennung der Authoring-Brücke vom lokalen Reload-Transport:
   - bestehender Local-Watch-Adapter,
   - neuer Embedded-Web-Adapter.
4. Web-Adapter für `ready`, `patch`, `assets` und `putAsset` über
   `MessageChannel`.
5. Preview-Ready- und State-Import/-Export-Schnittstelle.
6. Explizites Wiederöffnen einer Draw-Figur nach erfolgreichem Build.
7. Möglichkeit, Edit-Brücke und Draw-Editor pro Renderziel unabhängig zu
   aktivieren.
8. Später optional Preview-Bundle mit externen versionierten Runtime-Assets.

Die lokale CLI und die vier heutigen selbstständigen Ausgaben bleiben der
Kompatibilitätsvertrag. Der Webdienst darf einen Wrapper verwenden, aber
sicherheitsrelevante Parser- und Pfadregeln sollen nicht in mehreren
inkongruenten Kopien entstehen.

## Diagnostik und Fehlerdarstellung

Overleaf-artige Bedienung verlangt strukturiertere Fehler als ein beliebiger
stderr-String.

Der Build-Report sollte nach Möglichkeit liefern:

- Severity,
- stabile Fehlerkennung,
- menschenlesbare Nachricht,
- Source-Range oder mindestens Zeile/Spalte,
- Chunk-ID beziehungsweise Draw-Kontext,
- Hinweis, ob die letzte Vorschau weiter gültig ist.

Interne Stacktraces, absolute Serverpfade und Sandboxdetails gehören nur in
redigierte Betreiberlogs, nicht in die Browserantwort.

Im Editor werden Fehler:

- als Marker im Text,
- in einer kompakten Problems-Liste,
- und als Status über der unveränderten letzten guten Vorschau dargestellt.

## Tests

### Compiler- und Pfadtests

- `..`, absolute Pfade und Symlink-Escapes werden abgelehnt.
- Webprofil lehnt Raw HTML, SVG und externe Embeds wie spezifiziert ab.
- Normale lokale Builds bleiben unverändert.
- Input- und Outputlimits greifen vor ungebremstem Speicherverbrauch.

### API- und Berechtigungstests

- Projekt A kann Projekt B weder lesen noch ändern noch bauen.
- Zufällige IDs ohne Edit-Capability reichen nicht.
- Stale Revisionen werden mit Konflikt abgelehnt.
- View-Tokens besitzen keine Schreiboperationen.
- Abgelaufene oder widerrufene Tokens funktionieren nicht.
- Keine Route akzeptiert Nutzerpfade oder Build-Flags.

### Draw-Integration

- Figur rechts öffnen, verändern und als eine Transaktion links anwenden.
- Undo stellt den alten kompletten Block wieder her.
- Verschobene, aber unveränderte Blöcke können eindeutig rebased werden.
- Gleichzeitig links geänderter Draw-Block erzeugt Konflikt statt Verlust.
- Nach Rebuild wird dieselbe Figur wieder geöffnet.
- Asset-Upload, Platzierung, Patch und Rebuild ergeben das echte Bild.
- Share- und Download-Build besitzen keine Edit-Brücke.

### Live-Preview

- Stale Build-Ergebnisse ersetzen keine neuere Vorschau.
- Fehlbuild lässt die letzte gute Vorschau stehen.
- Chunk und Step werden beim Iframe-Tausch erhalten.
- Sandbox-Inhalt kann weder Parent-DOM noch Cookies oder Storage lesen.
- Top-Navigation, Formulare und unerlaubte Popups bleiben blockiert.
- Ein gefälschtes oder altes MessagePort-Protokoll kann nicht schreiben.

### Isolation und Last

- Gleichzeitige Projekte vermischen keine globalen Compilerzustände.
- CPU-, RAM-, Zeit- und Outputlimits werden praktisch ausgelöst und geprüft.
- Abgebrochene Builds hinterlassen keine weiterlaufenden Prozesse.
- Queue-Kollaps führt zu kontrollierten Fehlern, nicht zum VM-Ausfall.
- Retention löscht Source, Assets und Artefakte vollständig.

## Gestufte Umsetzung

### Phase 0: Entscheidungen und Threat Model

- Ziele und Nicht-Ziele dieses Dokuments bestätigen.
- Web-safe-Quellformat festlegen.
- Anonymes Capability- und Retention-Modell festlegen.
- Preview-Sandbox und Origin-Modell festlegen.
- Größen- und Lastbudgets zunächst als messbare Hypothesen definieren.

Ergebnis: ein kleines Security- und Architektur-Decision-Record, gegen das
der Prototyp geprüft werden kann.

### Phase 1: Lokaler Split-View-Prototyp

- CodeMirror/Monaco-Spike.
- Links `source.md`, rechts manuell gebautes Audience-HTML per `srcdoc`.
- Build-ID und Source-Hash.
- Fehlbuild behält letzte gute Vorschau.
- Noch keine öffentliche Bereitstellung und keine Uploads.

Ergebnis: Prüfung von Bediengefühl, Buildlatenz und Preview-Kompatibilität.

### Phase 2: Draw-Write-back

- Transportneutrale `psiWatch`-Schnittstelle herauslösen.
- `MessageChannel`-Adapter ergänzen.
- Draw-Patch als Editor-Transaktion anwenden.
- Konfliktprüfung und eindeutiges Rebase.
- Draw-Reopen nach Iframe-Tausch.

Ergebnis: kompletter Kernworkflow „grafisch rechts ändern, Markdown links
aktualisieren“ ohne direkte Serverschreibrechte aus der Vorschau.

### Phase 3: Web-safe Builder

- Pfad-Containment.
- Webprofil und Inputlimits.
- strukturierter Build-Report.
- frischer isolierter Job pro Build.
- Queue, Timeout, Outputlimit und Cleanup.
- Security- und Isolationstests.

Ergebnis: Builder, dem beliebige Quellen angeboten werden können, ohne den
Editor bereits öffentlich freizugeben.

### Phase 4: Anonyme öffentliche Projekte

- Projekt-API und HttpOnly-Sitzung.
- Revisionen und Autosave.
- Quotas, Rate Limits und Retention.
- HTTPS, Security Header, Monitoring und redigierte Logs.
- kontrollierter öffentlicher Beta-Betrieb.

Ergebnis: nutzbarer öffentlicher Texteditor mit Live-Preview und Draw-
Write-back.

### Phase 5: Rasterbild-Upload

- sichere Uploadpipeline und Re-Encoding.
- Asset-Liste im Parent.
- Draw-Editor-Brücke für `assets` und `putAsset`.
- Projekt- und Pixelbudgets.
- Download mit inlinierten Bildern.

Ergebnis: vollständiger Authoringfluss für Text, Draw-Figuren und sichere
Rasterbilder.

### Phase 6: Export, Share und Performance

- Export aller gewünschten Ansichten.
- optionale zeitlich begrenzte Share-Preview ohne Edit-Brücke.
- Double-Buffer-Preview und vollständiger State-Transfer.
- bei Bedarf externes versioniertes Preview-Bundle.
- optionale Accounts beziehungsweise Recovery nach realem Bedarf.

## Entscheidungen vor Implementierungsbeginn

| Frage | Vorschlag für den ersten Prototyp | Noch zu klären |
| --- | --- | --- |
| Konten | keine, anonyme HttpOnly-Sitzung | Recovery und spätere Migration |
| Retention | kurz, beispielsweise 24 Stunden | Kosten, Nutzererwartung, Datenschutz |
| Editor | CodeMirror 6 | UI-Spike gegen Monaco |
| Preview | `srcdoc` im Sandbox-Iframe | Browserkompatibilität und State-Transfer |
| Live-Build | 600–1000 ms Debounce | Lasttest und tatsächliches Tippgefühl |
| Preview-Ausgabe | nur Audience | wann Print/Speaker gebaut werden |
| Draw-Commit | explizites Apply/Ctrl-S | zusätzlich kontinuierliches Spiegeln? |
| Draw-Konflikt | ablehnen, wenn Block selbst geändert | genaue Rebase-Identität |
| Bilder | PNG/JPEG/WebP, eng begrenzt | GIF, Maße und Re-Encoding-Library |
| SVG | zunächst nein | Sanitizer und Rest-Risiko |
| Raw HTML | im Webprofil nein | Escape oder harte Fehlermeldung |
| Remote-Media | zunächst nein | späterer CSP-/Privacy-Vertrag |
| Isolation | rootless + gVisor | Startzeit, Betriebssystem und Provider |
| Share-Links | nicht in MVP | Tokenfluss, Ablauf und Abuse-Verantwortung |
| Analytics | nur technische Metriken | Datenschutz und freiwillige Produktdaten |

## Bewusste Grenzen

- Eine lange Zufalls-URL verhindert Erraten, aber nicht Weitergabe oder
  Verlust. Ohne Account bleibt sie ein Bearer-Geheimnis.
- Ein Sandbox-Iframe kann einige normale Präsentationsfunktionen einschränken.
  Der heruntergeladene Build bleibt der Ort für das vollständige Verhalten.
- Eine vollständig selbstständige HTML-Datei pro Tipp-Pause ist bequem, aber
  bei größerer Nutzung bandbreitenintensiv.
- Der bestehende Draw-Editor ist gut integrierbar; ein allgemeiner visueller
  Editor für den restlichen Lecture-Text ist damit nicht automatisch gegeben.
- Anonyme öffentliche Builds benötigen auch ohne bekannte RCE einen echten
  Missbrauchs-, Quota- und Löschbetrieb.
- Der Webdienst darf ein engeres Quellformat haben als die lokale CLI. Eine
  scheinbare Funktionsgleichheit ist kein guter Tausch gegen eine unklare
  Sicherheitsgrenze.

## Erfolgskriterien für eine erste öffentliche Beta

Die Beta ist bereit, wenn mindestens Folgendes nachweisbar ist:

1. Ein neuer Besucher kann ohne Installation eine Lecture schreiben, bauen,
   ansehen und als `audience.html` herunterladen.
2. Ein vorhandener `::: draw`-Block kann rechts grafisch verändert und links
   verlustfrei als eine Undo-Einheit übernommen werden.
3. Ein Konflikt überschreibt niemals still Quelltext.
4. Ein Buildfehler zerstört weder Source noch letzte gute Vorschau.
5. Zwei gleichzeitige Projekte können weder Daten noch Compilerzustand
   miteinander vermischen.
6. Preview-Inhalt kann nicht auf Editor-Cookies, Parent-DOM oder fremde
   Projekte zugreifen.
7. Builder besitzen kein Netzwerk, keine Secrets und keinen Hostzugriff.
8. Upload-, Build-, Queue-, Speicher- und Retentionlimits sind automatisiert
   getestet.
9. Abgelaufene Projekte und Artefakte werden tatsächlich gelöscht.
10. Share- und Export-Artefakte enthalten niemals die Edit-Brücke.

## Vorgeschlagene nächste Diskussion

Vor Code sollte die nächste Runde diese Fragen in dieser Reihenfolge
entscheiden:

1. Ist „anonym und nach 24 Stunden gelöscht“ das richtige erste Produkt, oder
   wird früh eine dauerhafte Speicherung erwartet?
2. Welche lokale Syntax muss das Webprofil zwingend unterstützen, und welche
   Features dürfen zunächst fehlen?
3. Reicht Audience-only im Editor, oder muss die Speaker-Ansicht früh
   erreichbar sein?
4. Welche konkreten Source-, Bild-, Output- und Buildzeitlimits sind für reale
   Lectures ausreichend?
5. Soll ein Draw-Patch erst auf Apply in den Text gelangen oder während der
   grafischen Bearbeitung kontinuierlich gespiegelt werden?
6. Welche Sandboxtechnik ist auf der vorgesehenen VM praktisch betreibbar?
7. Wann wird ein Projekt als Download gesichert, und braucht es zusätzlich
   einen Recovery-Code?

Erst nach diesen Entscheidungen sollte aus diesem Diskussionsplan ein
verbindlicher Implementierungsplan mit Komponenten, Interfaces, Tests und
Migrationen abgeleitet werden.
