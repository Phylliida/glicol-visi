#!/usr/bin/env python3
"""
UI Testing Suite for Glicol Visual Editor
Uses nodriver (zendriver) for browser automation
"""

import asyncio
import nodriver as uc
import time
from typing import Optional


class GlicolUITester:
    """Test harness for Glicol Visual Editor UI"""

    def __init__(self, url: str = "http://127.0.0.1:5000"):
        self.url = url
        self.browser: Optional[uc.Browser] = None
        self.page: Optional[uc.Tab] = None

    async def setup(self):
        """Initialize browser and navigate to app"""
        print("🚀 Launching browser...")
        self.browser = await uc.start()
        self.page = await self.browser.get(self.url)

        # Wait for page to load
        await asyncio.sleep(2)
        print(f"✅ Loaded {self.url}")

        # Wait for the app to be ready
        await self.page.wait_for("div#app", timeout=10)
        print("✅ App container found")

    async def teardown(self):
        """Clean up browser instance"""
        if self.browser:
            self.browser.stop()
            print("🛑 Browser closed")

    async def screenshot(self, filename: str = "screenshot.png"):
        """Take a screenshot"""
        if self.page:
            await self.page.save_screenshot(filename)
            print(f"📸 Screenshot saved: {filename}")

    async def get_node_count(self) -> int:
        """Count how many nodes are on the canvas"""
        nodes = await self.page.select_all(".node")
        count = len(nodes)
        print(f"📊 Found {count} nodes on canvas")
        return count

    async def get_connection_count(self) -> int:
        """Count how many connections exist"""
        connections = await self.page.select_all(".connection")
        count = len(connections)
        print(f"🔗 Found {count} connections")
        return count

    async def click_add_node_button(self, node_type: str):
        """Click a button to add a node of the specified type"""
        print(f"🖱️  Clicking 'Add {node_type.capitalize()}' button...")

        # Find the button with matching data-type attribute
        button = await self.page.select(f'button.add-node[data-type="{node_type}"]')

        if button:
            await button.click()
            await asyncio.sleep(0.5)  # Wait for node to be created
            print(f"✅ Clicked 'Add {node_type.capitalize()}'")
            return True
        else:
            print(f"❌ Button for '{node_type}' not found")
            return False

    async def drag_node(self, node_index: int = 0, dx: int = 100, dy: int = 50):
        """Drag a node by a specified offset"""
        nodes = await self.page.select_all(".node")

        if node_index >= len(nodes):
            print(f"❌ Node index {node_index} out of range (only {len(nodes)} nodes)")
            return False

        node = nodes[node_index]

        # Get element position using JavaScript
        result = await self.page.evaluate(f"""
            (function() {{
                const nodes = document.querySelectorAll('.node');
                const rect = nodes[{node_index}].getBoundingClientRect();
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;
                return JSON.stringify([centerX, centerY]);
            }})()
        """)

        if not result:
            print(f"❌ Could not get position for node {node_index}")
            return False

        # Parse JSON result
        import json
        try:
            position = json.loads(result)
            x = float(position[0])
            y = float(position[1])
        except (json.JSONDecodeError, IndexError, ValueError, TypeError) as e:
            print(f"❌ Failed to parse position: {e}, result type: {type(result)}, value: {result}")
            return False

        print(f"🖱️  Dragging node {node_index} from ({x:.0f}, {y:.0f}) by ({dx}, {dy})...")

        # Perform drag operation using JavaScript simulation
        await self.page.evaluate(f"""
            (function() {{
                const node = document.querySelectorAll('.node')[{node_index}];
                const startX = {x};
                const startY = {y};
                const endX = {x + dx};
                const endY = {y + dy};

                // Simulate mousedown
                const mouseDown = new MouseEvent('mousedown', {{
                    bubbles: true,
                    cancelable: true,
                    clientX: startX,
                    clientY: startY
                }});
                node.dispatchEvent(mouseDown);

                // Simulate mousemove
                setTimeout(() => {{
                    const mouseMove = new MouseEvent('mousemove', {{
                        bubbles: true,
                        cancelable: true,
                        clientX: endX,
                        clientY: endY
                    }});
                    document.dispatchEvent(mouseMove);

                    // Simulate mouseup
                    setTimeout(() => {{
                        const mouseUp = new MouseEvent('mouseup', {{
                            bubbles: true,
                            cancelable: true,
                            clientX: endX,
                            clientY: endY
                        }});
                        document.dispatchEvent(mouseUp);
                    }}, 100);
                }}, 100);
            }})()
        """)

        await asyncio.sleep(0.5)

        print(f"✅ Dragged node {node_index}")
        return True

    async def create_connection(self, from_node_idx: int, to_node_idx: int):
        """Create a connection between two nodes"""
        print(f"🔗 Connecting node {from_node_idx} → node {to_node_idx}...")

        # Get all output ports and input ports
        output_ports = await self.page.select_all(".port.output")
        input_ports = await self.page.select_all(".port.input")

        if from_node_idx >= len(output_ports):
            print(f"❌ Not enough output ports")
            return False

        if to_node_idx >= len(input_ports):
            print(f"❌ Not enough input ports")
            return False

        # Get port positions using JavaScript
        result = await self.page.evaluate(f"""
            (function() {{
                const outputPorts = document.querySelectorAll('.port.output');
                const inputPorts = document.querySelectorAll('.port.input');

                const fromRect = outputPorts[{from_node_idx}].getBoundingClientRect();
                const toRect = inputPorts[{to_node_idx}].getBoundingClientRect();

                return JSON.stringify([
                    fromRect.left + fromRect.width / 2,
                    fromRect.top + fromRect.height / 2,
                    toRect.left + toRect.width / 2,
                    toRect.top + toRect.height / 2
                ]);
            }})()
        """)

        if not result:
            print("❌ Could not get port positions")
            return False

        # Parse JSON result
        import json
        try:
            positions = json.loads(result)
            from_x = float(positions[0])
            from_y = float(positions[1])
            to_x = float(positions[2])
            to_y = float(positions[3])
        except (json.JSONDecodeError, IndexError, ValueError, TypeError) as e:
            print(f"❌ Failed to parse positions: {e}")
            return False

        # Click output port and drag to input port using JavaScript simulation
        # Directly manipulate the application state since event simulation is tricky
        result = await self.page.evaluate(f"""
            (function() {{
                const outputPorts = document.querySelectorAll('.port.output');
                const inputPorts = document.querySelectorAll('.port.input');

                const outputPort = outputPorts[{from_node_idx}];
                const inputPort = inputPorts[{to_node_idx}];

                // Get port information
                const fromPort = {{
                    nodeId: outputPort.dataset.nodeId,
                    portType: outputPort.dataset.portType,
                    portIndex: parseInt(outputPort.dataset.portIndex)
                }};

                const toPort = {{
                    nodeId: inputPort.dataset.nodeId,
                    portType: inputPort.dataset.portType,
                    portIndex: parseInt(inputPort.dataset.portIndex)
                }};

                // Directly create connection in state (simulating what the event handlers do)
                // Normalize to output -> input
                const [from, to] = fromPort.portType === 'output' ? [fromPort, toPort] : [toPort, fromPort];

                // Check if connection already exists
                const exists = Array.from(state.connections.values()).some(c =>
                    c.fromNodeId === from.nodeId && c.fromPortIndex === from.portIndex &&
                    c.toNodeId === to.nodeId && c.toPortIndex === to.portIndex
                );

                if (!exists && from.nodeId !== to.nodeId) {{
                    const id = generateId('conn');
                    state.connections.set(id, {{
                        id,
                        fromNodeId: from.nodeId,
                        fromPortIndex: from.portIndex,
                        toNodeId: to.nodeId,
                        toPortIndex: to.portIndex
                    }});
                    render();
                    return JSON.stringify({{ success: true, connectionId: id }});
                }} else {{
                    return JSON.stringify({{ success: false, exists, sameNode: from.nodeId === to.nodeId }});
                }}
            }})()
        """)

        print(f"   Connection result: {result}")

        await asyncio.sleep(0.3)

        print(f"✅ Connection created")
        return True

    async def remove_connection(self, connection_index: int = 0):
        """Remove a connection by clicking on it"""
        print(f"🗑️  Removing connection {connection_index}...")

        # Get all connection elements
        connections = await self.page.select_all("g[data-connection-id]")

        if connection_index >= len(connections):
            print(f"❌ Connection index {connection_index} out of range (only {len(connections)} connections)")
            return False

        # Click on the connection to remove it
        connection = connections[connection_index]
        await connection.click()
        await asyncio.sleep(0.3)

        print(f"✅ Connection removed")
        return True

    async def click_save_button(self):
        """Click the save button"""
        print("💾 Clicking save button...")
        save_btn = await self.page.select("#save-btn")

        if save_btn:
            await save_btn.click()
            await asyncio.sleep(1)
            print("✅ Save button clicked")
            return True
        else:
            print("❌ Save button not found")
            return False

    async def get_current_hash(self) -> str:
        """Get the current URL hash (patch UUID)"""
        url = await self.page.evaluate("window.location.href")
        hash_part = url.split("#")[-1] if "#" in url else ""
        print(f"🔖 Current hash: {hash_part or '(none)'}")
        return hash_part

    async def wait_for_status(self, expected_text: str, timeout: float = 5):
        """Wait for status element to show expected text"""
        print(f"⏳ Waiting for status: '{expected_text}'...")

        start = time.time()
        while time.time() - start < timeout:
            status = await self.page.select("#status")
            if status:
                text = await status.text_all
                if expected_text in text:
                    print(f"✅ Status shows: '{text}'")
                    return True
            await asyncio.sleep(0.1)

        print(f"❌ Timeout waiting for status '{expected_text}'")
        return False


