---
title: Python, from zero to a working scanner
subtitle: One session, one file, a tool you keep
presenter: Prof. Dr. Dominik Herrmann
info: |
  PSI-Sem-B · PSI-Sem-M
  SoSe 2026
course: psi-sem-sose26
lecture: python-intro
lang: en
cover: beside
cover-ratio: 34%
section: number
draw-defaults: |
  default text {.small}
---

## title: {#title}

::: draw 120x62
default box {.tone-1} w 1.55

box url   "a URL"             at 0,0 {.tone-2}
box br    "a real browser"    below url gap 0.7
box links "every link on it"  below br gap 0.7 {.tone-3}
box rep   "one line per page" below links gap 0.7 {.tone-2}
edge url -> br
edge br -> links
edge links -> rep
:::

## outline: The hour ahead {.wide #agenda}

Nine short parts: the last three build the tool, and the six before them are
the pieces it is made of.

> note: Short welcome. Ask who has written Python before and who has not. Say
> out loud that we end the session with a working CLI that crawls a website –
> everyone leaves with a tool, not with slides.

# What we are building {#welcome}

## free: A link-health scanner | under eighty lines, and you will have read them {.wide #what-you-will-build}

By the end of the session you will have a **small command-line tool** that
visits a URL, follows every link it finds on that page, and prints one line
about each page it touches.

::: cards 3
- **Broken links**\
  any response at or above 400, with the URL that produced it
- **Missing titles**\
  a page whose `<title>` came back empty
- **No description**\
  no `meta` description tag in the head
:::

**Most of what we cover today turns up in the final script.** By the last slide
you will be able to read it without stopping, and the parts that do not reach
the scanner – `pathlib` and `re` – are there because the next script needs them.

## free: What you already need | three boxes to tick before we start {.wide #prerequisites}

::: rows
- **Python 3.11 or newer** `python3 --version` in a terminal has to answer, and the answer has to start with a 3.11 or better
- **A terminal you are at home in** we install, activate and run from it all afternoon; which shell it is does not matter
- **The shape of a loop** a variable, a function and a `for` should be familiar ideas, even if the Python spelling is not
:::

Prior *Python* is not assumed. Prior programming in some language is. If that
last box is not ticked, pair up with someone whose is – the pace takes it for
granted.

## principle: Use a venv | from the very first import {.standard #venv-principle}

**Global Python belongs to the operating system**, not to your project. `pip
install` on the system interpreter edits a shared dependency tree that other
programs read from.

A **virtual environment** is a directory with its own interpreter and its own
`site-packages`. You activate it, install into it, throw it away. **Your
project stays reproducible, your machine stays clean.**

> note: The single most valuable sentence in a Python intro. If they remember
> nothing else from today, this is the one.

# Setting up {#setup}

## example: Setup with uv | the fast modern path {.wide #setup-uv}

::: side

