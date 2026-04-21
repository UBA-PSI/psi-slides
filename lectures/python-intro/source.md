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

## principle: Use a venv. Always. {.narrow #venv-principle}

Global Python is for the OS. Your project gets its own environment.

> note: The single most valuable sentence in a Python intro. If students remember nothing else from today, this is the one.

## free: What you will build {.standard #what-you-will-build}

By the end of this session you will have a small command-line tool that:

- takes a URL,
- visits every link it finds on that page,
- reports broken links, missing page titles, and missing meta descriptions.

Under 80 lines of Python. Uses a real browser under the hood.

## free: What you already need {.standard #prerequisites}

You need:

- Python **3.11 or newer** on your machine,
- a terminal you are comfortable with,
- roughly three hours of patience.

You do *not* need prior Python experience. You should know what a variable, a function, and a loop are – in any language.

## example: Setup with uv {.narrow #setup-uv}

`uv` is a modern, fast Python package manager. Recommended path:

```bash
# install uv (once, globally)
curl -LsSf https://astral.sh/uv/install.sh | sh

# per project
uv venv
source .venv/bin/activate
uv pip install playwright
```

## example: Fallback with pip and venv {.narrow #setup-pip}

If you cannot install `uv`, the classic route still works:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install playwright
```

Same result, a few seconds slower. Pick one and stick with it for the rest of the session.

# Python fundamentals {#fundamentals}

## definition: Variables and types {.standard #variables-and-types}

A **variable** is a name bound to a value. Python is dynamically typed – you do not declare the type, the value carries it.

```python
name = "Ada"       # str
age = 36           # int
pi = 3.14159       # float
ready = True       # bool
unknown = None     # NoneType
```

The built-in `type(x)` tells you what you are holding.

## example: F-strings {.standard #fstrings}

The modern way to build strings. Prefix with `f`, embed expressions in `{}`:

```python
name = "Ada"
age = 36
print(f"{name} is {age} years old.")
print(f"Next birthday: {age + 1}.")
print(f"{name=}, {age=}")   # self-documenting
```

The last line prints `name='Ada', age=36`. Very useful while debugging.

## free: Collections {.wide #collections}

Four core containers, each with a different job:

- **list** – ordered, mutable. `[1, 2, 3]`. Use when order matters and the contents change.
- **tuple** – ordered, *immutable*. `(lat, lon)`. Use for fixed-shape records.
- **dict** – key-value map. `{"host": "example.com", "port": 443}`. The workhorse.
- **set** – unordered, unique. `{"a", "b"}`. Use for membership and deduplication.

---

Common operations are boringly similar across all of them:

```python
urls = ["https://a.com", "https://b.com"]
urls.append("https://c.com")
"https://a.com" in urls        # True

seen = set()
seen.add("https://a.com")

page = {"url": "https://a.com", "status": 200}
page["title"] = "A"            # dicts grow by assignment
```

## example: Control flow {.standard #control-flow}

Indentation is the block delimiter. No braces, no `end`.

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

`match` is available since 3.10 for structural patterns – useful, but `if/elif` covers 90% of cases.

## example: Functions with type hints {.standard #functions}

```python
def greet(name: str, excited: bool = False) -> str:
    suffix = "!" if excited else "."
    return f"Hello, {name}{suffix}"

greet("Ada")                   # "Hello, Ada."
greet("Ada", excited=True)     # "Hello, Ada!"
```

Type hints are *optional* and *not enforced* at runtime – they are documentation the editor and linter can read. Add them. Your future self will thank you.

# More Python {#more-python}

## example: Comprehensions {.standard #comprehensions}

Build a list, dict, or set from an existing iterable in one line:

```python
urls = ["https://a.com/", "https://b.com", "mailto:x@y"]

https_only = [u for u in urls if u.startswith("https://")]
lengths = {u: len(u) for u in https_only}
domains = {u.split("/")[2] for u in https_only}
```

Comprehensions are idiomatic Python. A `for`-loop with `.append()` inside it is often a comprehension waiting to happen.

## example: Exceptions {.standard #exceptions}

Errors are values. You catch them, inspect them, decide what to do:

```python
try:
    value = int(user_input)
