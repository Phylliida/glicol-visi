# Lean Kernel, Rebuilt in Python — Hands-on Course

A step-by-step, build-it-yourself curriculum to reimplement the trusted Lean kernel in Python. Each module ends with runnable tests and mirrors specific Lean kernel files (see `lean4/src/kernel`).

> Implementation note: Modules 1–5 now live in `leanpy/` (`ast.py`, `reduce.py`, `typing.py`, `inductive.py`, `env.py`) with starter tests in `leanpy/tests/test_leanpy.py`.

## Prereqs
- Solid Python (dataclasses, enums, typing, pattern matching).
- Familiarity with simply typed λ-calculus; basic category/type theory vocabulary.
- Comfort writing small property tests (e.g., `pytest` + `hypothesis`).

## Project scaffold (suggested)
```
leanpy/
  __init__.py
  ast.py            # names, levels, expr
  env.py            # declarations, environment
  reduce.py         # whnf, delta/beta/eta/ι/ζ reductions
  typing.py         # type checker, inference, cumulativity
  inductive.py      # inductive declarations, recursors
  matcher.py        # pattern-matching → recursor compilation
  termination.py    # structural + well-founded checks (minimal)
  quot.py           # quotient primitives
  tests/            # pytest-based regression + property tests
```

## Module 1 — Names, Levels, Expressions
- Implement `Name` (hierarchical identifiers), `Level` (`zero`, `succ`, `max`, `imax`, `param`), and `Expr` (sort, const, var, fvar, mvar, app, lam, pi, let, lit).
- Operations: `has_free_var`, `instantiate`, `abstract`, `replace`, α-equivalence.
- Map to Lean sources: `expr.{h,cpp}`, `level.{h,cpp}`.
- Deliverable: round-trip pretty-printer + parser for a minimal concrete syntax.

## Module 2 — Reduction & Definitional Equality
- Write weak head normal form (`whnf`) with β, δ (transparent constants), ζ (let), and ι (inductive cases once available).
- Convertibility checker using WHNF + η for functions.
- Map to Lean: `type_checker.cpp` (conversion), `expr_eq_fn.cpp`.
- Tests: `whnf(app(lam x, a)) == whnf(body[x:=a])`; η-laws; delta unfolds definitions marked reducible.

## Module 3 — Typing for Pure Π-Calculus
- Contexts with locals and metavariables; support binder annotations and universe levels.
- Implement typing judgment for `Sort u`, `Const`, `Var/FVar`, `Lam`, `Pi`, `Let`.
- Cumulativity: `Sort u` < `Sort (u+1)`.
- Map: `type_checker.{h,cpp}` core rules.
- Tests: infer types of polymorphic identity, constant function, and Π nesting; ensure universe constraints propagate.

## Module 4 — Inductive Declarations
- Data structure for inductive definitions (params, indices, ctors, universe level).
- Positivity check (simplified) and computation of constructor types.
- Generate primitive recursors/eliminators automatically (non-dependent + dependent).
- Map: `inductive.{h,cpp}`, `declaration.{h,cpp}`.
- Tests: `Nat` recursor computes `recNat z s (succ (succ zero)) → s (succ zero) (s zero z)`; list length proof sketch.

## Module 5 — Reduction with Inductives
- Extend ι-reduction for pattern matching on constructors.
- Add definitional equalities for generated recursors.
- Map: `reduce_let`/`reduce_rec` pieces in `type_checker.cpp`.
- Tests: canonical equations for `Nat.rec` and `List.rec`.

## Module 6 — Environment & Declarations
- Persistent environment storing constants, defs, inductives; transparency flags (opaque/irreducible/reducible).
- Kernel “add constant” API that checks well-typedness before insertion.
- Map: `environment.{h,cpp}`, `declaration.{h,cpp}`, `init_module.{cpp}`.
- Tests: reject ill-typed definitions; delta-reduction respects transparency.

## Module 7 — Pattern Matching Front-End
- Mini elaborator from `match`/equations to core recursor applications (no tactics).
- Cover simple, nested, and dependent matches; completeness checking (basic).
- Map: sits above kernel but mirrors Lean’s equation compiler behavior.
- Tests: compile `map` on lists; ensure generated terms pass kernel checker.

## Module 8 — Termination Checking (Minimal)
- Structural recursion checker on a designated decreasing argument; optionally a simple well-founded measure.
- Map: simplified analogue of Lean’s termination checker (outside the trusted kernel).
- Tests: accept structurally decreasing `Nat.rec`-style functions; reject obvious non-terminating `f x := f x`.

## Module 9 — Quotients and Prop Irrelevance
- Add quotient type former with intro/elimination axioms; mark as trusted primitive.
- Make `Prop` proof-irrelevant (erase proofs at runtime).
- Map: `quot.{h,cpp}`.
- Tests: β/ι rules for quotient recursor; proof erasure does not change definitional equality in `Prop`.

## Module 10 — Soundness Smoke Tests
- Encode small proofs: commutativity of `Nat` addition, length append, plus a contradiction attempt to ensure rejection.
- Property tests comparing definitional equality against a reference normalizer for small terms.

## Stretch Goals
- Universe polymorphic inductives with cumulativity.
- Meta-variables with unification (higher-order pattern unification).
- Serialization/loading of compiled modules.

## Working Style
- Keep each module behind feature flags/tests so you can iterate.
- Write `pytest` fixtures that build tiny environments per module.
- When stuck, read the matching Lean file first; port only the minimal logic, not the C++ optimizations.
