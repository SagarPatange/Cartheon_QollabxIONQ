# Coding style

How code in this repo is written. The goal is the one every university style guide starts from: **code a person
can read top to bottom and understand, step by step.** This is mission-critical code, and code nobody can read is
code nobody can check.

Readable beats clever. Readable beats short. Readable beats fast, unless a measurement shows the speed matters.

The rules come from university CS courses (sources at the end). Where they
disagree, this document picks one and says so.

---

## 1. Names

**A name says what the thing is.** Someone should understand a line without scrolling up to find out what a
variable holds. *(UChicago, CMU, Stanford, MIT, Cornell)*

- **Variables are nouns:** `first_dispatch_of_load`, `pairs_still_needed`, `total_road_km`.
- **Functions are verbs:** `read_events`, `find_stops`, `compute_detention_charge`. *(UChicago: "function names
  performing actions should include a verb")*
- **No single letters**, except `i`/`j` for a loop index and `x`/`y` for coordinates. *(CMU)* Not `e` for an event,
  `d` for a folder, `r` for a row, `sb`/`db` for blocks.
- **Units go in the name** when a number has one: `drive_minutes`, `revenue_cents`, `distance_km`.
- **Booleans read as yes/no questions:** `is_hazmat`, `has_driver`, `never_arrived`.
- **Don't reuse a name for something else** later in the same function. One purpose per variable. *(MIT)*
- **Never shadow a built-in** (`list`, `dict`, `id`, `type`, `sum`, `min`). *(CMU)*
- Python casing (PEP 8): `snake_case` for variables and functions, `CamelCase` for classes, `ALL_CAPS` for
  constants.

## 2. Functions

**A function does one job, and its name says what that job is.** *(CMU "top-down design", MIT, UW)*

- **About 30 lines at most**, not counting the docstring, comments and blank lines. *(CMU)* A longer function is
  doing several jobs; give each job its own function. When you change a long function, split it.
- **Top-down:** a long task reads like a recipe that calls named steps.
  ```python
  def build_week(week_start):
      loads = read_loads(week_start)
      drivers = read_driver_roster(week_start)
      gps_stops = match_gps_to_stops(loads, week_start)
      events = make_events(loads, drivers, gps_stops)
      write_events(events, week_start)
  ```
- **Inputs come in as parameters, results go out as return values.** No global variables (constants are fine).
  Don't `print` a result another function needs; return it. *(MIT, CMU)*
- **A function either computes something or does something** (writes a file, changes the state). Keep the two
  apart where you can, so the computing part can be tested on its own.

## 3. One step per line

**Each line does one thing, and intermediate results get a name.** *(UW "one statement per line", Stanford)*

- **Plain `for` loops over clever one-liners.** A comprehension is fine when it is short and does one thing
  (`[stop["site"] for stop in stops]`). Once it filters *and* transforms, or loops twice, write the loop.
- **No nested comprehensions**, no comprehension inside a `sorted()` inside a `for`.
- **No `a; b; c`** on one line.
- **No `x and y or z`** for choosing a value. Use `if`/`else`.
- **Don't compute the same thing twice** in one expression; compute it once and name it.
- **Add up floats with `sum()`, not a `+=` loop.** Since Python 3.12, `sum()` adds floats with extra precision, so a
  loop gives slightly different digits (10570.84 vs 10570.839999999995). Build a named list, then `sum()` it.
  Counting whole numbers with a loop is fine.
- **Keep random draws in the same order.** Drive and stop times, offers and test problems are random draws from a
  seeded generator: rewriting code that calls it must call it the same number of times, in the same order, under the
  same conditions, or every result changes.

### Example: `pipeline/build/fill_trips.py`

Before:
```python
dispatch: dict[str, dict] = {}
for e in sorted((e for e in events if e["event"] == "dispatch" and e.get("truck")), key=lambda e: e["time"]):
    dispatch.setdefault(e["load"], e)   # the trip's first dispatch: its truck, driver and PCS leg
```

After:
```python
# A trip's first dispatch tells us its truck, driver and PCS leg.
dispatches_with_a_truck = []
for event in events:
    if event["event"] == "dispatch" and event.get("truck"):
        dispatches_with_a_truck.append(event)
dispatches_with_a_truck.sort(key=lambda event: event["time"])

first_dispatch_of_load: dict[str, dict] = {}
for event in dispatches_with_a_truck:
    load_id = event["load"]
    if load_id not in first_dispatch_of_load:
        first_dispatch_of_load[load_id] = event
```

### Example: `pipeline/build/road_matrix.py`

Before:
```python
todo = [(a, b) for a, _ in sb for b, _ in db if a != b and (a, b) not in have]
```

After:
```python
pairs_still_needed = []
for origin_site, _ in origin_block:
    for destination_site, _ in destination_block:
        is_same_site = origin_site == destination_site
        is_already_fetched = (origin_site, destination_site) in pairs_already_fetched
        if not is_same_site and not is_already_fetched:
            pairs_still_needed.append((origin_site, destination_site))
```

## 4. Conditions

- **Give a complicated condition a name**, then test the name. *(UW "boolean zen")*
  ```python
  started_before_week = move["left"] < 0
  never_arrived = move["arrived"] <= move["left"]
  if started_before_week or never_arrived:
      continue
  ```
- **Test booleans directly:** `if is_hazmat:`, not `if is_hazmat == True:`. *(UChicago, UW)*
- **Return early** for the cases you skip, so the main logic is not buried three `if`s deep.
- **No special cases** when the general logic already handles them. *(MIT)*

## 5. Comments and docstrings

**Comments explain why. The code already says what.** *(MIT, Stanford, CMU)*

- **Every module starts with a docstring:** what the file is for, how to run it if it is a command, and what it
  reads and writes.
- **Every function has a docstring:** what it does, what each input is, what it returns. *(UChicago: "All
  functions must have a docstring that contains a description of the purpose of the function, the expected input
  arguments, the expected output values")* One line is enough when the name and inputs make the rest obvious.
- **Comment the reasons:** a business rule, a data quirk, where a number came from, why the obvious approach was
  wrong.
  ```python
  # PCS fills pickup = entry + 24 h when the dispatcher left it blank, so a gap of exactly whole days is not real.
  ```
- **Don't translate code into English:** `count += 1  # add one to count` helps nobody. *(MIT)*
- **Cite data for every modeling claim:** the file, the column and the count (repo rule, see `README.md`).
- **No commented-out code and no dead code.** Git remembers it. *(CMU)*

## 6. Numbers and constants

**No magic numbers.** A number whose meaning isn't obvious gets a named constant. *(UChicago, CMU, MIT, UW)*

- Business numbers a person might change (rates, caps, hours) live in `config/constants.yaml` or
  `config/offices/*.yaml`, read through `common/constants.py`.
- Fixed facts live as `ALL_CAPS` constants at the top of the file that uses them, with a comment saying where the
  number comes from: `SHIFT_CAP_MIN = 20 * 60  # longest real shift; log-in chains beyond this are separate shifts`.
- Plainly obvious numbers are fine inline: `0`, `1`, `-1`, `2`, `60` minutes in an hour. *(CMU lists 0, 1, -1, 2, 10)*
- Time is integer minutes and money is integer cents (repo rule).

## 7. Don't repeat yourself

**The same logic in two places means the same bug in two places.** *(MIT "DRY", CMU, UW)*

- Copy-pasted code becomes one function.
- Numbered variables (`stop0`, `stop1`, `stop2`) become a list and a loop. *(CMU)*
- The same small helper written in several files becomes one shared helper in `common/`. Example: reading and
  writing CSVs is `common/csv_files.py` (`read_csv`, `read_gzip_csv`, `write_csv`), used by 20 modules in `src/`;
  don't write another reader.

## 8. Fail fast

**A problem should show up where it happens, not three steps later.** *(MIT)*

- Check inputs at the start of a function and raise a clear error: `raise ValueError(f"week {week} has no
  events.csv; run week_events first")`.
- A missing or misspelled setting fails when the program starts, never silently (`common/constants.py` does this).
- Don't swallow errors with a bare `except:` or `except Exception: pass`.

## 9. Writing a new function: the Design Recipe

From *How to Design Programs* (Brown, Northeastern), in Python. Follow these steps in order, and the function
comes out readable because it was designed before it was typed.

1. **Data:** what goes in and what comes out (types, units).
2. **Signature and purpose:** the `def` line with type hints, and a one-sentence docstring.
3. **Examples:** two or three small cases with known answers. These become the tests.
4. **Body:** write it, one step per line.
5. **Test and tidy:** run the tests, then reread it as a stranger would and rename or split what is unclear.

## 10. Layout and formatting

- **PEP 8**, checked by `ruff check src tests`. Indent 4 spaces, imports at the top, two blank lines
  between functions.
- **Lines up to 120 characters.** *(Decision: UChicago, CMU and PEP 8 say 79 to 80. This repo has always used 120
  and keeps it, because changing it would reflow every file. Shorter is still better.)*
- Imports name the actual file a thing lives in (`from freightsim.model.state.state import State`).
- **No `__init__.py` files.** Folders import as plain namespace packages; each folder has a `README.md` listing its
  files instead.
- One file, one topic. A file over about 400 lines usually holds several topics.

## 11. Tests

- **Every function that can be tested has a test** (CMU): small, hand-made input, known answer.
- Tests live in `tests/`, in the same folders as the code they test.
- A test name says what should happen: `test_a_driver_offered_every_day_covers_every_real_shift`.
- **Changing how code reads must not change what it does:** before and after a cleanup, all tests pass and a
  simulation run gives identical output.

---

## Checklist before committing

- [ ] Could someone new read each function top to bottom and say what it does?
- [ ] Every name says what the thing is; no single letters except `i`, `j`, `x`, `y`.
- [ ] Every function under about 30 lines, one job, with a docstring.
- [ ] No line does two things; no nested comprehensions; no `a; b`.
- [ ] Complicated conditions have names.
- [ ] No magic numbers; no copy-pasted logic; no dead or commented-out code.
- [ ] Comments say *why*.
- [ ] `pytest -q` passes and `ruff check src tests` is clean.

---

## Sources

| School | Guide | Strongest on |
|---|---|---|
| UChicago | [Python Style Guide, CS with Applications 1](https://classes.cs.uchicago.edu/archive/2020/fall/30121-1/style-guide/index.html) and [2](https://classes.cs.uchicago.edu/archive/2020/winter/30122-1/style-guide/) | docstrings, naming, magic numbers |
| CMU | [15-112 Style Rubric](https://www.cs.cmu.edu/~112-n25/notes/notes-style.html) | concrete limits: 30-line functions, names, repetition |
| MIT | [6.031 Reading: Code Review](https://web.mit.edu/6.031/www/sp22/classes/04-code-review) and [code review guidelines](https://web.mit.edu/6.031/www/sp22/general/code-review.html) | why: DRY, fail fast, one purpose per variable |
| Stanford | [CS106A Python Style](https://cs.stanford.edu/people/nick/py/python-style1.html) | names that make code read as a story |
| Washington | [CSE 122 Code Quality Guide](https://courses.cs.washington.edu/courses/cse122/26su/resources/code_quality/) | conditionals, boolean zen, decomposition |
| Cornell | [CS 1110 Notes on Style](https://www.cs.cornell.edu/courses/cs1110/2017fa/materials/style.php.html) | function specifications, why style matters |
| Brown / Northeastern (HtDP) | [The Design Recipe, in Python](https://www.brinckerhoff.org/python-design-recipe/index.html) | designing a function before writing it |
| Python | [PEP 8](https://peps.python.org/pep-0008/) | formatting conventions everyone shares |