`uv` is a **modern Python package manager** written in Rust. It replaces `pip`,
`virtualenv` and `pyenv` with one binary and an order of magnitude more speed.
Install it once, globally, or run the script on
[the uv site](https://docs.astral.sh/uv/).

```bash
pip install uv
# or: brew install uv
```

::: flip

Then, inside your project directory, create the venv, activate it, and install
the one dependency we need.

```bash
uv venv
source .venv/bin/activate
uv pip install playwright
```

:::

**The activation step is the one that matters.** After it, `python` and `pip`
resolve to the binaries inside `.venv/`, not to the ones on your system.

## example: Fallback with pip and venv | same result, a few seconds slower {.standard #setup-pip}

**If you cannot install `uv`, the venv module and pip ship with Python itself.**
They have done since 3.3 and 3.4 respectively, so there is nothing to install
before you start.

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install playwright
```

The difference that matters here is **speed**: uv resolves and installs in
parallel and caches aggressively, `pip` is sequential and cold-caches often. Pick one and
stay with it for the rest of the session.

::: expand deep-dive
**Why not `conda`?** Conda solves a different problem – reproducible *binary*
environments including C libraries, BLAS stacks, CUDA. For a pure-Python,
wheels-only stack like ours it is overkill and slower.

**Why not `poetry`?** Poetry is excellent for libraries you publish. For
single-file scripts and teaching material it adds ceremony without payoff.
`uv pip` covers 95% of the surface.
:::

## figure: What activation actually does | one directory, one line of `PATH` {.wide #venv-structure}

::: draw 150x58
default box {.tone-1 .mono}

text b "PATH before activate" at 0,0 {.left .muted}
box p1 "/usr/local/bin" below b gap 0.3 flush left
box p2 "/usr/bin" right of p1 gap 0.22 same as p1

text a "PATH after activate" below p1 gap 1.15 flush left {.left .muted}
box v  ".venv/bin" below a gap 0.3 flush left same as p1 {.tone-4}
box q1 "/usr/local/bin" right of v gap 0.22 same as p1
box q2 "/usr/bin" right of q1 gap 0.22 same as p1

text n "python and pip are found here first" below v gap 0.55 -- v {.muted}

step activated
  show a, v, q1, q2, n
:::

**Activation prepends one directory to `PATH`.** Deactivating restores the
`PATH` it saved. There is no global state change, no service and no daemon –
only a directory you are free to delete.

# The language itself {#fundamentals}

## definition: Variables carry values | names do not carry types {.standard #variables-and-types}

**Python is dynamically typed.** A name is bound to a value, and the value
carries its own type. The same name can point at an `int` on one line and a
`str` on the next, although that is usually a bug rather than a feature.

```python
name = "Ada"       # str
age = 36           # int
pi = 3.14159       # float
ready = True       # bool
unknown = None     # NoneType
```

The built-in **`type(x)`** tells you what you are holding right now;
**`isinstance(x, str)`** answers the question you usually actually have.

::: expand None-vs-False
`None` is **not** the same as `False`. `None` is the absence of a value;
`False` is a boolean.

```python
if x is None:   # explicitly unset
    ...
if not x:       # any falsy value
    ...
```

The two guards mean different things the moment `x` can legitimately be `0` or
an empty string. Use `is None` when you care about “was this ever assigned”,
`not x` when you care about “is there anything useful in here”.
:::

## example: F-strings | self-documenting prints for debugging {.standard #fstrings}

**F-strings are the modern way to build a string.** A leading `f` tells Python
to evaluate the expressions inside `{}` braces and insert the results.

```python
name = "Ada"
age = 36
print(f"{name} is {age} years old.")
print(f"Next birthday: {age + 1}.")
print(f"{name=}, {age=}")
```

The last form – an `=` inside the braces – prints **both the expression and its
value**: `name='Ada', age=36`. It exists for one purpose, throwaway debug
prints that are still readable three weeks later.

::: expand format-spec
**F-strings carry the whole format-spec mini-language** after a colon:
alignment, padding, precision, thousands separators, type-specific formatting.

```python
f"{1234567:>12,}"    # thousands, padded
f"{3.14159:.2f}"     # 2 decimals
f"{0.1 + 0.2:.17f}"  # full precision
f"{255:08b}"         # binary, 8 digits
```

Worth remembering the two or three you use weekly; look the rest up.
:::

## free: The four core collections | each one answers a different question {.wide #collections}

::: rows
- **`list`** ordered and mutable, for a run of things whose order means something: `urls = ["a", "b"]`
- **`tuple`** ordered and immutable, for a fixed-shape record: `(lat, lon)`, `(host, port)`
- **`dict`** a map from keys to values, for a record with more fields than you can unpack: `{"status": 200}`
- **`set`** unordered and unique, for membership tests and deduplication: `seen.add(url)`
:::

The scanner uses a `set` so that it never visits one URL twice, and a `dict` in
its place would say something the code does not mean.

## example: Collection operations | boringly similar across all four {.standard #collection-ops}

**Most operations look the same on lists, tuples, dicts and sets.** `in` tests
membership, `len()` gives the size, iteration yields elements – for a dict, its
keys. The differences are in *mutation* and in *shape*.

```python
urls = ["https://a.com", "https://b.com"]
urls.append("https://c.com")
"https://a.com" in urls        # True

seen = {"https://a.com"}
seen.add("https://b.com")

page = {"url": "https://a.com", "status": 200}
page["title"] = "A"   # dicts grow by assignment
```

## example: Control flow | indentation is the block delimiter {.standard #control-flow}

**Python uses indentation where other languages use braces.** Four spaces per
level – what PEP 8 asks for and what `black` and `ruff format` produce. No
`end`, no `}`, no semicolons.

```python
status = 404

if status == 200:
    print("ok")
elif 300 <= status < 400:
    print("redirect")
else:
    print("problem")
