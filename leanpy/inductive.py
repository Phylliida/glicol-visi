"""
Inductive type declarations and recursor generation (Modules 4–5).
Simplified: parameters only, no indices; recursor is non-dependent but
provides induction hypotheses for recursive arguments.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import List, Sequence, Tuple

from . import ast, env


def pis_from(binders: Sequence[Tuple[ast.Name, ast.Expr]], body: ast.Expr) -> ast.Expr:
    res = body
    for nm, ty in reversed(binders):
        res = ast.Pi(nm, ty, ast.abstract(res, nm))
    return res


def is_recursive_arg(arg_ty: ast.Expr, ind_name: ast.Name, param_names: Sequence[ast.Name]) -> bool:
    head, args = ast.unwind_app(arg_ty)
    if not isinstance(head, ast.Const) or head.name != ind_name:
        return False
    if len(args) != len(param_names):
        return False
    return all(a == ast.FVar(nm) for a, nm in zip(args, param_names))


def build_constructor_type(ind_name: ast.Name, params: List[Tuple[ast.Name, ast.Expr]], arg_binders: List[Tuple[ast.Name, ast.Expr]]) -> ast.Expr:
    param_names = [p[0] for p in params]
    target = ast.mk_app(ast.Const(ind_name), *[ast.FVar(nm) for nm in param_names])
    return pis_from(params + arg_binders, target)


def build_recursor(ind_decl: env.InductiveDecl, result_level: ast.Level | None = None) -> Tuple[env.RecursorDecl, env.ConstantDecl]:
    result_level = result_level or ast.Level.param("u")
    param_names = [p[0] for p in ind_decl.params]

    # Motive/result type C : Sort u
    C_name = ast.Name.mk("C")
    C_sort = ast.Sort(result_level)
    C_var = ast.FVar(C_name)

    ctor_arg_types: List[List[ast.Expr]] = []
    ctor_arg_is_rec: List[List[bool]] = []
    minor_types: List[ast.Expr] = []

    for ctor in ind_decl.ctors:
        # Assume constructor type is Pi params -> args -> I params
        # Extract argument binders (after parameters)
        arg_binders: List[Tuple[ast.Name, ast.Expr]] = []
        ty = ctor.type
        # Strip parameter Pis
        for _ in ind_decl.params:
            if isinstance(ty, ast.Pi):
                ty = ty.body
            else:
                break
        # Now collect actual argument Pis until target
        while isinstance(ty, ast.Pi):
            arg_binders.append((ty.name, ty.type))
            ty = ty.body

        flags: List[bool] = []
        for name, arg_ty in arg_binders:
            flags.append(is_recursive_arg(arg_ty, ind_decl.name, param_names))
        ctor_arg_types.append([t for _, t in arg_binders])
        ctor_arg_is_rec.append(flags)

        # Minor premise type: args, plus IH for each recursive arg, → C
        minor_binders: List[Tuple[ast.Name, ast.Expr]] = []
        for (nm, ty_b), is_rec in zip(arg_binders, flags):
            minor_binders.append((nm, ty_b))
            if is_rec:
                ih_nm = ast.Name.mk(f"ih_{nm.parts[-1]}")
                minor_binders.append((ih_nm, C_var))
        minor_ty = pis_from(minor_binders, C_var)
        minor_types.append(minor_ty)

    # Build recursor type Π params, C, minors..., (x : I params), C
    binders: List[Tuple[ast.Name, ast.Expr]] = []
    binders += ind_decl.params
    binders.append((C_name, C_sort))
    binders += [(ast.Name.mk(f"m_{i}"), mty) for i, mty in enumerate(minor_types)]
    x_name = ast.Name.mk("x")
    x_ty = ast.mk_app(ast.Const(ind_decl.name), *[ast.FVar(nm) for nm in param_names])
    binders.append((x_name, x_ty))
    rec_type = pis_from(binders, C_var)

    rec_name = ind_decl.name.extend("rec")
    rec_decl = env.RecursorDecl(
        name=rec_name,
        inductive=ind_decl.name,
        params=ind_decl.params,
        result_level=result_level,
        ctor_minors=minor_types,
        ctor_arg_types=ctor_arg_types,
        ctor_arg_is_rec=ctor_arg_is_rec,
        ctors_order=[c.name for c in ind_decl.ctors],
    )
    rec_const = env.ConstantDecl(rec_name, rec_type, value=None, reducible=True)
    return rec_decl, rec_const


def add_inductive(env_: env.Environment, name: str, params: List[Tuple[str, ast.Expr]], ctors: List[Tuple[str, List[ast.Expr]]], sort: ast.Level | None = None) -> env.InductiveDecl:
    sort = sort or ast.Level.zero()
    param_binders = [(ast.Name.mk(pn), pty) for pn, pty in params]
    ctor_decls: List[env.ConstructorDecl] = []
    for ctor_name, arg_types in ctors:
        arg_binders = [(ast.Name.mk(f"a{i}"), ty) for i, ty in enumerate(arg_types)]
        ctor_type = build_constructor_type(ast.Name.mk(name), param_binders, arg_binders)
        ctor_decls.append(env.ConstructorDecl(ast.Name.mk(ctor_name), ctor_type, ast.Name.mk(name)))

    ind_decl = env.InductiveDecl(ast.Name.mk(name), param_binders, sort, ctor_decls)
    rec_decl, rec_const = build_recursor(ind_decl)
    env_.add_inductive(ind_decl, rec_decl, rec_const)
    # Also register constructors as constants for lookup convenience
    for ctor in ctor_decls:
        env_.constants[ctor.name] = env.ConstantDecl(ctor.name, ctor.type, value=None)
    return ind_decl
