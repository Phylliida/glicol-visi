// ============================================================================
// CONFIGURATION
// ============================================================================

const NODE_TYPES = {
    text: {
        name: 'Text',
        inputs: [],
        outputs: ['text'],
        settings: [{ key: 'text', label: 'text', title: 'text' }]
    },
    code: {
        name: 'Code',
        inputs: ['inputs'],
        outputs: ['callers', 'code'],
        settings: [{ key: 'code', label: 'code', title: 'code' }]
    },
    notes: {
        name: 'Notes',
        inputs: [],
        outputs: ['tuning'],
        settings: [
            { key: 'tuning', label: 'tuning', title: 'tuning' }
        ]
    },
    output: { name: 'Output', inputs: ['in'], outputs: [] }
};

let idCounter = 0;
const generateId = (prefix) => `${prefix}_${++idCounter}`;
const parseIdNumber = (id) => {
    const match = /_(\d+)$/.exec(id);
    return match ? parseInt(match[1], 10) : 0;
};

// ============================================================================
// STATE
// ============================================================================

const state = {
    nodes: new Map(),
    connections: new Map(),
    draggedNode: null,
    dragOffset: { x: 0, y: 0 },
    connectingPort: null,
    tempConnectionEnd: null,
    resizing: null
};

const ensureNodeSettings = (node) => {
    const config = NODE_TYPES[node.type];
    if (!config || !config.settings) return;

    if (!node.settings) node.settings = {};
    config.settings.forEach(setting => {
        if (node.settings[setting.key] === undefined) {
            node.settings[setting.key] = '';
        }
    });

    if (node.value === undefined && config.settings.length) {
        const firstKey = config.settings[0].key;
        const initialValue = node.settings[firstKey];
        if (initialValue !== undefined && initialValue !== '') {
            node.value = initialValue;
        }
    }
};

const hasIncomingConnection = (nodeId, portIndex) =>
    Array.from(state.connections.values()).some(
        (conn) => conn.toNodeId === nodeId && conn.toPortIndex === portIndex
    );

const updateSettingFieldDom = (nodeId, portIndex, value) => {
    const nodeEl = document.querySelector(`[data-node-id="${nodeId}"]`);
    if (!nodeEl) return;

    const field = nodeEl.querySelector(`.setting-field[data-port-index="${portIndex}"]`);
    if (!field || field === document.activeElement) return;

    field.value = value ?? '';
};

const getInputDefinitions = (config) => {
    const baseInputs = (config.inputs || []).map(input =>
        typeof input === 'string' ? { label: input } : input
    );

    const settingInputs = (config.settings || []).map(setting => ({
        label: setting.label,
        title: setting.title,
        settingKey: setting.key
    }));

    return [...baseInputs, ...settingInputs];
};

const deleteNode = (nodeId) => {
    if (!state.nodes.has(nodeId)) return;

    state.nodes.delete(nodeId);

    if (state.draggedNode === nodeId) {
        state.draggedNode = null;
        state.dragOffset = { x: 0, y: 0 };
    }

    if (state.connectingPort && state.connectingPort.nodeId === nodeId) {
        state.connectingPort = null;
        state.tempConnectionEnd = null;
    }

    for (const [connId, conn] of Array.from(state.connections.entries())) {
        if (conn.fromNodeId === nodeId || conn.toNodeId === nodeId) {
            state.connections.delete(connId);
        }
    }

    render();
    autoSave();
};

// ============================================================================
// VALUE PROPAGATION
// ============================================================================

