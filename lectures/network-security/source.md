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

The rules these were built against are in `figure-design.md`. The tone
assignment holds for the whole deck: `.tone-1` infrastructure, `.tone-2` a
legitimate host, `.tone-3` payload and protocol fields, `.tone-4` whatever this
beat is about, `.accent` the attacker and the attack traffic, `.dim` not
involved in this scene, `.muted` the apparatus.

# Addresses, and the protocols that resolve them

## figure: For transport, each network layer relies on addresses {.full #ns-a03}

::: draw {unit=150x54}
default box {.tone-3 .sharp} w 0.88 h 0.85

box fh "Frame\nHeader"    at 0,0
box dh "Datagram\nHeader" right of fh gap 0 same as fh
box sh "Segment\nHeader"  right of dh gap 0 same as fh
box pl "Payload"          right of sh gap 0 same as fh {.paper}

# The three labels climb to the right, so their leaders stay vertical and none
# lies over the next. They point at the top edge rather than at the box: a
# leader to the centre would end in the middle of the box's own label.
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

**A packet carries its own pair of addresses at every layer.** The four boxes are one frame on the wire: `gap 0` and `same as` hold them together as a stack, and only the label above says which header carries which addresses. Each step emphasises one header and brings its explanation in, outside to inside, in the order a device works through the headers. The payload stays untinted, having nothing to say in this figure.

## figure: Besides spoofing, adversaries may attack address resolution {.full #ns-a07}

::: draw {unit=170x50}
default box {.tone-3 .sharp} w 1.15 h 0.6

box dn  "domain name" at 0,0
box ip1 "IP address"  below dn gap 0.5 offset 1.5,0 {@dns}
edge dn.bottom -- ip1.left via dn.cx,ip1.cy {.muted}
text ldns "DNS" left of ip1 gap 1.15 pad 0.14 {.paper .bold @dns}

# The gap inside a pair is 0.5, between pairs 1.15 - a good factor of two, so
# the grouping arrives before the label does.
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

**A name on its own carries no packet.** Two translations sit between what a person types and what a network card can address: DNS turns the name into an IP address, ARP turns the IP address into a MAC address. Both are drawn the same way here, being twice the same construction – a question, an answer, no proof. The last step colours exactly the two protocol names: they are the attack surface, not the addresses. The full explanation is in the video on network fundamentals.

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

# On the original slide A is red from the start. Here A is a host like any
# other first and becomes the attacker only in the last beat, which is exactly
# what the original says, and costs no label.
step hosts
  show @hosts
step forwarding
  emph bwire, sw
step poisoning
  style a {.accent .paper}
  emph a, awire
  dim bwire, sw
:::

**A switch is an optimisation, not a security measure.** It remembers which MAC address sits behind which port and sends a frame only there; that A does not see B's traffic is a side effect of that thrift. ARP cache poisoning attacks exactly that mapping: A claims, unasked, to hold the MAC address for somebody else's IP, and the traffic lands at A from then on. So the last beat colours A and its wire and takes the emphasis off the normal case again.

## figure: B wants to visit webserver at example.com | knows IP of DNS resolver of ISP and gateway {.full #ns-a08}

::: draw {unit=190x54}
# Diese Topologie tragen vier Figuren gemeinsam (A-08, A-12, A-13, A-14):
# the same names in the same places, so the run reads as one drawing that
# develops.
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

# The zone boundary is a separation rather than a relation: a headless dotted
# edge between two coordinates, touching no element.
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

**The stage for the next three figures.** The home network on the left, the internet on the right, and a dotted boundary between them that separates rather than connects – which is why it is a headless edge between two coordinates and hangs off no element. B knows two addresses by heart: its default gateway and its provider's DNS resolver. Everything else B has to ask for, and that is where the attacks that follow begin. The break mark on the wire to the web server says there is a lot of network between router and destination that the drawing does not show.

## figure: DNS Spoofing | Adversary forges IP address in DNS reply to redirect victim to malicious server, e.g., for phishing credentials {.full #ns-a12}

::: draw {unit=190x54}
# The same topology as #ns-a08, the same names, the same places.
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

# The forged reply runs on the same wire as B's connection, so it takes that
# wire's place: bwire goes, forged arrives - never both, instead of two lines
# on top of each other.
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

**The attacker need not break the web server; the answer to the question about it is enough.** A does not wait but hands B a DNS reply of its own – “example.com is 66.9.9.6” – and B dutifully opens the connection to that machine. In the figure the red arrow replaces B's connecting wire rather than lying beside it: it is the same wire the real answer would come on, and two lines on top of each other would be a drawing claiming two paths. The real web server stays reachable and unaware, which is what makes the attack so quiet.

## figure: Forgery trivial for on-path attacker (on routers or endpoints) | prevent reply from reaching B and inject own reply {.full #ns-a13}

::: draw {unit=190x54}
# The same topology as #ns-a08 and #ns-a12, the same names and places.
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