```

**`elif` is the Python spelling of `else if`.** There is no separate keyword and
no `switch`.

---

**A `for` loop walks an iterable, never an index.** `continue` skips to the next
item, `break` leaves the loop entirely, and both do what you expect.

```python
for url in urls:
    if "localhost" in url:
        continue
    print(url)
```

::: expand match
**`match` has been available since Python 3.10** for structural pattern
matching: it destructures data and dispatches on shape.

```python
match page:
    case {"status": 200, "title": title}:
        print(f"ok: {title}")
    case {"status": status} if status >= 400:
        print(f"error: {status}")
    case _:
        print("unknown shape")
```

Useful, but `if`/`elif` covers 90% of cases. Reach for `match` when you have
four or more shapes to tell apart.
:::

## example: Functions with type hints | optional, and you should write them anyway {.wide #functions}

::: side

**Define a function with `def`**, annotate the parameters and the return type,
and you have documentation the editor can read. **Hints are not enforced at
runtime** – they are advisory.

```python
def greet(
    name: str,
    loud: bool = False,
) -> str:
    end = "!" if loud else "."
    return f"Hello, {name}{end}"
```

::: flip

**Call it like any other function.** Positional arguments first, keyword
arguments after them, and defaults let a caller leave out what it does not
need. A signature too long for one line wraps one parameter per line with a
trailing comma – the form `black` and `ruff format` both produce.

```python
greet("Ada")
# Hello, Ada.
greet("Ada", loud=True)
# Hello, Ada!
greet(name="Ada")
# same call, keyword form
```

:::

**Type hints are documentation that a machine reads.** `ruff` or `mypy` flags a
mismatch before the code runs, and your future self is the one who benefits.

# Idioms worth having {#more-python}

## example: Comprehensions | one line from an iterable {.standard #comprehensions}

**A comprehension builds a list, a dict or a set out of an existing iterable in
one expression.** It reads as “this element, for each item in that source,
optionally filtered”.

```python
urls = ["https://a.com/", "https://b.com", "mailto:x@y"]

https_only = [u for u in urls if u.startswith("https://")]
lengths = {u: len(u) for u in https_only}
domains = {u.split("/")[2] for u in https_only}
```

**Prefer a comprehension to a for-loop with `.append()`.** It is more compact,
a little faster, and it says which of two things you are doing: building a
collection, rather than performing side effects.

::: expand generators
**A generator expression is a comprehension without the brackets.** It produces
its values lazily, one at a time, instead of materialising the whole list.

```python
total = sum(len(u) for u in urls)   # no intermediate list
first_https = next(u for u in urls if u.startswith("https://"))
```

Use one when the result goes straight into `sum`, `min`, `max`, `any`, `all` or
`next`. Use a list comprehension when you need every value at once.
:::

> note: Write the for-loop version on the board first and let them convert it.
> The nesting order trips people up: `for` clauses read left to right, the same
> order they would be written as nested loops. Two levels is the limit worth
> teaching; deeper than that a loop is clearer, and I say so.

## example: Exceptions | errors are values you catch and inspect {.standard #exceptions}

**Exceptions are Python’s error channel.** When something goes wrong a function
*raises* one; a caller further up the stack *catches* it with `try`/`except`
and decides what to do.

```python
try:
    value = int(user_input)
except ValueError as exc:
    print(f"Not a number: {exc}")
    value = 0
```

The **`as exc`** clause binds the exception object to a name so that you can
inspect it. Drop it when you only care *that* something failed and not *what*
failed: `except ValueError:`.

::: expand bare-except
**Never write `except:` with no type after it.** A bare `except` swallows every
exception, `KeyboardInterrupt` and `SystemExit` included, so `Ctrl-C` stops
working and the process cannot be killed cleanly.

```python
try:
    ...
except Exception:    # ok – still lets Ctrl-C through
    ...
except:              # never do this
    ...
