---
title: Python, from zero to a working scanner
presenter: Prof. Dr. Dominik Herrmann
info: |
  A practical introduction to Python
  PSI-Sem-B · PSI-Sem-M
  SoSe 2026
course: psi-sem-sose26
lecture: python-intro
---

## title: {#title}

# Welcome {#welcome}

> note: Short welcome, ask who has written Python before and who hasn't. Tell the room we will end the session with a working CLI that crawls a website. Everyone leaves with a tool, not just slides.

## principle: Use a venv | always, from the very first import {.narrow #venv-principle}

**Global Python belongs to the operating system**, not to your project. `pip install` on the system interpreter edits a shared dependency tree that other programs read from.

A **virtual environment** is a directory with its own interpreter and its own `site-packages`. You activate it, install into it, throw it away. Your project stays **reproducible**, your machine stays **clean**.

> note: The single most valuable sentence in a Python intro. If students remember nothing else from today, this is the one.

## free: What you will build | a link-health scanner, under 80 lines {.wide #what-you-will-build}

By the end of this session you will have a **small command-line tool** that visits a URL, follows every link it finds, and prints a short report for each page it touches. Broken links, missing titles, and missing meta descriptions all get flagged on one line each.

::: cols 2

The tool is **short**: under 80 lines of Python. It is **real**: it drives an actual Chromium browser under the hood, so it sees JavaScript-rendered pages the way a human does.

We will build it up **piece by piece**. Each topic in this lecture contributes one or two lines of the final script. By the last slide you will be able to trace every character of the scanner back to something you have already seen.

:::

## free: What you already need | three boxes to tick before we start {.wide #prerequisites}

::: side

**You bring:** Python **3.11 or newer**, a terminal you are comfortable in, and roughly **three hours of patience**. Prior Python experience is not required; prior programming experience in any language is.

::: flip

**You should already know** what a variable, a function, and a loop are. The shape of an `if` and a `for` should feel familiar even if the syntax does not. If not, pair with someone who does – the pace assumes this baseline.

:::

# Setup {#setup}

## example: Setup with uv | the fast modern path {.wide #setup-uv}

::: side

`uv` is a **modern Python package manager** written in Rust. It replaces `pip`, `virtualenv`, and `pyenv` with one binary and an order of magnitude more speed. Install it once, globally.

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

::: flip

Then inside your project directory, create the venv, activate it, and install the one dependency we need.

```bash
uv venv
source .venv/bin/activate
uv pip install playwright
```

:::

The **activation step** matters. After it, `python` and `pip` resolve to the binaries inside `.venv/`, not the ones on your system.

## example: Fallback with pip and venv | same result, a few seconds slower {.standard #setup-pip}

**If you cannot install `uv`, the stdlib has everything you need.** Both the venv module and pip ship with Python itself since 3.3 and 3.4 respectively – no extra tool required.

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install playwright
```

The only difference is **speed**: uv resolves and installs dependencies in parallel and caches aggressively; `pip` is sequential and cold-caches often. Pick one and stick with it for the rest of the session.

::: expand deep-dive
**Why not `conda`?** Conda solves a different problem – reproducible *binary* environments including C libraries, BLAS stacks, CUDA. For pure-Python or wheels-only stacks like ours, it is overkill and slower.

**Why not `poetry`?** Poetry is excellent for libraries you publish. For single-file scripts and teaching material, it adds ceremony without payoff. `uv pip` covers 95% of the surface.
:::

## figure: What a venv actually looks like on disk {.wide #venv-structure}

![venv directory layout](venv-layout)

The **activation script** rewrites your shell's `PATH` so `.venv/bin/` comes first. Deactivating just restores the previous `PATH`. There is no global state change, no service, no daemon – only a directory.

# Python fundamentals {#fundamentals}

## definition: Variables carry values | names do not carry types {.standard #variables-and-types}

**Python is dynamically typed.** A name is bound to a value, and the value carries its own type. The same name can point at an `int` on one line and a `str` on the next, although that is usually a bug, not a feature.

```python
name = "Ada"       # str
age = 36           # int
pi = 3.14159       # float
ready = True       # bool
unknown = None     # NoneType
```

The built-in **`type(x)`** tells you what you are holding right now; **`isinstance(x, str)`** answers the question you usually actually have.

::: expand None-vs-False
`None` is **not** the same as `False`. `None` is the absence of a value; `False` is a boolean.

```python
if x is None:   # explicitly unset
    ...
