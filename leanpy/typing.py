"""
Type inference and checking for the core Π-calculus plus inductives (Modules 3–5).
"""
from __future__ import annotations

from typing import Dict, List, Tuple

from . import ast, env, reduce


class TypeError(Exception):
    pass


def level_max(a: ast.Level, b: ast.Level) -> ast.Level:
    if a == b:
        return a
    return ast.Level.max(a, b)


def ensure_sort(t: ast.Expr, e: env.Environment) -> ast.Level:
    t_whnf = reduce.whnf(t, e)
    if isinstance(t_whnf, ast.Sort):
        return t_whnf.level
    raise TypeError(f"expected a sort, got {t_whnf}")


def infer(expr: ast.Expr, e: env.Environment, bctx: List[ast.Expr] | None = None, fctx: Dict[ast.Name, ast.Expr] | None = None) -> ast.Expr:
    """
    Infer the type of `expr` under bound-variable context `bctx` (de Bruijn)
    and free-variable context `fctx` (named locals).
    """
    bctx = bctx or []
    fctx = fctx or {}

    if isinstance(expr, ast.Sort):
        return ast.Sort(ast.Level.succ(expr.level))

    if isinstance(expr, ast.Var):
        try:
            return bctx[-(expr.idx + 1)]
        except IndexError:
            raise TypeError(f"unbound de Bruijn index {expr.idx}")

    if isinstance(expr, ast.FVar):
        if expr.name not in fctx:
            raise TypeError(f"unbound free var {expr.name}")
        return fctx[expr.name]

    if isinstance(expr, ast.Const):
        decl = e.get_constant(expr.name)
        if decl is None:
            raise TypeError(f"unknown constant {expr.name}")
        # Universe instantiation ignored for simplicity; assume closed defs.
        return decl.type

    if isinstance(expr, ast.App):
        fn_ty = infer(expr.fn, e, bctx, fctx)
        fn_ty_whnf = reduce.whnf(fn_ty, e)
        if not isinstance(fn_ty_whnf, ast.Pi):
            raise TypeError(f"cannot apply non-function: {fn_ty_whnf}")
        arg_ty = infer(expr.arg, e, bctx, fctx)
        if not reduce.defeq(arg_ty, fn_ty_whnf.type, e):
            raise TypeError(f"argument type mismatch: expected {fn_ty_whnf.type}, got {arg_ty}")
        return ast.instantiate1(fn_ty_whnf.body, expr.arg)

    if isinstance(expr, ast.Lam):
        dom_sort = ensure_sort(infer(expr.type, e, bctx, fctx), e)
        new_bctx = bctx + [expr.type]
        body_ty = infer(expr.body, e, new_bctx, fctx)
        return ast.Pi(expr.name, expr.type, body_ty)

    if isinstance(expr, ast.Pi):
        dom_sort = ensure_sort(infer(expr.type, e, bctx, fctx), e)
        new_bctx = bctx + [expr.type]
        body_ty = infer(expr.body, e, new_bctx, fctx)
        body_sort = ensure_sort(body_ty, e)
        return ast.Sort(level_max(dom_sort, body_sort))

    if isinstance(expr, ast.Let):
        val_ty = infer(expr.value, e, bctx, fctx)
        if expr.type is not None and not reduce.defeq(val_ty, expr.type, e):
            raise TypeError(f"let type annotation mismatch: {expr.type} vs {val_ty}")
        new_val_ty = expr.type or val_ty
        new_bctx = bctx + [new_val_ty]
        body_ty = infer(expr.body, e, new_bctx, fctx)
        return ast.instantiate1(body_ty, expr.value)

    if isinstance(expr, ast.Lit):
        # Treat literals as inhabited by a primitive type `Nat` if present.
        nat = ast.Name.mk("Nat")
        decl = e.get_constant(nat)
        if decl:
            return decl.name  # incorrect but placeholder
        raise TypeError(f"cannot infer literal type for {expr.value}")

    raise TypeError(f"unknown expression {expr}")


def check(expr: ast.Expr, expected: ast.Expr, e: env.Environment, bctx: List[ast.Expr] | None = None, fctx: Dict[ast.Name, ast.Expr] | None = None) -> None:
    actual = infer(expr, e, bctx, fctx)
    if not reduce.defeq(actual, expected, e):
        raise TypeError(f"expected {expected}, got {actual}")