const propagateValuesFrom = (startNodeId) => {
    if (!startNodeId) return;

    const queue = [startNodeId];

    while (queue.length) {
        const nodeId = queue.shift();
        const fromNode = state.nodes.get(nodeId);
        if (!fromNode || fromNode.value === undefined) continue;
        const fromValue = String(fromNode.value);

        for (const conn of state.connections.values()) {
            if (conn.fromNodeId !== nodeId) continue;

            const targetNode = state.nodes.get(conn.toNodeId);
            if (!targetNode) continue;

            let changed = false;

            if (targetNode.value !== fromValue) {
                targetNode.value = fromValue;
                changed = true;
            }

            const targetConfig = NODE_TYPES[targetNode.type];
            const inputDefs = getInputDefinitions(targetConfig);
            const inputDef = inputDefs[conn.toPortIndex];

            if (inputDef?.settingKey) {
                ensureNodeSettings(targetNode);
                if (targetNode.settings[inputDef.settingKey] !== fromValue) {
                    targetNode.settings[inputDef.settingKey] = fromValue;
                    updateSettingFieldDom(targetNode.id, conn.toPortIndex, fromValue);
                    changed = true;
                }
            }

            if (changed) queue.push(targetNode.id);
        }
    }
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
    if (!config) return null;
    ensureNodeSettings(node);
    const nodeEl = document.createElement('div');
    nodeEl.className = 'node';
    nodeEl.dataset.nodeId = node.id;
    nodeEl.style.left = `${node.x}px`;
    nodeEl.style.top = `${node.y}px`;

    const header = document.createElement('div');
    header.className = 'node-header';
    const title = document.createElement('span');
    title.className = 'node-title';
    title.textContent = config.name;

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'node-delete';
    deleteBtn.textContent = '×';
    deleteBtn.title = 'Delete node';

    const confirmBox = document.createElement('div');
    confirmBox.className = 'node-delete-confirm hidden';
    confirmBox.innerHTML = `
        <div class="confirm-text">Delete?</div>
        <div class="confirm-actions">
            <button class="confirm-yes">Yes</button>
            <button class="confirm-no">No</button>
        </div>
    `;

    deleteBtn.addEventListener('mousedown', (evt) => evt.stopPropagation());
    confirmBox.addEventListener('mousedown', (evt) => evt.stopPropagation());

    deleteBtn.addEventListener('click', (evt) => {
        evt.stopPropagation();
        confirmBox.classList.toggle('hidden');
    });

    confirmBox.querySelector('.confirm-yes').addEventListener('click', (evt) => {
        evt.stopPropagation();
        deleteNode(node.id);
    });

    confirmBox.querySelector('.confirm-no').addEventListener('click', (evt) => {
        evt.stopPropagation();
        confirmBox.classList.add('hidden');
    });

    header.append(title, deleteBtn, confirmBox);
    nodeEl.appendChild(header);

    const portsContainer = document.createElement('div');
    portsContainer.className = 'node-ports';

    // Inputs
    const inputsDiv = document.createElement('div');
    inputsDiv.className = 'inputs';
    const inputDefs = getInputDefinitions(config);
    inputDefs.forEach((def, i) => {
        const container = document.createElement('div');
        container.className = 'port-container';
        if (def.settingKey) container.classList.add('setting-port');

        const port = document.createElement('div');
        port.className = 'port input';
        Object.assign(port.dataset, { nodeId: node.id, portType: 'input', portIndex: i });

        const label = document.createElement('span');
        label.className = 'port-label';
        label.textContent = def.label;
        if (def.title) label.title = def.title;

        container.append(port, label);

        if (def.settingKey) {
            const field = document.createElement('input');
            field.type = 'text';
            field.className = 'setting-field';
            field.dataset.portIndex = i;
            field.dataset.settingKey = def.settingKey;
            const connected = hasIncomingConnection(node.id, i);
            field.disabled = connected;
            field.placeholder = connected ? 'from input' : '';
            field.value = node.settings?.[def.settingKey] ?? '';
            if (def.title) field.title = def.title;
            field.addEventListener('mousedown', (evt) => evt.stopPropagation());
            field.addEventListener('click', (evt) => evt.stopPropagation());
            field.addEventListener('input', (evt) => {
                const current = state.nodes.get(node.id);
                if (!current) return;
                ensureNodeSettings(current);
                current.settings[def.settingKey] = evt.target.value;
                current.value = evt.target.value;
                propagateValuesFrom(current.id);
                updateCodePanel();
                autoSave();
            });
            container.appendChild(field);
        }

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
// SIDE PANEL
// ============================================================================

const isUpstream = (sourceId, targetId) => {
    if (sourceId === targetId) return false;
    const visited = new Set();
    const stack = [sourceId];

    while (stack.length) {
        const current = stack.pop();
        if (visited.has(current)) continue;
        visited.add(current);

        for (const conn of state.connections.values()) {
            if (conn.fromNodeId !== current) continue;
            const next = conn.toNodeId;
            if (next === targetId) return true;
            stack.push(next);
        }
    }

    return false;
};

const buildComponentMap = () => {
    const adjacency = new Map();
    for (const nodeId of state.nodes.keys()) adjacency.set(nodeId, []);
    for (const conn of state.connections.values()) {
        if (!adjacency.has(conn.fromNodeId) || !adjacency.has(conn.toNodeId)) continue;
        adjacency.get(conn.fromNodeId).push(conn.toNodeId);
        adjacency.get(conn.toNodeId).push(conn.fromNodeId);
    }

    const compMap = new Map();
    let nextId = 0;
    for (const nodeId of adjacency.keys()) {
        if (compMap.has(nodeId)) continue;
        const stack = [nodeId];
        while (stack.length) {
            const current = stack.pop();
            if (compMap.has(current)) continue;
            compMap.set(current, nextId);
            for (const neighbor of adjacency.get(current)) {
                stack.push(neighbor);
            }
        }
        nextId++;
    }

    return compMap;
};

const updateCodePanel = () => {
    const strudelEditor = document.querySelector('strudel-editor');
    if (!strudelEditor) return;

    const componentMap = buildComponentMap();
    const codeNodes = Array.from(state.nodes.values()).filter(node => node.type === 'code');

    const componentMeta = new Map();
    codeNodes.forEach(node => {
        const compId = componentMap.get(node.id) ?? node.id;
        const meta = componentMeta.get(compId) ?? {
            minY: node.y ?? 0,
            minX: node.x ?? 0,
            minId: parseIdNumber(node.id)
        };
        meta.minY = Math.min(meta.minY, node.y ?? 0);
        meta.minX = Math.min(meta.minX, node.x ?? 0);
        meta.minId = Math.min(meta.minId, parseIdNumber(node.id));
        componentMeta.set(compId, meta);
    });

    const orderedComponents = Array.from(componentMeta.entries()).sort(([, a], [, b]) => {
        const yDiff = a.minY - b.minY;
        if (yDiff !== 0) return yDiff;
        const xDiff = a.minX - b.minX;
        if (xDiff !== 0) return xDiff;
        return a.minId - b.minId;
    });

    const componentOrder = new Map(orderedComponents.map(([id], index) => [id, index]));

    const codeText = codeNodes
        .sort((a, b) => {
            const compA = componentMap.get(a.id) ?? a.id;
            const compB = componentMap.get(b.id) ?? b.id;
            if (compA !== compB) {
                return (componentOrder.get(compA) ?? 0) - (componentOrder.get(compB) ?? 0);
            }
            if (isUpstream(a.id, b.id)) return -1;
            if (isUpstream(b.id, a.id)) return 1;
            const yDiff = (a.y ?? 0) - (b.y ?? 0);
            if (yDiff !== 0) return yDiff;
            const xDiff = (a.x ?? 0) - (b.x ?? 0);
            if (xDiff !== 0) return xDiff;
            return parseIdNumber(a.id) - parseIdNumber(b.id);
        })
        .map(node => {
            const codeValue = node.settings?.code ?? node.value ?? '';
            return String(codeValue).replace(/\r?\n/g, ' ');
        })
        .join('\n');

    if (strudelEditor.getAttribute('code') !== codeText) {
        strudelEditor.setAttribute('code', codeText);
    }

    // The strudel component renders into a sibling container; ensure it fills the panel.
    const replContainer = strudelEditor.nextElementSibling;
    if (replContainer) {
        replContainer.style.flex = '1';
        replContainer.style.display = 'flex';
        replContainer.style.minHeight = '0';
    }
};

const getStrudelRepl = () => document.querySelector('strudel-editor')?.editor;

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
        if (!nodeEl) continue;
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

    updateCodePanel();
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
    if (state.resizing) {
        const { startX, startWidth, panel } = state.resizing;
        const delta = e.clientX - startX;
        const newWidth = Math.max(180, startWidth - delta);
        panel.style.width = `${newWidth}px`;
        e.preventDefault();
        return;
    }

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
    if (state.resizing) {
        state.resizing = null;
        document.body.style.cursor = '';
        return;
    }

    let shouldSave = false;
    let shouldRender = false;

    // Finish dragging
    if (state.draggedNode) {
        state.draggedNode = null;
        state.dragOffset = { x: 0, y: 0 };
        shouldSave = true;
        shouldRender = true;
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
                    propagateValuesFrom(from.nodeId);
                    shouldSave = true;
                }
            }
        }

        state.connectingPort = null;
        state.tempConnectionEnd = null;
        shouldRender = true;
    }

    // Only re-render when something actually changed; otherwise let click
    // events on connections fire without being interrupted by a full rerender.
    if (shouldRender) render();
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

        patch.data.nodes.forEach(node => {
            ensureNodeSettings(node);
            state.nodes.set(node.id, node);
        });
        patch.data.connections.forEach(conn => state.connections.set(conn.id, conn));

        const maxLoadedId = Math.max(
            0,
            ...patch.data.nodes.map(n => parseIdNumber(n.id)),
            ...patch.data.connections.map(c => parseIdNumber(c.id))
        );
        if (maxLoadedId > idCounter) idCounter = maxLoadedId;

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

    // Resize code panel
    const resizeHandle = document.getElementById('resize-handle');
    const codePanel = document.getElementById('code-panel');
    if (resizeHandle && codePanel) {
        resizeHandle.addEventListener('mousedown', (e) => {
            state.resizing = {
                startX: e.clientX,
                startWidth: codePanel.offsetWidth,
                panel: codePanel
            };
            document.body.style.cursor = 'col-resize';
            e.preventDefault();
        });
    }

    // Toolbar: Add node buttons
    document.querySelectorAll('.add-node').forEach(button => {
        button.addEventListener('click', () => {
            const id = generateId('node');
            const nodeData = { id, type: button.dataset.type, x: 100, y: 100 };
            ensureNodeSettings(nodeData);
            state.nodes.set(id, nodeData);
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

    // Code panel: Play/Update buttons
    document.getElementById('play-btn').addEventListener('click', async () => {
        const repl = getStrudelRepl();
        if (!repl) return;
        await repl.evaluate(true);
    });

    document.getElementById('update-btn').addEventListener('click', async () => {
        const repl = getStrudelRepl();
        if (!repl) return;
        await repl.evaluate(false);
    });

    // Load from URL or create demo nodes
    const hash = window.location.hash.slice(1);
    if (hash) {
        await loadPatch(hash);
    } else {
        // Add demo nodes
        const id = generateId('node');
        const nodeData = { id, type: 'code', x: 150, y: 150 };
        ensureNodeSettings(nodeData);
        state.nodes.set(id, nodeData);
        render();
    }
};

init();
