// ============================================================================
// CONFIGURATION
// ============================================================================

const NODE_TYPES = {
    oscillator: { name: 'Oscillator', inputs: [], outputs: ['out'] },
    filter: { name: 'Filter', inputs: ['in', 'freq'], outputs: ['out'] },
    envelope: { name: 'Envelope', inputs: [], outputs: ['out'] },
    output: { name: 'Output', inputs: ['in'], outputs: [] }
};

let idCounter = 0;
const generateId = (prefix) => `${prefix}_${++idCounter}`;

// ============================================================================
// STATE
// ============================================================================

const state = {
    nodes: new Map(),
    connections: new Map(),
    draggedNode: null,
    dragOffset: { x: 0, y: 0 },
    connectingPort: null,
    tempConnectionEnd: null
};

// ============================================================================
// GEOMETRY
// ============================================================================

const getPortPosition = (nodeId, portType, portIndex) => {
    const port = document.querySelector(
        `[data-node-id="${nodeId}"] [data-port-type="${portType}"][data-port-index="${portIndex}"]`
    );
    if (!port) return { x: 0, y: 0 };

    const rect = port.getBoundingClientRect();
    const containerRect = document.getElementById('canvas-container').getBoundingClientRect();

    return {
        x: rect.left + rect.width / 2 - containerRect.left,
        y: rect.top + rect.height / 2 - containerRect.top
    };
};

const calculatePath = (fromPos, toPos) => {
    const curve = Math.abs(toPos.x - fromPos.x) * 0.5;
    return `M ${fromPos.x} ${fromPos.y} C ${fromPos.x + curve} ${fromPos.y}, ${toPos.x - curve} ${toPos.y}, ${toPos.x} ${toPos.y}`;
};

// ============================================================================
// DOM CREATORS
// ============================================================================

const createNodeElement = (node) => {
    const config = NODE_TYPES[node.type];
    const nodeEl = document.createElement('div');
    nodeEl.className = 'node';
    nodeEl.dataset.nodeId = node.id;
    nodeEl.style.left = `${node.x}px`;
    nodeEl.style.top = `${node.y}px`;

    const header = document.createElement('div');
    header.className = 'node-header';
    header.textContent = config.name;
    nodeEl.appendChild(header);

    const portsContainer = document.createElement('div');
    portsContainer.className = 'node-ports';

    // Inputs
    const inputsDiv = document.createElement('div');
    inputsDiv.className = 'inputs';
    config.inputs.forEach((name, i) => {
        const container = document.createElement('div');
        container.className = 'port-container';

        const port = document.createElement('div');
        port.className = 'port input';
        Object.assign(port.dataset, { nodeId: node.id, portType: 'input', portIndex: i });

        const label = document.createElement('span');
        label.className = 'port-label';
        label.textContent = name;

        container.append(port, label);
        inputsDiv.appendChild(container);
    });

    // Outputs
    const outputsDiv = document.createElement('div');
    outputsDiv.className = 'outputs';
    config.outputs.forEach((name, i) => {
        const container = document.createElement('div');
        container.className = 'port-container';

        const port = document.createElement('div');
        port.className = 'port output';
        Object.assign(port.dataset, { nodeId: node.id, portType: 'output', portIndex: i });

        const label = document.createElement('span');
        label.className = 'port-label';
        label.textContent = name;

        container.append(label, port);
        outputsDiv.appendChild(container);
    });

    portsContainer.append(inputsDiv, outputsDiv);
    nodeEl.appendChild(portsContainer);

    return nodeEl;
};

const createConnection = (conn, fromPos, toPos) => {
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.dataset.connectionId = conn.id;
    group.style.pointerEvents = 'auto';

    const hitbox = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    hitbox.classList.add('connection-hitbox');
    hitbox.setAttribute('d', calculatePath(fromPos, toPos));

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.classList.add('connection');
    path.setAttribute('d', calculatePath(fromPos, toPos));

    group.append(hitbox, path);
    return group;
};

// ============================================================================
// RENDERING
// ============================================================================

