from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from storage import PatchStorage
import os
from pathlib import Path

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Initialize storage
storage = PatchStorage("patches.json")


@app.route('/')
def index():
    """Serve the main HTML file."""
    return send_from_directory('.', 'index.html')


@app.route('/<path:path>')
def serve_static(path):
    """Serve static files (CSS, JS)."""
    return send_from_directory('.', path)


@app.route('/api/patch/<uuid>', methods=['GET'])
def get_patch(uuid):
    """
    Get a specific patch by UUID.

    Returns:
        200: Patch data
        404: Patch not found
    """
    patch = storage.get_patch(uuid)

    if patch is None:
        return jsonify({"error": "Patch not found"}), 404

    return jsonify(patch)


@app.route('/api/patch', methods=['POST'])
def create_patch():
    """
    Create a new patch version.

    Expected JSON body:
        {
            "data": { ... patch data ... },
            "parent_uuid": "optional-parent-uuid"
        }

    Returns:
        201: New patch created with UUID
        400: Invalid request
    """
    try:
        request_data = request.get_json()

        if not request_data or "data" not in request_data:
            return jsonify({"error": "Missing 'data' field"}), 400

        patch_data = request_data["data"]
        parent_uuid = request_data.get("parent_uuid")

        # Save the patch
        new_uuid = storage.save_patch(patch_data, parent_uuid)

        return jsonify({
            "uuid": new_uuid,
            "parent_uuid": parent_uuid
        }), 201

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/patch/<uuid>/history', methods=['GET'])
def get_patch_history(uuid):
    """
    Get the full history chain for a patch.

    Returns:
        200: List of patches from oldest to newest
        404: Patch not found
    """
    history = storage.get_patch_history(uuid)

    if not history:
        return jsonify({"error": "Patch not found"}), 404

    return jsonify({
        "uuid": uuid,
        "history": history
    })


@app.route('/api/patch/<uuid>/children', methods=['GET'])
def get_patch_children(uuid):
    """
    Get all direct children (forks) of a patch.

    Returns:
        200: List of child patches
    """
    children = storage.get_children(uuid)

    return jsonify({
        "uuid": uuid,
        "children": children
    })


@app.route('/api/tunings', methods=['GET'])
def list_tunings():
    """Return a flat list of all .scl files under tunings/."""
    root = Path('tunings')
    tunings = sorted(
        str(p.relative_to(root)).replace(os.sep, '/')
        for p in root.rglob('*.scl')
    )
    return jsonify({"tunings": tunings})


@app.route('/api/patches', methods=['GET'])
def get_all_patches():
    """
    Get all patches (for debugging/admin).

    Returns:
        200: List of all patches
    """
    patches = storage.get_all_patches()

    return jsonify({
        "total": len(patches),
        "patches": patches
    })


if __name__ == '__main__':
    # Run in development mode
    app.run(debug=True, host='0.0.0.0', port=5500)
