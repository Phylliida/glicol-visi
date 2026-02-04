"""
Core syntax and substitution utilities (Module 1).
Uses de Bruijn indices for bound variables; named free variables for user-level locals.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Iterable, List, Optional, Sequence, Tuple


# -------- Names & Levels ----------

@dataclass(frozen=True)
class Name:
    parts: Tuple[str, ...]

    @staticmethod
    def anon() -> "Name":
        return Name(("_",))

    @staticmethod
    def mk(*parts: str) -> "Name":
        return Name(tuple(parts))

    def extend(self, part: str) -> "Name":
        return Name(self.parts + (part,))

    def __str__(self) -> str:
        return ".".join(self.parts)


@dataclass(frozen=True)
class Level:
    kind: str
    args: Tuple["Level", ...] = ()
    param: Optional[str] = None

    @staticmethod
    def zero() -> "Level":
        return Level("zero")

    @staticmethod
    def succ(u: "Level") -> "Level":
        return Level("succ", (u,))

    @staticmethod
    def max(u: "Level", v: "Level") -> "Level":
        return Level("max", (u, v))

    @staticmethod
    def imax(u: "Level", v: "Level") -> "Level":
        return Level("imax", (u, v))

    @staticmethod
    def param(name: str) -> "Level":
        return Level("param", param=name)

    def __str__(self) -> str:
        if self.kind == "zero":
            return "0"
        if self.kind == "succ":
            return f"succ {self.args[0]}"
        if self.kind in ("max", "imax"):
            return f"{self.kind}({self.args[0]}, {self.args[1]})"
        if self.kind == "param":
            return self.param or "?"
        return f"{self.kind}{self.args}"


# -------- Expressions -------------


class Expr:
    pass


@dataclass(frozen=True)
class Sort(Expr):
    level: Level

    def __str__(self) -> str:
        return f"Sort {self.level}"


@dataclass(frozen=True)
class Const(Expr):
    name: Name
    levels: Tuple[Level, ...] = ()

    def __str__(self) -> str:
        suffix = f"[{', '.join(map(str, self.levels))}]" if self.levels else ""
        return f"{self.name}{suffix}"


@dataclass(frozen=True)
class Var(Expr):
    idx: int  # de Bruijn index

    def __str__(self) -> str:
        return f"#{self.idx}"


@dataclass(frozen=True)
class FVar(Expr):
    name: Name

    def __str__(self) -> str:
        return f"{self.name}"


@dataclass(frozen=True)
class MVar(Expr):
    name: Name

    def __str__(self) -> str:
        return f"?{self.name}"


@dataclass(frozen=True)
class App(Expr):
    fn: Expr
    arg: Expr

    def __str__(self) -> str:
        return f"({self.fn} {self.arg})"


@dataclass(frozen=True)
class Lam(Expr):
    name: Name
    type: Expr
    body: Expr

    def __str__(self) -> str:
        return f"(λ {self.name} : {self.type}, {self.body})"


@dataclass(frozen=True)
class Pi(Expr):
    name: Name
    type: Expr
    body: Expr

    def __str__(self) -> str:
        return f"(Π {self.name} : {self.type}, {self.body})"


@dataclass(frozen=True)
class Let(Expr):
    name: Name
    type: Optional[Expr]
    value: Expr
    body: Expr

    def __str__(self) -> str:
        return f"(let {self.name} := {self.value} in {self.body})"


@dataclass(frozen=True)
class Lit(Expr):
    value: object

    def __str__(self) -> str:
        return repr(self.value)


# -------- Helpers -----------------


def mk_app(fn: Expr, *args: Expr) -> Expr:
    out = fn
    for a in args:
        out = App(out, a)
    return out


def unwind_app(expr: Expr) -> Tuple[Expr, List[Expr]]:
    args: List[Expr] = []
    while isinstance(expr, App):
        args.append(expr.arg)
        expr = expr.fn
    args.reverse()
    return expr, args


# -------- De Bruijn shuffling -----


def shift(expr: Expr, by: int, cutoff: int = 0) -> Expr:
    """Raise de Bruijn indices >= cutoff by `by`."""
    if isinstance(expr, Var):
        return Var(expr.idx + by) if expr.idx >= cutoff else expr
    if isinstance(expr, (Sort, Const, FVar, MVar, Lit)):
        return expr
    if isinstance(expr, App):
        return App(shift(expr.fn, by, cutoff), shift(expr.arg, by, cutoff))
    if isinstance(expr, Lam):
        return Lam(expr.name, shift(expr.type, by, cutoff), shift(expr.body, by, cutoff + 1))
    if isinstance(expr, Pi):
        return Pi(expr.name, shift(expr.type, by, cutoff), shift(expr.body, by, cutoff + 1))
    if isinstance(expr, Let):
        return Let(
            expr.name,
            shift(expr.type, by, cutoff) if expr.type else None,
            shift(expr.value, by, cutoff),
            shift(expr.body, by, cutoff + 1),
        )
    raise TypeError(expr)


def instantiate1(body: Expr, value: Expr, depth: int = 0) -> Expr:
    """Substitute Var(depth) in body with value, adjusting indices."""
    if isinstance(body, Var):
        if body.idx == depth:
            return shift(value, depth)
        return Var(body.idx - 1) if body.idx > depth else body
    if isinstance(body, (Sort, Const, FVar, MVar, Lit)):
        return body
    if isinstance(body, App):
        return App(instantiate1(body.fn, value, depth), instantiate1(body.arg, value, depth))
    if isinstance(body, Lam):
        return Lam(body.name, instantiate1(body.type, value, depth), instantiate1(body.body, value, depth + 1))
    if isinstance(body, Pi):
        return Pi(body.name, instantiate1(body.type, value, depth), instantiate1(body.body, value, depth + 1))
    if isinstance(body, Let):
        return Let(
            body.name,
            instantiate1(body.type, value, depth) if body.type else None,
            instantiate1(body.value, value, depth),
            instantiate1(body.body, value, depth + 1),
        )
    raise TypeError(body)


def abstract(expr: Expr, name: Name, depth: int = 0) -> Expr:
    """Replace free variable `name` with bound Var(depth); increase indices > depth."""
    if isinstance(expr, Var):
        return expr
    if isinstance(expr, FVar):
        return Var(depth) if expr.name == name else expr
    if isinstance(expr, (Sort, Const, MVar, Lit)):
        return expr
    if isinstance(expr, App):
        return App(abstract(expr.fn, name, depth), abstract(expr.arg, name, depth))
    if isinstance(expr, Lam):
        return Lam(expr.name, abstract(expr.type, name, depth), abstract(expr.body, name, depth + 1))
    if isinstance(expr, Pi):
        return Pi(expr.name, abstract(expr.type, name, depth), abstract(expr.body, name, depth + 1))
    if isinstance(expr, Let):
        return Let(
            expr.name,
            abstract(expr.type, name, depth) if expr.type else None,
            abstract(expr.value, name, depth),
            abstract(expr.body, name, depth + 1),
        )
    raise TypeError(expr)


def abstract_many(expr: Expr, names: Sequence[Name]) -> Expr:
    """Abstract a list of names, last name becomes Var(0)."""
    out = expr
    for depth, nm in enumerate(reversed(names)):
        out = abstract(out, nm, depth)
    return out


def alpha_equiv(a: Expr, b: Expr) -> bool:
    """Structural equality modulo binder names (de Bruijn handles most)."""
    return a == b


def free_fvars(expr: Expr) -> set[Name]:
    out: set[Name] = set()
    if isinstance(expr, FVar):
        out.add(expr.name)
    elif isinstance(expr, App):
        out |= free_fvars(expr.fn)
        out |= free_fvars(expr.arg)
    elif isinstance(expr, Lam):
        out |= free_fvars(expr.type)
        out |= free_fvars(expr.body)
    elif isinstance(expr, Pi):
        out |= free_fvars(expr.type)
        out |= free_fvars(expr.body)
    elif isinstance(expr, Let):
        out |= free_fvars(expr.type) if expr.type else set()
        out |= free_fvars(expr.value)
        out |= free_fvars(expr.body)
    return out