# "on-patch" is the original's typo and is kept verbatim. There the question
# is a bordered box; here it is a note with a leader to A - a box
# in the topology would look like a device. It stands beside A so the leader
# stays horizontal.
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

**Sitting on the path means never having to guess.** An attacker on a router or on one of the endpoints sees the query and all its random numbers; they hold the real reply back and push their own in front of it. The figure does that in two moves: first the wire the real answer would come on turns dashed, then the forged arrow takes its place. The box at the top left is the original's question to the room, and it is meant seriously: A does not lie on the path to the resolver but can put itself there by ARP cache poisoning.

## figure: Off-path attackers (E) must generate a valid reply | that reaches B before the reply sent by the real DNS resolver {.full #ns-a14}

::: draw {unit=190x54}
# The same topology as #ns-a08, #ns-a12 and #ns-a13, the same names and
# places. All that is new is who the attacker is: A steps back and the box at
# the bottom left of the internet gets a name.
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

**From outside, the same attack is suddenly a race.** E does not see the query and has to hit three fields blind: the reply's source IP has to be the resolver's, the UDP destination port on B has to be the query's source port, and the transaction ID has to match the query's. The IP can be forged, the port and the TXID cannot – 2^16 possibilities each, provided the client picks them at random, and some clients did not. On top of that the forged reply has to arrive before the real one, which is why the red arrow replaces the wire the real answer would be travelling on here too. Aim E at the resolver instead of at B and the forged entry lands in its cache and reaches all its customers, which is DNS cache poisoning.

# Denial of service

## figure: Distributed Denial of Service (DDoS) attack | attacker instructs hosts infected with malware to flood a victim with traffic {.full #ns-a28}

::: draw {unit=100x76}
# In the original the bots lie on a world map. That stays out here: a raster
# image follows no theme and costs over 100 kB. Scattered sources all round
# say the same thing - "distributed" was the argument, the geography never
# was. Every label is verbatim from the original.
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

# Eight arrows into one box is exactly the point here, so no waypoint and no
# detour. The fraction after the anchor spreads the heads along the sides
# instead of putting three of them on the same spot.
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

**The victim stands still and the rest comes from everywhere.** The original's map is replaced by a ring of scattered bots – *distributed* was the point, the continent never was. The first beat sets the botnet up, the second lets it fire, the third draws the conclusion the talk has to speak anyway. Because the bots use their real addresses, the traffic looks like traffic.

## figure: DoS attacks are also possible without access to a botnet | Attackers can use connectionless protocols and spoof their Src IP to hide their identity {.full #ns-a29}

::: draw {unit=96x74}
# Again with no world map, for the same reasons as the figure before. The
# dashed boxes with the question mark are the "faked sources": what is not
# genuine about them is the outline. Text verbatim from the original; only the
# line breaks in the box on the right are re-set - the original breaks
# "proto-cols" mid-word there, because its frame ran out.
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
# The label sits on the line rather than beside it, and .paper knocks the line
# out for it - otherwise line and word read as one pattern.
text tr "Traffic of the DoS attack" between atk,vic pad 0.14 {.paper .accent @real}
text loc "Attacker's real location\nis unknown (IP spoofing)." below atk gap 0.4 {.muted @real}

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

**No botnet, a forged source address instead.** The attacker appears once in the picture, but their traffic carries eight foreign sources – that is the whole trick, and the dashed outlines say nothing about those sources is genuine. The last beat takes the arrows back and puts the countermeasure beside them. It has been known since BCP 38 and is still not deployed everywhere, because it earns the filtering provider nothing.

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
# "Spamhouse" is what the original says (the company is called Spamhaus) and it
# stays; the evidence for it is the capture beside it, not this picture. The
# two triangles are the size comparison: the area is the volume, the point
# shows where it arrives. 37 bytes out, 1194 back.
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

**The attacker sends little and lets a lot come back.** The small point goes to an open resolver carrying the victim's source address; the large one comes out at the victim, and the ratio of the two areas is the amplification factor. The capture beside it has the numbers. It works only because the servers queried answer anybody who asks.

## figure: Next up is a DoS attack that exploits a design flaw | For that let's review the TCP connection handshake {.full #ns-a31}

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
# The original's typo stays: the code on the left says
# print('Connected by', add) rather than addr.
# The slide's block arrows are .chevron (pointing right, client -> server) and
# .chevron point left (server -> client); the italic variables are written *c*
# and *s*, and the compiler sets them in the accent.
default box {.tone-3} w 2.35 h 0.5

text cl "Client" at -1.175,-0.75 {.left}
text sv "Server" at 1.175,-0.75 {.right}

box syn  "SYN seq=*c*"               at 0,0 {.chevron}
box sa   "SYN+ACK seq=*s* ack=*c*+1" below syn gap 0.22 point left {.chevron @two}
box ack  "ACK seq=*c*+1 ack=*s*+1"   below sa gap 0.22 {.chevron @three}
box data "DATA"                      below ack gap 0.62 {.chevron .tone-4 @data}

