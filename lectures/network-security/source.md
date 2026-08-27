---
title: Network Security
subtitle: "Thirty-six lecture slides, rebuilt as animated figures"
presenter: Prof. Dr. Dominik Herrmann
info: |
  Introduction to Security and Privacy
  PSI-Sem-B · PSI-Sem-M
course: introsp
lecture: network-security
lang: en
theme: dark
collapse: none
draw-defaults: |
  default text {.small}
  default container pad 0.4
---

## title: Network Security | thirty-six slides, rebuilt from text {#cover}

Every figure in this lecture is written in the lecture source, laid out at build
time, and stepped with the same key that advances a reveal. The wording of every
label is the wording of the original slide; the arrangement is not.

Die Regeln, gegen die hier gebaut wurde, stehen in `figure-design.md`. Die
Tonzuordnung gilt für den ganzen Foliensatz: `.tone-1` Infrastruktur, `.tone-2`
ein legitimer Host, `.tone-3` Nutzdaten und Protokollfelder, `.tone-4` das, worum
es in diesem Beat geht, `.accent` Angreifer und Angriffsverkehr, `.dim` in dieser
Szene unbeteiligt, `.muted` das Gerüst.

# Addresses, and the protocols that resolve them

## figure: For transport, each network layer relies on addresses {.full #ns-a03}

::: draw {unit=150x54}
default box {.tone-3 .sharp} w 0.88 h 0.85

box fh "Frame\nHeader"    at 0,0
box dh "Datagram\nHeader" right of fh gap 0 same as fh
box sh "Segment\nHeader"  right of dh gap 0 same as fh
box pl "Payload"          right of sh gap 0 same as fh {.paper}

# Die drei Beschriftungen steigen nach rechts an, damit ihre Leitlinien
# senkrecht bleiben und keine über der nächsten liegt. Sie zeigen auf die
# Oberkante, nicht auf den Kasten: eine Leitlinie zur Mitte endete mitten
# in der Beschriftung des Kastens.
text lmac "Ethernet source\nand destination\naddresses*"       above fh gap 0.5 -- fh.cx,fh.top {.muted @l1}
text lip  "IP source\nand destination\naddresses"              above dh gap 1.7 -- dh.cx,dh.top {.muted @l2}
text lprt "source and\ndestination ports\n(if TCP/UDP is used)" above sh gap 2.9 -- sh.cx,sh.top {.muted @l3}

text foot "*also called MAC addresses (media access control)" below fh gap 0.85 flush left {.left .muted}

step ethernet
  show @l1
  emph fh
step ip
  show @l2
  emph dh
step ports
  show @l3
  emph sh
:::

**Ein Paket trägt in jeder Schicht ein eigenes Adressenpaar.** Die vier Kästen sind ein einziger Rahmen auf dem Draht: `gap 0` und `same as` halten sie als Stapel zusammen, und nur die Beschriftung darüber sagt, welcher Kopf welche Adressen führt. Jeder Schritt hebt einen Kopf hervor und blendet die zugehörige Erklärung ein, von außen nach innen – in der Reihenfolge, in der ein Gerät die Kopfdaten abarbeitet. Die Nutzdaten bleiben ungetönt, weil sie in dieser Figur nichts zu sagen haben.

## figure: Besides spoofing, adversaries may attack address resolution {.full #ns-a07}

::: draw {unit=170x50}
default box {.tone-3 .sharp} w 1.15 h 0.6

box dn  "domain name" at 0,0
box ip1 "IP address"  below dn gap 0.5 offset 1.5,0 {@dns}
edge dn.bottom -- ip1.left via dn.cx,ip1.cy {.muted}
text ldns "DNS" left of ip1 gap 1.15 pad 0.14 {.paper .bold @dns}

# Der Abstand innerhalb eines Paares ist 0.5, der zwischen den Paaren 1.15 –
# gut Faktor zwei, damit die Gruppierung vor der Beschriftung ankommt.
box ip2 "IP address"  below ip1 gap 1.15 offset -1.5,0
box mac "MAC address" below ip2 gap 0.5 offset 1.5,0 {@arp}
edge ip2.bottom -- mac.left via ip2.cx,mac.cy {.muted}
text larp "ARP" left of mac gap 1.15 pad 0.14 {.paper .bold @arp}

step dns
  show @dns
step arp
  show @arp
step surface
  style ldns, larp {.accent}
  emph ldns, larp
:::

**Ein Name allein trägt kein Paket.** Zwischen dem, was ein Mensch eintippt, und dem, was eine Netzkarte adressieren kann, liegen zwei Übersetzungen: DNS macht aus dem Namen eine IP-Adresse, ARP aus der IP-Adresse eine MAC-Adresse. Beide sind hier gleich gezeichnet, denn es ist zweimal dieselbe Bauform – eine Frage, eine Antwort, kein Beweis. Der letzte Schritt färbt genau die beiden Protokollnamen ein: Sie sind die Angriffsfläche, nicht die Adressen. Die ausführliche Erklärung steht im Video zu den Netzgrundlagen.

## figure: ARP Cache Poisoning | allows A to eavesdrop on communication between local network devices {.full #ns-a10}

::: draw {unit=170x50}
box sw "Ethernet\nSwitch" at 0,0 w 1.0 h 0.9 {.tone-1}
box gw "Default\nGateway" right of sw gap 1.15 same as sw {.tone-1}
edge sw -- gw {.muted}
container dev "" over sw,gw pad 0.3 {.muted}

box a "A" above sw gap 0.55 offset -0.32,0 w 0.21 h 0.7 {.tone-2 @hosts}
box b "B" above sw gap 1.1  offset  0.22,0 same as a {.tone-2 @hosts}
edge awire a.bottom -- a.cx,sw.top {.muted}
edge bwire b.bottom -- b.cx,sw.top {.muted}

text amac "aa:aa:aa:00:01:02" above a gap 0.25 offset -0.55,0 {.mono .muted @hosts}
text bmac "eb:99:f1:f3:1f:f2\n10.1.1.5" above b gap 0.3 {.mono .muted @hosts}
text gwl  "10.1.1.1\n00:ac:c1:11:15:11" below gw gap 0.32 {.mono .muted}

# Auf der Originalfolie ist A von Anfang an rot. Hier ist A zuerst ein Host
# wie jeder andere und wird erst im letzten Beat zum Angreifer – das ist
# genau die Aussage der Folie und kostet keine Beschriftung.
step hosts
  show @hosts
step forwarding
  emph bwire, sw
step poisoning
  style a {.accent .paper}
  emph a, awire
  dim bwire, sw
:::

**Ein Switch ist keine Sicherheitsmaßnahme, sondern eine Optimierung.** Er merkt sich, hinter welchem Port welche MAC-Adresse sitzt, und schickt einen Rahmen nur dorthin; dass A den Verkehr von B nicht sieht, ist ein Nebeneffekt dieser Sparsamkeit. ARP Cache Poisoning greift genau diese Zuordnung an: A behauptet unaufgefordert, die MAC-Adresse zu einer fremden IP zu besitzen, und der Verkehr landet fortan bei A. Der letzte Beat färbt deshalb A und seine Leitung ein und nimmt die Betonung vom Normalfall wieder weg.

## figure: B wants to visit webserver at example.com | knows IP of DNS resolver of ISP and gateway {.full #ns-a08}

::: draw {unit=190x54}
# Diese Topologie tragen vier Figuren gemeinsam (A-08, A-12, A-13, A-14):
# gleiche Namen, gleiche Plätze, damit die Folge als eine Zeichnung liest,
# die sich entwickelt.
box sw  "Switch &\nRouter" at 0,0 w 0.9 h 0.9 {.tone-1}
box b   "B" above sw gap 1.6  offset  0.24,0 w 0.2 h 0.7 {.tone-2}
box a   "A" above sw gap 0.55 offset -0.32,0 same as b {.dim}
edge awire a.bottom -- a.cx,sw.top {.muted}
edge bwire b.bottom -- b.cx,sw.top {.muted}

box rt  "Router" at 2.30,0 w 0.72 h 0.9 {.tone-1 @net}
box res "" above rt gap 1.6 w 0.2 h 0.7 {.tone-1 @net}
box web "" below rt gap 1.75 same as res {.tone-2 @net}
align y middle b, res
edge trunk sw -- rt {.muted}
edge rwire res.bottom -- rt.top {.muted}
edge uplink rt.bottom -- web.top {.muted}
text brk "//" between rt,web pad 0.12 {.paper .muted @net}

text bmac "eb:99:f1:f3:1f:f2\n10.1.1.5" above b gap 0.3 {.mono .muted}
text gwl  "default gateway\n10.1.1.1\n00:ac:c1:11:15:11" below sw gap 0.3 {.muted}
text resl "41.1.2.1\nDNS Resolver of ISP" above res gap 0.28 {.muted @net}
text webl "Webserver\nexample.com\n80.5.5.3" below web gap 0.28 {.muted @net}

# Die Zonengrenze ist keine Beziehung, sondern eine Trennung: eine kopflose
# gepunktete Kante zwischen zwei Koordinaten, die kein Element berührt.
text zoneh "Home Network\n(10.1.1.1–254)" above bmac gap 0.5 offset 0.55,0 {.muted .serif}
text zonei "Internet" above resl gap 0.5 offset -0.5,0 {.muted .serif}
align y middle zoneh, zonei
edge rt.left-0.52,zoneh.top-0.2 -- rt.left-0.52,webl.bottom+0.2 {.dotted .muted}

step internet
  show @net
step knows
  emph res, sw
step wants
  emph web
  dim res, sw
:::

**Die Bühne für die nächsten drei Figuren.** Links das Heimnetz, rechts das Internet, dazwischen eine gepunktete Grenze, die nichts verbindet, sondern trennt – deshalb ist sie eine kopflose Kante zwischen zwei Koordinaten und hängt an keinem Element. B kennt zwei Adressen auswendig: die des Standardgateways und die des DNS-Resolvers seines Providers. Alles Weitere muss B erfragen, und genau dort setzen die folgenden Angriffe an. Das Bruchzeichen auf der Leitung zum Webserver sagt, dass zwischen Router und Ziel noch viel Netz liegt, das die Zeichnung nicht zeigt.

## figure: DNS Spoofing | Adversary forges IP address in DNS reply to redirect victim to malicious server, e.g., for phishing credentials {.full #ns-a12}

::: draw {unit=190x54}
# Dieselbe Topologie wie #ns-a08, dieselben Namen, dieselben Plätze.
box sw  "Switch &\nRouter" at 0,0 w 0.9 h 0.9 {.tone-1}
box b   "B" above sw gap 1.6  offset  0.24,0 w 0.2 h 0.7 {.tone-2}
box a   "A" above sw gap 0.55 offset -0.32,0 same as b {.accent}
edge awire a.bottom -- a.cx,sw.top {.muted}
edge bwire b.bottom -- b.cx,sw.top {.muted}

box rt  "Router" at 2.30,0 w 0.72 h 0.9 {.tone-1}
box res "" above rt gap 1.6 w 0.2 h 0.7 {.tone-1}
box web "" below rt gap 1.75 same as res {.tone-2}
align y middle b, res
edge trunk sw -- rt {.muted}
edge rwire res.bottom -- rt.top {.muted}
edge uplink rt.bottom -- web.top {.muted}
text brk "//" between rt,web pad 0.12 {.paper .muted}

box awb "" left of web gap 5.45 same as web {.accent @evil}
box e   "" left of awb gap 2.35 same as web {.dim}
edge e -- awb {.muted}
edge awb -- web {.muted}

text bmac "eb:99:f1:f3:1f:f2\n10.1.1.5" above b gap 0.3 {.mono .muted}
text gwl  "default gateway\n10.1.1.1\n00:ac:c1:11:15:11" below sw gap 0.3 {.muted}
text resl "DNS Resolver\nof ISP" above res gap 0.28 {.muted}
text webl "Webserver\nexample.com\n80.5.5.3" below web gap 0.28 {.muted}
text awbl "Attacker's Webserver\n“example.com”\n66.9.9.6" below awb gap 0.28 {.muted @evil}

# Die gefälschte Antwort läuft auf derselben Leitung wie B's Anschluss, also
# tritt sie an deren Stelle: bwire geht weg, forged kommt – nie beide, statt
# zweier Linien übereinander.
edge forged b.cx,sw.top -> b.bottom {.accent}
text forgedl "“example.com\nis 66.9.9.6”" above sw gap 0.45 offset 0.24,0 pad 0.14 {.paper .accent .mono @spoof}

edge rt.left-0.52,resl.top-0.3 -- e.cx-0.45,gwl.bottom+0.28 via rt.left-0.52,gwl.bottom+0.28 {.dotted .muted}

step query
  emph bwire, trunk, rwire