```

If you do want everything, write `except Exception:`. It covers all
*program* errors and leaves the interpreter’s own signals intact.
:::

## principle: Read a traceback from the bottom | the last line is the failure {.standard #read-errors-principle}

**The last line of a traceback names the actual failure.** Everything above it
is the chain of calls that led to that line. Start at the bottom, read one
frame upwards at a time, and stop at the first frame that is your own code.

# The standard library {#stdlib}

Five modules – `pathlib`, `urllib.parse`, `re`, `dataclasses`, `argparse` –
and three of them end up in the scanner.

## question: Why lean on the standard library? | a dependency is a liability {.narrow #why-stdlib}

**A `pip install` is a future maintenance cost.** Transitive dependencies,
security patches, breaking releases – they land on your plate. The
[standard library](https://docs.python.org/3/library/) is already there,
already audited, already installed with Python itself.

> note: The formulation is roughly Hynek Schlawack's; name the source if the
> room cares. The point to leave standing: every pip install is a future
> maintenance cost.

## example: pathlib | paths are objects, not strings {.standard #pathlib}

**`pathlib` replaces string surgery on paths with path objects.** The `/`
operator joins segments, and `.read_text()`, `.mkdir(parents=True)` and
`.glob()` do what their names say.

```python
from pathlib import Path

here = Path(__file__).parent
report = here / "out" / "report.txt"
report.parent.mkdir(parents=True, exist_ok=True)
report.write_text("hello\n")

for md in here.glob("**/*.md"):
    print(md.relative_to(here))
```

**Cross-platform correctness costs no extra code.** `Path` normalises slashes
and drive letters, so the same lines run on Linux, macOS and Windows with no
`os.path.join` gymnastics.

## example: urllib.parse | URL surgery without regex {.wide #urllib-parse}

**Do not parse a URL with a regex.** `urllib.parse` already knows about schemes, userinfo, punycode hosts, default ports and path
normalisation.

::: cols 2

**`urlparse`** splits a URL into named parts – scheme, netloc, path, query,
fragment – which you then read by attribute.

```python
from urllib.parse import urlparse

u = urlparse("https://example.com/a?x=1")
u.scheme   # "https"
u.netloc   # "example.com"
u.path     # "/a"
```

**`urljoin`** resolves a relative reference against a base URL, exactly the way
a browser does when it meets an `<a href>`.

```python
from urllib.parse import urljoin

urljoin("https://ex.com/a/", "b/c")  # .../a/b/c
urljoin("https://ex.com/a/", "/d")   # .../d
```

:::

The scanner uses both: **`urljoin` to make a relative link absolute**, and
**`urlparse` to check that it stays on the same host** before we visit it.

## example: re | just enough regex {.standard #re}

**Reach for `re` when pattern matching is the right tool, and not before.** If
what you need is “starts with” or “contains”, then `str.startswith`,
`str.endswith` and `in` are faster to write and faster to read.

```python
import re

pattern = re.compile(r"^https?://")
pattern.match("https://example.com")   # Match object
pattern.match("mailto:x@y")            # None
```

**Compile once, match many.** `re.compile` hands back a compiled pattern, and
calling `.match()` on it skips the compile step every time round the loop.

::: marginalia
The `r` in `r"^https?://"` is a **raw string**: backslashes stay backslashes.
Without it, every `\d` in a pattern has to be written `\\d`, and one day one of
them will not be.
:::

## example: dataclasses | classes that are mostly data {.wide #dataclasses}

::: side

**`@dataclass` writes `__init__`, `__repr__` and equality for you** from the
field annotations. Less boilerplate, and so fewer bugs in the boilerplate you
did not write.

```python
from dataclasses import dataclass

@dataclass
class PageReport:
    url: str
    status: int
    title: str | None
    has_description: bool
```

::: flip

**The generated `__init__` takes every field as a keyword argument.** `__repr__`
prints them all, and equality compares them all. This exact class is the one
the scanner fills in for every page it visits.

```python
r = PageReport(
    url="https://ex.com",
    status=200,
    title="Example",
    has_description=True,
)
print(r)
# PageReport(url='https://ex.com'...)
```

:::

## example: argparse | the `--help` you never wrote, in three lines {.standard #argparse}

**`argparse` turns a list of argument descriptions into a whole CLI.** Help
text, type coercion, default values and error messages are all generated from
the `add_argument` calls.

```python
import argparse

p = argparse.ArgumentParser(description="Scan a page for link health.")
p.add_argument("url", help="URL to start from")
p.add_argument("--max", type=int, default=20, help="max links")
args = p.parse_args()