text state "Server stores *state* (e.g., seq,\nIPs, ports) in memory to match\nclient's ACK previous packets." below data gap 0.62 {@why}

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

**Three messages, and the server remembers something after the first.** The block arrows point in the reading direction of their traffic: two to the right, the middle one to the left. The code on the left is the evidence that an ordinary server has to do nothing for this – `s.listen(5)` sets the queue up, and `accept()` only gets the finished connection. That remembered state is the attack surface.

## figure: One technique to defend against SYN flooding is to enable SYN Cookies | so that server does not have to store the state {.full #ns-a33}

::: draw {unit=126x62}
# The slide highlights seq=e and ack=e+1 in yellow. There are no free colours
# here and none are needed: *e* sets the variable in the accent, and the beat
# "cookie" emphasises the two block arrows in which
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

**The state has to live somewhere, so why not in the packet.** The server answers with a sequence number *e* it worked out itself, and gets it back as *e*+1 in the client's ACK. The client carries the state for it, as long as the state fits in 32 bits. A SYN with no ACK behind it then costs the server nothing.

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

**One handshake, two flights.** The client opens with `ClientHello` and encloses its half of the Diffie-Hellman key. The server answers in a single flight: parameter choice, certificate chain, signature and MAC. After that both sides know the same secret without it ever having crossed the wire – and it is checked only in the last step, before any payload flows.

## figure: Certificate chains {.full #ns-a43}

::: draw {unit=124x50}
default box {.tone-3} w 1.55

box  os "Browser/OS" at 0,0 {.tone-1}
text st "Store with trusted\ncertificates" right of os gap 0.85 {.left .muted}

box  r0 "Certificate\nof a Root CA"            below os gap 0.5 flush left offset 0.55,0
box  r1 "Certificate of an\nintermediate CA"   below r0 gap 0.5 flush left offset 0.55,0
box  r2 "Cert. of another\nintermediate CA"    below r1 gap 0.5 flush left offset 0.55,0
box  r3 "Certificate\nof server"               below r2 gap 0.5 flush left offset 0.55,0 {.tone-4}

# The staircase: vertically out of the bottom edge, down the channel left of
# the next box, then horizontally onto its left edge. The start point is a
# coordinate rather than an anchor, so the descent and the waypoint carry the
# same x and the vertical is vertical.
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

**Trust has a beginning, and it is on your own machine.** Browser and operating system ship a store of root certificates, and everything else hangs off it through signatures. Each link in the chain signs the next, until the server's own certificate stands at the bottom. On the right, the same chain as a certificate viewer lists it for `github.com` – intermediates are the rule rather than the exception: one here, two in the schematic on the left.

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

**A certificate is a data structure, not a text.** The upper block carries what every version knows – version, serial number, signature algorithm, validity, issuer – and within it the two fields this is really about: the holder's name and their public key. Under that, v2 added the identifiers and v3 the extensions. At the very bottom lies the issuer's signature over everything above it, which is why nobody can change a line further up.

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

# The fourth, empty row is deliberate: the value beside it runs to four lines,
# and without it the next group measures its gap from a label ending three
# lines higher - the grouping gap would disappear.
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

**The extensions say what the key is good for.** `Basic Constraints` with `Certificate Authority: NO` forbids this certificate from signing further certificates – were it `YES`, whoever runs `github.com` could issue for every domain in the world. The `Subject Alternative Name` lists the names the certificate is valid for. And `Critical` is not decoration: a client that does not understand an extension marked critical has to reject the certificate.

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
To the login form</a> [...]
</body></html>
```

or

```http
> GET / HTTP/1.1
> Host: www.bank.de

< HTTP/1.1 301 Moved Permanently
< Location: https://www.bank.de/
```

**Switching to HTTPS is a request, not a guarantee.** Both routes start in the clear: either the server delivers a page whose links already carry `https://`, or it answers the HTTP request with a redirect. Either way the first round trip is unprotected, and that is where the attack goes in – in the answer nobody checks.

## figure: Operation of sslstrip {.full #ns-a62}

::: draw {unit=90x90}
box  br "Browser"  at 0,0   w 1.3 {.tone-2}
box  sv "Server"   at 5.4,0 same as br {.tone-2}
text ss "sslstrip" at 2.7,0 {.turn .accent @mitm}
# The two slashes are the cut in the wire. They run about 7 degrees off
# vertical and so well outside the skew warning.
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

**sslstrip takes the encryption off the victim without breaking it.** The attacker sits in the path, speaks perfectly ordinary HTTPS to the server, and passes the answer on to the browser in the clear. On the way it rewrites every `https://` in the delivered pages to `http://`, so the browser never has cause to switch. The server sees a faultless TLS connection and the user sees a page with no padlock, which almost nobody looks at.