const render = () => {
    const nodesLayer = document.getElementById('nodes-layer');
    const connectionsLayer = document.getElementById('connections-layer');

    // Clear
    nodesLayer.innerHTML = '';
    connectionsLayer.innerHTML = '';

    // Render nodes
    for (const node of state.nodes.values()) {
        const nodeEl = createNodeElement(node);
        nodeEl.addEventListener('mousedown', onNodeMouseDown);
        nodeEl.querySelectorAll('.port').forEach(port => {
            port.addEventListener('mousedown', onPortMouseDown);
        });
        nodesLayer.appendChild(nodeEl);
    }

    // Render connections
    for (const conn of state.connections.values()) {
        const fromPos = getPortPosition(conn.fromNodeId, 'output', conn.fromPortIndex);
        const toPos = getPortPosition(conn.toNodeId, 'input', conn.toPortIndex);
        const connEl = createConnection(conn, fromPos, toPos);
        connEl.addEventListener('click', (e) => {
            e.stopPropagation();
            state.connections.delete(conn.id);
            render();
            autoSave();
        });
        connectionsLayer.appendChild(connEl);
    }

    // Render temp connection
    if (state.connectingPort && state.tempConnectionEnd) {
        const fromPos = getPortPosition(
            state.connectingPort.nodeId,
            state.connectingPort.portType,
            state.connectingPort.portIndex
        );
        const tempPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        tempPath.classList.add('temp-connection');
        tempPath.setAttribute('d', calculatePath(fromPos, state.tempConnectionEnd));
        connectionsLayer.appendChild(tempPath);
    }

    // Visual states
    if (state.draggedNode) {
        const nodeEl = nodesLayer.querySelector(`[data-node-id="${state.draggedNode}"]`);
        if (nodeEl) nodeEl.classList.add('dragging');
    }

    if (state.connectingPort) {
        const port = nodesLayer.querySelector(
            `[data-node-id="${state.connectingPort.nodeId}"] [data-port-type="${state.connectingPort.portType}"][data-port-index="${state.connectingPort.portIndex}"]`
        );
        if (port) port.classList.add('connecting');
    }
};

// ============================================================================
// EVENT HANDLERS
// ============================================================================

const onNodeMouseDown = (e) => {
    if (e.target.classList.contains('port')) return;

    const nodeEl = e.target.closest('.node');
    if (!nodeEl) return;

    const rect = nodeEl.getBoundingClientRect();
    state.draggedNode = nodeEl.dataset.nodeId;
    state.dragOffset = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
    };

    render();
    e.preventDefault();
};

const onPortMouseDown = (e) => {
    e.stopPropagation();

    const port = e.target;
    state.connectingPort = {
        nodeId: port.dataset.nodeId,
        portType: port.dataset.portType,
        portIndex: parseInt(port.dataset.portIndex)
    };

    render();
};

const onMouseMove = (e) => {
    const containerRect = document.getElementById('canvas-container').getBoundingClientRect();
    const mousePos = {
        x: e.clientX - containerRect.left,
        y: e.clientY - containerRect.top
    };

    let changed = false;

    // Update dragged node position
    if (state.draggedNode) {
        const node = state.nodes.get(state.draggedNode);
        if (node) {
            node.x = mousePos.x - state.dragOffset.x;
            node.y = mousePos.y - state.dragOffset.y;
            changed = true;
        }
    }

    // Update temp connection
    if (state.connectingPort) {
        state.tempConnectionEnd = mousePos;
        changed = true;
    }

    if (changed) render();
};

const onMouseUp = (e) => {
    let shouldSave = false;

    // Finish dragging
    if (state.draggedNode) {
        state.draggedNode = null;
        state.dragOffset = { x: 0, y: 0 };
        shouldSave = true;
    }

    // Finish connecting
    if (state.connectingPort) {
        const targetPort = e.target.closest('.port');

        // Try to create connection
        if (targetPort && targetPort.dataset.nodeId !== state.connectingPort.nodeId) {
            const fromPort = state.connectingPort;
            const toPort = {
                nodeId: targetPort.dataset.nodeId,
                portType: targetPort.dataset.portType,
                portIndex: parseInt(targetPort.dataset.portIndex)
            };

            // Validate output -> input
            const isValid = (fromPort.portType === 'output' && toPort.portType === 'input') ||
                            (fromPort.portType === 'input' && toPort.portType === 'output');

            if (isValid) {
                // Normalize to output -> input
                const [from, to] = fromPort.portType === 'output' ? [fromPort, toPort] : [toPort, fromPort];

                // Check if exists
                const exists = Array.from(state.connections.values()).some(c =>
                    c.fromNodeId === from.nodeId && c.fromPortIndex === from.portIndex &&
                    c.toNodeId === to.nodeId && c.toPortIndex === to.portIndex
                );

                if (!exists) {
                    const id = generateId('conn');
                    state.connections.set(id, {
                        id,
                        fromNodeId: from.nodeId,
                        fromPortIndex: from.portIndex,
                        toNodeId: to.nodeId,
                        toPortIndex: to.portIndex
                    });
                    shouldSave = true;
                }
            }
        }

        state.connectingPort = null;
        state.tempConnectionEnd = null;
    }

    render();
    if (shouldSave) autoSave();
};