print(args.url, args.max)
```

**`python scanner.py --help` already works.** Three lines of setup, and the
user has a standards-conforming CLI with Unix-style flags and a readable usage
block.

# Waiting well {#async}

The scanner spends its time waiting for somebody else.

## principle: Async is for I/O, not for CPU | overlapping waits, not overlapping work {.standard #async-principle}

**A network call spends nearly all of its time waiting, so $n$ of them run one
after another cost $T_{\text{seq}} = \sum_i t_i$ and the same $n$ started
together cost only the longest of them.**

$$
T_{\text{conc}} \approx \max_i t_i
$$

**It does not make CPU-bound code faster.** There is nothing to overlap when
the thread is busy rather than idle – for that you need processes.

## definition: The event loop | a scheduler for coroutines {.standard #event-loop}

**An event loop is a scheduler that runs coroutines** – functions that can
pause at an `await` and resume later. While one coroutine waits for a network
response, the loop runs another. **One thread, many overlapping waits.**

You rarely touch the loop directly. **`asyncio.run(main())` starts it**, runs
your top-level coroutine to completion, and shuts it down again.

::: expand coroutine-vs-function
**A coroutine looks like a function and behaves differently when called.**
Calling an `async def` function does not run its body – it hands back a
*coroutine object* standing for the work to be done.

```python
async def fetch():
    return 42

x = fetch()               # not 42 – a coroutine object
x = await fetch()         # 42 – only inside async def
x = asyncio.run(fetch())  # also 42, but starts its own loop
```

Forgetting the `await` is the commonest async bug. Python warns about “coroutine
was never awaited”, but only once the object is collected without having been
awaited – which is not always.
:::

## example: async and await | three waits, one second in total {.wide #async-await}

**`async def` defines a coroutine and `await` suspends it** until the awaited
operation finishes. `asyncio.gather` starts several at once and waits for all
of them.

```python
import asyncio

async def fetch(name: str, delay: float) -> str:
    await asyncio.sleep(delay)  # a network call, pretend
    return f"done: {name}"

async def main() -> None:
    results = await asyncio.gather(
        fetch("a", 1.0),
        fetch("b", 1.0),
        fetch("c", 1.0),
    )
    print(results)

asyncio.run(main())
```

**Three one-second sleeps, total runtime about one second.** The three waits
overlapped instead of queueing up behind one another.

::: expand gather-vs-taskgroup
**Since Python 3.11 `asyncio.TaskGroup` is the preferred alternative to
`gather`.** It uses `async with` to guarantee that every task either finishes
or is cancelled, so no task leaks when one of them raises.

```python
async with asyncio.TaskGroup() as tg:
    t1 = tg.create_task(fetch("a", 1.0))
    t2 = tg.create_task(fetch("b", 1.0))
# results available as t1.result(), t2.result() here
```

`gather` is still fine for simple cases; `TaskGroup` is the right answer once
exception handling matters.
:::

## figure: One thread, many overlapping waits {.full #async-timeline}

::: draw 150x62
default box {.tone-3} w 1.15 h 0.6

text s "blocking: the thread waits" at 0,0 {.left .muted}
box s1 "wait a" below s gap 0.35 flush left
box s2 "wait b" right of s1 gap 0.07 same as s1
box s3 "wait c" right of s2 gap 0.07 same as s1
brace bs over s1,s2,s3 "about three seconds" side bottom pad 0.28 {.muted}

text c "awaiting: the thread is handed back" below s1 gap 1.9 flush left {.left .muted}
box a1 "wait a" below c gap 0.35 flush left same as s1 {.tone-4}
box a2 "wait b" below a1 gap 0.09 same as s1 {.tone-4}
box a3 "wait c" below a2 gap 0.09 same as s1 {.tone-4}
brace ba over a3 "about one second" side bottom pad 0.28 {.muted}

step overlapping
  show c, a1, a2, a3, ba
:::

**The same three calls and the same single thread.** What changes is who gets
to run while somebody else waits: three one-second waits started together
finish in $\max(1, 1, 1) = 1$ second.

# Driving a real browser {#playwright}

## free: Why Playwright | the modern web is rendered, not served {.wide #why-playwright}

::: cols 2

**A lot of the web is rendered by JavaScript in the browser.** **`requests` and plain `urllib` see only the HTML shell** – often just `<div id="app"></div>` plus a pile of script tags. The text, the links and the title are not in it.

**Playwright drives a real browser** – Chromium, Firefox, or WebKit – over a debugging protocol. The page renders, scripts execute, the DOM settles, and then you query it. You see what a human sees.

**For a link scanner this matters a lot.** Navigation on many real sites is built client-side: menus, footers, and even the main content are injected after load. A scanner that speaks HTTP and nothing else does not see that navigation.

**The cost is weight.** A browser is a hundred megabytes of binaries and a few hundred of RAM per instance. For a lecture scanner that is fine; for a production crawler you would measure first.

:::

::: footnote
`requests` is still the right tool for an API that answers in JSON. The
browser is for pages meant to be looked at.
:::

> note: Show the difference live if the room is awake: open a JS-heavy site,
> curl it, and let them find the missing text themselves. Ninety seconds, and
> nobody asks again why a scanner needs a browser.

## example: Install the browser once | Playwright pins the build {.narrow #playwright-install}

**After `pip install playwright` you still need the browser itself.** Playwright ships a small CLI to download a pinned Chromium build into its cache.

```bash
playwright install chromium
```

**Pinned means reproducible.** The next developer on the project runs the same command and gets the *same* Chromium version, not whatever ships with today’s operating system.

## example: Open a page | the smallest useful Playwright script {.wide #playwright-first-page}

**Open a context, launch a browser, navigate, query, close.** `async with`
guarantees the cleanup even if the page raises.

```python
import asyncio
from playwright.async_api import async_playwright

