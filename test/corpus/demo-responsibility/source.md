---
title: Responsibility
subtitle: Who answers when a system does harm?
presenter: Prof. Dr. Dominik Herrmann
info: |
  Ethics for the Digital Society
  Privacy and Security in Information Systems · Universität Bamberg
course: eds
lecture: responsibility
lang: en
cover: quote
section: number
section-mark: Part
theme: light-teal
collapse: topic-bold
auto-fit: shrink
style:
  headings: left
  bold: accent
  print-bold: bold
  hyphenate: all
---

## title: {#title}

You are not only responsible for what you say, but also for what you do not say.

# The Case {#case}

## figure: The Mirai botnet took down half the web {.full #mirai}

::: draw 150x50
box dvr "Hacked DVRs\nand IP cameras" at 0,0 w 2.4 h 1.2 {.tone-4}
box net "The open\ninternet" right of dvr gap 2.6 w 2.2 h 1.2
box vic "Twitter, Reddit,\nSpotify, GitHub" right of net gap 2.6 w 2.4 h 1.2
edge dvr -> net "flood of traffic" side top
edge net -> vic "unreachable" side top
text src "Three students, a Minecraft hustle – not a nation state." below net gap 1.6 {.small .muted}
:::

> note: The anchor case for the whole lecture.

## figure: Sixty-one passwords opened every door {.full #passwords}

::: draw 150x76
table t "Password | Device" at 0,0 col 1.1,2.0 row 0.4 {.clear .bare .left}
  "123456 | ACTi IP Camera"
  "anko | ANKO Products DVR"
  "pass | Axis IP Camera"
  "888888 | Dahua DVR"
  "vizxv | Dahua IP Camera"
  "dreambox | Dreambox TV Receiver"
  "juantech | Guangzhou Juan Optical"
  "xc3511 | H.264 Chinese DVR"
  "klv123 | HiSilicon IP Camera"
  "admin | IPX-DDK Network Camera"
  "meinsm | Mobotix Network Camera"
  "realtek | RealTek Routers"
  "smcadmin | SMC Routers"
  "ubnt | Ubiquiti AirOS Router"
  "supervisor | VideoIQ"

table u "Password | Device" right of t gap 1.2 col 1.1,2.0 row 0.4 {.clear .bare .left}
  "klv1234 | HiSilicon IP Camera"
  "jvbzd | HiSilicon IP Camera"
  "system | IQinVision Cameras"
  "54321 | Packet8 VOIP Phone"
  "00000000 | Panasonic Printer"
  "1111111 | Samsung IP Camera"
  "xmhdipc | Shenzhen Anran Camera"
  "ikwb | Toshiba Network Camera"
  "7ujMko0admin | Dahua IP Camera"
  "666666 | Dahua DVR"
  "cat1029 | HiSilicon IP Camera"
  "hi3518 | HiSilicon IP Camera"
  "OxhlwSG8 | HiSilicon IP Camera"
  "guest | generic"
  "tech | generic"
:::

> note: The table is verbatim from Antonakakis et al. 2017.

## question: Who is responsible? {.wide #who}

::: cards 3 {.small}
- **Students**\
  who open-sourced Mirai
- **Owners**\
  of vulnerable devices
- **Manufacturers**\
  who shipped default passwords
:::

The DDoS lands on *someone else*. **That is a negative externality**, and it
is why the market never fixed the devices on its own.

## principle: The economics explain the failure better than the ethics do {.wide #lemons}

**Buyers cannot assess a device's security, and will not pay for it.** So a
manufacturer that spends on security loses to one that does not.

The result is a market for lemons: the secure product cannot signal its
quality, so it cannot command its price, so it is not built.

::: footnote
Anderson & Moore (2006), The Economics of Information Security, Science 314.
:::

# Kinds of Responsibility {#kinds}

There are different kinds of responsibility, and the lecture is about only one of them.

## definition: There are different kinds of responsibility {.wide #four-kinds}

::: rows
- **Legal** Liability: the law assigns who pays.
- **Role** The duties that come with a function – parent to child, employee to firm.
- **Moral** The obligations that hold whether or not the law names them.
- **Professional** The duties of a role, as far as they stay within what is morally allowed.
:::

Our focus is the last one: **system designers and engineers**.

## definition: Passive responsibility looks backward {.wide #passive}

::: draw 150x44
dot d "" at 0,0 {.tone-4}
text dl "decision" below d gap 0.3 {.small}
box ev "undesirable\nevent" right of d gap 3.0 w 1.6 {.tone-1}
dot here "" right of ev gap 3.0 {.tone-4}
text hl "we are here" below here gap 0.3 {.small .bold}
edge d -> here {.thick}
text q "Who is responsible for that?" above ev gap 1.0 {.small .muted}
:::