# Firewalls and tunnels

## figure: Firewalls enforce rules that limit who is allowed to talk to whom. {.full #ns-b04}

::: draw {unit=132x78}
# Every label verbatim from the original - including "publically reachable",
# which is spelled exactly that way in the original and stays. The line break
# in "demilitarized zone (DMZ)" is only a break in the original (hyphenated
# there), not different wording.
#
# Three shapes the language does not have, and their stand-ins, the same on
# all three slides: the cylinder (web/database/file server) is a .round box in
# the storage tone, the cloud is a .round box "Internet", and the monitor
# symbols are labelled boxes under the group caption "desktops".
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

# The bus: every edge runs vertically out of its box, horizontally along the
# channel and vertically into the switch - no diagonals, and that the last
# pieces lie on each other is exactly the original's T.
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

# The dashed zone separator is a headless edge between two coordinates. It
# runs through fw2 - boxes are drawn after edges and cover it there, exactly
# as in the original.
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

**Two filters in one wire, and between them a strip that may be reachable from outside.** The outer firewall separates the internet from the demilitarised zone, the inner one separates the DMZ from the trusted hosts. Whatever has to be addressable from outside – the web server here – therefore stands between the two rather than behind both. If it falls, the attacker still has the second firewall in front of them rather than the database and the file server.

## figure: Not only used to secure the perimeter, also for network segmentation. | cf. lateral movement, ransomware {.full #ns-b05}

::: draw {unit=132x78}
# The same drawing as on the previous slide: the same names, coordinates and
# stand-in shapes. All that is new are the two inner firewalls and the zone
# caption "segmented net", so the run reads as one drawing that develops.
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

# The two inner firewalls sit on the spurs to the switch rather than at the
# perimeter: that is the whole difference from the previous slide.
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

**The same drawing, two filters more, and they are no longer at the perimeter.** A firewall at the perimeter helps only against whoever is still outside. Anyone who has reached a desktop otherwise moves on unimpeded to the database and file servers, which is what ransomware lives on. Segmentation pulls the filters into the network, so every hop between segments has to pass a rule again.

## figure: Firewalls are also run on hosts to limit chatty applications' network access. {.full #ns-b06}

::: draw {unit=132x78}
# The same drawing again, the same names and coordinates. What is new is the
# FIREWALL on the host - in the original it stands horizontally beside the
# caption "desktops", so it stands in the same place here and "desktops"
# moves one box width to the right.
#
# The Little Snitch dialogue is not a screenshot but rebuilt: a frame with the
# original's text lines and two buttons. Every line verbatim; the selected
# option is bold rather than marked with a radio button, and the original's
# two icon buttons add nothing to the argument and are left out.
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

# The dialogue stands there from the start rather than being brought in: the
# live view reserves room in the viewBox for every element that turns up
# later, and a dialogue this size shown only in the third beat would have
# pressed the drawing into the upper half of a twice-as-tall frame for two
# beats.
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

**A firewall need not stand in the network; it can run on the machine itself.** There it knows something no device in the network can: which program wants to open the connection. So Little Snitch asks about the application rather than about address and port, and lets the answer be narrowed to a single domain. The price is that somebody has to decide, in the middle of their work.

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
# The slide's command lines stand beside the figure as an ordinary code
# block, not in the diagram. And they stand there verbatim: the second line
# names 91.1.1.5, the others 92.1.1.5. That is how the original has it, and the
# difference is kept.
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

# The browser addresses the locally opened port, the tunnel carries the
# connection through, and at the far end it goes on to the web server or to a
# third machine.
edge wb -> sc
edge tun sc -- ss {.thick}
edge ss -> ws
# Sideways into the channel right of the machine and then down - straight
# down, the edge would run through the middle of the label "92.1.1.5".
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

**A tunnel is a connection travelling inside another connection.** The `ssh` client opens a port locally, accepts an ordinary TCP connection on it, and carries that connection encrypted to the `ssh` server, which lets it out at the far end. Where it comes out is in the command line: at the web server on the same machine, at a third machine in the network behind it, or – with `-D` – at whatever the SOCKS proxy is offered. To every device along the way this looks like a single SSH session.

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
# A chain on one horizontal line - the same shape as on the slide after it.
# The HTTP capture stands beside it as a code block, not in the picture. The
# labels "ssh client" and "ssh server" run to two lines as in the original;
# that is a break, not different wording.
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

