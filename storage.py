import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any, List
import threading


class PatchStorage:
    """Append-only JSON storage for patches with version history."""

    def __init__(self, storage_file: str = "patches.json"):
        self.storage_file = Path(storage_file)
        self.lock = threading.Lock()
        self._ensure_storage_exists()

    def _ensure_storage_exists(self):
        """Create storage file if it doesn't exist."""
        if not self.storage_file.exists():
            self.storage_file.write_text(json.dumps({"patches": []}, indent=2))

    def _read_storage(self) -> Dict[str, Any]:
        """Read the entire storage file."""
        with self.lock:
            try:
                return json.loads(self.storage_file.read_text())
            except json.JSONDecodeError:
                # If file is corrupted, return empty structure
                return {"patches": []}

    def _write_storage(self, data: Dict[str, Any]):
        """Write the entire storage file."""
        with self.lock:
            self.storage_file.write_text(json.dumps(data, indent=2))

    def save_patch(self, patch_data: Dict[str, Any], parent_uuid: Optional[str] = None) -> str:
        """
        Save a new patch version and return its UUID.

        Args:
            patch_data: The patch data (nodes, connections, etc.)
            parent_uuid: Optional UUID of the parent patch (for history tracking)

        Returns:
            The UUID of the newly created patch
        """
        patch_uuid = str(uuid.uuid4())

        storage = self._read_storage()

        patch_entry = {
            "uuid": patch_uuid,
            "parent_uuid": parent_uuid,
            "timestamp": datetime.utcnow().isoformat(),
            "data": patch_data
        }

        storage["patches"].append(patch_entry)
        self._write_storage(storage)

        return patch_uuid

    def get_patch(self, patch_uuid: str) -> Optional[Dict[str, Any]]:
        """
        Retrieve a patch by its UUID.

        Args:
            patch_uuid: The UUID of the patch to retrieve

        Returns:
            The patch entry (including metadata) or None if not found
        """
        storage = self._read_storage()

        for patch in storage["patches"]:
            if patch["uuid"] == patch_uuid:
                return patch

        return None

    def get_patch_history(self, patch_uuid: str) -> List[Dict[str, Any]]:
        """
        Get the full history chain for a patch by walking back through parents.

        Args:
            patch_uuid: The UUID to start from

        Returns:
            List of patches from oldest to newest (ending with patch_uuid)
        """
        history = []
        current_uuid = patch_uuid
        storage = self._read_storage()

        # Build a lookup map for faster access
        patches_by_uuid = {p["uuid"]: p for p in storage["patches"]}

        # Walk backwards through parents
        visited = set()  # Prevent infinite loops
        while current_uuid and current_uuid not in visited:
            if current_uuid in patches_by_uuid:
                patch = patches_by_uuid[current_uuid]
                history.insert(0, patch)  # Insert at beginning to get chronological order
                visited.add(current_uuid)
                current_uuid = patch.get("parent_uuid")
            else:
                break

        return history

    def get_all_patches(self) -> List[Dict[str, Any]]:
        """Get all patches (for debugging/admin)."""
        storage = self._read_storage()
        return storage["patches"]

    def get_children(self, patch_uuid: str) -> List[Dict[str, Any]]:
        """
        Get all direct children (forks) of a patch.

        Args:
            patch_uuid: The UUID to find children for

        Returns:
            List of patches that have this UUID as their parent
        """
        storage = self._read_storage()
        return [p for p in storage["patches"] if p.get("parent_uuid") == patch_uuid]