async def main() -> None:
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        await page.goto("https://example.com")
        print(await page.title())
        await browser.close()

asyncio.run(main())
```

**There is an `await` on every browser call.** Each one is a round trip over a
socket to the browser process, so each one is an I/O wait – which is exactly
what async is for.

::: expand headless-vs-headed
**`p.chromium.launch()` runs headless by default** – no visible window, faster,
suitable for CI. For debugging, launch with a window and in slow motion.

```python
browser = await p.chromium.launch(
    headless=False,
    slow_mo=200,        # ms between actions
)
```

Headed mode is invaluable when a selector or a timing bug reproduces only
against real rendering. Flip back to headless once the bug is fixed.
:::

## example: Extract all links | `page.evaluate` bridges Python and JS {.standard #playwright-links}

**`page.evaluate` runs JavaScript inside the page** and returns the result as
plain Python data. Anything JSON-serialisable crosses the boundary.

```python
hrefs = await page.evaluate("""
  () => Array.from(document.querySelectorAll('a[href]'))
             .map(a => a.href)
""")
```

**`hrefs` comes back as a Python list of strings, already absolute.** The
browser resolves a relative `<a href>` against the current page URL before it
hands them over.

# The scanner {#scanner}

## free: What we are building | one file, four steps {.full #scanner-spec}

**`scanner.py` is a single file, under eighty lines, and it does four things.**

::: cards 4 {.small}
- **Take a URL**\
  from the command line, plus an optional `--max`
- **Open it**\
  in Chromium, and read every link on the page
- **Visit each one**\
  status, title, description
- **Print**\
  one line per page, flags first
:::

**Simple before fast**: the loop over the links is sequential, and making it
concurrent is the first exercise at the end.

**Nothing beyond Playwright**: everything else in the file is `urllib.parse`,
`argparse` and `dataclasses`.

## figure: How the scanner runs | one pass over the page, then one visit per link {.full #scanner-pipeline}

::: side 2:3 {.middle}

::: draw 132x60
default box {.tone-1} w 2.05

# A label reads `_` as subscript syntax, so no identifier with an underscore
# goes in a box here. The prose beside the figure names the functions.
box arg  "the arguments\na URL and --max" at 0,0
box open "a browser\nand the starting page" below arg gap 0.55
box coll "every link on that page\nabsolute, same host, deduped" below open gap 0.55 {.tone-3}
box scan "one visit per link\nstatus, title, description" below coll gap 0.95 {.tone-3}
box row  "one PageReport each" below scan gap 0.5 {.tone-2}
box out  "one printed line each" below row gap 0.95 {.tone-2}
edge arg -> open
edge open -> coll
edge coll -> scan
edge scan -> row
edge row -> out
container loop "for each link" over scan,row pad 0.38 {.dashed .muted}

step first-pass
  emph arg, open, coll
step per-link
  dim arg, open, coll
  emph scan, row
step report
  dim scan, row
  emph out
:::

::: flip

**The first pass runs once.** Parse the arguments, launch Chromium, open the
starting page, and read every `<a href>` out of the rendered DOM. `urljoin`
makes each one absolute, `urlparse` throws away anything on another host, and
`dict.fromkeys` removes the duplicates while keeping the order.

**The middle block runs once per link.** `page.goto` hands back a response,
which is where the status comes from; `page.title()` and one `page.evaluate`
supply the other two fields. Each visit produces one `PageReport`.

**The last line runs once again.** The reports are printed in the order they
were collected, flags first, so the output can be filtered with `grep`.

:::

## figure: `scanner.py` | the whole tool, in one file {.full #scanner-source}

```python
import argparse
import asyncio
from dataclasses import dataclass
from urllib.parse import urljoin, urlparse