**If only port 80 stays open, the tunnel becomes HTTP itself.** `htc` accepts the SSH connection locally, wraps it in an ordinary GET request to `vm1.cloud.com` and holds the answer open; `hts` unwraps it at the far end and passes it to the `ssh` server. To the proxy in between this is a long, dull HTTP response with `Content-Length: 102400`. Only somebody looking into the body finds the SSH banner in it.

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
# Two chains on one horizontal line each, formally like the slide before it:
# the naive attempt above, the one that gets through below. The original's
# prohibition sign and two stickers are trimming and are left out - the gap
# behind the firewall says that the upper one does not get through.
box uc  "ssh client\nconnect to 443" at 0,0 w 1.1 {.tone-2}
box ufw "firewall\nwith DPI"         right of uc gap 0.5 w 0.82 {.tone-1}
box us  "ssh server\non port 443"    right of ufw gap 0.5 same as uc {.tone-3}
edge uc  -- ufw
edge reach ufw -- us

# The lower chain is built out from the firewall in both directions, so the
# two "firewall with DPI" boxes stand exactly above each other: it is the same
# firewall, drawn twice.
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

**The port alone gives nothing away; the first record does.** Run `ssh` on 443 and the first thing it sends is the plaintext banner `SSH-2.0-OpenSSH_3.8p1`, which is unambiguous to a deep packet inspection, and the connection ends at the firewall. The second route speaks real HTTPS instead: a `CONNECT` to the web server, then a regular TLS handshake, with the SSH traffic in ordinary TLS records. The inspection then sees what it sees on any other visit to a website, and only a list of permitted destinations still helps.

# Intrusion detection

## figure: Why should we deploy an intrusion detection system (IDS) at all? {.full #ns-b26}

::: draw {unit=118x78}
default box {.tone-1} w 1.15 h 0.66

# The five proactive measures are the wall itself: a row with no joint except
# the one the intruder comes through. The original's semicircular arcs are
# decoration and are left out.
box fw "Firewall"                         at 0,0
box cr "Cryptography"                     right of fw gap 0 same as fw
box su "Security\nUpdates"                right of cr gap 0 same as fw
box pt "Penetration\nTests"               right of su gap 0 same as fw
box aa "Authentication &\nAccess Control" right of pt gap 0.3 w 1.55 h 0.66
text plab "EXAMPLES OF\nPROACTIVE MEASURES" above cr gap 0.5 {.muted}

# What is left once the wall has been passed.
box al  "Audit\nLogs"    below fw gap 1.5 w 1.0 h 0.66 {.tone-3 @inner}
box ids "IDS"            below su gap 1.5 w 0.95 h 0.66 {.hex .tone-4 @inner}
box im  "Incident\nMgmt" below aa gap 1.5 w 1.0 h 0.66 {.tone-3 @inner}
align y middle al, ids, im
spread x al, ids, im
container react "REACTIVE MEASURES" over al,ids,im pad 0.5 {.dashed .muted}

# The original's red lettering, rotated 30 degrees, cannot be rotated here.
# Instead a thick edge pushing in from outside through the joint in the wall,
# with the word horizontal beside it.
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

**Proactive measures build a wall, and the wall has joints.** Firewalls, cryptography, security updates, penetration tests and access control keep the normal case out, each of them a stone in the same wall. The intruder does not go round that wall but through one of its joints, and from that moment no prevention helps any more. What still carries is the reactive measures: logs that record the incident, an incident management that works through it, and between them the IDS that noticed it at all.

## figure: Two Deployment Approaches | Host- (HIDS) and Network-based (NIDS) {.full #ns-b27}

::: draw {unit=150x62}
default box {.tone-1}

# The backbone: uplink, firewall, switch. The original's pale blue full-bleed
# background is dropped; what is accented is the sensors.
dot ext ""         at 0,0 r 0.07 {.muted}
box fw "FIREWALL"  right of ext gap 3.85 w 0.34 h 1.55 {.turn}
box sw "SWITCH"    right of fw gap 3.85 w 0.85 h 0.44
edge w1 ext -- fw.left
edge w2 fw.right -- sw.left

# The sensors sit on the wire rather than beside it.
box n1 "NIDS" between ext,fw w 0.7 h 0.44 {.hex .tone-4 @nids}
box n2 "NIDS" between fw,sw same as n1 {.hex .tone-4 @nids}

# Workstations above the switch, on one shared strand. Labelled as in
# #ns-b04 rather than left empty: a box with no word reads as a mistake, and
# the two figures show the same network.
box d2 "desktop" above sw gap 1.25 w 0.6 h 0.44 {.tone-2 @hosts}
box d1 "desktop" left of d2 gap 1.45 same as d2 {.tone-2 @hosts}
text dlab "desktops" left of d1 gap 1.2 -- d1 {.muted @hosts}
edge k2 d2.bottom -- sw.top {@hosts}
edge k1 d1.bottom -- sw.cx,d1.bottom+0.42 via d1.cx,d1.bottom+0.42 {@hosts}

# Two servers. The original's cylinder is a .round box in the server tone.
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

**Two places to put one, one network.** The wire runs from the uplink through the firewall to the switch, and the workstations and the two servers hang off it. Network-based sensors sit on the wire itself and see exactly the traffic that passes their spot – something different before the firewall and after it. Host-based sensors run on the device and see everything that happens there, and nothing of the rest of the network.