if not x:       # any falsy value
    ...
```

The two guards mean different things the moment `x` can legitimately be `0` or an empty string. Use `is None` when you care about "was this ever assigned", `not x` when you care about "is there anything useful here".
:::

## example: F-strings | self-documenting prints for debugging {.standard #fstrings}

**F-strings are the modern way to build strings.** A leading `f` tells Python to evaluate expressions inside `{}` braces and insert the result.

```python
name = "Ada"
age = 36
print(f"{name} is {age} years old.")
print(f"Next birthday: {age + 1}.")
print(f"{name=}, {age=}")
```

The last form – adding `=` inside the braces – prints **both the expression and its value**. `name='Ada', age=36`. It exists for one reason only: throwaway debug prints that are still readable three weeks later.

::: expand format-spec
**F-strings carry the full format-spec mini-language** after a colon: alignment, padding, precision, thousands separators, and type-specific formatting.

```python
f"{1234567:>12,}"    # thousands, padded
f"{3.14159:.2f}"     # 2 decimals
f"{0.1 + 0.2:.17f}"  # full precision
f"{255:08b}"         # binary, 8 digits
```

Worth remembering the two or three you use weekly; look the rest up when needed.
:::

## free: The four core collections | each one answers a different question {.wide #collections}

::: cols 2

**`list`** is an **ordered, mutable** sequence. Use it when order matters and the contents change: `urls = ["a", "b", "c"]`. The workhorse for "a bunch of things in a row".

**`tuple`** is an **ordered, immutable** sequence. Use it for fixed-shape records: `(lat, lon)`, `(host, port)`. Unpacks neatly into multiple names in one line.

**`dict`** is a **key-value map**. `{"host": "example.com", "port": 443}`. The workhorse for structured records when you have more than three fields and unpacking stops being readable.

**`set`** is an **unordered, unique** bag. Use it for **membership checks** and **deduplication** – `seen = set(); seen.add(url)`. The scanner uses one to avoid visiting the same URL twice.

:::

## example: Collection operations | boringly similar across all four {.standard #collection-ops}

**Most operations look the same on lists, tuples, dicts, and sets.** `in` tests membership, `len()` gives size, iteration yields elements (for dicts: keys). The differences are in *mutation* and *shape*.

```python
urls = ["https://a.com", "https://b.com"]
urls.append("https://c.com")
"https://a.com" in urls        # True

seen = {"https://a.com"}
seen.add("https://b.com")

page = {"url": "https://a.com", "status": 200}
page["title"] = "A"            # dicts grow by assignment
```

## example: Control flow | indentation is the block delimiter {.standard #control-flow}

**Python uses indentation instead of braces.** Four spaces per level is the convention, enforced by every editor and lint tool. No `end`, no `}`, no semicolons.

```python
status = 404

if status == 200:
    print("ok")
elif 300 <= status < 400:
    print("redirect")
else:
    print("problem")

for url in urls:
    if "localhost" in url:
        continue
    print(url)
```

The **`continue`** and **`break`** keywords do what you expect. `elif` is the Python spelling of `else if` – no separate keyword.

::: expand match
**`match`** is available since Python 3.10 for structural pattern matching: it destructures data and dispatches on shape.

```python
match page:
    case {"status": 200, "title": title}:
        print(f"ok: {title}")
    case {"status": status} if status >= 400:
        print(f"error: {status}")
    case _:
        print("unknown shape")