step spoof
  hide bwire
  show forged, @spoof
  dim trunk, rwire
step redirect
  show @evil
  emph awb
:::

**Der Angreifer muss den Webserver nicht knacken, es genügt die Antwort auf die Frage nach ihm.** A wartet nicht ab, sondern legt B eine eigene DNS-Antwort vor – „example.com is 66.9.9.6“ –, und B baut die Verbindung brav zu diesem Rechner auf. In der Figur ersetzt der rote Pfeil B's Anschlussleitung, statt sich daneben zu legen: Es ist derselbe Draht, auf dem sonst die echte Antwort käme, und zwei Linien übereinander wären eine Zeichnung, die zwei Wege behauptet. Der echte Webserver bleibt erreichbar und ahnungslos, was den Angriff so unauffällig macht.

## figure: Forgery trivial for on-path attacker (on routers or endpoints) | prevent reply from reaching B and inject own reply {.full #ns-a13}

::: draw {unit=190x54}
# Dieselbe Topologie wie #ns-a08 und #ns-a12, dieselben Namen, dieselben Plätze.
box sw  "Switch &\nRouter" at 0,0 w 0.9 h 0.9 {.tone-1}
box b   "B" above sw gap 1.6  offset  0.24,0 w 0.2 h 0.7 {.tone-2}
box a   "A" above sw gap 0.55 offset -0.32,0 same as b {.accent}
edge awire a.bottom -- a.cx,sw.top {.muted}
edge bwire b.bottom -- b.cx,sw.top {.muted}

box rt  "Router" at 2.30,0 w 0.72 h 0.9 {.tone-1}
box res "" above rt gap 1.6 w 0.2 h 0.7 {.tone-1}
box web "" below rt gap 1.75 same as res {.tone-2}
align y middle b, res
edge trunk sw -- rt {.muted}
edge rwire res.bottom -- rt.top {.muted}
edge uplink rt.bottom -- web.top {.muted}
text brk "//" between rt,web pad 0.12 {.paper .muted}

box awb "" left of web gap 5.45 same as web {.accent}
box e   "" left of awb gap 2.35 same as web {.dim}
edge e -- awb {.muted}
edge awb -- web {.muted}

text bmac "eb:99:f1:f3:1f:f2\n10.1.1.5" above b gap 0.3 {.mono .muted}
text gwl  "default gateway\n10.1.1.1\n00:ac:c1:11:15:11" below sw gap 0.3 {.muted}
text resl "DNS Resolver\nof ISP" above res gap 0.28 {.muted}
text webl "Webserver\nexample.com\n80.5.5.3" below web gap 0.28 {.muted}
text awbl "Attacker's Webserver\n“example.com”\n66.9.9.6" below awb gap 0.28 {.muted}

edge forged b.cx,sw.top -> b.bottom {.accent}
text forgedl "“example.com\nis 66.9.9.6”" above sw gap 0.45 offset 0.24,0 pad 0.14 {.paper .accent .mono @spoof}

# „on-patch“ ist der Tippfehler der Originalfolie und bleibt wörtlich stehen.
# Auf der Folie ist die Frage ein umrandeter Kasten; hier ist sie eine
# Anmerkung mit Leitlinie auf A – ein Kasten in der Topologie sähe aus wie
# ein Gerät. Sie steht neben A, damit die Leitlinie waagerecht bleibt.
text ask "Can A also become\non-patch attacker?" left of a gap 1.75 -- a.left,a.cy {.accent @ask}

edge rt.left-0.52,resl.top-0.3 -- e.cx-0.45,gwl.bottom+0.28 via rt.left-0.52,gwl.bottom+0.28 {.dotted .muted}

step path
  emph rwire, trunk, bwire
step intercept
  style bwire {.dashed}
  dim rwire, trunk
step inject
  hide bwire
  show forged, @spoof
step question
  show @ask
:::

**Wer auf dem Pfad sitzt, muss nicht raten.** Ein Angreifer auf einem Router oder auf einem der Endpunkte sieht die Anfrage und alle ihre Zufallszahlen; er hält die echte Antwort zurück und schiebt seine eigene vor. Die Figur zeigt das in zwei Zügen: erst wird die Leitung, auf der die echte Antwort käme, gestrichelt, dann tritt der gefälschte Pfeil an ihre Stelle. Der Kasten links oben ist die Frage der Folie an den Hörsaal, und sie ist ernst gemeint: A liegt nicht auf dem Pfad zum Resolver, kann sich aber per ARP Cache Poisoning dorthin bringen.

## figure: Off-path attackers (E) must generate a valid reply | that reaches B before the reply sent by the real DNS resolver {.full #ns-a14}

::: draw {unit=190x54}
# Dieselbe Topologie wie #ns-a08, #ns-a12 und #ns-a13, dieselben Namen,
# dieselben Plätze. Neu ist nur, wer der Angreifer ist: A tritt zurück,
# der Kasten unten links im Internet bekommt einen Namen.
box sw  "Switch &\nRouter" at 0,0 w 0.9 h 0.9 {.tone-1}
box b   "B" above sw gap 1.6  offset  0.24,0 w 0.2 h 0.7 {.tone-2}
box a   "A" above sw gap 0.55 offset -0.32,0 same as b {.dim}
edge awire a.bottom -- a.cx,sw.top {.muted}
edge bwire b.bottom -- b.cx,sw.top {.muted}

box rt  "Router" at 2.30,0 w 0.72 h 0.9 {.tone-1}
box res "" above rt gap 1.6 w 0.2 h 0.7 {.tone-1}
box web "" below rt gap 1.75 same as res {.tone-2}
align y middle b, res
edge trunk sw -- rt {.muted}
edge rwire res.bottom -- rt.top {.muted}
edge uplink rt.bottom -- web.top {.muted}
text brk "//" between rt,web pad 0.12 {.paper .muted}

box awb "" left of web gap 5.45 same as web {.accent}
box e   "" left of awb gap 2.35 same as web {.dim}
edge e -- awb {.muted}
edge awb -- web {.muted}

text bmac "eb:99:f1:f3:1f:f2\n10.1.1.5" above b gap 0.3 {.mono .muted}
text gwl  "default gateway\n10.1.1.1\n00:ac:c1:11:15:11" below sw gap 0.3 {.muted}
text resl "DNS Resolver\nof ISP" above res gap 0.28 {.muted}
text webl "Webserver\nexample.com\n80.5.5.3" below web gap 0.28 {.muted}
text awbl "Attacker's Webserver\n“example.com”\n66.9.9.6" below awb gap 0.28 {.muted}

edge forged b.cx,sw.top -> b.bottom {.accent}
text forgedl "“example.com\nis 66.9.9.6”" above sw gap 0.45 offset 0.24,0 pad 0.14 {.paper .accent .mono @spoof}
edge poison res.cx,rt.top -> res.bottom {.accent}
text poisonl "“example.com\nis 66.9.9.6”" between rt,res pad 0.14 {.paper .accent .mono @cache}

edge rt.left-0.52,resl.top-0.3 -- e.cx-0.45,gwl.bottom+0.28 via rt.left-0.52,gwl.bottom+0.28 {.dotted .muted}

step offpath
  label e "E"
  style e {.accent .paper}
  emph e
step race
  hide bwire
  show forged, @spoof
  dim e
step cache
  hide rwire
  show poison, @cache
  emph poison
:::

**Von außen ist derselbe Angriff plötzlich ein Rennen.** E sieht die Anfrage nicht und muss deshalb drei Felder blind treffen: die Absender-IP der Antwort muss die des Resolvers sein, der UDP-Zielport auf B muss der Quellport der Anfrage sein, und die Transaction ID muss zur ID der Anfrage passen. Die IP lässt sich fälschen, Port und TXID nicht – je 2^16 Möglichkeiten, sofern der Client sie zufällig wählt, und genau das haben manche Clients nicht getan. Dazu muss die gefälschte Antwort vor der echten ankommen; deshalb ersetzt der rote Pfeil auch hier jeweils die Leitung, auf der die echte Antwort unterwegs wäre. Zielt E statt auf B auf den Resolver, landet der gefälschte Eintrag in dessen Cache und trifft alle seine Kunden – das ist DNS Cache Poisoning.

# Denial of service

## figure: Distributed Denial of Service (DDoS) attack | attacker instructs hosts infected with malware to flood a victim with traffic {.full #ns-a28}

::: draw {unit=100x76}
# Auf der Folie liegen die Bots auf einer Weltkarte. Die bleibt hier draußen:
# ein Rasterbild folgt keinem Theme und kostet über 100 kB. Verstreute Quellen
# ringsum sagen dasselbe – "verteilt" war das Argument, die Geografie nie.
# Alle Beschriftungen stehen wörtlich wie auf der Folie.
default box {.accent} w 0.44 h 0.3

box vic "Victim" at 0,0 w 1.05 h 0.62 {.tone-4 !accent}

box n1 "" at -2.6,-1.5 {@bots}
box n2 "" at -1.0,-2.2 {@bots}
box n3 "" at 1.1,-2.0 {@bots}
box n4 "" at 2.7,-1.1 {@bots}
box n5 "" at 2.9,0.9 {@bots}
box n6 "" at 1.0,2.1 {@bots}
box n7 "" at -1.2,2.0 {@bots}
box n8 "" at -2.8,0.8 {@bots}

# Acht Pfeile auf einen Kasten sind hier genau die Aussage, deshalb kein
# Wegpunkt und kein Umweg. Der Bruchteil hinter dem Anker verteilt die
# Spitzen über die Kanten, statt drei davon auf denselben Punkt zu legen.
edge f1 n1 -> vic.left:0.25 {.accent @flood}
edge f2 n2 -> vic.top:0.35 {.accent @flood}
edge f3 n3 -> vic.top:0.65 {.accent @flood}
edge f4 n4 -> vic.right:0.25 {.accent @flood}
edge f5 n5 -> vic.right:0.6 {.accent @flood}
edge f6 n6 -> vic.bottom:0.65 {.accent @flood}
edge f7 n7 -> vic.bottom:0.35 {.accent @flood}
edge f8 n8 -> vic.left:0.7 {.accent @flood}

text bn "*Botnet* of\ninfected hosts" above n4 gap 0.45 -- n4 {.small}

text note1 "Victim (and ISPs) cannot filter the DDoS\ntraffic as it resembles legitimate traffic." at -3.3,2.95 {.left .muted @conc}
text note2 "Bots send requests using their actual\nIP address, i.e., do not use IP Spoofing." at 0.35,2.95 {.left .muted @conc}

step botnet
  show @bots, bn
step flood
  show @flood
  emph vic
step unfilterable
  show @conc
  dim @flood
:::

**Das Opfer steht still, der Rest kommt von überall.** Die Karte der Vorlage ist durch einen Ring verstreuter Bots ersetzt – *verteilt* war die Aussage, der Kontinent nie. Der erste Takt stellt das Botnetz hin, der zweite lässt es feuern, der dritte zieht die Folgerung, die der Vortrag ohnehin sprechen muss. Weil die Bots ihre echten Adressen benutzen, sieht der Verkehr aus wie Verkehr.

## figure: DoS attacks are also possible without access to a botnet | Attackers can use connectionless protocols and spoof their Src IP to hide their identity {.full #ns-a29}

::: draw {unit=96x74}
# Wieder ohne Weltkarte, aus denselben Gründen wie eine Folie zuvor. Die
# gestrichelten Kästen mit dem Fragezeichen sind die "faked sources": Was an
# ihnen unecht ist, ist der Umriss. Texte wörtlich von der Folie, nur die
# Zeilenumbrüche des Kastens rechts sind neu gesetzt – die Vorlage trennt dort
# "proto-cols" mitten im Wort, weil ihr Rahmen zu Ende war.
default box {.accent} w 0.44 h 0.34

box vic "Victim" at 0,0 w 1.05 h 0.62 {.tone-4 !accent}

box q1 "?" at -2.6,-1.5 {.dashed @fake}
box q2 "?" at -1.0,-2.2 {.dashed @fake}
box q3 "?" at 1.1,-2.0 {.dashed @fake}
box q4 "?" at 2.7,-1.1 {.dashed @fake}
box q5 "?" at 2.9,0.9 {.dashed @fake}
box q6 "?" at 1.0,2.1 {.dashed @fake}
box q7 "?" at -1.2,2.0 {.dashed @fake}
box q8 "?" at -2.9,0.75 {.dashed @fake}

edge q1 -> vic.left:0.25 {.accent @spoofed}
edge q2 -> vic.top:0.35 {.accent @spoofed}
edge q3 -> vic.top:0.65 {.accent @spoofed}
edge q4 -> vic.right:0.25 {.accent @spoofed}
edge q5 -> vic.right:0.6 {.accent @spoofed}
edge q6 -> vic.bottom:0.65 {.accent @spoofed}
edge q7 -> vic.bottom:0.35 {.accent @spoofed}
edge q8 -> vic.left:0.7 {.accent @spoofed}

