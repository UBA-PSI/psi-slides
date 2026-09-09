---
title: The second time
subtitle: a short talk, written out word for word
presenter: psi-slides
cover: display
info: |
  psi-slides
  the reference talk for the cockpit's cue cards
lang: en
theme: light-red
collapse: none
auto-fit: true
section: outline
section-mark: Part
---

<!-- Why this lecture exists.

     The cockpit's cue-card mode (`K`) is for a talk that is written out word
     for word and carries almost nothing on its slides. None of the other
     lectures here is one: the tutorial's notes are examples of note syntax,
     and python-intro's are reminders to a lecturer who has the slides in
     front of him. A frame of either shows the rail and not the reason for it.

     So this is a talk. The notes are what a speaker would say, in the words
     he would say them, with the phrases he wants to see in bold and the
     `@mm:ss` marks he set while rehearsing. #second-time is the chunk the
     mode was built for: a figure with three `step` blocks and three notes
     pinned to those beats with `> note: from N`, so the rail interleaves
     cards and clicks and one press moves the cards and the projection in
     turn.

     docs/site/shoot.mjs photographs #second-time in four states for the
     project site. Its chunk ids are that script's contract: renaming one
     means renaming it there in the same commit.

     The subject is real and the numbers are the ordinary ones: a page fetched
     twice, and the second fetch answered without the network. -->

## title: {#cover}

Ninety milliseconds.

> note: @0:00 **This is a talk about one number.** I opened a page this morning and it took **1.4 seconds**. I pressed reload and it took **ninety milliseconds**. Same laptop, same page, same café wifi.
>
> **Fifteen times faster, and nothing had been optimised.** Nobody had shipped anything overnight.
>
> **[Pause. Let the number sit.]**
>
> The talk is about **where that difference went** – and about the part of the picture that was missing when I first drew it on the board.

# Where the time went

## free: {.center #two-numbers}

1.4 seconds. Then 90 milliseconds.

> note: @1:20 **Let me be precise about the two numbers**, because the rest of the hour hangs on them.
>
> **The first visit: 1.4 seconds.** A name looked up, a connection opened, a certificate checked, a request sent, a page built, the bytes sent back. **Six things, and each one costs.**
>
> **The second visit: ninety milliseconds.** The same six things would still cost the same. **So five of them did not happen.**

## free: What we say happens {.standard #story}

The browser asks. The server answers. The page appears.

> note: @2:40 **Ask anyone how the web works and you get three sentences.** The browser asks, the server answers, the page appears. **I teach it that way too**, and I am going to keep teaching it that way, because it is the right first picture.
>
> #### What a first picture is for
> **A first picture is not a lie. It is a picture with the exceptions left out**, and it earns its place by being small enough to hold in your head. The question is only whether anyone ever draws the second one.
>
> **Today we draw the second one**, for a page that was asked for twice.

# The request, twice

## figure: As I draw it on the board | six steps, left to right {.wide #board}

::: draw 132x40
default box {.tone-2} w 1.5 pad 0.16

box req "Request" at 0,0
box net "Network"                right of req gap 0.5
box srv "Server: builds the page" right of net gap 0.5 w 2.1
edge req -> net
edge net -> srv

text ok "1.4 s" below req gap 0.6 flush left {.left .muted}
:::

> note: @4:10 **This is the board version**, and it is the one I drew for years. **Three boxes, two arrows, and a number underneath.** The request leaves the machine, crosses the network, reaches a server, and the server builds the page.
>
> **Every measurement I made agreed with it** – as long as I measured the first visit. **1.4 seconds, and the picture accounts for all of it.**
>
> **[Point at the number.]** Now press reload. **Ninety milliseconds.** Which of these three boxes got fifteen times faster?

## figure: As it runs the second time | the request that stops early {.wide #second-time}

::: draw 132x54
default box {.tone-2} w 1.5 pad 0.16

box req "Request" at 0,0
box net "Network"                right of req gap 0.5
box srv "Server: builds the page" right of net gap 0.5 w 2.1
edge req -> net
edge net -> srv

box store "Browser cache" below net gap 1 flush left
box hit   "The answer,\nalready here" right of store gap 0.5 w 2.1
edge store -> hit
edge srv.bottom -> store.top {.dashed}

box stamp "a freshness date nobody reads" below store gap 0.7 flush left w 2.6
edge hit.bottom -> stamp.right {.dashed .elbow}

text src "“stale-while-revalidate” · RFC 5861" below stamp gap 0.5 flush left {.left .muted .small}

step quiet
  style srv {.dashed}
  dim srv
step local
  show store, hit
step dated
  show stamp, src

:::

> note: @6:15 **None of them did.**

> note: from 1
> **First press:** the **server never heard about the second visit**.

> note: from 2
> **Second press: the browser answered itself.** It had kept the page from the first visit, and it handed that copy back **without asking anyone**. Ninety milliseconds is what it costs to **look in a drawer you already have open**.

> note: from 3
> **Third press:** and beside the copy sits **a date**, saying how long it may be handed back before somebody has to ask again. **The copy is not the interesting part. The date is.**
>
> Now you can see **what the board version left out**: **no faster server, no better network**. **A drawer, a copy and a date** – and the date is the only thing in the picture that can be wrong.
>
> #### Where I stop being able to help
> **A slow page I can measure.** A page that is fast because it is **serving you something from Tuesday**, I cannot measure from here: it looks exactly like a page that is fast because it is good. **The two are the same ninety milliseconds.**
>
> **[Pause, let the two readings of the same number stand.]**
>
> And you are thinking: **then shorten the date.** Yes. And then the second visit costs 1.4 seconds again, and somebody files a ticket about **the page having got slower**. **The date is a decision, not a setting** – and it is made once, usually by whoever set up the server, usually on a Friday.

## question: {.standard #ask}

Which of your numbers is a measurement, and which is a copy?

> note: @9:30 **So here is the question I want you to take away**, and it works on anything you monitor, not only on a web page.
>
> **Which of your numbers is a measurement, and which one is a copy of a measurement?** A dashboard that is fast is not the same as a system that is well. **Somewhere there is a date on the copy**, and the useful question is who set it and when.
>
> **That is the whole talk.** Ninety milliseconds, a drawer, and a date.