## figure: The observable input depends on the placement of the sensor. {.full #ns-b28}

::: draw {unit=150x58}
# The original has no arrows between the three stages, and the two variants
# hang beside them with no connection. Both are supplied here without a word
# changing.
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

**An IDS is a chain of three stages.** What comes in is assessed by a decision stage, and only its verdict triggers a response. The chain is only as good as its beginning: what can be observed is settled where the sensor sits. Network-based it reads packets on the wire, host-based the events of a single machine – two different slices of the world, from which the same decision stage draws different verdicts.

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

**Four cases, two of them mistakes.** One axis says what was really there, the other how the IDS reacted to it. Where the two agree the case is closed: an attack detected, or normal operation rightly passed over in silence. The two off-diagonal cells are the interesting ones – a missed attack costs security, a false alarm costs attention, and every threshold that lowers one raises the other.

## figure: Misuse-based IDS can only detect what is known. | Anomaly-based IDS might detect novel attacks. {.full #ns-b48}

::: draw {unit=150x62}
default box {.sharp}

text mh "Misuse detection"  at 0.85,0 {.large .bold}
text ah "Anomaly detection" at 2.65,0 {.large .bold}

# Two base sets of one size, one tone: both are a set of events. What the
# detector knows of them carries the same tone in both columns - the
# difference is the shape, pointwise against areal. The original's jagged star
# becomes a dot and the blob a .round box.
# The frame is .clear rather than filled: boxes are drawn after edges, and a
# fill would swallow the two leaders to the signatures. So the base set is the
# area inside the frame.
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

**Pointwise against areal – the whole difference hangs on that.** A misuse detector knows signatures of known attacks: single points in the set of all intrusions, and anything beside them raises no alarm. An anomaly detector knows an area instead – a model of permitted operation – and reports everything outside it. So only the second can report an attack nobody has seen before, and that is also why it reports harmless events its model does not cover.

# How good is a detector?

## figure: Observed character freq. | Anomaly? {.full #ns-b55}

::: draw {unit=150x58}
# The string under the columns is verbatim from the original, letter-spaced:
# "t / p r e n . ; l m o b". The second string splits on spaces, so one label
# per column. The values are chosen so that the bins on #ns-b57 - the same
# packet, the same columns - come to exactly the counts 43 / 36 / 21 taken
# verbatim there.
bars obs "20,12,11,10,9,9,8,8,7,6,5,4" "t / p r e n . ; l m o b" at 0,0 w 3.1 h 0.85

text hcmp "Comparison with normal behavior" below obs gap 0.62 flush left {.left}

# The frame is normalised on both axes: the character's rank across, its
# relative frequency down. The slide labels only the horizontal, and with the
# string itself, so that stands as the axis title.
plot cmp ".ie0lo1/a35M6rckn()tW…" below hcmp gap 0.5 flush left w 3.1 h 1.5 x 0,1 y 0,1 tick 0.5

# Normal behaviour runs as a smooth curve through its waypoints.
edge normal cmp@0.01,cmp@0.6 -- cmp@1,cmp@0.03 via cmp@0.1,cmp@0.4 cmp@0.25,cmp@0.26 cmp@0.45,cmp@0.15 cmp@0.7,cmp@0.07 {.smooth .thick}

# The suspicious packet's needles: a second run of columns standing on the
# plot's baseline and filling its width. 24 rather than the original's ~40
# needles - the point is the contrast, not the count.
# .tone-4 is the only full fill there is, and it mixes from --emph: a needle
# 6 px wide with a bare stroke would be empty inside.
bars sus "20,14,55,10,8,45,12,88,9,62,7,6,10,5,18,4,6,5,3,4,3,2,3,2" at cmp@0.5,cmp@0.425 w 3.1 h 1.275 space 0.085 {.tone-4 @sus}

text ls "/" above sus-2 gap 0.06 {@sus}
text lr "r" above sus-5 gap 0.06 {@sus}
text lt "t" above sus-7 gap 0.06 {@sus}
text lp "p" above sus-9 gap 0.06 {@sus}

# Both labels lie over gridlines and so get a ground of their own, which
# knocks the line out behind them.
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

**A packet brings its own character distribution with it.** Above is what was actually counted in the payload; below, the same count lies over what is normal for this service. The red needles stand where the observed packet is far above the reference – the eye sees the outlier before any figure has been computed. Which leaves the question the original asks: what distance measure turns this picture into a number?

## figure: Training stage | Chi-square statistic (goodness of fit) {.full #ns-b56}

::: draw {unit=150x56}
bars f "20,19,17,12,11,10,9,9,8,7,6,5" ". i e 0 l o 1 / a 3 5 M" at 0,0 w 2.5 h 0.9
text cap "Char. freq. distribution for\nnormal payloads" above f gap 0.16 flush right {.right}