text fs "Faked sources" right of q5 gap 0.6 -- q5 {@fake}

box atk "Attacker" at -4.3,2.6 w 0.95 h 0.55 {@real}
edge real-traffic atk -> vic.bl {.accent .thick @real}
# Die Beschriftung sitzt auf der Linie, nicht daneben, und .paper stanzt sie
# dafür aus – sonst lesen sich Linie und Wort als ein Muster.
text tr "Traffic of the DoS attack" between atk,vic pad 0.14 {.paper .accent @real}
text loc "Attacker’s real location\nis unknown (IP spoofing)." below atk gap 0.4 {.muted @real}

box why "Faking Src IP possible for\nconnectionless protocols,\ne.g., ICMP (“ping”) or\nprotocols using UDP (DNS, NTP)" at 5.05,-1.7 w 2.8 h 1.2 {.clear @fake}

text note1 "Victim (and ISPs) cannot filter the DoS\ntraffic if it resembles legitimate traffic." at -4.6,4.3 {.left .muted @conc}
text note2 "To mitigate IP Spoofing many (all) ISPs would\nhave to perform *Ingress/Egress Filtering*.\nDifficult due to negative externality." at -0.4,4.2 {.left .muted @conc}
text bcp "cf. BCP 38: Ingress Filtering" at 5.1,5.3 {.small .muted @conc}

step attacker
  show @real
step spoofed
  show @fake, @spoofed
  emph vic
step mitigation
  show @conc
  dim @spoofed
:::

**Ohne Botnetz, dafür mit gefälschter Absenderadresse.** Der Angreifer sitzt einmal im Bild, sein Verkehr trägt aber acht fremde Quellen – das ist der ganze Trick, und die gestrichelten Umrisse sagen, dass an diesen Quellen nichts echt ist. Der letzte Takt nimmt die Pfeile zurück und stellt die Gegenmaßnahme daneben. Sie ist seit BCP 38 bekannt und wird trotzdem nicht flächendeckend umgesetzt, weil sie dem filternden Provider selbst nichts einbringt.

## figure: Amplification attack | some connectionless protocols allow attackers to use IP Spoofing to reflect and multiply their attack traffic {.full #ns-a30}

::: side

```
$ dig any ripe.net      # ask for all resource records
...
$ sudo tcpdump port 53

IP 10.113.99.103.61584 > 141.13.240.2.53: 47020+ [1au]
ANY? ripe.net. (37)

IP 141.13.240.2.53 > 10.113.99.103.61584: 47020 23/0/11
A 193.0.6.139, NS manus.authdns.ripe.net., […], MX
mahimahi.ripe.net. 200, TXT "Sendinblue-code:d854a…",
TXT "google-site-verification=Mjh2VR…-Y1FNrqGWayXAg",
… AAAA 2001:67c:2e8:22::c100:68b, … (1194)
```

Example: Spamhouse  (75 Gbps)
<https://blog.cloudflare.com/the-ddos-that-knocked-spamhaus-offline-and-ho/>

::: flip
::: draw {unit=130x62}
# "Spamhouse" steht so auf der Folie (die Firma heißt Spamhaus) und bleibt so
# stehen; der Beleg dazu ist der Mitschnitt nebenan, nicht dieses Bild.
# Die beiden Dreiecke sind der Größenvergleich: die Fläche ist die Menge, die
# Spitze zeigt, wo sie ankommt. 37 Bytes hin, 1194 zurück.
text intro "For some protocols (e.g., DNS or\nNTP) the response can become\nmuch larger than the request." at -2.3,-1.35 {.left}
text amp "*Amplification factor:* ratio of\nresponse and request size." below intro gap 0.45 flush left {.left}

text atk "Attacker" at 0.4,-1.5 {.accent}
box  req "" below atk gap 0.3 w 0.34 h 0.3 {.wedge .tone-3 @small}
text srv "Server" below req gap 0.3 {@small}
box  res "" below srv gap 0.3 w 0.66 h 0.58 {.wedge .tone-3 @big}
text victim "Victim" below res gap 0.3 {@big}

text lreq "Small request with\nSrc IP of victim" left of req gap 1.05 {.right @small}
text lres "Large response with\nDst IP of victim" left of res gap 0.95 {.right @big}

text open "Attack possible due to liberally\noperated DNS/NTP servers." at -2.3,1.95 {.left .muted @open}

step request
  show @small
step response
  show @big
  emph res
step blame
  show @open
:::
:::

**Der Angreifer schickt wenig und lässt viel zurückkommen.** Die kleine Spitze geht mit der Absenderadresse des Opfers an einen offenen Resolver, die große kommt beim Opfer heraus; das Verhältnis der beiden Flächen ist der Verstärkungsfaktor. Der Mitschnitt nebenan liefert die Zahlen dazu. Möglich ist das nur, weil die befragten Server jedem antworten, der fragt.

## figure: Next up is a DoS attack that exploits a design flaw | For that let’s review the TCP connection handshake {.full #ns-a31}

::: side

```python
# Simple echo server in Python, taken from
# https://docs.python.org/3/library/socket.html

import socket
HOST = ''          # all available interfaces
PORT = 50007       # arbitrary non-privileged port
with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
    s.bind((HOST, PORT))
    s.listen(5)  # backlog: 5 connections
    conn, addr = s.accept()
    with conn:
        print('Connected by', add)
        while True:
            data = conn.recv(1024)
            if not data: break
            conn.sendall(data)
```

::: flip
::: draw {unit=112x58}
# Der Tippfehler der Vorlage bleibt stehen: im Code links heißt es
# print('Connected by', add) statt addr.
# Die Blockpfeile der Folie sind .chevron (Spitze rechts, Client -> Server)
# und .chevron point left (Server -> Client); die kursiven Variablen schreibt man
# als *c* und *s*, der Compiler setzt sie in den Akzent.
default box {.tone-3} w 2.35 h 0.5

text cl "Client" at -1.175,-0.75 {.left}
text sv "Server" at 1.175,-0.75 {.right}

box syn  "SYN seq=*c*"               at 0,0 {.chevron}
box sa   "SYN+ACK seq=*s* ack=*c*+1" below syn gap 0.22 point left {.chevron @two}
box ack  "ACK seq=*c*+1 ack=*s*+1"   below sa gap 0.22 {.chevron @three}
box data "DATA"                      below ack gap 0.62 {.chevron .tone-4 @data}

text state "Server stores *state* (e.g., seq,\nIPs, ports) in memory to match\nclient’s ACK previous packets." below data gap 0.62 {@why}

step reply
  show @two
step established
  show @three
step data
  show @data
  emph data
step state
  show @why
  dim data
:::
:::

**Drei Nachrichten, und schon nach der ersten merkt sich der Server etwas.** Die Blockpfeile stehen in der Leserichtung ihres Verkehrs: zwei zeigen nach rechts, der mittlere nach links. Der Code links ist der Beleg dafür, dass ein gewöhnlicher Server dafür nichts tun muss – `s.listen(5)` legt die Warteschlange an, `accept()` bekommt erst die fertige Verbindung. Genau dieser gemerkte Zustand ist die Angriffsfläche.

## figure: One technique to defend against SYN flooding is to enable SYN Cookies | so that server does not have to store the state {.full #ns-a33}

::: draw {unit=126x62}
# Die Folie hebt seq=e und ack=e+1 gelb hervor. Freie Farben gibt es hier
# nicht, und sie werden auch nicht gebraucht: *e* setzt die Variable in den
# Akzent, und der Takt "cookie" hebt die beiden Blockpfeile hervor, in denen
# sie steht.
text st "*State:* Src IP/port, Dst IP/port,\nmax segment size (MSS)" at 0,0 {.left}

text obs "Observation:" below st gap 0.7 flush left {.left @obs}

box sa  "SYN+ACK seq=*e*  ack=*c*+1" below obs gap 0.35 flush left w 2.35 h 0.5 point left {.chevron .tone-3 @obs}
box ack "ACK seq=*c*+1 ack=*e*+1"    below sa gap 0.28 flush left same as sa {.chevron .tone-3 @obs}

text q "How to encode state in\nseq/ack (len: 32 bits)." below ack gap 0.7 flush left {.left @ask}

step observation
  show @obs
step cookie
  emph sa, ack
step encode
  show @ask
:::

**Der Zustand muss irgendwo stehen – warum nicht im Paket selbst.** Der Server antwortet mit einer Sequenznummer *e*, die er sich ausgerechnet hat, und bekommt sie im ACK des Clients als *e*+1 zurück. Damit trägt der Client den Zustand für ihn, solange er in 32 Bit passt. Ein SYN, dem kein ACK folgt, kostet den Server dann nichts mehr.

# TLS, certificates, and what a browser trusts

## figure: TLS 1.3 performs a handshake to start a secure network connection | and to negotiate cryptographic keys between the client and the server {.full #ns-a41}

::: draw {unit=120x46}
default box {.tone-3} w 2.3

text cl "Client" at 0,0 {.large .muted}
text c1 "Generate DH key pair (c, C)" right of cl gap 1.3 {.left}
box  ch "ClientHello\n– Supported ciphersuites\n– Public key C" below c1 gap 0.5 flush left {@hello}

box  a1 "" right of ch gap 1.05 flush top w 0.8 h 0.42 {.chevron @hello}
text s1 "Generate DH key pair (s, S)\nCompute secret = DH(s, C)\nDerive keys = KDF(secret)" right of a1 gap 1.05 flush top {.left @hello}
text sv "Server" above s1 gap 0.5 {.large .muted}
align y middle cl, sv

box sh   "ServerHello\n– Selected ciphersuite\n– Public key S"      below s1 gap 0.5 flush left {@srv}
box cert "Certificate(s)"                                           below sh gap 0 flush left {@srv}
box sig  "Signature over ClientHello,\nServerHello, and Certificate" below cert gap 0 flush left {@srv}
box mac  "MAC over ClientHello,\nServerHello, Certificate,\nand Signature" below sig gap 0 flush left {@srv}

box  a2 "" left of cert gap 1.05 flush top w 0.8 h 0.42 point left {.chevron @srv}
text vf "Verify certificate\nVerify signature\nCompute secret = DH(c, S)\nDerive keys = KDF(secret)\nVerify MAC" left of a2 gap 1.05 flush top {.left @done}

step hello
  show @hello
step flight
  show @srv
step verify
  show @done
  emph vf
:::

**Ein Handshake, zwei Flüge.** Der Client eröffnet mit `ClientHello` und legt seinen halben Diffie-Hellman-Schlüssel gleich bei. Der Server antwortet in einem einzigen Flug: Parameterwahl, Zertifikatskette, Signatur und MAC. Danach kennen beide Seiten dasselbe Geheimnis, ohne dass es je über die Leitung gegangen wäre – geprüft wird es erst im letzten Schritt, bevor Nutzdaten fließen.

## figure: Certificate chains {.full #ns-a43}

::: draw {unit=124x50}
default box {.tone-3} w 1.55

box  os "Browser/OS" at 0,0 {.tone-1}
text st "Store with trusted\ncertificates" right of os gap 0.85 {.left .muted}

box  r0 "Certificate\nof a Root CA"            below os gap 0.5 flush left offset 0.55,0
box  r1 "Certificate of an\nintermediate CA"   below r0 gap 0.5 flush left offset 0.55,0
box  r2 "Cert. of another\nintermediate CA"    below r1 gap 0.5 flush left offset 0.55,0
box  r3 "Certificate\nof server"               below r2 gap 0.5 flush left offset 0.55,0 {.tone-4}

# Die Treppe: senkrecht aus der Unterkante heraus, in der Gasse links vom
# nächsten Kasten nach unten, dann waagerecht auf dessen linke Kante. Der
# Startpunkt ist eine Koordinate statt eines Ankers, damit Abstieg und
# Wegpunkt dasselbe x tragen und die Senkrechte senkrecht ist.
edge os.left+0.35,os.bottom -> r0.left via os.left+0.35,r0.cy
edge r0.left+0.35,r0.bottom -> r1.left via r0.left+0.35,r1.cy
edge r1.left+0.35,r1.bottom -> r2.left via r1.left+0.35,r2.cy
edge r2.left+0.35,r2.bottom -> r3.left via r2.left+0.35,r3.cy

text n0 "Has"   at os.left+0.2,r0.cy {.right}
text n1 "Signs" at r0.left+0.2,r1.cy {.right}
text n2 "Signs" at r1.left+0.2,r2.cy {.right}
text n3 "Signs" at r2.left+0.2,r3.cy {.right}