from playwright.async_api import async_playwright


@dataclass
class PageReport:
    url: str
    status: int | None
    title: str | None
    has_description: bool


async def scan_page(page, url: str) -> PageReport:
    response = await page.goto(url, wait_until="domcontentloaded")
    status = response.status if response else None
    title = await page.title()
    has_desc = await page.evaluate(
        "() => !!document.querySelector('meta[name=\"description\"]')"
    )
    return PageReport(url=url, status=status, title=title or None,
                      has_description=has_desc)


async def collect_links(page, base_url: str) -> list[str]:
    hrefs = await page.evaluate(
        "() => Array.from(document.querySelectorAll('a[href]'))"
        "       .map(a => a.href)"
    )
    origin = urlparse(base_url).netloc
    return [urljoin(base_url, h) for h in hrefs
            if urlparse(h).netloc == origin]


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("url")
    parser.add_argument("--max", type=int, default=20)
    args = parser.parse_args()

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        await page.goto(args.url, wait_until="domcontentloaded")
        links = await collect_links(page, args.url)
        links = list(dict.fromkeys(links))[: args.max]

        reports = [await scan_page(page, url) for url in links]
        await browser.close()

    for r in reports:
        flags = []
        if r.status is None or r.status >= 400:
            flags.append(f"status={r.status}")
        if not r.title:
            flags.append("no-title")
        if not r.has_description:
            flags.append("no-description")
        marker = " ".join(flags) if flags else "ok"
        print(f"{marker:<40} {r.url}")


if __name__ == "__main__":
    asyncio.run(main())
```

**The whole file is built out of what the last four parts put on the slides.** A
dataclass for the report row, type hints for documentation, `async`/`await` for
the I/O, `urljoin` and `urlparse` for the URL surgery, `argparse` for the CLI.
About 55 lines, end to end.

::: expand whats-missing
**Four things this version does *not* do**, each of them an exercise at the end:

- no retry and no timeout, so one slow page blocks the whole scan;
- no concurrency, just a sequential `for` over `links`;
- no output format beyond printing to stdout;
- no `robots.txt` check – we assume we are allowed to crawl.

The eighty-line target leaves room for one happy-path read-through;
production hardening doubles the line count and changes nothing about the core
logic.
:::

## example: Running it | pipe it into grep for the interesting cases {.standard #scanner-run}

```bash
python scanner.py https://example.com --max 10
```

**The output is `grep`-friendly**: one line per page, flags first and the URL
last, so `grep -v '^ok'` leaves only the pages with a problem.

```
ok                                       https://example.com/
no-description                           https://example.com/about
status=404 no-title                      https://example.com/oops
```

# Wrap-up {#wrap-up}

## principle: A small script you understand beats a framework you do not {.standard #small-scripts-principle}

**Fifty lines you can read end to end are worth more than five hundred you
cannot.** The bar for a real tool is far lower than the ecosystem suggests:
the standard library, one dependency, type hints and `asyncio.run` is already a
real tool.

## exercise: Extend the scanner | pick one, or two if you are bored {.wide #exercise-extend}

**Each extension is ten to thirty extra lines**, and each uses only what we
covered today plus one standard-library module you have not touched yet.

::: rows {.small}
- **Concurrency** replace the sequential loop with `asyncio.gather` over `scan_page`, behind a semaphore that caps it at five. Time both versions against one site
- **One hop outwards** add `--external` and follow links off the host, politely: one request per host per second, tracked in a `dict` of host to timestamp
- **A CSV report** add `--out report.csv` and use the `csv` module; the field names come from `dataclasses.fields(PageReport)`
- **Broken images** collect `<img src>` as well, fetch each one, and flag anything that is not a 2xx. `data:` and `blob:` URLs are fine as they are
:::

> note: Close by asking each student which extension they will try first. That
> commitment is what turns the slide into homework.

## closing: That is the whole tool | questions, and then the terminal {#end}

The tool is one file you can read in five minutes. The next thing to read is
the
[Playwright Python guide](https://playwright.dev/python/docs/intro).