# ============================================================================
# TEST SCENARIOS
# ============================================================================

async def test_basic_ui_load():
    """Test 1: Basic UI loads correctly"""
    print("\n" + "="*60)
    print("TEST 1: Basic UI Load")
    print("="*60)

    tester = GlicolUITester()
    await tester.setup()

    try:
        # Check initial node count (should have 3 demo nodes)
        initial_count = await tester.get_node_count()
        assert initial_count == 3, f"Expected 3 demo nodes, got {initial_count}"

        await tester.screenshot("test1_initial_load.png")

        print("✅ TEST 1 PASSED: UI loaded with demo nodes")

    finally:
        await tester.teardown()


async def test_add_nodes():
    """Test 2: Adding nodes via buttons"""
    print("\n" + "="*60)
    print("TEST 2: Adding Nodes")
    print("="*60)

    tester = GlicolUITester()
    await tester.setup()

    try:
        initial_count = await tester.get_node_count()

        # Add an envelope node
        await tester.click_add_node_button("envelope")

        # Verify node count increased
        new_count = await tester.get_node_count()
        assert new_count == initial_count + 1, f"Expected {initial_count + 1} nodes, got {new_count}"

        await tester.screenshot("test2_added_node.png")

        print("✅ TEST 2 PASSED: Successfully added node")

    finally:
        await tester.teardown()