```

Useful, but `if`/`elif` covers 90% of cases. Reach for `match` when you have four or more shapes to discriminate.
:::

## example: Functions with type hints | optional, but you should add them {.wide #functions}

::: side

**Define a function with `def`**, annotate parameters and return type, and you get documentation the editor can read. Hints are **not enforced at runtime** – they are advisory.

```python
def greet(name: str, excited: bool = False) -> str:
    suffix = "!" if excited else "."
    return f"Hello, {name}{suffix}"
```

::: flip

**Call it like any other function.** Positional arguments first, then keyword arguments. Defaults let callers omit what they don't need.

```python
greet("Ada")                  # "Hello, Ada."
greet("Ada", excited=True)    # "Hello, Ada!"
greet(name="Ada")             # same, keyword form
```

:::

**Type hints are documentation that compiles.** A linter like `ruff` or a type checker like `mypy` reads them and flags mismatches before the code runs. Your future self will thank you.

# More Python {#more-python}

## example: Comprehensions | one line from an iterable {.standard #comprehensions}

**Comprehensions build a list, dict, or set from an existing iterable in a single expression.** They read like "{element} for each item in source, optionally filtered".

```python
urls = ["https://a.com/", "https://b.com", "mailto:x@y"]

https_only = [u for u in urls if u.startswith("https://")]
lengths = {u: len(u) for u in https_only}
domains = {u.split("/")[2] for u in https_only}
```

**Prefer a comprehension over a for-loop with `.append()`.** The comprehension form is more compact, slightly faster, and signals intent: "I am building a collection", not "I am performing side effects".

::: expand generators
**A generator expression is a comprehension without the brackets.** It produces values lazily, one at a time, instead of materializing the whole list in memory.

```python
total = sum(len(u) for u in urls)   # no intermediate list
first_https = next(u for u in urls if u.startswith("https://"))
```

Use a generator when you feed the result straight into `sum`, `min`, `max`, `any`, `all`, or `next`. Use a list comprehension when you actually need to hold all values at once.
:::

## example: Exceptions | errors are values you catch and inspect {.standard #exceptions}

**Exceptions are Python's error channel.** When something goes wrong, a function *raises* an exception; a caller further up the stack *catches* it with `try`/`except` and decides what to do.

```python
try:
    value = int(user_input)
except ValueError as exc:
    print(f"Not a number: {exc}")
    value = 0
```

The **`as exc`** clause binds the exception object to a name so you can inspect it. Drop it when you only care *that* something failed, not *what* failed: `except ValueError:`.

::: expand bare-except
**Never write `except:` without specifying a type.** A bare `except` swallows every exception, including `KeyboardInterrupt` and `SystemExit`, which means `Ctrl-C` stops working and the process cannot be killed cleanly.

```python
try:
    ...
except Exception:    # ok – still lets Ctrl-C through
    ...
except:              # never do this
    ...
```

If you genuinely want to catch everything, write `except Exception:` – it covers all *program* errors while leaving interpreter-level signals intact.
:::

## principle: Read tracebacks from the bottom | the last line is the failure {.narrow #read-errors-principle}

**The last line of a traceback names the actual failure.** Everything above it is the chain of calls that *led* to that line. Start at the bottom, read one frame up at a time, and stop at the first frame that is your own code.

# The standard library {#stdlib}

## question: Why lean on the standard library? | a dependency is a liability {.narrow #why-stdlib}

**Every `pip install` is a future maintenance cost.** Transitive deps, security patches, breaking releases – all of it on your plate. The standard library is already there, already audited, already installed with Python itself.

> note: Quote is roughly Hynek Schlawack's. Worth naming the source if the room cares. Main point: every pip install is a future maintenance cost. The stdlib is already there.

## example: pathlib | paths are objects, not strings {.standard #pathlib}

**`pathlib` replaces string path manipulation with path objects.** The `/` operator joins segments; methods like `.read_text()`, `.mkdir(parents=True)`, and `.glob()` do what their names suggest.

```python
from pathlib import Path

