// Every word the interface shows, in both languages. One key, two entries;
// the test in desktop/test/strings.test.mjs fails when a key is missing in
// either, so a string can never ship in one language only.
//
// Placeholders are {name} and are filled by t() in app.js. Keep the two
// languages saying the same thing rather than translating word by word – the
// German is not a rendering of the English, both are written for the person
// reading them.
//
// Plain script, no module syntax: the renderer runs sandboxed from file://,
// where a module script is not guaranteed to load. The last line lets Node
// read the same file in the tests.
const STRINGS = {
  en: {
    'app.name': 'psi-slides Builder',

    'start.title': 'Open a lecture',
    'start.lead': 'Choose the source.md of a lecture, or drop it onto this window.',
    'start.open': 'Open source.md…',
    'start.new': 'New lecture…',
    'start.recent': 'Recently opened',
    'start.recentEmpty': 'Lectures you open will be listed here.',
    'start.missing': 'not found',
    'start.remove': 'Remove from the list',
    'start.local': 'Everything stays on this computer. Nothing is uploaded.',
    'drop.hint': 'Drop to open',

    'new.title': 'New lecture',
    'new.nameLabel': 'Folder name',
    'new.nameHint': 'Lowercase letters, digits and hyphens, for example netsec-04.',
    'new.whereLabel': 'Create in',
    'new.choose': 'Choose folder…',
    'new.create': 'Create lecture',
    'new.cancel': 'Cancel',
    'new.badName': 'Use lowercase letters, digits and hyphens, and start with a letter.',
    'new.exists': 'A folder with that name already exists there.',
    'new.noFolder': 'Choose a folder to create the lecture in.',

    'project.back': 'Lectures',
    'project.showFolder': 'Show folder',
    'project.openSource': 'Open source.md in your text editor',
    'project.editorNote': 'Any text editor will do. Save the file, and the builder turns it into the four views again.',

    'status.starting': 'Starting…',
    'status.building': 'Building…',
    'status.ready': 'Ready. Built at {time} in {duration}.',
    'status.changed': 'source.md has changed since the build at {time}.',
    'status.error': 'The build failed.',
    'status.errorKeep': 'The views still show the last successful build, from {time}.',
    'status.errorNone': 'There is no successful build yet, so the views cannot be opened.',
    'status.bug': 'This looks like a fault in psi-slides itself rather than in your lecture. The build details below are what a bug report needs.',
    'status.exited': 'Building has stopped unexpectedly.',
    'status.restart': 'Restart',

    'actions.build': 'Build now',
    'actions.auto': 'Build again whenever source.md is saved',

    'outputs.title': 'Open a view',
    'outputs.audience': 'Presentation',
    'outputs.audienceHint': 'for the projector',
    'outputs.speaker': 'Cockpit',
    'outputs.speakerHint': 'your notes, the timer and the next slide',
    'outputs.print': 'Handout',
    'outputs.printHint': 'the lecture as a document',
    'outputs.printNotes': 'Handout with notes',
    'outputs.printNotesHint': 'the document plus your speaker notes',
    'outputs.notBuilt': 'Not built yet',

    'details.show': 'Show build details',
    'details.hide': 'Hide build details',
    'details.copy': 'Copy details',
    'details.copied': 'Copied',
    'details.empty': 'Nothing logged yet.',

    'hint.browser': 'No Chrome or Edge was found, so the views open in your default browser. psi-slides is tested in Chrome; other browsers may behave differently.',
    'hint.embeds': 'This lecture embeds players from YouTube or Vimeo, and they refuse to play from a file. Turn on “Open the views through a local web address” below.',

    'serve.label': 'Open the views through a local web address',
    'serve.hint': 'Needed for embedded YouTube or Vimeo players, which refuse to play from a file. The address works on this computer only.',
    'serve.restarting': 'The builder is restarting. Reload any views you have open.',
    'serve.address': 'The views are at {url}',

    'settings.title': 'Settings',
    'settings.language': 'Language',
    'settings.languageEn': 'English',
    'settings.languageDe': 'Deutsch',
    'settings.browser': 'Open the views in',
    'settings.browserAuto': 'Chrome or Edge if installed, otherwise the default browser',
    'settings.browserDefault': 'Always the default browser',
    'settings.done': 'Done',
    'settings.version': 'psi-slides Builder {version}',

    'menu.file': 'File',
    'menu.open': 'Open source.md…',
    'menu.new': 'New lecture…',
    'menu.close': 'Close lecture',
    'menu.build': 'Build now',
    'menu.settings': 'Settings…',
    'menu.view': 'View',
    'menu.help': 'Help',
    'menu.docs': 'psi-slides documentation',
    'menu.tutorial': 'How to write a lecture',

    'error.notMarkdown': 'Only Markdown files (.md) can be opened.',
    'error.unreadable': 'The file {path} cannot be read.',
    'error.openFailed': 'Could not open {path}: {reason}',
    'error.engineMissing': 'The psi-slides build is missing from this installation, so nothing can be built. Installing the app again should restore it.',
    'error.dismiss': 'Dismiss',

    'time.seconds': '{n} s',
    'time.justNow': 'just now',
    'time.minutes': '{n} min ago',
    'time.hours': '{n} h ago',
    'time.yesterday': 'yesterday',
    'time.days': '{n} days ago',
  },

  de: {
    'app.name': 'psi-slides Builder',

    'start.title': 'Eine Vorlesung öffnen',
    'start.lead': 'Wähle die source.md einer Vorlesung, oder zieh sie in dieses Fenster.',
    'start.open': 'source.md öffnen…',
    'start.new': 'Neue Vorlesung…',
    'start.recent': 'Zuletzt geöffnet',
    'start.recentEmpty': 'Vorlesungen, die du öffnest, stehen dann hier.',
    'start.missing': 'nicht gefunden',
    'start.remove': 'Aus der Liste entfernen',
    'start.local': 'Alles bleibt auf diesem Rechner. Nichts wird hochgeladen.',
    'drop.hint': 'Loslassen, um zu öffnen',

    'new.title': 'Neue Vorlesung',
    'new.nameLabel': 'Ordnername',
    'new.nameHint': 'Kleinbuchstaben, Ziffern und Bindestriche, zum Beispiel netsec-04.',
    'new.whereLabel': 'Anlegen in',
    'new.choose': 'Ordner wählen…',
    'new.create': 'Vorlesung anlegen',
    'new.cancel': 'Abbrechen',
    'new.badName': 'Nur Kleinbuchstaben, Ziffern und Bindestriche, und der Name beginnt mit einem Buchstaben.',
    'new.exists': 'Dort gibt es schon einen Ordner mit diesem Namen.',
    'new.noFolder': 'Wähle einen Ordner, in dem die Vorlesung angelegt wird.',

    'project.back': 'Vorlesungen',
    'project.showFolder': 'Ordner anzeigen',
    'project.openSource': 'source.md im Texteditor öffnen',
    'project.editorNote': 'Jeder Texteditor genügt. Speichern, und der Builder macht aus der Datei wieder die vier Ansichten.',

    'status.starting': 'Startet…',
    'status.building': 'Baut…',
    'status.ready': 'Bereit. Gebaut um {time} in {duration}.',
    'status.changed': 'source.md hat sich seit dem Build um {time} geändert.',
    'status.error': 'Der Build ist fehlgeschlagen.',
    'status.errorKeep': 'Die Ansichten zeigen noch den letzten erfolgreichen Build von {time}.',
    'status.errorNone': 'Es gibt noch keinen erfolgreichen Build. Die Ansichten lassen sich deshalb noch nicht öffnen.',
    'status.bug': 'Das sieht nach einem Fehler in psi-slides selbst aus, nicht in deiner Vorlesung. Die Build-Details unten sind das, was ein Fehlerbericht braucht.',
    'status.exited': 'Das Bauen wurde unerwartet beendet.',
    'status.restart': 'Neu starten',

    'actions.build': 'Jetzt bauen',
    'actions.auto': 'Bei jedem Speichern von source.md neu bauen',

    'outputs.title': 'Eine Ansicht öffnen',
    'outputs.audience': 'Präsentation',
    'outputs.audienceHint': 'für den Beamer',
    'outputs.speaker': 'Cockpit',
    'outputs.speakerHint': 'deine Notizen, der Timer und die nächste Folie',
    'outputs.print': 'Handout',
    'outputs.printHint': 'die Vorlesung als Dokument',
    'outputs.printNotes': 'Handout mit Notizen',
    'outputs.printNotesHint': 'das Dokument samt deinen Sprechernotizen',
    'outputs.notBuilt': 'Noch nicht gebaut',

    'details.show': 'Build-Details anzeigen',
    'details.hide': 'Build-Details ausblenden',
    'details.copy': 'Details kopieren',
    'details.copied': 'Kopiert',
    'details.empty': 'Noch nichts protokolliert.',

    'hint.browser': 'Chrome oder Edge wurde nicht gefunden, die Ansichten öffnen sich deshalb im Standardbrowser. psi-slides ist in Chrome getestet; andere Browser können sich anders verhalten.',
    'hint.embeds': 'Diese Vorlesung bettet Player von YouTube oder Vimeo ein, und die laufen nicht aus einer Datei heraus. Schalte unten „Die Ansichten über eine lokale Webadresse öffnen“ ein.',

    'serve.label': 'Die Ansichten über eine lokale Webadresse öffnen',
    'serve.hint': 'Nötig für eingebettete YouTube- oder Vimeo-Player, die aus einer Datei heraus nicht laufen. Die Adresse funktioniert nur auf diesem Rechner.',
    'serve.restarting': 'Der Builder startet neu. Lade offene Ansichten danach neu.',
    'serve.address': 'Die Ansichten liegen unter {url}',

    'settings.title': 'Einstellungen',
    'settings.language': 'Sprache',
    'settings.languageEn': 'English',
    'settings.languageDe': 'Deutsch',
    'settings.browser': 'Ansichten öffnen in',
    'settings.browserAuto': 'Chrome oder Edge, wenn installiert, sonst im Standardbrowser',
    'settings.browserDefault': 'Immer im Standardbrowser',
    'settings.done': 'Fertig',
    'settings.version': 'psi-slides Builder {version}',

    'menu.file': 'Datei',
    'menu.open': 'source.md öffnen…',
    'menu.new': 'Neue Vorlesung…',
    'menu.close': 'Vorlesung schließen',
    'menu.build': 'Jetzt bauen',
    'menu.settings': 'Einstellungen…',
    'menu.view': 'Ansicht',
    'menu.help': 'Hilfe',
    'menu.docs': 'psi-slides-Dokumentation',
    'menu.tutorial': 'Wie man eine Vorlesung schreibt',

    'error.notMarkdown': 'Nur Markdown-Dateien (.md) lassen sich öffnen.',
    'error.unreadable': 'Die Datei {path} lässt sich nicht lesen.',
    'error.openFailed': '{path} ließ sich nicht öffnen: {reason}',
    'error.engineMissing': 'In dieser Installation fehlt der psi-slides-Build, es lässt sich deshalb nichts bauen. Die App noch einmal zu installieren stellt ihn wieder her.',
    'error.dismiss': 'Schließen',

    'time.seconds': '{n} s',
    'time.justNow': 'gerade eben',
    'time.minutes': 'vor {n} Min.',
    'time.hours': 'vor {n} Std.',
    'time.yesterday': 'gestern',
    'time.days': 'vor {n} Tagen',
  },
};

if (typeof module !== 'undefined') module.exports = STRINGS;
