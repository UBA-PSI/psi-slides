---
title: Anonymous Communication
presenter: Dominik Herrmann
info: |
  Privacy and Security in Information Systems
  University of Bamberg
course: advasp
lecture: 07
lang: en
---

## title: {#title}

# Why mixes need a crowd {#crowd}

## principle: Anonymity is a property of the set | not of the channel {.wide #anon-set}

**Anonymity comes from the others doing the same thing.** A mix node that
forwards exactly one message leaks it by timing alone: the attacker needs a
clock, not cryptanalysis.

The size of the anonymity set is therefore a property of the **traffic**, not
of the protocol. Padding buys you set size; encryption alone buys you none.

::: margin
Pfitzmann and Hansen give the terminology this chapter follows.
:::

> note: Ask the room for the smallest set they would trust. Answers cluster
> around 100, and the reasoning is always worth two minutes.

## definition: Anonymity set {.standard #anon-def}

The anonymity set $S$ is the set of senders an observer cannot tell apart.
Its entropy gives the degree of anonymity:

$$ d = \frac{H(S)}{\log_2 |S|} $$

A set of one has degree zero, however much cryptography surrounds it.