here = Path(__file__).parent
report = here / "out" / "report.txt"
report.parent.mkdir(parents=True, exist_ok=True)
report.write_text("hello\n")

for md in here.glob("**/*.md"):
    print(md.relative_to(here))
```

**Cross-platform correctness comes for free.** `Path` normalizes slashes and drive letters so the same code runs on Linux, macOS, and Windows without `os.path.join` gymnastics.

## example: urllib.parse | URL surgery without regex {.wide #urllib-parse}

**Parsing URLs with a regex is almost always a mistake.** `urllib.parse` already knows about schemes, userinfo, punycode hosts, port defaults, and path normalization.

::: cols 2

**`urlparse`** splits a URL into named parts – scheme, netloc, path, query, fragment – that you can read by attribute.

```python
from urllib.parse import urlparse

u = urlparse("https://example.com/a?x=1")
u.scheme   # "https"
u.netloc   # "example.com"
u.path     # "/a"
```

**`urljoin`** resolves a relative reference against a base URL, exactly the way a browser does when it encounters `<a href>`.

```python
from urllib.parse import urljoin

urljoin("https://ex.com/a/", "b/c")  # .../a/b/c
urljoin("https://ex.com/a/", "/d")   # .../d
```

:::

The scanner uses both: **`urljoin`** to turn relative links into absolute URLs, and **`urlparse`** to check that a link stays on the same host before we visit it.

## example: re | just enough regex {.standard #re}

**Reach for `re` when pattern matching is the right tool, not before.** If you only need "starts with" or "contains", `str.startswith`, `str.endswith`, and `in` are faster to write and faster to read.

```python
import re

pattern = re.compile(r"^https?://")
pattern.match("https://example.com")   # Match object
pattern.match("mailto:x@y")            # None
```

**Compile once, match many.** `re.compile` caches the compiled pattern; calling `.match()` on the compiled object skips the compile step on every call.

## example: dataclasses | classes that are mostly data {.wide #dataclasses}

::: side

**`@dataclass` generates `__init__`, `__repr__`, and equality for you** from the field annotations. Less boilerplate, fewer bugs in the boilerplate you don't write.

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

**The generated `__init__` takes each field as a keyword argument.** `__repr__` prints all fields; equality compares all fields. We will use this exact class for every page the scanner visits.

```python
r = PageReport(
    url="https://ex.com",
    status=200,
    title="Example",
    has_description=True,
)
print(r)   # PageReport(url='https://ex.com', ...)
```

:::

## example: argparse | --help for free, in three lines {.standard #argparse}

**`argparse` turns a list of argument descriptions into a full CLI.** Help text, type coercion, default values, error messages – all generated from `add_argument` calls.

```python
import argparse

p = argparse.ArgumentParser(description="Scan a page for link health.")
p.add_argument("url", help="URL to start from")
p.add_argument("--max", type=int, default=20, help="max links to visit")
args = p.parse_args()

print(args.url, args.max)
```

**`python scanner.py --help` already works.** Three lines of setup, and the user gets a standards-conforming CLI with Unix-style flags and a readable usage block.

# Async basics {#async}

## principle: Async is for I/O, not CPU | overlapping waits, not overlapping work {.narrow #async-principle}

**Network calls spend almost all their time waiting.** Async lets one thread start many waits and serve whichever one completes first. It does not make CPU-bound code faster – for that, you need processes.

## definition: The event loop | a scheduler for coroutines {.standard #event-loop}

**An event loop is a scheduler that runs coroutines** – functions that can pause at `await` and resume later. While one coroutine is waiting for a network response, the loop runs another. **One thread, many overlapping waits.**

You rarely touch the loop directly. **`asyncio.run(main())`** starts it, runs your top-level coroutine to completion, and shuts the loop down.

::: expand coroutine-vs-function
**A coroutine looks like a function but behaves differently when called.** Calling `fetch()` on an `async def` function does not run the body – it returns a *coroutine object* that represents the work to do.

```python
async def fetch():
    return 42