**It has two aspects: accountability and blameworthiness.** Accountability is
owing an account of why you acted as you did; blameworthiness is culpability
for what followed.

## definition: Blameworthiness has exactly four conditions {.wide #blame}

::: cards 4 {.outline .small}
- **Wrong-doing**\
  a norm was violated
- **Causal contribution**\
  an act or an omission that mattered
- **Foreseeability**\
  the harm was knowable
- **Freedom of action**\
  no compulsion
:::

A single causal contribution is rarely *sufficient* for the harm, but it is
often *necessary*. **We look at the abnormal factors** – the dry season, the
discarded cigarette – not the ones that are always present.

## definition: Active responsibility looks forward {.wide #active}

Responsibility before anything has happened: a duty to care for a state of
affairs. **It is not about blame but about virtue.**

::: cards 5 {.small}
- **Perception**\
  of potential norm violations
- **Consequences**\
  considered in advance
- **Autonomy**\
  making one's own moral decisions
- **A code**\
  verifiable and consistent
- **Role duties**\
  taken seriously
:::

> note: Bovens (1998), five features.

# Professional Ideals {#ideals}

## principle: Technology is not neutral {.standard #not-neutral}

**"The hammer does not care."** That is the popular excuse, and the lecture
rejects it.

Every technology bears the intentions of its maker, and it comes with
possibilities and limits that shape how it will be used. **A tool is a
metaphor waiting to unfold.**

## figure: The engineer who would not look {.full #classifier}

::: draw 150x46
box train "gang-related\nnot gang-related" at 0,0 w 2.2 h 1.4 {.tone-1}
box arr1 "" right of train gap 0.5 w 0.5 h 0.5 {.wedge .tone-2} point right
box clf "CLASSIFIER" right of arr1 gap 0.5 w 2.2 h 1.4 {.tone-4}
box arr2 "" right of clf gap 0.5 w 0.5 h 0.5 {.wedge .tone-2} point right
box pred "predictions" right of arr2 gap 0.5 w 2.0 h 1.4 {.tone-1}
edge train -- clf
edge clf -- pred
text q "\"I'm just an engineer.\"" below clf gap 1.4 {.small .muted}
:::

# Engineers versus Managers {#tension}

## figure: Being a salaried employee creates a tension {.wide #salaried}

::: draw 110x56
box eng "Engineer" at 0,0 w 2.4 h 1.0 {.tone-1}
box comp "Responsibility\nto the company" above eng gap 1.2 w 2.6 h 1.0
box prof "Professional\nresponsibility" below eng gap 1.2 w 2.6 h 1.0
edge comp -> eng {.thick}
edge prof -> eng {.thick}
:::

Three positions resolve the conflict, and the lecture takes each in turn.

## definition: Three positions {.wide #positions}

::: cards 3 {.panel}
- **Separatism**\
  Engineers do the technical work; others take the value decisions.
- **Technocracy**\
  Engineers should take them, because they understand the technology.
- **Whistle-blowing**\
  A last resort, at significant personal cost.
:::

# Whistle-blowing {#whistle}

## figure: De George's five conditions {.full #de-george}

::: draw 132x60
box c1 "1 · Serious harm\nto the public" at 0,0 w 3.4 h 0.9 {.tone-1}
box c2 "2 · Reported to a superior,\nwho did nothing" below c1 gap 0.4 w 3.4 h 0.9 {.tone-1}
box c3 "3 · Internal procedures\nexhausted" below c2 gap 0.4 w 3.4 h 0.9 {.tone-1}
box c4 "4 · Evidence a reasonable\nobserver would accept" below c3 gap 0.9 w 3.4 h 0.9 {.tone-2}
box c5 "5 · Good reason it will\nprevent the harm" below c4 gap 0.4 w 3.4 h 0.9 {.tone-2}
brace perm over c1,c2,c3 side right "permissible" pad 0.4 {.muted}
brace obl over c4,c5 side right "obligatory" pad 0.4 {.muted}
:::

**Conditions one to three make whistle-blowing permissible.** Four and five
make it an *obligation*.

## exercise: Was Snowden justified? {.wide #snowden}

::: slide

- Apply De George's five conditions to the 2013 NSA disclosures.
- Which are clearly met? Which are contestable?
- Does your answer change if he had gone to Congress first?

:::

Snowden leaked to the Washington Post and the Guardian, revealing Tempora,
PRISM and XKeyscore. His critics call him a traitor; his defenders, a patriot.
The exercise is not to decide, but to *locate the disagreement* in De George's
list.

## closing: Thank you | next: privacy by design {#end}

Not to act is one way to react.
