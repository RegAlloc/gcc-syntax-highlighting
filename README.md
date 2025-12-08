# gcc-syntax-highlighting – GCC internals in color

**Extension version:** 0.0.1

This repository contains a Visual Studio Code / VSCodium extension that adds syntax highlighting for **GCC internals**.
It is aimed at people working on GCC itself or regularly reading GCC dumps.

## License

This project is licensed under the GNU General Public License v3.0 or later (GPL-3.0-or-later).

See the [LICENSE](./LICENSE) file for details.


## What this is useful for

When hacking on GCC you often need to read and understand:

- **Machine description files (`.md`)**
  - `define_insn`, `define_expand`, `define_split`, `define_peephole2`, iterators, attributes, `match_operand`, and RTL patterns.
  - Embedded C/C++ blocks inside MD files.
- **RTL dumps** (files like `foo.c.176r.expand`)
  - `insn`, `jump_insn`, `call_insn`, `note`, `barrier`, `code_label`, `debug_insn` records.
  - `set`, `parallel`, `clobber`, `use`, arithmetic and logical RTL operators.
  - Registers and modes such as `reg:DI 3`, vector modes, `const_int` and other constants.
- **GIMPLE dumps** (files like `foo.c.065t.ssa`, `foo.c.093t.optimized`)
  - Basic block headers like `<bb 3>` and associated metadata.
  - GIMPLE statements such as `gimple_call`, `gimple_assign`, `gimple_cond`, `gimple_switch`, `gimple_label`.
  - PHI nodes and SSA names so you can follow dataflow.
- **`match.pd` pattern files**
  - `match` / `simplify` rules and helper definitions.
  - Operator trees (e.g. `plus`, `mult`, `bit_and`, `lshift`, `cond`, `vec_perm`, `fma`, etc.).
  - Captures like `@x` and `@@y`, plus embedded C/C++ action code.

Reading all of this as plain, uncolored text is painful. This extension provides TextMate grammars so that VS Code / VSCodium can:

- Color **MD** constructs (define forms, iterators, predicates, operands, RTL operators, modes, constants).
- Color **RTL** dumps (instruction kinds, UIDs, registers, modes, constants, and common RTL operators).
- Color **GIMPLE** dumps (basic blocks, common statement kinds, PHIs, SSA names, constants, and control-flow keywords).
- Color **`match.pd`** (pattern headers, operators, captures, preprocessor lines, and C/C++ action blocks).

In short, this repo is useful any time you are:

- Developing or debugging GCC itself.
- Inspecting GIMPLE or RTL dumps produced by GCC.
- Working on `match.pd` or `.md` files and want them to be readable inside VS Code / VSCodium instead of in a bare terminal.

## Syntax Highlighting Preview

### Match Pattern
![Match](pictures/Match.png)

### GCC Machine Description
![GCC Machine Description](pictures/GCC-Machine-Description.png)