x = fetch()           # not 42 – this is <coroutine object>
x = await fetch()     # actually 42 (only legal inside async def)
x = asyncio.run(fetch())  # also 42, but starts its own loop
```

Forgetting the `await` is the most common async bug. Python will warn about "coroutine was never awaited" at runtime, but only if the object gets garbage-collected without being awaited – not always.
:::

## example: async and await | three waits, one second total {.wide #async-await}

**`async def` defines a coroutine; `await` suspends it until the awaited operation completes.** `asyncio.gather` starts several coroutines in parallel and waits for all of them.

```python
import asyncio

async def fetch(name: str, delay: float) -> str:
    await asyncio.sleep(delay)    # pretend this is a network call
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

**Three one-second sleeps, total runtime: about one second.** That is the whole point of async I/O.

::: expand gather-vs-taskgroup
**Since Python 3.11, `asyncio.TaskGroup` is the preferred alternative to `gather`.** It uses `async with` to guarantee that all tasks either complete or are cancelled – no task leaks on error.

```python
async with asyncio.TaskGroup() as tg:
    t1 = tg.create_task(fetch("a", 1.0))
    t2 = tg.create_task(fetch("b", 1.0))
# results available as t1.result(), t2.result() here
```

`gather` is still fine for simple cases; `TaskGroup` is the new right-answer when exception handling matters.
:::

## figure: One thread, many overlapping waits {.full #async-timeline}

![async vs sync timeline](async-timeline)

The same three network calls. The same single thread. The **only difference** is who gets to run while someone else waits. Synchronous code blocks the thread on every wait; async code releases the thread and lets other coroutines progress.

## free: Why Playwright | the modern web is rendered, not served {.wide #why-playwright}

::: cols 2

**A lot of the web is rendered by JavaScript in the browser.** `requests` and plain `urllib` see only the **HTML shell** – often just `<div id="app"></div>` plus a pile of script tags. Useful text, links, and titles never arrive.

**Playwright drives a real browser** – Chromium, Firefox, or WebKit – over a debugging protocol. The page renders, scripts execute, the DOM settles, and then you query it. You see what a human sees.

**For a link scanner this matters a lot.** Navigation on many real sites is built client-side: menus, footers, and even the main content are injected after load. A scanner that speaks HTTP only would miss all of it.

**The cost is weight.** A browser is a hundred megabytes of binaries and a few hundred of RAM per instance. For a lecture scanner that is fine; for a production crawler you would measure first.

:::

## example: Install the browser once | Playwright pins the build {.narrow #playwright-install}

**After `pip install playwright` you still need the browser itself.** Playwright ships a small CLI to download a pinned Chromium build into its cache.

```bash
playwright install chromium
```

**Pinned means reproducible.** The next developer on the project runs the same command and gets the *same* Chromium version, not whatever ships with today's operating system.

## example: Open a page | the smallest useful Playwright script {.wide #playwright-first-page}

**The pattern is always the same: open a context, launch a browser, navigate, query, close.** `async with` guarantees cleanup even if the page raises.

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

**`await` on every browser call.** Each one is a round-trip over a socket to the browser process, so every call is an I/O wait – exactly what async is for.

::: expand headless-vs-headed
**`p.chromium.launch()` runs headless by default** – no visible window, faster, suitable for CI. For debugging, launch with a visible window and slow-motion.

```python
browser = await p.chromium.launch(
    headless=False,
    slow_mo=200,        # ms between actions
)
```

Headed mode is invaluable when a selector or timing bug reproduces only against real rendering. Flip back to headless once the bug is fixed.
:::

## example: Extract all links | page.evaluate bridges Python and JS {.standard #playwright-links}

**`page.evaluate` runs JavaScript inside the page** and returns the result as plain Python data. Anything JSON-serializable crosses the boundary.