except ValueError as exc:
    print(f"Not a number: {exc}")
    value = 0
```

The `as exc` part is only useful if you actually look at the exception. Often you do not – a bare `except ValueError:` is fine.

## principle: Read errors from the bottom. {.narrow #read-errors-principle}

The last line of a traceback names the failure. Everything above is the route it took to get there.

# The standard library {#stdlib}

## question: Why the standard library? {.narrow #why-stdlib}

Because "a dependency is a liability you have not paid for yet."

> note: Quote is roughly Hynek Schlawack's. Worth naming the source if the room cares. Main point: every `pip install` is a future maintenance cost. The stdlib is already there.

## example: pathlib {.standard #pathlib}

Filesystem paths as objects, not strings. Cross-platform, readable:

```python
from pathlib import Path

here = Path(__file__).parent
report = here / "out" / "report.txt"
report.parent.mkdir(parents=True, exist_ok=True)
report.write_text("hello\n")

for md in here.glob("**/*.md"):
    print(md.relative_to(here))
```

## example: urllib.parse {.standard #urllib-parse}

URL surgery without regex:

```python
from urllib.parse import urlparse, urljoin

u = urlparse("https://example.com/a/b?x=1#frag")
u.scheme    # "https"
u.netloc    # "example.com"
u.path      # "/a/b"

urljoin("https://example.com/a/", "b/c")   # ".../a/b/c"
urljoin("https://example.com/a/", "/d")    # ".../d"
```

We will use both in the scanner.

## example: re – just enough {.standard #re}

Regex, when pattern matching is actually the right tool:

```python
import re

pattern = re.compile(r"^https?://")
pattern.match("https://example.com")       # Match object
pattern.match("mailto:x@y")                # None
```

Compile once, match many. If you find yourself escaping a dozen characters, consider whether `str.startswith` or `in` would do.

## example: dataclasses {.standard #dataclasses}

A class that is mostly data, with almost no boilerplate:

```python
from dataclasses import dataclass

@dataclass
class PageReport:
    url: str
    status: int
    title: str | None
    has_description: bool
```

`__init__`, `__repr__`, and equality come for free. We will use this for the scanner's output rows.

## example: argparse {.standard #argparse}

Parse command-line arguments, with `--help` for free:

```python
import argparse

p = argparse.ArgumentParser(description="Scan a page for link health.")
p.add_argument("url", help="URL to start from")
p.add_argument("--max", type=int, default=20, help="max links to visit")
args = p.parse_args()

print(args.url, args.max)
```

Three lines of setup, and `python scanner.py --help` already works.

# Async basics {#async}

## principle: Async is for I/O, not CPU. {.narrow #async-principle}

Network calls wait. `async` lets many waits overlap on one thread.

## definition: The event loop {.standard #event-loop}

An **event loop** is a scheduler that runs *coroutines* – functions that can pause at `await` and resume later. While one coroutine is waiting for a network response, the loop runs another. One thread, many overlapping waits.

You rarely interact with the loop directly. `asyncio.run(main())` starts it, runs your top-level coroutine, and shuts it down.

## example: async and await {.standard #async-await}

```python
import asyncio

async def fetch(name: str, delay: float) -> str:
    await asyncio.sleep(delay)   # pretend this is a network call
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

Three one-second sleeps, total runtime: about one second. That is the whole point.

## figure: One thread, many waits {.wide #async-timeline}

```
time ──▶        0 s                     1 s                     2 s                     3 s

async/await:
  fetch a     │■■■■■■■ awaiting ■■■■■■■│done
  fetch b     │■■■■■■■ awaiting ■■■■■■■│done
  fetch c     │■■■■■■■ awaiting ■■■■■■■│done
                                        ▲
                                        └── asyncio.gather returns here  (≈ 1 s total)

synchronous:
  fetch a     │■■■■■■■ awaiting ■■■■■■■│done
  fetch b                              │■■■■■■■ awaiting ■■■■■■■│done
  fetch c                                                       │■■■■■■■ awaiting ■■■■■■■│done
                                                                                         ▲
                                                                                         └── ≈ 3 s total
```