box  d0 "DigiCert High Assurance EV Root CA"     at 5.7,2.30 w 2.6 h 0.42 {@real}
box  d1 "DigiCert SHA2 High Assurance Server CA" below d0 gap 0.5 flush left offset 0.3,0 same as d0 {@real}
box  d2 "github.com"                             below d1 gap 0.5 flush left offset 0.3,0 same as d0 {.tone-4 @real}
edge d0.left+0.2,d0.bottom -> d1.left via d0.left+0.2,d1.cy {.muted @real}
edge d1.left+0.2,d1.bottom -> d2.left via d1.left+0.2,d2.cy {.muted @real}

step anchor
  show r0
step chain
  show r1, r2, r3
step real
  show @real
  emph d2
:::

**Vertrauen hat einen Anfang, und der liegt auf dem eigenen Rechner.** Browser und Betriebssystem bringen einen Speicher mit Wurzelzertifikaten mit; alles Weitere hängt über Signaturen daran. Jedes Glied der Kette signiert das nächste, bis unten das Zertifikat des Servers steht. Rechts dieselbe Kette, wie ein Zertifikatsbetrachter sie für `github.com` auflistet – Zwischenstufen sind die Regel, nicht die Ausnahme: hier ist es eine, im Schema links sind es zwei.

## figure: Certificates are stored in a X.509 (v3) data structure. {.standard #ns-a45}

::: draw {unit=150x40}
default box {.tone-3} w 2.6 pad 0.3

box f1 "X.509 version\nSerial number\nSignature algorithm\nValid from/until\nIssuer Name\n*Subject Name*\n*Public Key*" at 0,0
box f2 "Issuer ID\nSubject ID"  below f1 gap 0 flush left {@v2}
box f3 "*Optional Extensions*"  below f2 gap 0 flush left {@v3}
box f4 "Digital Signature"      below f3 gap 0 flush left {.tone-4 .bold @sig}

step identifiers
  show @v2
step extensions
  show @v3
step signature
  show @sig
  emph f4
:::

**Ein Zertifikat ist eine Datenstruktur, kein Text.** Der obere Block trägt, was jede Version kennt – Version, Seriennummer, Signaturverfahren, Gültigkeit, Aussteller –, und darin die beiden Felder, um die es eigentlich geht: der Name des Inhabers und sein öffentlicher Schlüssel. Darunter kamen mit v2 die Identifier und mit v3 die Erweiterungen hinzu. Ganz unten liegt die Signatur des Ausstellers über allem Vorhergehenden; sie ist der Grund, warum niemand eine Zeile darüber ändern kann.

## figure: Extensions of a server certificate | github.com, as a certificate viewer lists them {.standard #ns-a49}

::: draw {unit=150x30}
default text {.small}

text l1 "Extension\nCritical\nUsage" at 0,0 {.right .muted}
text v1 "Key Usage ( 2.5.29.15 )\nYES\nDigital Signature, Key Encipherment" right of l1 gap 1.5 flush top {.left}

text l2 "Extension\nCritical" below l1 gap 0.4 flush right {.right .muted}
text v2 "Basic Constraints ( 2.5.29.19 )\nYES" right of l2 gap 1.5 flush top {.left}
text l2b "Certificate Authority" below l2 gap 0 flush right {.right .muted}
text v2b "NO" right of l2b gap 1.5 flush top {.left}

text l3 "Extension\nCritical\nPurpose #1\nPurpose #2" below l2b gap 0.4 flush right {.right .muted}
text v3 "Extended Key Usage ( 2.5.29.37 )\nNO\nServer Authentication ( 1.3.6.1.5.5.7.3.1 )\nClient Authentication ( 1.3.6.1.5.5.7.3.2 )" right of l3 gap 1.5 flush top {.left}

# Die vierte, leere Zeile ist Absicht: der Wert daneben ist vierzeilig, und
# ohne sie misst die nächste Gruppe ihren Abstand von einer Beschriftung,
# die drei Zeilen höher endet – der Gruppenabstand verschwände.
text l4 "Extension\nCritical\nKey ID\n " below l3 gap 0.4 flush right {.right .muted}
text v4 "Subject Key Identifier ( 2.5.29.14 )\nNO\n63 02 D2 5D 02 5F F7 8D D5 5A 12 9E 76 11 36 96\n86 2C 8A 48" right of l4 gap 1.5 flush top {.left}

text l5 "Extension\nCritical\nKey ID\n " below l4 gap 0.4 flush right {.right .muted}
text v5 "Authority Key Identifier ( 2.5.29.35 )\nNO\n51 68 FF 90 AF 02 07 75 3C CC D9 65 64 62 A2\n12 B8 59 72 3B" right of l5 gap 1.5 flush top {.left}

text l6 "Extension\nCritical" below l5 gap 0.4 flush right {.right .muted}
text v6 "Subject Alternative Name ( 2.5.29.17 )\nNO" right of l6 gap 1.5 flush top {.left}
text l6b "DNS Name\nDNS Name" below l6 gap 0 flush right {.right .muted}
text v6b "github.com\nwww.github.com" right of l6b gap 1.5 flush top {.left}

text l7 "Extension\nCritical" below l6b gap 0.4 flush right {.right .muted}
text v7 "Certificate Policies ( 2.5.29.32 )\nNO" right of l7 gap 1.5 flush top {.left}

box ca  "no signing of other keys!" right of v2b gap 5.5 flush top h 0.85 point left {.chevron .tone-4 @ca}
box dom "domain(s)"                 right of v6b gap 5.5 flush top h 0.85 point left {.chevron .tone-4 @dom}

step no-ca
  show @ca
  emph l2b, v2b
step domains
  dim l2b, v2b
  show @dom
  emph l6b, v6b
:::

**Die Erweiterungen sagen, wozu der Schlüssel taugt.** `Basic Constraints` mit `Certificate Authority: NO` verbietet diesem Zertifikat, weitere Zertifikate zu signieren – stünde dort `YES`, könnte der Betreiber von `github.com` für jede Domain der Welt ausstellen. Der `Subject Alternative Name` führt die Namen auf, für die das Zertifikat gilt. Und `Critical` ist keine Zierde: Ein Client, der eine als kritisch markierte Erweiterung nicht versteht, muss das Zertifikat ablehnen.

## figure: Upgrading HTTP to HTTPS {.full #ns-a60}

::: draw {unit=110x110}
box  br "Browser" at 0,0 w 1.1 {.tone-2}
box  sv "Server"  at 4.0,0 same as br {.tone-2}

box  q1 "HTTP"  at 1.05,0.62 w 0.68 h 0.3 {.tone-3 @plain}
edge q1 -> sv.left-0.1,q1.cy {@plain}
box  a1 "HTTP"  at 3.00,1.02 same as q1 {.tone-3 @plain}
edge a1 -> br.right+0.1,a1.cy {@plain}

box  q2 "HTTPS" at 1.10,1.72 w 0.80 h 0.3 {.tone-4 @tls}
edge q2 -> sv.left-0.1,q2.cy {@tls}
box  a2 "HTTPS" at 2.95,2.12 same as q2 {.tone-4 @tls}
edge a2 -> br.right+0.1,a2.cy {@tls}

step plain
  show @plain
step upgrade
  show @tls
step secure
  emph q2, a2
:::

```html
<html> [...]
<body> [...]
<a href="https://www.shop.de/login">
Zum Login-Formular</a> [...]
</body></html>
```

or

```http
> GET / HTTP/1.1
> Host: www.bank.de

< HTTP/1.1 301 Moved Permanently
< Location: https://www.bank.de/
```

**Der Wechsel auf HTTPS ist eine Bitte, keine Garantie.** Beide Wege beginnen im Klartext: Entweder liefert der Server eine Seite aus, deren Links schon `https://` tragen, oder er beantwortet die HTTP-Anfrage mit einer Weiterleitung. In beiden Fällen ist die erste Runde ungeschützt. Genau dort, in der Antwort, die niemand prüft, setzt der Angriff an.

## figure: Operation of sslstrip {.full #ns-a62}

::: draw {unit=90x90}
box  br "Browser"  at 0,0   w 1.3 {.tone-2}
box  sv "Server"   at 5.4,0 same as br {.tone-2}
text ss "sslstrip" at 2.7,0 {.turn .accent @mitm}
# Die beiden Schrägstriche sind der Schnitt in der Leitung. Sie laufen rund
# 7 Grad aus der Senkrechten und damit weit außerhalb der Schiefe-Warnung.
edge 2.40,-1.0 -- 2.15,1.0 {.muted @mitm}
edge 3.25,-1.0 -- 3.00,1.0 {.muted @mitm}

box  q1 "HTTP"  at 1.05,-0.72 w 0.75 h 0.3 {.accent @plain}
edge q1 -> 2.20,q1.cy {.accent @plain}
box  r1 "HTTP"  at 1.85,-0.30 same as q1 {.accent @plain}
edge r1 -> br.right+0.1,r1.cy {.accent @plain}

box  q2 "HTTPS" at 3.85,0.30 w 0.88 h 0.3 {.tone-4 @tls}
edge q2 -> sv.left-0.1,q2.cy {@tls}
box  r2 "HTTPS" at 4.30,0.72 same as q2 {.tone-4 @tls}
edge r2 -> 3.20,r2.cy {@tls}

step intercept
  show @mitm
step downgrade
  show @plain
  emph q1, r1
step relay
  dim q1, r1
  show @tls
:::

```html
<html> [...]
<body> [...]
<a href="http://www.shop.de/login">
Go to secure Login Form</a>[...]
</body></html>
```

replace with

```html
<html> [...]
<body> [...]
<a href="https://www.shop.de/login">
Go to secure Login Form</a>[...]
</body></html>
```

**sslstrip nimmt dem Opfer die Verschlüsselung ab, ohne sie zu brechen.** Der Angreifer steht im Pfad, spricht zum Server ganz regulär HTTPS und reicht die Antwort an den Browser im Klartext weiter. Dabei schreibt er jedes `https://` in den ausgelieferten Seiten auf `http://` um, sodass der Browser nie einen Anlass hat, umzuschalten. Der Server sieht eine tadellose TLS-Verbindung, der Nutzer sieht eine Seite ohne Schloss – und genau darauf achtet fast niemand.

# Firewalls and tunnels

## figure: Firewalls enforce rules that limit who is allowed to talk to whom. {.full #ns-b04}

::: draw {unit=132x78}
# Alle Beschriftungen wörtlich von der Folie – auch "publically reachable",
# das im Original genau so geschrieben steht und hier so bleibt. Der
# Zeilenumbruch in "demilitarized zone (DMZ)" ist im Original nur ein
# Umbruch (dort mit Trennstrich), kein anderer Wortlaut.
#
# Drei Formen, die die Sprache nicht hat, und ihr Ersatz – auf allen drei
# Folien derselbe: der Zylinder (web/database/file server) ist eine
# .round-Box im Speicherton, die Wolke ist eine .round-Box "Internet",
# die Monitorsymbole sind beschriftete Kästen unter der Gruppen-
# beschriftung "desktops".
default text {.muted}

box net "Internet" at 0,0 w 0.8 {.round .dim}
box fw1 "FIREWALL" at 1.35,0 w 0.3 h 1.6 {.turn .tone-1}
box fw2 "FIREWALL" at 3.35,0 w 0.3 h 1.6 {.turn .tone-1}
box sw  "SWITCH"   at 4.85,0 w 0.95 {.tone-1}

box web "web\nserver"      at 2.35,1.95 w 0.82 {.round .tone-3}
box db  "database\nserver" at 4.25,1.95 w 0.92 {.round .tone-3}
box fs  "file\nserver"     at 5.45,1.95 w 0.82 {.round .tone-3}

box  d1 "desktop"  at 4.25,-1.95 w 0.82 {.tone-2}
box  d2 "desktop"  at 5.45,-1.95 same as d1 {.tone-2}
text dl "desktops" between d1,d2 offset 0,-0.6

# Der Bus: jede Kante läuft senkrecht aus dem Kasten, waagerecht im Kanal
# und senkrecht in den Switch – keine Schräge, und dass die letzten Stücke
# aufeinanderliegen, ist genau das T der Vorlage.
edge net -- fw1
edge fw1 -- fw2
edge fw2 -- sw
edge web.top -- web.cx,0
edge d1.bottom -- sw.top via d1.cx,-1.0 sw.cx,-1.0
edge d2.bottom -- sw.top via d2.cx,-1.0 sw.cx,-1.0
edge db.top -- sw.bottom via db.cx,1.0 sw.cx,1.0
edge fs.top -- sw.bottom via fs.cx,1.0 sw.cx,1.0

text pub "publically\nreachable"     at 1.66,-2.15 {.left @zone}
text dmz "demilitarized\nzone (DMZ)" at 1.66,-1.35 {.left @zone}
text tru "trusted hosts"             at 4.85,2.75 {@zone}