brace b1 over f-0,f-1,f-2 side bottom "Bin 1" pad 0.45 {.muted @bins}
brace b2 over f-3,f-4,f-5,f-6 side bottom "Bin 2" pad 0.45 {.muted @bins}
brace b3 over f-7,f-8,f-9 side bottom "Bin 3" pad 0.45 {.muted @bins}
text bd "…" at f.right+0.3,f.bottom+0.78 {.muted @bins}

# The weights stand under the bin names rather than under the brace: a brace
# measures itself without its label, and one line higher the number would lie
# on the row of characters.
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

**The training phase measures what is normal.** The sensor counts the characters in the payload of harmless requests, sorts them descending and groups neighbouring characters into bins – “group multiple features into bins of suitable size (aggregating counts)”. What it keeps is not the individual frequencies but the bin shares $p_1 = 0.20$, $p_2 = 0.18$, $p_3 = 0.12$ with $\sum_i p_i = 1$. The method is from C. Krügel et al. (2002), *Service Specific Anomaly Detection for Network Intrusion Detection*, SAC 2002, ACM, pp. 201–208.

## figure: Detection at Runtime {.full #ns-b57}

::: draw {unit=150x56}
# The same values as the observed distribution on #ns-b55 - it is the same
# packet - and the bins sum to exactly the original's numbers: 20+12+11 = 43,
# 10+9+9+8 = 36, 8+7+6 = 21. These used to be the values of the *training*
# distribution from #ns-b56, which made the anomalous distribution identical
# to the one it is meant to deviate from.
bars g "20,12,11,10,9,9,8,8,7,6,5,4" "t / p r e n . ; l m o b" at 0,0 w 2.5 h 0.9
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

**At run time the same division is counted again.** Every request yields observed bin frequencies $O_i$; the expected ones follow from the trained shares, for instance $E(\text{Bin 1}) = 0.2 \cdot 163 = 32.6$. The distance between observed and expected is the chi-squared statistic

$$\chi^2 = \sum_i \frac{(O_i - E_i)^2}{E_i}$$

and the sensor raises an alarm as soon as $\chi^2 > t$. What value $t$ should take is what the next slide decides.

## figure: Reaction of IDS {.full #ns-b59}

::: draw {unit=62x62}
# The ten labelled packets lie on an axis: the anomaly score the sensor
# computes across (the chi-squared of the slide before), the true class down.
# Only that lets the threshold separate anything at all - in the version
# before, the markers stood side by side as a block and the rule ran past
# them rather than through them.
# The unit is square, so that a packet box comes out square.
text ds "Labeled dataset (e.g., by DARPA/Lincoln Labs)" at 0,0 {.left}

text latt "attack traffic" below ds gap 1.0 flush left {.left}
text lben "benign traffic" below latt gap 0.5 flush left {.left}

# Grid slot to grid slot is 0.74 and a box measures 0.42, so the space
# between is three quarters of a box wide and the threshold fits visibly
# between them without touching one. The order is the sort by anomaly score -
# attacks lie higher on average but overlap, and that overlap is the subject.
# Grid slots: benign 0,1,2,3,5,7 - attack 4,6,8,9.
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

# The threshold itself is the label, and the line hangs off it: a step moves
# "t", the layout is worked out again, and the rule follows. The old version's
# double-headed arrow, which was there to say the rule can move, is therefore
# unnecessary - now it moves.
text tlbl "t" at a1.cx+0.37,a1.top-0.45 pad 0.12 {.paper .hand @thr}
edge thr tlbl.cx,tlbl.bottom -- tlbl.cx,b1.bottom+0.7 {.thick @thr}

# The 2x2 matrix. The attack row carries the accent, the normal row the tone
# for legitimate traffic - the same assignment as everywhere else.
# The columns stand as the axis above them does: no alarm left of t, alarm
# right of it. So FN sits left of TP and not the other way round.
box fn "FN" at ds.left+1.2,b1.bottom+3.05 w 1.3 h 0.9 {.accent}
box tp "TP" right of fn gap 0 same as fn {.accent}
box tn "TN" below fn gap 0 same as fn {.tone-2}
box fp "FP" right of tn gap 0 same as fn {.tone-2}

# The number is in the cell's own label rather than a row of small markers
# beside it: it changes in every beat, and a "label" step swaps in a variant
# typeset at build time for it. Counting four squares from the back row of a
# lecture hall takes longer than reading.
text cno "no alert" above fn gap 0.28
text cal "alert" above tp gap 0.28
text head "REACTION OF IDS" above cno gap 0.3 flush left {.bold .left}
text rowa "attack" left of fn gap 0.25 {.turn}
text rown "normal" left of tn gap 0.25 {.turn}

text rates "TP rate: 0.75 / FP rate: 0.33" at tp.right+2.1,fn.bottom-0.25 {.bold @thr}

# The takeaway belongs to the last beat and therefore to the handout too: the
# relationship the next slide draws as a ROC curve.
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

