import {
    getNodeConfig,
    getInputDefinitions,
    ensureNodeSettings as ensureNodeSettingsForType,
    getNodeOutputValue as getNodeOutputValueForType,
    resolveIncomingValue as resolveIncomingValueForType,
    valueAfterIncoming as valueAfterIncomingForType,
    renderHeaderExtras as renderHeaderExtrasForType,
    renderSettingField as renderSettingFieldForType,
    updateSettingFieldDom as updateSettingFieldDomForType,
    afterRender as afterRenderForType,
    initNodeTypes
} from './node-lib.js';
import './nodes/text.js';
import './nodes/code.js';
import './nodes/notes.js';
import './nodes/output.js';

// ============================================================================
// UTILITIES
// ============================================================================

let idCounter = 0;
const generateId = (prefix) => `${prefix}_${++idCounter}`;
const parseIdNumber = (id) => {
    const match = /_(\d+)$/.exec(id);
    return match ? parseInt(match[1], 10) : 0;
};
const NODE_MIN_WIDTH_PX = 150;
const NODE_MIN_HEIGHT_PX = 56;
const NOTES_MIN_COL_HEIGHT_PX = 10;
const NODE_RESIZE_ICON_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" aria-hidden="true" focusable="false"><g transform="translate(512 0) scale(-1 1)"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M304 96h112v112m-10.23-101.8L111.98 400.02M208 416H96V304"/></g></svg>';
const NODE_DELETE_ICON_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2.25" d="M6 6l12 12M18 6L6 18"/></svg>';

// ============================================================================
// STATE
// ============================================================================

const state = {
    nodes: new Map(),
    connections: new Map(),
    draggedNode: null,
    dragOffset: { x: 0, y: 0 },
    canvasOffset: { x: 0, y: 0 },
    scale: 1,
    panning: null,
    connectingPort: null,
    tempConnectionEnd: null,
    resizing: null,
    nodeResizing: null
};

const screenToWorld = (clientX, clientY) => {
    const canvas = document.getElementById('canvas-container');
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const screenX = clientX - rect.left;
    const screenY = clientY - rect.top;
    return {
        x: (screenX - state.canvasOffset.x) / state.scale,
        y: (screenY - state.canvasOffset.y) / state.scale
    };
};

const ensureNodeSettings = (node) => {
    ensureNodeSettingsForType(node, getNodeContext());
};

const hasIncomingConnection = (nodeId, portIndex) =>
    Array.from(state.connections.values()).some(
        (conn) => conn.toNodeId === nodeId && conn.toPortIndex === portIndex
    );

const updateSettingFieldDom = (nodeId, portIndex, value) => {
    const node = state.nodes.get(nodeId);
    if (!node) return;
    const nodeEl = document.querySelector(`[data-node-id="${nodeId}"]`);
    if (!nodeEl) return;

    const config = getNodeConfig(node.type);
    const inputDefs = config ? getInputDefinitions(config) : [];
    const settingKey = inputDefs[portIndex]?.settingKey;

    const handled = updateSettingFieldDomForType({
        node,
        nodeEl,
        settingKey,
        portIndex,
        value,
        context: getNodeContext()
    });
    if (handled) return;

    const fields = nodeEl.querySelectorAll(`.setting-field[data-port-index="${portIndex}"]`);
    if (!fields.length) return;

    const field = fields[0];
    if (field === document.activeElement) return;
    if (field.type === 'checkbox') {
        field.checked = Boolean(value);
    } else {
        field.value = value ?? '';
    }
};

