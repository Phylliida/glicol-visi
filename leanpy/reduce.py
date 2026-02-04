"""
Weak-head normalization and definitional equality (Modules 2 & 5).
"""
from __future__ import annotations

from typing import Optional

from . import ast, env


def whnf(expr: ast.Expr, e: env.Environment, fuel: int = 256) -> ast.Expr:
    """Weak-head normalize with β, δ, ζ, and ι (for recursors)."""
    step = 0
    cur = expr
    while step < fuel:
        step += 1
        # ζ: let
        if isinstance(cur, ast.Let):
            cur = ast.instantiate1(cur.body, cur.value)
            continue

        # δ: unfold constants with values
        if isinstance(cur, ast.Const):
            decl = e.get_constant(cur.name)
            if decl and decl.value is not None and decl.reducible:
                cur = decl.value
                continue
            return cur

        # β + iota inside application chains
        if isinstance(cur, ast.App):
            fn_whnf = whnf(cur.fn, e, fuel - step)
            if isinstance(fn_whnf, ast.Lam):
                cur = ast.instantiate1(fn_whnf.body, cur.arg)
                continue
            candidate = ast.App(fn_whnf, cur.arg)
            iota_red = reduce_iota(candidate, e, fuel - step)
            if iota_red is not None:
                cur = iota_red
                continue
            # If no reduction, keep as built (fn already in WHNF)
            if candidate == cur and not isinstance(cur.arg, ast.App):
                return candidate
            cur = candidate
            continue

        return cur
    return cur  # out of fuel; best effort


def reduce_iota(expr: ast.Expr, e: env.Environment, fuel: int = 128) -> Optional[ast.Expr]:
    """Perform one ι-reduction step for a recursor applied to a constructor."""
    if fuel <= 0:
        return None
    head, args = ast.unwind_app(expr)
    if not isinstance(head, ast.Const):
        return None
    rec_decl = e.get_recursor(head.name)
    if rec_decl is None:
        return None
    param_count = len(rec_decl.params)
    ctor_count = len(rec_decl.ctor_minors)
    needed = param_count + 1 + ctor_count + 1  # params, C, minors..., major
    if len(args) < needed:
        return None

    params_args = args[:param_count]
    result_type = args[param_count]
    minors = args[param_count + 1 : param_count + 1 + ctor_count]
    major = args[needed - 1]

    maj_head, maj_args = ast.unwind_app(whnf(major, e, fuel - 1))
    if not isinstance(maj_head, ast.Const):
        return None
    ctor = e.get_constructor(maj_head.name)
    if ctor is None or ctor.inductive != rec_decl.inductive:
        return None
    try:
        ctor_idx = rec_decl.ctors_order.index(maj_head.name)
    except ValueError:
        return None
    expected_arg_types = rec_decl.ctor_arg_types[ctor_idx]
    if len(maj_args) < len(expected_arg_types):
        return None  # not fully applied

    rec_flags = rec_decl.ctor_arg_is_rec[ctor_idx]
    minor_fn = minors[ctor_idx]

    # Build application of minor with constructor arguments + IHs
    applied = minor_fn
    for arg_val, is_rec in zip(maj_args, rec_flags):
        applied = ast.App(applied, arg_val)
        if is_rec:
            ih = ast.mk_app(head, *(params_args + [result_type] + minors + [arg_val]))
            applied = ast.App(applied, ih)
    return applied


def defeq(a: ast.Expr, b: ast.Expr, e: env.Environment, fuel: int = 256) -> bool:
    """Definitional equality via WHNF with simple η for functions."""
    if fuel <= 0:
        return False

    aw = whnf(a, e, fuel)
    bw = whnf(b, e, fuel)
    if aw == bw:
        return True

    # Sorts
    if isinstance(aw, ast.Sort) and isinstance(bw, ast.Sort):
        return aw.level == bw.level

    # Constants
    if isinstance(aw, ast.Const) and isinstance(bw, ast.Const):
        return aw.name == bw.name and aw.levels == bw.levels

    # Variables / free variables / literals
    if isinstance(aw, (ast.Var, ast.FVar, ast.Lit)) and isinstance(bw, type(aw)):
        return aw == bw

    # Applications
    if isinstance(aw, ast.App) and isinstance(bw, ast.App):
        return defeq(aw.fn, bw.fn, e, fuel - 1) and defeq(aw.arg, bw.arg, e, fuel - 1)

    # Lambdas (up to η)
    if isinstance(aw, ast.Lam) and isinstance(bw, ast.Lam):
        return defeq(aw.type, bw.type, e, fuel - 1) and defeq(aw.body, bw.body, e, fuel - 1)

    if isinstance(aw, ast.Lam):
        v = ast.Var(0)
        bw_eta = ast.Lam(ast.Name.anon(), aw.type, ast.App(ast.shift(bw, 1), v))
        return defeq(aw, bw_eta, e, fuel - 1)
    if isinstance(bw, ast.Lam):
        v = ast.Var(0)
        aw_eta = ast.Lam(ast.Name.anon(), bw.type, ast.App(ast.shift(aw, 1), v))
        return defeq(aw_eta, bw, e, fuel - 1)

    # Π-types
    if isinstance(aw, ast.Pi) and isinstance(bw, ast.Pi):
        return defeq(aw.type, bw.type, e, fuel - 1) and defeq(aw.body, bw.body, e, fuel - 1)

    return False