// ============================================================================
// PERSISTENCE
// ============================================================================

const savePatch = async () => {
    const currentHash = window.location.hash.slice(1);
    const data = {
        nodes: Array.from(state.nodes.values()),
        connections: Array.from(state.connections.values())
    };

    try {
        const response = await fetch('/api/patch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data, parent_uuid: currentHash || null })
        });

        if (!response.ok) throw new Error('Save failed');

        const result = await response.json();
        window.location.hash = result.uuid;
        return result.uuid;
    } catch (error) {
        console.error('Error saving:', error);
        return null;
    }
};

const loadPatch = async (uuid) => {
    try {
        const response = await fetch(`/api/patch/${uuid}`);
        if (!response.ok) throw new Error('Load failed');

        const patch = await response.json();

        state.nodes.clear();
        state.connections.clear();

        patch.data.nodes.forEach(node => state.nodes.set(node.id, node));
        patch.data.connections.forEach(conn => state.connections.set(conn.id, conn));

        render();
    } catch (error) {
        console.error('Error loading:', error);
    }
};

const showHistory = async () => {
    const currentHash = window.location.hash.slice(1);
    if (!currentHash) {
        alert('No patch loaded yet. Create something first!');
        return;
    }

    try {
        const response = await fetch(`/api/patch/${currentHash}/history`);
        if (!response.ok) throw new Error('Failed to load history');

        const { history } = await response.json();

        const lines = [`History (${history.length} versions):\n`];
        history.forEach((patch, i) => {
            const date = new Date(patch.timestamp).toLocaleString();
            const current = patch.uuid === currentHash ? ' (current)' : '';
            lines.push(`${i + 1}. ${date}${current}`);
            lines.push(`   ${patch.uuid}`);
            if (patch.parent_uuid) lines.push(`   Parent: ${patch.parent_uuid}`);
            lines.push('');
        });

        alert(lines.join('\n'));
    } catch (error) {
        console.error('Error loading history:', error);
        alert('Failed to load history');
    }
};

// Debounced auto-save
let saveTimeout = null;
const autoSave = () => {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => savePatch(), 1000);
};

// ============================================================================
// INITIALIZATION
// ============================================================================

const init = async () => {
    // Global mouse handlers
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    // Toolbar: Add node buttons
    document.querySelectorAll('.add-node').forEach(button => {
        button.addEventListener('click', () => {
            const id = generateId('node');
            state.nodes.set(id, { id, type: button.dataset.type, x: 100, y: 100 });
            render();
            autoSave();
        });
    });

    // Toolbar: Manual save button
    document.getElementById('save-btn').addEventListener('click', async () => {
        const statusEl = document.getElementById('status');
        statusEl.textContent = 'Saving...';
        const uuid = await savePatch();
        statusEl.textContent = uuid ? 'Saved!' : 'Save failed';
        setTimeout(() => statusEl.textContent = '', 2000);
    });

    // Toolbar: History button
    document.getElementById('history-btn').addEventListener('click', showHistory);

    // Load from URL or create demo nodes
    const hash = window.location.hash.slice(1);
    if (hash) {
        await loadPatch(hash);
    } else {
        // Add demo nodes
        ['oscillator', 'filter', 'output'].forEach((type, i) => {
            const id = generateId('node');
            state.nodes.set(id, { id, type, x: 100 + i * 250, y: 150 });
        });
        render();
    }
};

init();
