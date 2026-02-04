"""
Environment and declaration records.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

from . import ast


@dataclass(frozen=True)
class ConstantDecl:
    name: ast.Name
    type: ast.Expr
    value: Optional[ast.Expr] = None
    reducible: bool = True
    universe_params: Tuple[str, ...] = ()


@dataclass(frozen=True)
class ConstructorDecl:
    name: ast.Name
    type: ast.Expr
    inductive: ast.Name


@dataclass(frozen=True)
class InductiveDecl:
    name: ast.Name
    params: List[Tuple[ast.Name, ast.Expr]]  # parameter binders
    sort: ast.Level
    ctors: List[ConstructorDecl]


@dataclass(frozen=True)
class RecursorDecl:
    name: ast.Name
    inductive: ast.Name
    params: List[Tuple[ast.Name, ast.Expr]]
    result_level: ast.Level
    ctor_minors: List[ast.Expr]  # types of minor premises
    ctor_arg_types: List[List[ast.Expr]]  # per-ctor binder types
    ctor_arg_is_rec: List[List[bool]]  # flags for recursive arguments
    ctors_order: List[ast.Name]


class Environment:
    def __init__(self) -> None:
        self.constants: Dict[ast.Name, ConstantDecl] = {}
        self.inductives: Dict[ast.Name, InductiveDecl] = {}
        self.constructors: Dict[ast.Name, ConstructorDecl] = {}
        self.recursors: Dict[ast.Name, RecursorDecl] = {}

    # ---- Adders ----
    def add_constant(self, decl: ConstantDecl) -> None:
        self.constants[decl.name] = decl

    def add_inductive(self, ind: InductiveDecl, rec: Optional[RecursorDecl], rec_const: Optional[ConstantDecl]) -> None:
        self.inductives[ind.name] = ind
        for ctor in ind.ctors:
            self.constructors[ctor.name] = ctor
        if rec and rec_const:
            self.recursors[rec.name] = rec
            self.constants[rec.name] = rec_const

    # ---- Lookups ----
    def get_constant(self, name: ast.Name) -> Optional[ConstantDecl]:
        c = self.constants.get(name)
        if c:
            return c
        ctor = self.constructors.get(name)
        if ctor:
            return ConstantDecl(name, ctor.type, value=None, reducible=True)
        return None

    def get_inductive(self, name: ast.Name) -> Optional[InductiveDecl]:
        return self.inductives.get(name)

    def get_constructor(self, name: ast.Name) -> Optional[ConstructorDecl]:
        return self.constructors.get(name)

    def get_recursor(self, name: ast.Name) -> Optional[RecursorDecl]:
        return self.recursors.get(name)
