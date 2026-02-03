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