Same three network calls. Same single thread. Only difference: who gets to run while someone else waits.



## free: Why Playwright {.standard #why-playwright}

A lot of the web is rendered by JavaScript. `requests` + `urllib` sees the *HTML shell* – the empty `<div id="app">`. Playwright drives a real browser (Chromium, Firefox, or WebKit), so it sees what a human sees.

For a link scanner, this matters: many sites build their navigation client-side.

## example: Install the browser {.narrow #playwright-install}

Once, after `pip install playwright`:

```bash
playwright install chromium
```

Downloads a pinned Chromium build into your cache. Pinned means reproducible.

## example: Open a page {.standard #playwright-first-page}

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

`async with` guarantees cleanup even if something raises. `await` on every browser call, because each of them goes over a socket to the browser process.

## example: Extract all links {.standard #playwright-links}

`page.evaluate` runs JavaScript inside the page and returns the result as Python data:

```python
hrefs = await page.evaluate("""
  () => Array.from(document.querySelectorAll('a[href]'))
             .map(a => a.href)
""")
```

`hrefs` comes back as a Python list of strings. Already resolved to absolute URLs by the browser.

# The scanner {#scanner}

## free: What we are building {.standard #scanner-spec}

A single-file CLI `scanner.py`:

1. Take a start URL from the command line.
2. Visit it with Playwright, grab every `<a href>`.
3. For each link, open it, record: HTTP-ish status, page title, whether a `<meta name="description">` exists.
4. Print a small report. One line per page.

Synchronous loop over pages – simple before fast. We will make it concurrent in the exercises.

## figure: Scanner pipeline {.wide #scanner-pipeline}

```
     CLI argument
   ┌──────────────┐
   │ url, --max   │
   └──────┬───────┘
          ▼
   ┌────────────────────────┐
   │ page.goto(url)         │
   └──────┬─────────────────┘
          ▼
   ┌────────────────────────┐        ┌──────────────────────────────┐
   │ collect_links()        │ ─────▶ │ same host only, dedup, ≤ max │
   │   evaluate: a[href]    │        └──────────────────────────────┘
   └──────┬─────────────────┘
          │
          ▼   for each link
   ┌────────────────────────┐
   │ scan_page()            │
   │   goto  ─▶ status      │        ┌──────────────┐
   │   title                │ ─────▶ │  PageReport  │
   │   meta[description]?   │        └──────┬───────┘
   └──────┬─────────────────┘               │
          │                                 │
          └─────────────────────────────────┤
                                            ▼
                                   ┌──────────────────────┐
                                   │ print: flags + URL   │
                                   └──────────────────────┘
```

Two Playwright calls per page: `goto` for status, `evaluate` for DOM queries. Everything else is `urllib.parse` and plain Python.

## figure: scanner.py {.full #scanner-source}

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

Everything we covered, composed into one script. About 55 lines.

## example: Running it {.standard #scanner-run}

```bash
python scanner.py https://example.com --max 10
```

Output looks like:

```
ok                                       https://example.com/
no-description                           https://example.com/about
status=404 no-title                      https://example.com/oops
```

First column flags any issue it found, second column is the URL. Pipe it into `grep -v '^ok'` to see only the problems.

# Wrap-up {#wrap-up}

## principle: Small scripts beat big frameworks. {.narrow #small-scripts-principle}

A 50-line script you understand end-to-end beats a 500-line framework you do not.

## exercise: Extend the scanner {.wide #exercise-extend}

Pick one or two. Each one is 10 to 30 extra lines.

- **Make it concurrent.** Replace the sequential loop with `asyncio.gather` over `scan_page` calls. Use a semaphore to cap concurrency at 5. Time both versions on a real site.
- **Follow external links too, but only one hop deep.** Add a `--external` flag. Be polite: one request per host per second.

---

- **Write the report as CSV.** Add a `--out report.csv` option. Use the `csv` module from the standard library. Each `PageReport` becomes one row.
- **Check for broken images.** Collect `<img src>` in addition to `<a href>`. Fetch each with a `HEAD` request via `httpx` (async) and flag any non-2xx.

> note: Close by asking each student which extension they will try first. That commitment turns the slide into homework.