```python
hrefs = await page.evaluate("""
  () => Array.from(document.querySelectorAll('a[href]'))
             .map(a => a.href)
""")
```

**`hrefs` comes back as a Python list of strings, already absolute.** The browser resolves relative `<a href>` against the current page URL before handing them over.

# The scanner {#scanner}

## free: What we are building | a single-file CLI, four steps {.wide #scanner-spec}

**`scanner.py` is one file, under 80 lines, and does exactly four things.** Take a URL from the command line. Open it with Playwright and grab every `<a href>`. For each link, open it and record status, title, and whether a meta description exists. Print a one-line-per-page report.

::: cols 2

**Synchronous loop over pages** – simple before fast. We visit one page, then the next, then the next. The exercise at the end asks you to make it concurrent.

**No third-party libraries beyond Playwright.** Everything else is `urllib.parse`, `argparse`, `dataclasses` – the stdlib modules we just covered.

:::

## figure: Scanner pipeline | data flows left to right, top to bottom {.full #scanner-pipeline}

![scanner data flow](scanner-flow)

**Two Playwright calls per page.** `page.goto()` returns a response so we can read its status; `page.evaluate()` runs a JS snippet inside the page for DOM queries. Everything else is plain Python manipulating the resulting strings and objects.

## figure: scanner.py | everything we covered, in one file {.full #scanner-source}

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

**Every line here is something we covered.** Dataclasses for the report row. Type hints for documentation. `async`/`await` for concurrency-ready I/O. `urljoin`/`urlparse` for URL surgery. `argparse` for the CLI. About 55 lines, end to end.

::: expand whats-missing
**Four things this version does *not* do** – each one is an exercise at the end:

- No retry or timeout handling (one slow page blocks the whole scan).
- No concurrency (sequential `for` over `links`).
- No output format beyond stdout print (no CSV, no JSON).
- No robots.txt check (we assume we're allowed to crawl).

Each omission is deliberate: the 80-line target leaves room for exactly one "happy path" read-through. Production hardening doubles the line count – and changes nothing about the core logic.
:::

## example: Running it | pipe into grep for the interesting cases {.standard #scanner-run}

```bash
python scanner.py https://example.com --max 10
```

**The output is deliberately `grep`-friendly.** One line per page, flags first, URL last. Pipe it into `grep -v '^ok'` to see only the pages that have a problem.

```
ok                                       https://example.com/
no-description                           https://example.com/about
status=404 no-title                      https://example.com/oops
```

# Wrap-up {#wrap-up}

## principle: Small scripts beat big frameworks | if you understand them end-to-end {.narrow #small-scripts-principle}

**A fifty-line script you understand is worth more than a five-hundred-line framework you do not.** The whole point of this lecture was that the bar for "real tool" is much lower than the ecosystem suggests. Standard library plus one dependency plus type hints plus `asyncio.run` – that is a real tool.

## exercise: Extend the scanner | pick one, or two if you're bored {.wide #exercise-extend}

**Each extension is ten to thirty extra lines.** All of them use only what we covered today, plus one stdlib module you haven't touched yet.

::: cols 2

**Make it concurrent.** Replace the sequential loop with `asyncio.gather` over `scan_page` calls, wrapped in a semaphore to cap concurrency at 5. Time both versions against the same site; the async version should win on any page with more than a handful of links.

**Follow external links too, one hop deep.** Add a `--external` flag. Be polite: **one request per host per second**, tracked in a small dict of `host -> last_request_time`.

**Write the report as CSV.** Add a `--out report.csv` option and use the stdlib `csv` module. Each `PageReport` becomes one row; field names come from `dataclasses.fields(PageReport)`.

**Flag broken images.** Collect `<img src>` in addition to `<a href>` and fetch each with a `HEAD` request via `httpx` (async). Flag any non-2xx. Treat `data:` and `blob:` URLs as fine.

:::

---

> note: Close by asking each student which extension they will try first. That commitment turns the slide into homework.