**The four cells are a count, not a vocabulary.** Ten labelled packets run through the sensor, lined up by the anomaly score it gives them; $t$ is the rule on that axis, and everything right of it is reported as an alarm. With $t$ in the middle the sensor catches three of the four attacks (TP) and misses one (FN), and wrongly reports two of the six harmless packets (FP) – the two figures the rest of the chapter rests on: TP rate 0.75 and FP rate 0.33. Push $t$ right and the sensor stays quiet more often and both rates fall (0.50 and 0.00); push it left and both rise (1.00 and 0.67). No value of $t$ lowers one without taking the other with it.

## figure: Receiver operating characteristic (ROC) curves {.full #ns-b60}

::: draw {unit=104x104}
# "False Postive Rate" is the original slide's typo and stays.
# The unit is square, so that the ROC frame comes out square.
plot roc "False Postive Rate" "True Positive Rate" at 0,0 w 2.6 h 2.45 x 0,1 y 0,1 tick 0.2

edge curve roc@0.02,roc@0.03 -- roc@0.98,roc@1 via roc@0.06,roc@0.5 roc@0.2,roc@0.8 roc@0.49,roc@0.95 roc@0.75,roc@0.98 {.smooth .thick}

# The labels sit under their point rather than to its right: the curve is to
# the right, and a .paper ground would otherwise knock it out.
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

**A ROC curve is every threshold at once.** Each point on the curve belongs to a value of $t$: the share of false alarms across, the share of detected attacks down. A strict threshold keeps the false alarms small and finds only half the attacks; a generous one finds nearly everything and lets every second harmless flow through as an alarm. You can choose between the two, but not have both.

## figure: Comparing detection techniques | ROC curves for alternative binnings {.full #ns-b61}

::: draw {unit=104x104}
# The same frame as before, typo "False Postive Rate" included.
plot roc "False Postive Rate" "True Positive Rate" at 0,0 w 2.6 h 2.45 x 0,1 y 0,1 tick 0.2

edge chance roc@0.02,roc@0.02 -- roc@1,roc@1 {.muted @chance}
# Below the diagonal, but far enough clear that its .paper ground does not cut
# the line: the diagonal is y = x, so the box's left edge has to lie right of
# its top edge.
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

**Compare two methods by their curves, not at one point.** The further a curve bulges into the top left corner, the better the method separates – the corner itself would be perfect, the diagonal is guessing. Alternative binnings of the character distribution give exactly such families of curves, and the better binning is the one with the upper curve. Which point on the chosen curve to set is a question the picture does not answer.

## figure: Sketch of a Similar Situation {.full #ns-b63}

::: draw {unit=70x70}
# 96 faces out of four grids rather than 96 lines: the rule is one line per
# grid, the exception a grid of its own. The asset is embedded once, however
# often it appears.
grid sickp image face-bad 7x1 at 0,0 cell 0.3 space 0.08 {@tp}
grid sickn image face-ok 1x1 right of sickp gap 0.1 cell 0.3 space 0.08 {@fn}
grid well image face-ok 7x11 below sickp gap 0.32 flush left cell 0.3 space 0.08 {@wellneg}
grid fpos image face-bad 1x11 right of well gap 0.1 flush top cell 0.3 space 0.08 {@fpos}

container zsick "" over sickp,sickn pad 0.09 {.accent .sharp}
container zwell "" over well,fpos pad 0.09 {.sharp}
text lsick "sick" left of sickp gap 0.3 {.right}
text lwell "healthy" left of well gap 0.3 {.right}

text rates "TP rate: 87.5% FP rate: 12.5%\nactually sick: 8.3%" above sickp gap 0.35 flush left {.left .muted}

# The legend stands halfway down the board rather than at the top: otherwise
# the bottom right half of the figure would stay empty.
image legb face-bad right of fpos gap 1.1 offset 0,-0.3 w 0.3
text tlegb "test positive (you are worried)" right of legb gap 0.2 {.left}
image lego face-ok below legb gap 0.35 same as legb
text tlego "test negative (you feel safe)" right of lego gap 0.2 {.left}
text ask "Should you be?" below tlego gap 0.55 flush left {.hand @ask}

# The beats build the argument up rather than dimming it away. The first used
# to be called "positives" and left the one missed sick case standing bright,
# and the second was called "alarms" and cleared the sick row entirely - so at
# the end only the *false* alarms were lit, the exact opposite of the name.
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

**The same arithmetic, a test instead of a sensor.** Of 96 people eight are ill; the test catches seven of them and misses one, and at the same time reports eleven of the 88 healthy ones as positive. Anyone holding a positive result is therefore one of 18 positives, of whom only seven are really ill: the probability is $7/18 \approx 39\,\%$, not the 87.5 % of the hit rate. A sensor with a good TP rate behaves exactly this way in a network where nearly all the traffic is harmless.
