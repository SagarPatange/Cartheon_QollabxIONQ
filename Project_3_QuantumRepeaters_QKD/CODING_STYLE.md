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

- **Variables are nouns:** `pairs_still_needed`, `alice_data_bits`, `heralding_attempts`.
- **Functions are verbs:** `encode_logical_plus`, `measure_block`, `compute_syndrome`. *(UChicago: "function names
  performing actions should include a verb")*
- **No single letters**, except `i`/`j` for a loop index and `x`/`y` for coordinates. *(CMU)* Not `q` for a qubit,
  `m` for a measurement, `r` for a result, `b1`/`b2` for blocks.
- **Units go in the name** when a number has one: `fiber_length_km`, `run_time_ms`, `error_rate_percent`.
- **Booleans read as yes/no questions:** `is_tapped`, `has_errors`, `was_corrected`.
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
  def build_logical_link(backend, noise, rng):
      herald_attempts = herald_all_pairs(backend, noise, rng)
      encode_logical_plus(backend, ALICE_DATA, noise)
      encode_logical_zero(backend, BOB_DATA, noise)
      teleport_transversal_cnot(backend, ALICE_DATA, BOB_DATA, noise)
      return herald_attempts
  ```
- **Inputs come in as parameters, results go out as return values.** No global variables (constants are fine).
  Don't `print` a result another function needs; return it. *(MIT, CMU)*
- **A function either computes something or does something** (writes a file, changes the state). Keep the two
  apart where you can, so the computing part can be tested on its own.

## 3. One step per line

**Each line does one thing, and intermediate results get a name.** *(UW "one statement per line", Stanford)*

- **Plain `for` loops over clever one-liners.** A comprehension is fine when it is short and does one thing
  (`[pair[0] for pair in bell_pairs]`). Once it filters *and* transforms, or loops twice, write the loop.
- **No nested comprehensions**, no comprehension inside a `sorted()` inside a `for`.
- **No `a; b; c`** on one line.
- **No `x and y or z`** for choosing a value. Use `if`/`else`.
- **Don't compute the same thing twice** in one expression; compute it once and name it.
- **Add up floats with `sum()`, not a `+=` loop.** Since Python 3.12, `sum()` adds floats with extra precision, so a
  loop gives slightly different digits (10570.84 vs 10570.839999999995). Build a named list, then `sum()` it.
  Counting whole numbers with a loop is fine.
- **Keep random draws in the same order.** Measurement outcomes, noise and heralding attempts are random draws from
  a seeded generator: rewriting code that calls it must call it the same number of times, in the same order, under
  the same conditions, or every result changes.

### Example

Before:
```python
todo = [(a, b) for a, _ in left for b, _ in right if a != b and (a, b) not in done]
```

After:
```python
pairs_still_needed = []
for left_qubit, _ in left_block:
    for right_qubit, _ in right_block:
        is_same_qubit = left_qubit == right_qubit
        is_already_paired = (left_qubit, right_qubit) in pairs_already_made
        if not is_same_qubit and not is_already_paired:
            pairs_still_needed.append((left_qubit, right_qubit))
```

## 4. Conditions

- **Give a complicated condition a name**, then test the name. *(UW "boolean zen")*
  ```python
  is_rejected_by_check = check_bits != [0, 0]
  is_out_of_attempts = attempt_number == max_attempts
  if is_rejected_by_check and is_out_of_attempts:
      raise EncodingFailedError(...)
  ```
- **Test booleans directly:** `if is_tapped:`, not `if is_tapped == True:`. *(UChicago, UW)*
- **Return early** for the cases you skip, so the main logic is not buried three `if`s deep.
- **No special cases** when the general logic already handles them. *(MIT)*

## 5. Comments and docstrings

**Comments explain why. The code already says what.** *(MIT, Stanford, CMU)*

- **Every module starts with a docstring:** what the file is for, how to run it if it is a command, and what it
  reads and writes.
- **Every function has a docstring:** what it does, what each input is, what it returns. *(UChicago: "All
  functions must have a docstring that contains a description of the purpose of the function, the expected input
  arguments, the expected output values")* One line is enough when the name and inputs make the rest obvious.
- **Comment the reasons:** a physics rule, a paper's equation, where a number came from, why the obvious approach
  was wrong.
  ```python
  # Transversal H is not a logical H for the repetition code, so |+̄⟩ is prepared directly as a GHZ state.
  ```
- **Don't translate code into English:** `count += 1  # add one to count` helps nobody. *(MIT)*
- **Cite a source for every physics or modeling claim:** the paper and equation or figure (see `README.md`).
- **No commented-out code and no dead code.** Git remembers it. *(CMU)*

## 6. Numbers and constants

**No magic numbers.** A number whose meaning isn't obvious gets a named constant. *(UChicago, CMU, MIT, UW)*

- Settings a person might change (error rates, shot counts, limits) live in one constants file or module per
  project, read from one place.
- Fixed facts live as `ALL_CAPS` constants at the top of the file that uses them, with a comment saying where the
  number comes from: `QUBITS_PER_BLOCK = 3  # 3-qubit repetition code`.
- Plainly obvious numbers are fine inline: `0`, `1`, `-1`, `2`, `60` minutes in an hour. *(CMU lists 0, 1, -1, 2, 10)*

## 7. Don't repeat yourself

**The same logic in two places means the same bug in two places.** *(MIT "DRY", CMU, UW)*

- Copy-pasted code becomes one function.
- Numbered variables (`qubit0`, `qubit1`, `qubit2`) become a list and a loop. *(CMU)*
- The same small helper written in several files becomes one shared helper; don't write another one.

## 8. Fail fast

**A problem should show up where it happens, not three steps later.** *(MIT)*

- Check inputs at the start of a function and raise a clear error:
  `raise ValueError(f"tap_fraction must be between 0 and 1, got {tap_fraction}")`.
- A missing or misspelled setting fails when the program starts, never silently.
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
- **Lines up to 120 characters.** *(Decision: UChicago, CMU and PEP 8 say 79 to 80. This repo uses 120, because
  docstrings that explain physics read better on fewer lines. Shorter is still better.)*
- Imports name the actual file a thing lives in (`from quantum_bros.protocol.qre_cec import QubitLayout`).
- **No `__init__.py` files.** Folders import as plain namespace packages.
- One file, one topic. A file over about 400 lines usually holds several topics.

## 11. Tests

- **Every function that can be tested has a test** (CMU): small, hand-made input, known answer.
- Tests live in `tests/`, in the same folders as the code they test.
- A test name says what should happen: `test_majority_vote_corrects_one_flipped_bit`.
- **Changing how code reads must not change what it does:** before and after a cleanup, all tests pass and a
  seeded run gives identical output.

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
