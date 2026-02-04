"""
Minimal educational reimplementation of Lean's trusted kernel in Python.

Modules:
- ast: names, universes, expressions, and basic substitution/abstraction.
- env: environment and declarations (constants, inductives, recursors).
- reduce: weak-head normalization and definitional equality.
- typing: type inference/checking for Π-calculus plus inductives.
- inductive: helpers to define inductive types and their recursors.
"""

from . import ast, env, reduce, typing, inductive

__all__ = ["ast", "env", "reduce", "typing", "inductive"]
