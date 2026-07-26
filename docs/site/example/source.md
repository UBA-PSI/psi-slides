---
title: Wie ein Paket durchs Internet reist
presenter: Prof. Dr. Dominik Herrmann
info: |
  Einführung in die Informatik (Inf-Einf-B)
  Universität Bamberg
  nach inf.zone/lectures/8.5-netze · CC BY-NC-SA 4.0
course: inf-einf-b
lecture: 8.5
lang: de
---

<!--
  Ein kurzer Ausschnitt aus einer echten Vorlesung, hier als vollständiges
  Beispiel für eine psi-slides-Quelle: die Notizen 8.5 „Netze“ der
  Inf-Einf-B, https://inf.zone/lectures/8.5-netze/notes85/, für das
  Chunk-Format neu gesetzt und gekürzt.
-->


## title: {#title}

# Namen und Nummern {#dns}

## principle: Rechner kennen keine Namen | nur Nummern {.standard #dns-principle}

**Bevor der erste Buchstabe einer Webseite fließt, muss aus dem Namen eine Nummer geworden sein.** Ein Rechner adressiert seine Gegenstelle über eine IP-Adresse wie `93.184.216.34`; `example.com` ist eine Bequemlichkeit für Menschen und für die Übertragung völlig bedeutungslos.

> note: Hier kurz sammeln lassen, wer schon einmal eine IP-Adresse getippt hat. Meist niemand – genau das ist der Punkt.

## definition: Domain Name System | das Telefonbuch des Internets {.standard #dns-def}

**Das DNS beantwortet genau eine Frage: „Welche Nummer gehört zu diesem Namen?“** Man reicht `example.com` hinein und bekommt `93.184.216.34` zurück.

Die Antwort kommt selten von weit her. **Zuerst schaut das Betriebssystem in seinen eigenen Zwischenspeicher**, dann der Resolver in seinen – dessen Adresse der Rechner beim Verbinden per DHCP erfahren hat. Erst wenn beide nichts wissen, wird wirklich gefragt.

::: expand Die Hierarchie, wenn niemand die Antwort kennt
Der Resolver arbeitet sich von oben nach unten durch:

1. Ein **Root-Nameserver** sagt, wer für `.com` zuständig ist.
2. Der **TLD-Nameserver** für `.com` sagt, wer für `example.com` zuständig ist.
3. Der **autoritative Nameserver** liefert die konkrete IP-Adresse.

Drei Fragen für eine Antwort – deshalb die Zwischenspeicher auf jeder Stufe.
:::

## example: Selbst nachsehen | zwei Zeilen im Terminal {.wide #dns-tools}

**Das DNS ist eines der wenigen Internet-Protokolle, die man ohne Werkzeuge direkt befragen kann.**

```bash
host www.uni-bamberg.de
dig www.uni-bamberg.de
```

`8.8.8.8` (Google) und `1.1.1.1` (Cloudflare) sind öffentliche Resolver, die jeder benutzen kann – und die deshalb mitlesen, welche Namen man nachschlägt.

::: margin
Durch die Zwischenspeicher liegt eine typische Antwortzeit unter 10 Millisekunden.
:::

# Große Nachrichten, kleine Pakete {#tcp}

## principle: Ein Paket ist klein | eine Nachricht selten {.standard #tcp-principle}

**Ein IP-Paket fasst im Ethernet nur rund 1500 Byte.** Alles Größere muss zerlegt werden, bevor es losfahren kann – und am Ziel wieder zusammengesetzt werden, ohne dass die Anwendung etwas davon merkt.

## example: TCP-Segmentierung | Nummern statt Reihenfolge {.wide #tcp-segments}

**TCP zerschneidet die Nachricht in Segmente und nummeriert sie – gezählt wird in Byte, nicht in Paketen.** Das erste Segment trägt die Nummer 1 und enthält die Byte 1 bis 1000, das zweite trägt die 1001.

::: cols 2

**Jedes Segment reist eigenständig.** Es wird in ein eigenes IP-Paket verpackt und kann einen anderen Weg durchs Netz nehmen als sein Vorgänger.

**Die Reihenfolge am Ziel ist deshalb nicht garantiert.** Der Empfänger sortiert nach den Sequenznummern, nicht nach der Ankunftszeit.

:::

**Geht ein Paket verloren, fordert TCP genau dieses eine nach.** Die Arbeitsteilung ist damit sauber: IP kümmert sich um das einzelne Paket, TCP um die vollständige Nachricht.

> note: Wenn Zeit ist, an der Tafel zwei Segmente über verschiedene Wege schicken und das zweite zuerst ankommen lassen. Die Frage „woher weiß der Empfänger, dass etwas fehlt“ kommt dann von selbst.