container perim "" over fw1,fw2,sw,web,db,fs,d1,d2,dl,pub,dmz,tru {.muted}

# Die gestrichelte Zonentrennung ist eine kopflose Kante zwischen zwei
# Koordinaten. Sie läuft durch fw2 – Kästen werden nach den Kanten
# gezeichnet und decken sie dort ab, genau wie in der Vorlage.
edge zsep fw2.cx,perim.top -- fw2.cx,perim.bottom {.dashed .muted @zone}

step zones
  show @zone
step exposed
  style web {.tone-4}
  emph web, fw1
step trusted
  dim web, fw1
  emph fw2
:::

**Zwei Filter in einer Leitung, und dazwischen ein Streifen, der von außen erreichbar sein darf.** Die äußere Firewall trennt das Internet von der demilitarisierten Zone, die innere trennt die DMZ von den vertrauenswürdigen Hosts. Was von außen angesprochen werden muss – hier der Webserver –, steht deshalb zwischen den beiden und nicht hinter beiden. Fällt er, hat der Angreifer immer noch die zweite Firewall vor sich und nicht Datenbank und Fileserver.

## figure: Not only used to secure the perimeter, also for network segmentation. | cf. lateral movement, ransomware {.full #ns-b05}

::: draw {unit=132x78}
# Dieselbe Zeichnung wie auf der vorigen Folie: dieselben Namen, dieselben
# Koordinaten, dieselben Ersatzformen. Neu sind allein die beiden inneren
# Firewalls und die Zonenbeschriftung "segmented net" – so liest die Folge
# als eine Zeichnung, die sich entwickelt.
default text {.muted}

box net "Internet" at 0,0 w 0.8 {.round .dim}
box fw1 "FIREWALL" at 1.35,0 w 0.3 h 1.6 {.turn .tone-1}
box fw2 "FIREWALL" at 3.35,0 w 0.3 h 1.6 {.turn .tone-1}
box sw  "SWITCH"   at 4.85,0 w 0.95 {.tone-1}

box web "web\nserver"      at 2.35,1.95 w 0.82 {.round .tone-3}
box db  "database\nserver" at 4.25,1.95 w 0.92 {.round .tone-3}
box fs  "file\nserver"     at 5.45,1.95 w 0.82 {.round .tone-3}

box  d1 "desktop"  at 4.25,-1.95 w 0.82 {.tone-2}
box  d2 "desktop"  at 5.45,-1.95 same as d1 {.tone-2}
text dl "desktops" between d1,d2 offset 0,-0.6

# Die beiden inneren Firewalls sitzen auf den Stichleitungen zum Switch,
# nicht am Rand: das ist der ganze Unterschied zur vorigen Folie.
box fwd "FW" at 4.85,-0.62 w 0.24 h 0.46 {.turn .tone-1 @seg}
box fws "FW" at 4.85,0.62  w 0.24 h 0.46 {.turn .tone-1 @seg}

edge net -- fw1
edge fw1 -- fw2
edge fw2 -- sw
edge web.top -- web.cx,0
edge d1.bottom -- sw.top via d1.cx,-1.0 sw.cx,-1.0
edge d2.bottom -- sw.top via d2.cx,-1.0 sw.cx,-1.0
edge db.top -- sw.bottom via db.cx,1.0 sw.cx,1.0
edge fs.top -- sw.bottom via fs.cx,1.0 sw.cx,1.0

text seg "segmented net" at 4.85,2.75 {@net}

container perim "" over fw1,fw2,sw,web,db,fs,d1,d2,dl,seg {.muted}

edge zsep fw2.cx,perim.top -- fw2.cx,perim.bottom {.dashed .muted}

step perimeter
  emph fw1, fw2
step segments
  show @seg
  dim fw1, fw2
  style fwd, fws {.tone-4}
  emph fwd, fws
step contained
  show @net
  dim fwd, fws
:::

**Dieselbe Zeichnung, zwei Filter mehr – und die stehen nicht mehr am Rand.** Eine Firewall am Perimeter hilft nur gegen den, der noch draußen ist. Wer erst einmal auf einem Desktop sitzt, bewegt sich sonst ungebremst zu Datenbank- und Fileserver weiter, und genau davon lebt Ransomware. Die Segmentierung zieht die Filter ins Netz hinein, sodass jeder Sprung zwischen Segmenten wieder an einer Regel vorbei muss.

## figure: Firewalls are also run on hosts to limit chatty applications' network access. {.full #ns-b06}

::: draw {unit=132x78}
# Wieder dieselbe Zeichnung, dieselben Namen, dieselben Koordinaten. Neu
# ist die FIREWALL auf dem Host – im Original steht sie waagerecht neben
# der Beschriftung "desktops", deshalb steht sie hier an derselben Stelle
# und "desktops" rückt um eine Kastenbreite nach rechts.
#
# Der Little-Snitch-Dialog ist kein Screenshot, sondern nachgebaut: ein
# Rahmen mit den Textzeilen der Vorlage und zwei Knöpfen. Alle Zeilen
# wörtlich; die gewählte Option ist fett statt durch einen Radioknopf
# markiert, und die beiden Symbolknöpfe der Vorlage tragen nichts zum
# Argument bei und fehlen deshalb.
default text {.muted}

box net "Internet" at 0,0 w 0.8 {.round .dim}
box fw1 "FIREWALL" at 1.35,0 w 0.3 h 1.6 {.turn .tone-1}
box fw2 "FIREWALL" at 3.35,0 w 0.3 h 1.6 {.turn .tone-1}
box sw  "SWITCH"   at 4.85,0 w 0.95 {.tone-1}

box web "web\nserver"      at 2.35,1.95 w 0.82 {.round .tone-3}
box db  "database\nserver" at 4.25,1.95 w 0.92 {.round .tone-3}
box fs  "file\nserver"     at 5.45,1.95 w 0.82 {.round .tone-3}

box  d1 "desktop"  at 4.25,-1.95 w 0.82 {.tone-2}
box  d2 "desktop"  at 5.45,-1.95 same as d1 {.tone-2}
box  hfw "FIREWALL" at 4.25,-2.62 w 1.02 {.tone-1 @host}
text dl  "desktops" at 5.6,-2.62

edge net -- fw1
edge fw1 -- fw2
edge fw2 -- sw
edge web.top -- web.cx,0
edge d1.bottom -- sw.top via d1.cx,-1.0 sw.cx,-1.0
edge d2.bottom -- sw.top via d2.cx,-1.0 sw.cx,-1.0
edge db.top -- sw.bottom via db.cx,1.0 sw.cx,1.0
edge fs.top -- sw.bottom via fs.cx,1.0 sw.cx,1.0

container perim "" over fw1,fw2,sw,web,db,fs,d1,d2,dl,hfw {.muted}

edge zsep fw2.cx,perim.top -- fw2.cx,perim.bottom {.dashed .muted}

text mail "Mail" at 2.17,3.7 {.left .large @ask}
text want "wants to connect to mail.gmail.com" below mail gap 0.26 flush left {.left @ask}
box  once "Once" below want gap 0.32 flush left w 0.6 {@ask}
text anyc "Any connection"        below once gap 0.32 flush left {.left @ask}
text only "Only domain gmail.com" below anyc gap 0.24 flush left {.left .bold @ask}
box  allow "Allow" below only gap 0.4 w 0.62 {@ask}
box  deny  "Deny…" left of allow gap 0.35 same as allow {@ask}
align x right want, allow
container dlg "" over mail,want,once,anyc,only,deny,allow {.round .muted @ask}

# Der Dialog steht von Anfang an da und wird nicht eingeblendet: die
# Live-Ansicht reserviert im viewBox Platz für jedes Element, das später
# auftaucht, und ein erst im dritten Beat gezeigter Dialog dieser Größe
# hätte die Zeichnung zwei Beats lang in die obere Hälfte eines doppelt
# so hohen Rahmens gedrückt.
step host
  show @host
  style hfw {.tone-4}
  emph hfw
step application
  dim hfw
  emph mail, want
step decide
  dim mail, want
  style deny {.tone-4}
  emph deny
:::

**Eine Firewall muss nicht im Netz stehen, sie kann auf dem Rechner selbst laufen.** Dort weiß sie etwas, das kein Gerät im Netz wissen kann: welches Programm die Verbindung aufbauen will. Little Snitch fragt deshalb nicht nach Adresse und Port, sondern nach der Anwendung – und lässt die Antwort auf eine einzelne Domain einschränken. Der Preis ist, dass jemand entscheiden muss, und zwar mitten in der Arbeit.

## figure: Tunneling TCP Connections via SSH {.full #ns-b18}

::: side
```text
ssh –L8888:127.0.0.1:80 92.1.1.5
 ▶ http://localhost:8888/
ssh –D1080 91.1.1.5 # SOCKS proxy

ssh –L2222:44.11.1.4:22 92.1.1.5
```
::: flip
::: draw {unit=138x74}
# Die Kommandozeilen der Folie stehen als gewöhnlicher Codeblock daneben,
# nicht im Diagramm. Und sie stehen wörtlich da: die zweite Zeile nennt
# 91.1.1.5, die anderen 92.1.1.5. Das ist auf der Folie so, und der
# Unterschied bleibt erhalten.
default box {.tone-2}

box  wb  "web\nbrowser" at 0,0 w 0.8
box  sc  "ssh\nclient"  below wb gap 0.7 w 0.8 {@tunnel}
text lpf "local port fwd" below sc gap 0.3 {.muted}
container lh "" over wb,sc,lpf {.dashed .muted}

box  ss  "ssh\nserver"  right of sc gap 3.55 same as sc {.tone-3 @tunnel}
box  ws  "web\nserver"  above ss gap 0.7 same as wb {.tone-3}
text ip  "92.1.1.5"     below ss gap 0.3 {.muted}
container rh "" over ws,ss,ip {.dashed .muted}

box  ss2 "ssh\nserver" below ip gap 0.85 same as sc {.tone-3 @second}
text ip2 "44.11.1.4"   left of ss2 gap 0.35 {.muted @second}

# Der Browser spricht den lokal geöffneten Port an, der Tunnel trägt die
# Verbindung durch, und am anderen Ende geht sie an den Webserver oder an
# einen dritten Rechner weiter.
edge wb -> sc
edge tun sc -- ss {.thick}
edge ss -> ws
# Seitlich in den Kanal rechts neben dem Rechner und dann hinunter – gerade
# nach unten liefe die Kante mitten durch die Beschriftung "92.1.1.5".
edge ss.right -> ss2.right via rh.right+0.28,ss.cy rh.right+0.28,ss2.cy

step tunnel
  style @tunnel {.tone-4}
  emph tun
step forward
  dim tun
  emph ws
step further
  show @second
:::
:::

**Ein Tunnel ist eine Verbindung, die in einer anderen Verbindung reist.** Der `ssh`-Client öffnet lokal einen Port, nimmt dort eine gewöhnliche TCP-Verbindung an und trägt sie verschlüsselt zum `ssh`-Server, der sie dort ausleitet. Wohin sie ausgeleitet wird, steht in der Kommandozeile: an den Webserver auf demselben Rechner, an einen dritten Rechner im Netz dahinter, oder – mit `–D` – an alles, was der SOCKS-Proxy angeboten bekommt. Für jedes Gerät auf dem Weg sieht das aus wie eine einzige SSH-Sitzung.

## figure: Tunneling SSH via HTTP {.full #ns-b20}

::: side
```text
HTTP tunnel request:
GET http://vm1.cloud.com/?crap=15
HTTP/1.1
Host: server
Connection: close

HTTP tunnel response:
HTTP/1.0 200 OK
Content-Length: 102400
Content-Type: text/html
Proxy-Connection: close

..'SSH-2.0-OpenSSH_3.8p1 Debian…
.`...\ÇÈÀœÁ.Û3Xjè*...=diffie- […]
```
::: flip
::: draw {unit=118x150}
# Eine Kette auf einer waagerechten Linie – dieselbe Form wie auf der
# Folie danach. Der HTTP-Mitschnitt steht daneben als Codeblock, nicht
# im Bild. Die Beschriftungen "ssh client" und "ssh server" stehen wie
# im Original zweizeilig; das ist ein Umbruch, kein anderer Wortlaut.
box sc  "ssh\nclient"      at 0,0 w 0.66 {.tone-2}
box htc "htc"              right of sc gap 0.25 w 0.5 {.tone-1 @relay}
box fwp "firewall\nproxy"  right of htc gap 0.25 w 0.8 {.tone-1}
box hts "hts"              right of fwp gap 0.25 same as htc {.tone-1 @relay}
box ss  "ssh\nserver"      right of hts gap 0.25 same as sc {.tone-3}
text vm "vm1.cloud.com:80" below hts gap 0.28 {.muted @relay}

edge sc  -- htc
edge in htc -- fwp
edge out fwp -- hts
edge hts -- ss

step relay
  show @relay
  style htc, hts {.tone-4}
step wrapped
  emph in, out
step through
  dim in, out
  emph fwp
:::
:::

**Bleibt nur Port 80 offen, wird der Tunnel selbst zu HTTP.** `htc` nimmt die SSH-Verbindung lokal an, verpackt sie in eine gewöhnliche GET-Anfrage an `vm1.cloud.com` und hält die Antwort offen; `hts` packt am anderen Ende wieder aus und reicht an den `ssh`-Server weiter. Für den Proxy dazwischen ist das eine lange, langweilige HTTP-Antwort mit `Content-Length: 102400`. Erst wer in den Rumpf hineinsieht, findet dort den SSH-Banner.

## figure: Tunneling SSH over HTTPS: why DPI is futile | … unless specific DstIPs are whitelisted {.full #ns-b22}

::: side
```text
ssh –p 443 92.1.1.5
 ▶ ..'SSH-2.0-OpenSSH_3.8p1 Debian…

