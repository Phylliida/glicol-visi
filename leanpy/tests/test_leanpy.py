import pytest

from leanpy import ast, env, inductive, reduce, typing


def test_shift_and_instantiate():
    x = ast.Var(0)
    body = ast.Lam(ast.Name.mk("x"), ast.Sort(ast.Level.zero()), x)
    res = ast.instantiate1(body.body, ast.Const(ast.Name.mk("c")))
    assert isinstance(res, ast.Const)
    assert res.name == ast.Name.mk("c")


def test_nat_rec_iota():
    e = env.Environment()
    inductive.add_inductive(
        e,
        "Nat",
        params=[],
        ctors=[("zero", []), ("succ", [ast.Const(ast.Name.mk("Nat"))])],
        sort=ast.Level.zero(),
    )

    C = ast.Sort(ast.Level.zero())
    base = ast.Const(ast.Name.mk("b"))
    step = ast.Lam(
        ast.Name.mk("n"),
        ast.Const(ast.Name.mk("Nat")),
        ast.Lam(ast.Name.mk("ih"), C, ast.Const(ast.Name.mk("s"))),
    )
    zero = ast.Const(ast.Name.mk("zero"))
    one = ast.App(ast.Const(ast.Name.mk("succ")), zero)

    rec = ast.Const(ast.Name.mk("Nat.rec"))
    term = ast.mk_app(rec, C, base, step, one)
    wh = reduce.whnf(term, e)
    # Should reduce to step n ih where n = zero and ih = rec ... zero
    assert isinstance(wh, ast.App)
    # fn part should be App(step, zero)
    fn_head, fn_args = ast.unwind_app(wh.fn)
    assert fn_head == step
    assert fn_args and fn_args[0] == zero


def test_type_pi_lambda():
    e = env.Environment()
    A_sort = ast.Sort(ast.Level.zero())
    # Π (A : Sort 0), Π (x : A), A
    id_ty = ast.Pi(
        ast.Name.mk("A"),
        A_sort,
        ast.Pi(ast.Name.mk("x"), ast.Var(0), ast.Var(1)),  # Var 1 refers to A
    )
    id_term = ast.Lam(
        ast.Name.mk("A"),
        A_sort,
        ast.Lam(ast.Name.mk("x"), ast.Var(0), ast.Var(0)),  # body returns x
    )
    ty = typing.infer(id_term, e)
    assert reduce.defeq(ty, id_ty, e)