function getNodeContext() {
    return {
        state,
        render,
        propagateValuesFrom,
        updateCodePanel,
        autoSave,
        hasIncomingConnection,
        getInputDefinitions
    };
}

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
        if (!fromNode) continue;

        for (const conn of state.connections.values()) {
            if (conn.fromNodeId !== nodeId) continue;
            const fromValue = getNodeOutputValueForType(
                fromNode,
                conn.fromPortIndex,
                getNodeContext()
            );
            if (fromValue === undefined) continue;
            const fromValueStr = String(fromValue);

            const targetNode = state.nodes.get(conn.toNodeId);
            if (!targetNode) continue;

            let changed = false;

            if (targetNode.value !== fromValueStr) {
                changed = true;
            }

            const targetConfig = getNodeConfig(targetNode.type);
            const inputDefs = getInputDefinitions(targetConfig);
            const inputDef = inputDefs[conn.toPortIndex];
            let incomingForSetting;

            if (inputDef?.settingKey) {
                ensureNodeSettings(targetNode);
                incomingForSetting = resolveIncomingValueForType(
                    targetNode,
                    inputDef.settingKey,
                    fromValue,
                    getNodeContext()
                );

                if (targetNode.settings[inputDef.settingKey] !== incomingForSetting) {
                    targetNode.settings[inputDef.settingKey] = incomingForSetting;
                    updateSettingFieldDom(targetNode.id, conn.toPortIndex, incomingForSetting);
                    changed = true;
                }
            }

            if (changed) {
                const nextValue = valueAfterIncomingForType(
                    targetNode,
                    inputDef,
                    incomingForSetting,
                    fromValue,
                    getNodeContext()
                );
                if (nextValue !== undefined) {
                    targetNode.value = nextValue;
                }
                queue.push(targetNode.id);
            }
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
        x: (rect.left + rect.width / 2 - containerRect.left - state.canvasOffset.x) / state.scale,
        y: (rect.top + rect.height / 2 - containerRect.top - state.canvasOffset.y) / state.scale
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
    const config = getNodeConfig(node.type);
    if (!config) return null;
    ensureNodeSettings(node);
    const nodeEl = document.createElement('div');
    nodeEl.className = 'node';
    nodeEl.dataset.nodeId = node.id;
    nodeEl.style.left = `${node.x}px`;
    nodeEl.style.top = `${node.y}px`;
    if (node.w) nodeEl.style.width = `${node.w}px`;
    if (node.h) nodeEl.style.height = `${node.h}px`;

    const header = document.createElement('div');
    header.className = 'node-header';
    const title = document.createElement('span');
    title.className = 'node-title';
    title.textContent = config.name;

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'node-delete';
    deleteBtn.innerHTML = NODE_DELETE_ICON_SVG;
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

    header.append(title);
    nodeEl.append(header, deleteBtn, confirmBox);

    const headerExtras = renderHeaderExtrasForType(node, getNodeContext());
    if (headerExtras) nodeEl.appendChild(headerExtras);

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
        if (def.settingKey) container.dataset.settingKey = def.settingKey;

        const port = document.createElement('div');
        port.className = 'port input';
        Object.assign(port.dataset, { nodeId: node.id, portType: 'input', portIndex: i });

        const label = document.createElement('span');
        label.className = 'port-label';
        label.textContent = def.label;
        if (def.title) label.title = def.title;

        container.append(port, label);

        if (def.settingKey) {
            const connected = hasIncomingConnection(node.id, i);
            const customField = renderSettingFieldForType({
                node,
                setting: def,
                portIndex: i,
                connected,
                context: getNodeContext()
            });
            if (customField) {
                container.append(customField);
            } else if (def.type === 'checkbox') {
                const field = document.createElement('input');
                field.type = 'checkbox';
                field.className = 'setting-field';
                field.dataset.portIndex = i;
                field.dataset.settingKey = def.settingKey;
                field.checked = Boolean(node.settings?.[def.settingKey]);
                field.disabled = connected;
                if (def.title) field.title = def.title;
                field.addEventListener('mousedown', (evt) => evt.stopPropagation());
                field.addEventListener('click', (evt) => evt.stopPropagation());
                field.addEventListener('change', (evt) => {
                    const current = state.nodes.get(node.id);
                    if (!current) return;
                    ensureNodeSettings(current);
                    current.settings[def.settingKey] = evt.target.checked;
                    propagateValuesFrom(current.id);
                    updateCodePanel();
                    autoSave();
                    render();
                });
                container.appendChild(field);
            } else {
                const field = document.createElement('input');
                field.type = 'text';
                field.className = 'setting-field';
                field.dataset.portIndex = i;
                field.dataset.settingKey = def.settingKey;
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

    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'node-resize';
    resizeHandle.title = 'Resize node';
    resizeHandle.innerHTML = NODE_RESIZE_ICON_SVG;
    resizeHandle.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const el = e.currentTarget.closest('.node');
        if (!el) return;

        const rect = el.getBoundingClientRect();
        const startWidth = rect.width / state.scale;
        const startHeight = rect.height / state.scale;
        const cssMinWidth = parseFloat(getComputedStyle(el).minWidth || String(NODE_MIN_WIDTH_PX)) || NODE_MIN_WIDTH_PX;
        let minWidth = Math.min(startWidth, cssMinWidth);
        let minHeight = 0;
        const notesUi = el.querySelector('.notes-ui');
        if (notesUi) {
            const currentNotesColHeight =
                parseFloat(getComputedStyle(notesUi).getPropertyValue('--notes-col-height')) || NOTES_MIN_COL_HEIGHT_PX;
            const notesHeightDelta = Math.max(0, currentNotesColHeight - NOTES_MIN_COL_HEIGHT_PX);
            minHeight = Math.max(0, startHeight - notesHeightDelta);
        } else {
            const cssMinHeight = parseFloat(getComputedStyle(el).minHeight || '0') || 0;
            minHeight = Math.max(NODE_MIN_HEIGHT_PX, cssMinHeight);
        }
        minWidth = Math.min(minWidth, startWidth);
        minHeight = Math.min(minHeight, startHeight);
        state.nodeResizing = {
            nodeId: node.id,
            startX: e.clientX,
            startY: e.clientY,
            startWidth,
            startHeight,
            startLeft: node.x ?? 0,
            startTop: node.y ?? 0,
            minWidth,
            minHeight
        };
        document.body.style.cursor = 'nw-resize';
    });
    nodeEl.appendChild(resizeHandle);

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
            const codeSetting = node.settings?.code;
            const codeValue =
                codeSetting !== undefined && codeSetting !== ''
                    ? codeSetting
                    : node.value ?? '';
            return String(codeValue);
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

function render() {
    const nodesLayer = document.getElementById('nodes-layer');
    const connectionsLayer = document.getElementById('connections-layer');
    const canvas = document.getElementById('canvas-container');
    const context = getNodeContext();

    if (canvas) {
        canvas.style.backgroundPosition = `${state.canvasOffset.x}px ${state.canvasOffset.y}px`;
        const gridSize = 20 * state.scale;
        canvas.style.backgroundSize = `${gridSize}px ${gridSize}px`;
    }

    const transform = `translate(${state.canvasOffset.x}px, ${state.canvasOffset.y}px) scale(${state.scale})`;
    if (nodesLayer) {
        nodesLayer.style.transform = transform;
        nodesLayer.style.transformOrigin = '0 0';
    }
    if (connectionsLayer) {
        connectionsLayer.style.transform = transform;
        connectionsLayer.style.transformOrigin = '0 0';
    }

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
        afterRenderForType(node, nodeEl, context);
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
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

const onCanvasMouseDown = (e) => {
    if (e.button !== 0) return;

    // Ignore when interacting with nodes, ports, or existing connections.
    if (e.target.closest('.node') || e.target.closest('.port') || e.target.closest('g[data-connection-id]')) {
        return;
    }

    state.panning = {
        startX: e.clientX,
        startY: e.clientY,
        origin: { ...state.canvasOffset }
    };
    document.body.style.cursor = 'grabbing';
    e.preventDefault();
};

const onCanvasWheel = (e) => {
    const oldScale = state.scale;
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.001, oldScale * zoomFactor);
    if (newScale === oldScale) return;

    const canvas = document.getElementById('canvas-container');
    if (canvas) {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

        // Keep the point under the cursor stationary while zooming.
        const factor = newScale / oldScale;
        state.canvasOffset.x = state.canvasOffset.x * factor + mouseX * (1 - factor);
        state.canvasOffset.y = state.canvasOffset.y * factor + mouseY * (1 - factor);
    }

    state.scale = newScale;
    render();
    e.preventDefault();
};

const onNodeMouseDown = (e) => {
    if (e.target.classList.contains('port')) return;
    if (e.target.closest('.node-resize')) return;

    const nodeEl = e.target.closest('.node');
    if (!nodeEl) return;

    state.draggedNode = nodeEl.dataset.nodeId;
    const current = state.nodes.get(state.draggedNode);
    const mouseWorld = screenToWorld(e.clientX, e.clientY);
    state.dragOffset = {
        x: mouseWorld.x - (current?.x ?? 0),
        y: mouseWorld.y - (current?.y ?? 0)
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
    if (state.nodeResizing) {
        const { nodeId, startX, startY, startWidth, startHeight, startLeft, startTop, minWidth, minHeight } =
            state.nodeResizing;
        const dx = (e.clientX - startX) / state.scale;
        const dy = (e.clientY - startY) / state.scale;
        const node = state.nodes.get(nodeId);
        if (node) {
            const right = startLeft + startWidth;
            const newWidth = Math.max(minWidth, startWidth - dx);
            node.w = newWidth;
            node.x = right - newWidth;
            const bottom = startTop + startHeight;
            const newHeight = Math.max(minHeight, startHeight - dy);
            node.h = newHeight;
            node.y = bottom - newHeight;
            render();
        }
        e.preventDefault();
        return;
    }

    if (state.resizing) {
        const { startX, startWidth, panel } = state.resizing;
        const delta = e.clientX - startX;
        const newWidth = Math.max(180, startWidth - delta);
        panel.style.width = `${newWidth}px`;
        e.preventDefault();
        return;
    }

    if (state.panning) {
        const dx = e.clientX - state.panning.startX;
        const dy = e.clientY - state.panning.startY;
        state.canvasOffset.x = state.panning.origin.x + dx;
        state.canvasOffset.y = state.panning.origin.y + dy;
        render();
        return;
    }

    const mousePos = screenToWorld(e.clientX, e.clientY);

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
    if (state.nodeResizing) {
        state.nodeResizing = null;
        document.body.style.cursor = '';
        autoSave();
        return;
    }

    if (state.resizing) {
        state.resizing = null;
        document.body.style.cursor = '';
        return;
    }

    if (state.panning) {
        state.panning = null;
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
    const canvas = document.getElementById('canvas-container');
    if (canvas) {
        canvas.addEventListener('mousedown', onCanvasMouseDown);
        canvas.addEventListener('wheel', onCanvasWheel, { passive: false });
    }

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

    initNodeTypes(getNodeContext());

    // Toolbar: Add node buttons
    document.querySelectorAll('.add-node').forEach(button => {
        button.addEventListener('click', () => {
            const id = generateId('node');
            const nodeData = { id, type: button.dataset.type, x: 100, y: 100 };
            if (nodeData.type === 'notes') {
                nodeData.settings = { noteEditMode: true };
            }
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