ssh […] 92.1.1.5
 ▶ CONNECT https://92.1.1.5:443/ HTTP/1.1
…
 ▶ <normal TLS handshake>
 ▶ <more TLS records> (SSH)
```
::: flip
::: draw {unit=118x104}
# Zwei Ketten auf je einer waagerechten Linie, formal wie die Folie davor:
# oben der naive Versuch, unten der, der durchkommt. Das Verbotszeichen und
# die beiden Aufkleber der Vorlage sind Beiwerk und fehlen – dass es oben
# nicht durchgeht, sagt die Lücke hinter der Firewall.
box uc  "ssh client\nconnect to 443" at 0,0 w 1.1 {.tone-2}
box ufw "firewall\nwith DPI"         right of uc gap 0.5 w 0.82 {.tone-1}
box us  "ssh server\non port 443"    right of ufw gap 0.5 same as uc {.tone-3}
edge uc  -- ufw
edge reach ufw -- us

# Die untere Kette wird von der Firewall aus nach beiden Seiten aufgebaut,
# damit die beiden "firewall with DPI" genau übereinanderstehen: es ist
# dieselbe Firewall, zweimal gezeichnet.
box lfw "firewall\nwith DPI"         below ufw gap 1.1 same as ufw {.tone-1 @proxy}
box pt  "proxy-\ntunnel"             left of lfw gap 0.5 w 0.68 {.tone-2 @proxy}
box lc  "ssh client"                 left of pt gap 0.5 same as uc {.tone-2 @proxy}
box ws  "webserver"                  right of lfw gap 0.5 w 0.86 {.tone-3 @proxy}
box ls  "ssh server\non localhost"   right of ws gap 0.5 same as uc {.tone-3 @proxy}
text ip "92.1.1.5:443"               below ws gap 0.28 {.muted @proxy}

edge lc  -- pt {@proxy}
edge lin pt -- lfw {@proxy}
edge lout lfw -- ws {@proxy}
edge ws  -- ls {@proxy}

step dpi
  emph ufw
  hide reach
  style us {.dim}
step tunnel
  show @proxy
step tls
  emph lin, lout
  style pt, ws {.tone-4}
step futile
  dim lin, lout
  dim ufw
:::
:::

**Der Port allein verrät nichts, der erste Datensatz schon.** Wer `ssh` einfach auf 443 laufen lässt, schickt als Erstes den Klartext-Banner `SSH-2.0-OpenSSH_3.8p1` – für eine Deep Packet Inspection ist das eindeutig, und die Verbindung endet an der Firewall. Der zweite Weg spricht stattdessen echtes HTTPS: ein `CONNECT` an den Webserver, danach ein regulärer TLS-Handshake, und der SSH-Verkehr liegt in gewöhnlichen TLS-Records. Damit sieht die Inspektion dasselbe wie bei jedem anderen Aufruf einer Website – nur eine Liste erlaubter Zieladressen hilft dann noch.

# Intrusion detection

## figure: Why should we deploy an intrusion detection system (IDS) at all? {.full #ns-b26}

::: draw {unit=118x78}
default box {.tone-1} w 1.15 h 0.66

# Die fünf proaktiven Maßnahmen sind die Mauer selbst: eine Reihe ohne Fuge,
# bis auf die eine, durch die der Eindringling kommt. Die Halbkreisbögen der
# Vorlage sind Dekoration und fehlen hier.
box fw "Firewall"                         at 0,0
box cr "Cryptography"                     right of fw gap 0 same as fw
box su "Security\nUpdates"                right of cr gap 0 same as fw
box pt "Penetration\nTests"               right of su gap 0 same as fw
box aa "Authentication &\nAccess Control" right of pt gap 0.3 w 1.55 h 0.66
text plab "EXAMPLES OF\nPROACTIVE MEASURES" above cr gap 0.5 {.muted}

# Was übrig bleibt, wenn die Mauer passiert ist.
box al  "Audit\nLogs"    below fw gap 1.5 w 1.0 h 0.66 {.tone-3 @inner}
box ids "IDS"            below su gap 1.5 w 0.95 h 0.66 {.hex .tone-4 @inner}
box im  "Incident\nMgmt" below aa gap 1.5 w 1.0 h 0.66 {.tone-3 @inner}
align y middle al, ids, im
spread x al, ids, im
container react "REACTIVE MEASURES" over al,ids,im pad 0.5 {.dashed .muted}

# Der rote, um 30° gedrehte Schriftzug der Vorlage lässt sich nicht drehen.
# Statt dessen eine dicke Kante, die von außen durch die Fuge der Mauer
# stößt, und das Wort waagerecht daneben.
edge intr pt.right+0.1,-0.95 -> pt.right+0.1,1.0 {.thick .accent @in}
text intrl "INTRUDER" above aa gap 0.62 {.accent .bold @in}

step breach
  show @in
  emph intr
step reactive
  show @inner
  dim intr
step detect
  emph ids
:::

**Proaktive Maßnahmen bauen eine Mauer, und die Mauer hat Fugen.** Firewall, Kryptographie, Sicherheitsupdates, Penetrationstests und Zugriffskontrolle halten den Normalfall draußen – jede von ihnen ist ein Stein in derselben Wand. Der Eindringling geht nicht um diese Wand herum, sondern durch eine ihrer Fugen, und ab diesem Moment hilft keine Vorbeugung mehr. Was dann noch trägt, sind reaktive Maßnahmen: Protokolle, die den Vorfall festhalten, ein Incident Management, das ihn abarbeitet – und dazwischen das IDS, das ihn überhaupt erst bemerkt.

## figure: Two Deployment Approaches | Host- (HIDS) and Network-based (NIDS) {.full #ns-b27}

::: draw {unit=150x62}
default box {.tone-1}

# Das Rückgrat: Uplink, Firewall, Switch. Der hellblaue Vollflächen-
# Hintergrund der Vorlage entfällt; akzentuiert werden die Sensoren.
dot ext ""         at 0,0 r 0.07 {.muted}
box fw "FIREWALL"  right of ext gap 3.85 w 0.34 h 1.55 {.turn}
box sw "SWITCH"    right of fw gap 3.85 w 0.85 h 0.44
edge w1 ext -- fw.left
edge w2 fw.right -- sw.left

# Die Sensoren sitzen auf der Leitung, nicht daneben.
box n1 "NIDS" between ext,fw w 0.7 h 0.44 {.hex .tone-4 @nids}
box n2 "NIDS" between fw,sw same as n1 {.hex .tone-4 @nids}

# Arbeitsplätze über dem Switch, an einem gemeinsamen Strang.
# Beschriftet wie in #ns-b04, nicht leer: ein Kasten ohne Wort liest sich als
# Fehler, und die beiden Figuren zeigen dasselbe Netz.
box d2 "desktop" above sw gap 1.25 w 0.6 h 0.44 {.tone-2 @hosts}
box d1 "desktop" left of d2 gap 1.45 same as d2 {.tone-2 @hosts}
text dlab "desktops" left of d1 gap 1.2 -- d1 {.muted @hosts}
edge k2 d2.bottom -- sw.top {@hosts}
edge k1 d1.bottom -- sw.cx,d1.bottom+0.42 via d1.cx,d1.bottom+0.42 {@hosts}

# Zwei Server. Der Zylinder der Vorlage ist eine .round-Box im Serverton.
box web "Web server" below n1 gap 1.3 w 1.0 h 0.5 {.round .tone-3 @hosts}
box db  "DB server"  below sw gap 1.3 offset -1.9,0 same as web {.round .tone-3 @hosts}
align y middle web, db
edge wl web.top -- web.cx,ext.cy {@hosts}
edge dl db.right -- sw.bottom via sw.cx,db.cy {@hosts}
box n3 "NIDS" right of db gap 1.2 same as n1 {.hex .tone-4 @nids}

box h1 "HIDS" above d1  gap 0.5  same as n1 {.hex .tone-4 @hids}
box h2 "HIDS" above d2  gap 0.5  same as n1 {.hex .tone-4 @hids}
box hw "HIDS" below web gap 0.45 same as n1 {.hex .tone-4 @hids}
box hd "HIDS" below db  gap 0.45 same as n1 {.hex .tone-4 @hids}

step hosts
  show @hosts
step nids
  show @nids
step hids
  show @hids
:::

**Zwei Anbringungsorte, ein Netz.** Die Leitung läuft vom Uplink über die Firewall zum Switch; daran hängen die Arbeitsplätze und die beiden Server. Netzbasierte Sensoren sitzen auf der Leitung selbst und sehen genau den Verkehr, der an ihrer Stelle vorbeikommt – vor der Firewall etwas anderes als dahinter. Hostbasierte Sensoren laufen auf dem Gerät und sehen dafür alles, was dort geschieht, aber nichts vom Rest des Netzes.

## figure: The observable input depends on the placement of the sensor. {.full #ns-b28}

::: draw {unit=150x58}
# In der Vorlage fehlen die Pfeile zwischen den drei Stufen, und die beiden
# Ausprägungen hängen ohne Bezug daneben. Beides ist hier ergänzt, ohne dass
# sich ein Wort ändert.
box inp "Input"            at 0,0 w 1.5 h 0.5 {.tone-3}
box de  "Decision\nEngine" below inp gap 0.75 w 1.7 h 0.95 {.hex .tone-4}
box rea "Reaction"         below de gap 0.75 w 1.5 h 0.5 {.tone-3}
edge f1 inp -> de
edge f2 de -> rea

text nb "network-based" right of inp gap 1.6 offset 0,-0.2 {.left @src}
text hb "host-based"    below nb gap 0.16 flush left {.left @src}
brace kinds over nb,hb side left "" pad 0.3 {.muted @src}

step engine
  show de
step reaction
  show rea
step sensor
  show @src
  emph inp
:::

**Ein IDS ist eine Kette aus drei Stufen.** Was hereinkommt, wertet eine Entscheidungsinstanz aus, und erst deren Urteil löst eine Reaktion aus. Die Kette ist nur so gut wie ihr Anfang: Das Beobachtbare entscheidet sich am Ort des Sensors. Netzbasiert liest er Pakete auf der Leitung, hostbasiert die Ereignisse eines einzelnen Rechners – zwei verschiedene Weltausschnitte, aus denen dieselbe Entscheidungsinstanz verschiedene Urteile zieht.

## figure: Given some input data, the detection result of an IDS can be classified into one of four cases. {.full #ns-b39}

::: draw {unit=150x60}
default box {.sharp}

box tp  "true positive\nTP"  at 0,0 w 1.45 h 1.05 {.tone-2}
box fn  "false negative\nFN" right of tp gap 0 same as tp {.tone-4}
box fp  "false positive\nFP" below tp gap 0 same as tp {.tone-4}
box tn  "true negative\nTN"  right of fp gap 0 same as tp {.tone-2}
box rat "ATTACK" left of tp gap 0 w 0.34 h 1.05 {.turn .clear .small}
box rno "NORMAL" left of fp gap 0 same as rat {.turn .clear .small}

text cal "alert"    above tp gap 0.3
text cno "no alert" above fn gap 0.3
brace hdr over cal,cno side top "REACTION OF IDS" pad 0.3 {.muted}

text miss "missed\nattack" right of fn gap 1.25 -- fn {.hand}
text fa   "false alarm"    below fp gap 0.5 -- fp {.hand}

step correct
  emph tp, tn
step missed
  dim tp, tn
  emph fn
  show miss
step alarm
  dim fn
  emph fp
  show fa
:::

**Vier Fälle, zwei davon sind Fehler.** Auf der einen Achse steht, was wirklich vorlag, auf der anderen, wie das IDS darauf reagiert hat. Stimmen beide überein, ist der Fall erledigt: ein erkannter Angriff oder ein zu Recht stiller Normalbetrieb. Interessant sind die beiden Diagonalfelder – ein übersehener Angriff kostet Sicherheit, ein Fehlalarm kostet Aufmerksamkeit, und jede Schwelle, die das eine senkt, hebt das andere.

## figure: Misuse-based IDS can only detect what is known. | Anomaly-based IDS might detect novel attacks. {.full #ns-b48}

::: draw {unit=150x62}
default box {.sharp}

text mh "Misuse detection"  at 0.85,0 {.large .bold}
text ah "Anomaly detection" at 2.65,0 {.large .bold}

# Zwei gleich große Grundmengen, gleicher Ton: beide sind eine Menge von
# Vorgängen. Was der Detektor davon kennt, trägt in beiden Spalten denselben
# Ton – der Unterschied ist die Form, punktuell gegen flächig. Der gezackte
# Stern der Vorlage wird ein dot, die Blob-Form eine .round-Box.
# Der Rahmen ist .clear, nicht gefüllt: Kästen werden nach den Kanten
# gezeichnet, eine Füllung verschluckte die beiden Leitlinien zu den
# Signaturen. Die Grundmenge ist damit die Fläche im Rahmen.
box mf "" at 0.85,3.55 w 1.7 h 4.1 {.clear}
box af "" at 2.65,3.55 w 1.7 h 4.1 {.clear}

text ms "signatures of\nknown intrusions"    at 0.85,0.8
text as "knowledge about\nbenign activities" at 2.65,0.8

dot  s1 ""   at 0.45,2.1 r 0.13 {.tone-4}
dot  s2 ""   at 1.25,2.1 r 0.13 {.tone-4}
box  bl ""   at 2.65,2.3 w 1.35 h 1.1 {.round .tone-4}
edge e1 ms -> s1 {.muted}
edge e2 ms -> s2 {.muted}
edge e3 as -> bl {.muted}

text mt "anything else:\nno misuse alert" at 0.85,4.6
text an "anything else:\nanomaly alert"   at 2.65,4.6

box mlab "All intrusions"     at 0.85,5.86 w 1.5 h 0.44 {.paper .accent}
box alab "All benign actions" at 2.65,5.86 w 1.7 h 0.44 {.paper}

text foot "Idealized illustration! What does\na poor situation look like?" at 1.75,6.75 {.muted}

step misuse
  show ms, s1, s2
step anomaly
  show as, bl
step rest
  show mt, an, foot
:::

**Punktuell gegen flächig – daran hängt der ganze Unterschied.** Ein Misuse-Detektor kennt Signaturen bekannter Angriffe; das sind einzelne Punkte in der Menge aller Einbrüche, und alles daneben löst keinen Alarm aus. Ein Anomalie-Detektor kennt statt dessen eine Fläche: ein Modell des erlaubten Betriebs, und alles außerhalb davon meldet er. Deshalb kann nur der zweite einen Angriff melden, den noch niemand gesehen hat – und deshalb meldet er auch harmlose Vorgänge, die sein Modell nicht abdeckt.

# How good is a detector?

## figure: Observed character freq. | Anomaly? {.full #ns-b55}

::: draw {unit=150x58}
# Die Zeichenkette unter den Säulen ist wörtlich von der Folie, gesperrt
# gesetzt: "t / p r e n . ; l m o b". Der zweite String wird an Leerzeichen
# geteilt, also eine Beschriftung je Säule. Die Werte sind so gewählt, dass
# die Bins auf #ns-b57 – dasselbe Paket, dieselben Säulen – exakt die dort
# wörtlich übernommenen Zählungen 43 / 36 / 21 ergeben.
bars obs "20,12,11,10,9,9,8,8,7,6,5,4" "t / p r e n . ; l m o b" at 0,0 w 3.1 h 0.85 {.tone-3 .bare}

text hcmp "Comparison with normal behavior" below obs gap 0.62 flush left {.left}

# Der Rahmen ist auf beiden Achsen normiert: waagerecht der Rang des Zeichens,
# senkrecht seine relative Häufigkeit. Die Folie beschriftet nur die Waagerechte,
# und zwar mit der Zeichenkette selbst – die steht deshalb als Achsentitel da.
plot cmp ".ie0lo1/a35M6rckn()tW…" below hcmp gap 0.5 flush left w 3.1 h 1.5 x 0,1 y 0,1 tick 0.5

# Das Normalverhalten läuft als glatte Kurve durch seine Wegpunkte.
edge normal cmp@0.01,cmp@0.6 -- cmp@1,cmp@0.03 via cmp@0.1,cmp@0.4 cmp@0.25,cmp@0.26 cmp@0.45,cmp@0.15 cmp@0.7,cmp@0.07 {.smooth .thick}

# Die Nadeln des verdächtigen Pakets: eine zweite Säulenreihe, die auf der
# Grundlinie des plots steht und ihn in der Breite ausfüllt. 24 statt der ~40
# Nadeln der Folie – die Aussage ist der Kontrast, nicht die Anzahl.
# .tone-4 ist die einzige volle Füllung, die es gibt, und sie mischt sich aus
# --emph: eine 6 px schmale Nadel mit bloßem Strich bliebe innen leer.
bars sus "20,14,55,10,8,45,12,88,9,62,7,6,10,5,18,4,6,5,3,4,3,2,3,2" at cmp@0.5,cmp@0.425 w 3.1 h 1.275 space 0.085 {.tone-4 .bare @sus}

text ls "/" above sus-2 gap 0.06 {@sus}
text lr "r" above sus-5 gap 0.06 {@sus}
text lt "t" above sus-7 gap 0.06 {@sus}
text lp "p" above sus-9 gap 0.06 {@sus}

# Beide Beschriftungen liegen über Gitterlinien und bekommen deshalb einen
# eigenen Grund, der die Linie dahinter ausstanzt.
text nnorm "normal behavior" at cmp@0.66,cmp@0.42 pad 0.12 {.paper}
text nsus  "suspicious packet" at cmp@0.62,cmp@0.86 pad 0.12 {.paper .hand @sus}

text ask "Suitable distance metric?" below cmp gap 0.92 flush left {.hand @ask}

step normal
  show normal, nnorm
step suspicious
  show @sus
  emph @sus
step metric
  show @ask
  dim normal
:::

**Ein Paket bringt seine eigene Zeichenverteilung mit.** Oben steht, was in der Nutzlast tatsächlich gezählt wurde; unten liegt dieselbe Zählung über dem, was an diesem Dienst normal ist. Die roten Nadeln stehen dort, wo das beobachtete Paket weit über der Referenz liegt – das Auge sieht den Ausreißer, bevor irgendeine Kennzahl berechnet ist. Bleibt die Frage, die die Folie stellt: welches Abstandsmaß macht aus diesem Bild eine Zahl?

## figure: Training stage | Chi-square statistic (goodness of fit) {.full #ns-b56}

::: draw {unit=150x56}
bars f "20,19,17,12,11,10,9,9,8,7,6,5" ". i e 0 l o 1 / a 3 5 M" at 0,0 w 2.5 h 0.9 {.tone-3 .bare}
text cap "Char. freq. distribution for\nnormal payloads" above f gap 0.16 flush right {.right}

brace b1 over f-0,f-1,f-2 side bottom "Bin 1" pad 0.45 {.muted @bins}
brace b2 over f-3,f-4,f-5,f-6 side bottom "Bin 2" pad 0.45 {.muted @bins}
brace b3 over f-7,f-8,f-9 side bottom "Bin 3" pad 0.45 {.muted @bins}
text bd "…" at f.right+0.3,f.bottom+0.78 {.muted @bins}

# Die Gewichte stehen unter den Bin-Namen, nicht unter der Klammer: die
# Klammer misst sich ohne ihre Beschriftung, und eine Zeile weiter oben
# läge die Zahl auf der Zeichenreihe.
text w1 "0.20" at b1.cx,f.bottom+1.12 {@weights}
text w2 "0.18" at b2.cx,f.bottom+1.12 {@weights}
text w3 "0.12" at b3.cx,f.bottom+1.12 {@weights}
text ws "Σ=1.0" at f.right+0.3,f.bottom+1.12 {@weights}

step bins
  show @bins
step weights
  show @weights
  emph @weights
:::

**Die Trainingsphase misst, was normal ist.** Der Sensor zählt die Zeichen im Nutzdatenteil harmloser Anfragen, sortiert sie absteigend und fasst benachbarte Zeichen zu Bins zusammen – „group multiple features into bins of suitable size (aggregating counts)". Was der Sensor behält, sind nicht die einzelnen Häufigkeiten, sondern die Bin-Anteile $p_1 = 0{,}20$, $p_2 = 0{,}18$, $p_3 = 0{,}12$ mit $\sum_i p_i = 1$. Das Verfahren stammt aus C. Krügel et al. (2002): *Service Specific Anomaly Detection for Network Intrusion Detection*, SAC 2002, ACM, S. 201–208.

## figure: Detection at Runtime {.full #ns-b57}

::: draw {unit=150x56}
# Dieselben Werte wie die beobachtete Verteilung auf #ns-b55 – es ist
# dasselbe Paket – und die Bins summieren exakt auf die Zahlen der Folie:
# 20+12+11 = 43, 10+9+9+8 = 36, 8+7+6 = 21. Vorher standen hier die Werte
# der *Trainingsverteilung* von #ns-b56, womit die anomale Verteilung
# deckungsgleich mit der war, von der sie abweichen soll.
bars g "20,12,11,10,9,9,8,8,7,6,5,4" "t / p r e n . ; l m o b" at 0,0 w 2.5 h 0.9 {.tone-3 .bare}
text cap "Anomalous payload\ndistribution" above g gap 0.16 flush right {.right}

brace b1 over g-0,g-1,g-2 side bottom "Bin 1" pad 0.45 {.muted @bins}
brace b2 over g-3,g-4,g-5,g-6 side bottom "Bin 2" pad 0.45 {.muted @bins}
brace b3 over g-7,g-8,g-9 side bottom "Bin 3" pad 0.45 {.muted @bins}
text bd "…" at g.right+0.3,g.bottom+0.78 {.muted @bins}

text o1 "43" at b1.cx,g.bottom+1.12 {@counts}
text o2 "36" at b2.cx,g.bottom+1.12 {@counts}
text o3 "21" at b3.cx,g.bottom+1.12 {@counts}
text os "Σ=163" at g.right+0.3,g.bottom+1.12 {@counts}

step bins
  show @bins
step counts
  show @counts
step deviation
  emph b1, o1
:::

**Zur Laufzeit wird dieselbe Einteilung noch einmal ausgezählt.** Jede Anfrage liefert beobachtete Bin-Häufigkeiten $O_i$; die erwarteten folgen aus den trainierten Anteilen, etwa $E(\text{Bin 1}) = 0{,}2 \cdot 163 = 32{,}6$. Der Abstand zwischen beobachtet und erwartet ist die Chi-Quadrat-Statistik

$$\chi^2 = \sum_i \frac{(O_i - E_i)^2}{E_i}$$

und der Sensor schlägt Alarm, sobald $\chi^2 > t$ ist. Welcher Wert für $t$ das sein soll, entscheidet die nächste Folie.

## figure: Reaction of IDS {.full #ns-b59}

::: draw {unit=62x62}
# Die zehn beschrifteten Pakete liegen auf einer Achse: waagerecht der
# Anomaliewert, den der Sensor ausrechnet (das Chi-Quadrat der Folie davor),
# senkrecht die wahre Klasse. Erst dadurch kann der Schwellwert überhaupt
# etwas trennen – in der Fassung davor standen die Marker als Block
# nebeneinander, und der Strich lief an ihnen vorbei statt hindurch.
# Die Einheit ist quadratisch, damit ein Paketkasten quadratisch wird.
text ds "Labeled dataset (e.g., by DARPA/Lincoln Labs)" at 0,0 {.left}

text latt "attack traffic" below ds gap 1.0 flush left {.left}
text lben "benign traffic" below latt gap 0.5 flush left {.left}

# Rasterplatz zu Rasterplatz sind 0.74, ein Kasten misst 0.42: der
# Zwischenraum ist damit dreiviertel so breit wie ein Kasten, und der
# Schwellwert passt sichtbar dazwischen, ohne einen zu berühren. Die
# Reihenfolge ist die Sortierung nach Anomaliewert – Angriffe liegen im
# Mittel höher, überlappen aber, und genau diese Überlappung ist das Thema.
# Rasterplätze: benign 0,1,2,3,5,7 – attack 4,6,8,9.
box b1 "" right of lben gap 0.55 w 0.42 h 0.42 {.tone-2 .sharp}
box b2 "" right of b1 gap 0.3 same as b1 {.tone-2 .sharp}
box b3 "" right of b2 gap 0.3 same as b1 {.tone-2 .sharp}
box b4 "" right of b3 gap 0.3 same as b1 {.tone-2 .sharp}
box b5 "" right of b4 gap 1.05 same as b1 {.tone-2 .sharp}
box b6 "" right of b5 gap 1.05 same as b1 {.tone-2 .sharp}

box a1 "" at b1.cx+2.96,latt.cy same as b1 {.accent .sharp}
box a2 "" right of a1 gap 1.05 same as b1 {.accent .sharp}
box a3 "" right of a2 gap 1.05 same as b1 {.accent .sharp}
box a4 "" right of a3 gap 0.3 same as b1 {.accent .sharp}

edge axis b1.left-0.5,b1.bottom+0.7 -> a4.right+0.6,b1.bottom+0.7 {.muted}
text axn "anomaly score" at b1.cx+3.33,b1.bottom+1.12 {.muted}
text lno "no alert" at b1.cx+0.37,b1.bottom+0.34 {.muted}
text lal "alert" at a4.cx-0.37,b1.bottom+0.34 {.muted}

# Der Schwellwert selbst ist die Beschriftung, und die Linie hängt an ihr:
# ein Schritt verschiebt "t", das Layout wird neu ausgewertet, und der Strich
# folgt. Der Doppelpfeil der alten Fassung, der sagen sollte, dass der Strich
# beweglich ist, ist damit überflüssig – jetzt bewegt er sich.
text tlbl "t" at a1.cx+0.37,a1.top-0.45 pad 0.12 {.paper .hand @thr}
edge thr tlbl.cx,tlbl.bottom -- tlbl.cx,b1.bottom+0.7 {.thick @thr}

# Die 2×2-Matrix. Die Angriffszeile trägt die Akzentfarbe, die Normalzeile
# den Ton für legitimen Verkehr – dieselbe Zuordnung wie überall sonst.
# Die Spalten stehen wie die Achse darüber: links von t kein Alarm, rechts
# Alarm. Deshalb sitzt FN links neben TP und nicht umgekehrt.
box fn "FN" at ds.left+1.2,b1.bottom+3.05 w 1.3 h 0.9 {.accent}
box tp "TP" right of fn gap 0 same as fn {.accent}
box tn "TN" below fn gap 0 same as fn {.tone-2}
box fp "FP" right of tn gap 0 same as fn {.tone-2}

# Die Zahl steht in der Beschriftung des Feldes und nicht als Reihe kleiner
# Marker daneben: sie ändert sich in jedem Beat, und ein "label"-Schritt
# tauscht dafür eine zur Bauzeit gesetzte Variante ein. Abzählen von vier
# Quadraten aus der letzten Reihe des Hörsaals dauert länger als Lesen.
text cno "no alert" above fn gap 0.28
text cal "alert" above tp gap 0.28
text head "REACTION OF IDS" above cno gap 0.3 flush left {.bold .left}
text rowa "attack" left of fn gap 0.25 {.turn}
text rown "normal" left of tn gap 0.25 {.turn}

text rates "TP rate: 0.75 / FP rate: 0.33" at tp.right+2.1,fn.bottom-0.25 {.bold @thr}

# Der Merksatz gehört zum letzten Beat und damit auch auf das Handout: der
# Zusammenhang, den die Folie danach als ROC-Kurve zeichnet.
text tnote "moving t moves both rates" at rates.cx,rates.bottom+0.6 {.hand}

step threshold
  show @thr
  emph thr
  label fn "FN\n1"
  label tp "TP\n3"
  label tn "TN\n4"
  label fp "FP\n2"
step stricter
  move tlbl by 2.22,0
  label fn "FN\n2"
  label tp "TP\n2"
  label tn "TN\n6"
  label fp "FP\n0"
  label rates "TP rate: 0.50 / FP rate: 0.00"
step lenient
  move tlbl by -4.44,0
  label fn "FN\n0"
  label tp "TP\n4"
  label tn "TN\n2"
  label fp "FP\n4"
  label rates "TP rate: 1.00 / FP rate: 0.67"
step tradeoff
  move tlbl by 2.22,0
  show tnote
  label fn "FN\n1"
  label tp "TP\n3"
  label tn "TN\n4"
  label fp "FP\n2"
  label rates "TP rate: 0.75 / FP rate: 0.33"
:::

**Die vier Felder sind kein Vokabular, sondern eine Auszählung.** Zehn beschriftete Pakete laufen durch den Sensor, aufgereiht nach dem Anomaliewert, den er ihnen gibt; $t$ ist der Strich auf dieser Achse, und alles rechts davon meldet er als Alarm. Steht $t$ in der Mitte, erkennt er von den vier Angriffen drei (TP) und verpasst einen (FN), von den sechs harmlosen Paketen meldet er zwei fälschlich (FP) – das sind die beiden Kennzahlen, die den Rest des Kapitels tragen: TP rate 0.75 und FP rate 0.33. Schiebt man $t$ nach rechts, schweigt der Sensor öfter und beide Raten fallen (0.50 und 0.00); schiebt man ihn nach links, steigen beide (1.00 und 0.67). Kein Wert von $t$ senkt die eine, ohne die andere mitzunehmen.

## figure: Receiver operating characteristic (ROC) curves {.full #ns-b60}

::: draw {unit=104x104}
# "False Postive Rate" ist der Tippfehler der Originalfolie und bleibt so.
# Die Einheit ist quadratisch, damit der ROC-Rahmen quadratisch wird.
plot roc "False Postive Rate" "True Positive Rate" at 0,0 w 2.6 h 2.45 x 0,1 y 0,1 tick 0.2

edge curve roc@0.02,roc@0.03 -- roc@0.98,roc@1 via roc@0.06,roc@0.5 roc@0.2,roc@0.8 roc@0.49,roc@0.95 roc@0.75,roc@0.98 {.smooth .thick}

# Die Beschriftungen sitzen unter ihrem Punkt, nicht rechts daneben: rechts
# liegt die Kurve, und ein .paper-Grund stanzt sie sonst aus.
dot pstrict "" at roc@0.06,roc@0.5 r 0.055 {.tone-4 @strict}
text lstrict "Strict threshold" at roc@0.3,roc@0.43 pad 0.12 {.bold .paper @strict}
dot pmod "" at roc@0.2,roc@0.8 r 0.055 {.tone-4 @moderate}
text lmod "Moderate threshold" at roc@0.5,roc@0.71 pad 0.12 {.bold .paper @moderate}
dot plen "" at roc@0.49,roc@0.95 r 0.055 {.tone-4 @lenient}
text llen "Lenient threshold" at roc@0.76,roc@0.86 pad 0.12 {.bold .paper @lenient}

step curve
  show curve
step strict
  show @strict
step moderate
  show @moderate
step lenient
  show @lenient
:::

**Eine ROC-Kurve ist die Menge aller Schwellwerte auf einmal.** Jeder Punkt der Kurve gehört zu einem Wert von $t$: waagerecht der Anteil der Fehlalarme, senkrecht der Anteil der erkannten Angriffe. Ein strenger Schwellwert hält die Fehlalarme klein und findet dafür nur die Hälfte der Angriffe; ein großzügiger findet fast alles und lässt jeden zweiten harmlosen Verkehr als Alarm durch. Zwischen beiden kann man wählen, aber nicht beides haben.

## figure: Comparing detection techniques | ROC curves for alternative binnings {.full #ns-b61}

::: draw {unit=104x104}
# Derselbe Rahmen wie zuvor, samt Tippfehler "False Postive Rate".
plot roc "False Postive Rate" "True Positive Rate" at 0,0 w 2.6 h 2.45 x 0,1 y 0,1 tick 0.2

edge chance roc@0.02,roc@0.02 -- roc@1,roc@1 {.muted @chance}
# Unterhalb der Diagonalen, aber weit genug daneben, dass ihr .paper-Grund
# die Linie nicht zerschneidet: die Diagonale ist y = x, also muss die linke
# Kante des Kastens rechts von seiner Oberkante liegen.
text nchance "Accuracy due\nto chance" at roc@0.65,roc@0.35 pad 0.12 {.bold .paper @chance}

edge high roc@0.02,roc@0.02 -- roc@1,roc@1 via roc@0.05,roc@0.6 roc@0.15,roc@0.86 roc@0.4,roc@0.95 roc@0.7,roc@0.98 {.smooth .thick @curves}
edge low roc@0.02,roc@0.02 -- roc@1,roc@1 via roc@0.12,roc@0.35 roc@0.3,roc@0.66 roc@0.6,roc@0.88 {.smooth .thick @curves}

text lhigh "High\naccuracy" at roc@0.3,roc@1.24 -- roc@0.24,roc@0.92 {.bold @curves}
text llow "Low\naccuracy" at roc@0.62,roc@1.24 -- roc@0.5,roc@0.81 {.bold @curves}

dot pperf "" at roc@0.02,roc@1 r 0.055 {.tone-4 @perfect}
text lperf "Perfect\naccuracy" at roc@0.02,roc@1.24 -- roc@0.02,roc@1.03 {.bold @perfect}

text q "What false positive\nrate is acceptable?" at roc@0.7,roc@0.12 pad 0.12 {.paper .hand @ask}

step chance
  show @chance
step curves
  show @curves
step perfect
  show @perfect
step question
  show @ask
  dim chance
:::

**Zwei Verfahren vergleicht man an ihren Kurven, nicht an einem Punkt.** Je weiter eine Kurve in die linke obere Ecke ausbeult, desto besser trennt das Verfahren – die Ecke selbst wäre perfekt, die Diagonale ist raten. Alternative Binnings der Zeichenverteilung liefern genau solche Kurvenscharen, und das bessere Binning ist das mit der oberen Kurve. Die Frage, welchen Punkt man auf der gewählten Kurve einstellt, beantwortet das Bild aber nicht.

## figure: Sketch of a Similar Situation {.full #ns-b63}

::: draw {unit=70x70}
# 96 Gesichter aus vier Rastern statt aus 96 Zeilen: die Regel ist je Raster
# eine Zeile, die Ausnahme ist ein eigenes Raster. Das Asset wird nur einmal
# eingebettet, egal wie oft es vorkommt.
grid sickp image face-bad 7x1 at 0,0 cell 0.3 space 0.08 {@tp}
grid sickn image face-ok 1x1 right of sickp gap 0.1 cell 0.3 space 0.08 {@fn}
grid well image face-ok 7x11 below sickp gap 0.32 flush left cell 0.3 space 0.08 {@wellneg}
grid fpos image face-bad 1x11 right of well gap 0.1 flush top cell 0.3 space 0.08 {@fpos}

container zsick "" over sickp,sickn pad 0.09 {.accent .sharp}
container zwell "" over well,fpos pad 0.09 {.sharp}
text lsick "sick" left of sickp gap 0.3 {.right}
text lwell "healthy" left of well gap 0.3 {.right}

text rates "TP rate: 87.5% FP rate: 12.5%\nactually sick: 8.3%" above sickp gap 0.35 flush left {.left .muted}

# Die Legende steht auf halber Höhe der Tafel, nicht oben: sonst bliebe die
# rechte untere Hälfte der Figur leer.
image legb face-bad right of fpos gap 1.1 offset 0,-0.3 w 0.3
text tlegb "test positive (you are worried)" right of legb gap 0.2 {.left}
image lego face-ok below legb gap 0.35 same as legb
text tlego "test negative (you feel safe)" right of lego gap 0.2 {.left}
text ask "Should you be?" below tlego gap 0.55 flush left {.hand @ask}

# Die Beats bauen die Argumentation auf, statt sie wegzudimmen. Vorher hiess
# der erste "positives" und liess den einen uebersehenen Kranken hell stehen,
# und der zweite hiess "alarms" und loeschte die Krankenzeile ganz - am Ende
# leuchteten nur die *falschen* Alarme, also genau das Gegenteil des Namens.
step detected
  emph @tp
  dim @fn, @wellneg, @fpos
step flagged
  emph @fpos
  dim @tp
step alarms
  emph @tp, @fpos
  dim @fn, @wellneg
  label rates "TP rate: 87.5% FP rate: 12.5%\nactually sick: 8.3%\n18 alarms, 7 of them real: 39%"
step worried
  show @ask
:::

**Dieselbe Rechnung, ein Test statt eines Sensors.** Von 96 Personen sind acht krank, der Test erkennt sieben davon und übersieht eine – und meldet zugleich elf der 88 Gesunden als positiv. Wer ein positives Ergebnis in der Hand hält, gehört also zu 18 Positiven, von denen nur sieben wirklich krank sind: die Wahrscheinlichkeit liegt bei $7/18 \approx 39\,\%$, nicht bei den 87,5 % der Trefferquote. Genau so verhält sich ein Sensor mit guter TP-Rate in einem Netz, in dem fast aller Verkehr harmlos ist.