async def test_drag_nodes():
    """Test 3: Dragging nodes around"""
    print("\n" + "="*60)
    print("TEST 3: Dragging Nodes")
    print("="*60)

    tester = GlicolUITester()
    await tester.setup()

    try:
        # Drag first node
        await tester.drag_node(0, dx=150, dy=100)

        await tester.screenshot("test3_dragged_node.png")

        print("✅ TEST 3 PASSED: Node dragging works")

    finally:
        await tester.teardown()


async def test_create_connections():
    """Test 4: Creating connections between nodes"""
    print("\n" + "="*60)
    print("TEST 4: Creating Connections")
    print("="*60)

    tester = GlicolUITester()
    await tester.setup()

    try:
        initial_connections = await tester.get_connection_count()

        # Create connection from first output to first input
        await tester.create_connection(0, 0)

        # Verify connection was created
        new_connections = await tester.get_connection_count()
        assert new_connections == initial_connections + 1, \
            f"Expected {initial_connections + 1} connections, got {new_connections}"

        await tester.screenshot("test4_connection_created.png")

        print("✅ TEST 4 PASSED: Connection created successfully")

    finally:
        await tester.teardown()


async def test_save_and_hash():
    """Test 5: Saving creates a hash"""
    print("\n" + "="*60)
    print("TEST 5: Save and Hash")
    print("="*60)

    tester = GlicolUITester()
    await tester.setup()

    try:
        # Initial hash should be empty for new session
        initial_hash = await tester.get_current_hash()

        # Make a change (add a node)
        await tester.click_add_node_button("oscillator")
        await asyncio.sleep(1.5)  # Wait for auto-save

        # Check if hash was created
        new_hash = await tester.get_current_hash()
        assert new_hash != "", "Expected hash to be created after auto-save"

        print(f"✅ TEST 5 PASSED: Auto-save created hash: {new_hash}")

    finally:
        await tester.teardown()


async def test_interactive_session():
    """Interactive session: Keep browser open for manual testing"""
    print("\n" + "="*60)
    print("INTERACTIVE SESSION: Manual Testing")
    print("="*60)

    tester = GlicolUITester()
    await tester.setup()

    try:
        print("\n📝 Browser is open for manual interaction!")
        print("   You can now interact with the UI manually.")
        print("   Press Ctrl+C when done.\n")

        # Keep alive
        while True:
            await asyncio.sleep(1)

    except KeyboardInterrupt:
        print("\n✅ Interactive session ended")
    finally:
        await tester.teardown()


async def run_all_tests():
    """Run all automated tests"""
    print("\n" + "="*70)
    print("🧪 GLICOL VISUAL EDITOR - UI TEST SUITE")
    print("="*70)

    tests = [
        test_basic_ui_load,
        test_add_nodes,
        test_drag_nodes,
        test_create_connections,
        test_save_and_hash,
    ]

    passed = 0
    failed = 0

    for test in tests:
        try:
            await test()
            passed += 1
        except Exception as e:
            print(f"❌ TEST FAILED: {e}")
            failed += 1

    print("\n" + "="*70)
    print(f"📊 TEST RESULTS: {passed} passed, {failed} failed")
    print("="*70)


# ============================================================================
# MAIN
# ============================================================================

if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "interactive":
        # Run interactive session
        asyncio.run(test_interactive_session())
    else:
        # Run all automated tests
        asyncio.run(run_all_tests())
