# glicol-visi

An opinionated visual (non-code) interface for making music with glicol (a code-based synth, like strudel).

## Features

- **Visual Node Editor**: Drag and drop nodes to create your audio graph
- **Real-time Connections**: Connect nodes with bezier curves
- **Auto-save**: Changes are automatically saved to the backend
- **Version History**: Every modification creates a new version (fork-based history)
- **Shareable URLs**: Share your patches via URL hash

## Getting Started

### Prerequisites

- Python 3.7+
- Modern web browser

### Installation

1. Install Python dependencies:
```bash
pip install -r requirements.txt
```

2. Run the Flask server:
```bash
python server.py
```

3. Open your browser to:
```
http://localhost:5000
```

## Usage

### Creating Nodes
- Click the "+ Node Type" buttons in the toolbar to add nodes
- Drag nodes around the canvas
- Click and hold to drag

### Making Connections
- Click an output port (red, on the right)
- Then click an input port (blue, on the left)
- The connection will appear as a curved line

### Removing Connections
- Click on any connection line to remove it

### Saving & History
- **Auto-save**: Changes are automatically saved 1 second after you stop editing
- **Manual Save**: Click "Save Now" to save immediately
- **View History**: Click "View History" to see all versions of the current patch

### Sharing
- The URL hash contains the current patch UUID
- Copy the URL to share your patch with others
- Each edit creates a new UUID (forking model)

## Architecture

- **Frontend**: Vanilla JavaScript with HTML Canvas for node rendering
- **Backend**: Flask server with append-only JSON storage
- **Storage**: All patches stored in `patches.json` with parent/child relationships

## API Endpoints

- `GET /api/patch/<uuid>` - Get a specific patch
- `POST /api/patch` - Create a new patch version
- `GET /api/patch/<uuid>/history` - Get patch history
- `GET /api/patch/<uuid>/children` - Get forked versions
- `GET /api/patches` - Get all patches (debug)

## Appendix: Calculus of Inductive Constructions (CIC) — First-Principles Primer

This project mentions Lean; Lean’s logical foundation is the Calculus of Inductive Constructions. Here’s a ground‑up sketch of how CIC works and why it’s trusted.

- **Terms and types are unified**: Everything is a term, and every term has a type. Functions can return types and take types as inputs. The notation `Π (x : A), B x` is both “for all x in A, B x holds” and “a function that, given x : A, produces a term of type B x.”
- **Propositions as types**: Logical propositions live in the special universe `Prop`; a proof of `P` is just a term of type `P`. If you can type‑check a term `t : P`, you have proved `P`.
- **Universes prevent paradoxes**: Types themselves live in an infinite hierarchy `Type 0, Type 1, …`; this stratification avoids Girard’s paradox (no `Type : Type`).
- **Inductive types add data and reasoning principles**: Declaring an inductive (e.g., natural numbers) simultaneously introduces:
  - Constructors (e.g., `zero`, `succ`) that build data.
  - A recursor/eliminator that specifies how to consume the data by recursion/induction. For `Nat`, this is the familiar primitive “define on `zero` and on `succ n` given a result for `n`.”
- **Computation is definitional equality**: The kernel reduces terms by β (function application), δ (unfold definitions), ι (match on constructors), and ζ (let‑unfolding) to decide whether two terms are definitionally equal. Proof checking boils down to verifying types and these reductions.
- **Safety boundary — the kernel**: All of Lean sits atop a tiny, trusted kernel that only knows: (1) type formation rules (Π, universes), (2) inductive declarations, and (3) the reduction rules above. Anything not justified inside the kernel—tactics, automation, compilation—is untrusted scaffolding.
- **Termination & consistency**: Recursive definitions must be accepted by the kernel’s termination checker (structural or well‑founded). This blocks non‑terminating terms from inhabiting `False`, preserving consistency.
- **Extraction angle**: Because proofs are programs, you can erase proof‑only parts (terms in `Prop`) and keep computational content in `Type`, yielding certified programs from constructive proofs.

Takeaway: CIC supplies a minimal, programmable core (dependent functions + inductives + universes); Lean’s user‑friendly features (`match`, tactics, automation) compile down to this small kernel, which is the only part you must trust.
