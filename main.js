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
        outputs: ['tuning', 'mode', 'tonic'],
        settings: [
            { key: 'tuning', label: 'tuning', title: 'tuning' },
            { key: 'mode', label: 'mode', title: 'mode' },
            { key: 'tonic', label: 'tonic', title: 'tonic' },
            { key: 'hideModeTonic', label: 'clear mode/tonic', title: 'Set mode & tonic to empty (when unchecked value stays)', type: 'checkbox' }
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

// Cached list of tunings fetched once for all Notes nodes
let tuningListCache = null;
let tuningListPromise = null;
const DEFAULT_TUNING = 'equal_temperament/et_<=12/fj-12tet.scl';
let tuningHierarchy = null;
const DEFAULT_MODE = 'ionian';
let modeSetsCache = null;
let modeListPromise = null;
const DEFAULT_TONIC = 0; // 0 = "A" in our display list
const TONIC_OPTIONS = [
    { value: 0, label: 'A' },
    { value: 1, label: 'A#/Bb' },
    { value: 2, label: 'B' },
    { value: 3, label: 'C' },
    { value: 4, label: 'C#/Db' },
    { value: 5, label: 'D' },
    { value: 6, label: 'D#/Eb' },
    { value: 7, label: 'E' },
    { value: 8, label: 'F' },
    { value: 9, label: 'F#/Gb' },
    { value: 10, label: 'G' },
    { value: 11, label: 'G#/Ab' }
];

const TuningUtils = window.TuningUtils || {};
const {
    getTuningMeta,
    tuningMetaCache,
    modesForCount,
    modesByGroupForCount,
    tonicOptionsForCount,
    clampTonicToCount
} = TuningUtils;

const buildTuningHierarchy = (list) => {
    const categories = new Set();
    const subs = new Map(); // cat -> [subs]
    const files = new Map(); // `${cat}/${sub}` -> [paths]

    list.forEach((p) => {
        const parts = p.split('/');
        const cat = parts[0] || '';
        const sub = parts.length > 2 ? parts[1] : '';
        categories.add(cat);
        const subSet = subs.get(cat) ?? new Set();
        subSet.add(sub);
        subs.set(cat, subSet);
        const key = `${cat}/${sub}`;
        const arr = files.get(key) ?? [];
        arr.push(p);
        files.set(key, arr);
    });

    return {
        categories: Array.from(categories).sort(),
        subs: new Map(
            Array.from(subs.entries()).map(([cat, set]) => [cat, Array.from(set).sort()])
        ),
        files
    };
};

const splitTuningPath = (p) => {
    const parts = p.split('/');
    const category = parts[0] || '';
    const subcategory = parts.length > 2 ? parts[1] : '';
    const file =
        parts.length > 2 ? parts.slice(2).join('/') : parts.length === 2 ? parts[1] : parts[0];
    return { category, subcategory, file };
};

const getModeSets = () => {
    if (modeSetsCache) return Promise.resolve(modeSetsCache);
    if (modeListPromise) return modeListPromise;
    modeListPromise = fetch('/modes.json')
        .then((res) => res.json())
        .then((data) => {
            modeSetsCache = Array.isArray(data) ? data : [];
            render(); // refresh dropdowns once list is ready
            return modeSetsCache;
        })
        .catch((err) => {
            console.error('Failed to load modes', err);
            modeSetsCache = [];
            return modeSetsCache;
        });
    return modeListPromise;
};

const resolveTuningValue = (raw) => {
    const val = (raw ?? '').trim();
    const list = tuningListCache;

    if (!list) {
        // Trigger async load for later renders; fall back for now.
        getTuningList().then(() => render());
        return val || DEFAULT_TUNING;
    }

    if (!val) return DEFAULT_TUNING;

    const lower = val.toLowerCase();

    // Exact path
    const exact = list.find((t) => t === val);
    if (exact) return exact;

    // Case-insensitive path
    const ci = list.find((t) => t.toLowerCase() === lower);
    if (ci) return ci;

    // Match by filename (case-insensitive)
    const base = lower.replace(/^.*[\\/]/, '');
    const baseMatch = list.find(
        (t) => t.toLowerCase().endsWith(`/${base}`) || t.toLowerCase() === base
    );
    if (baseMatch) return baseMatch;

    return DEFAULT_TUNING;
};

const flattenModes = () =>
    (modeSetsCache ?? []).flatMap((set) => set.modes.map((m) => ({ ...m, group: set.group })));

const modesByGroup = () => {
    const all = flattenModes();
    const map = new Map();
    all.forEach((m) => {
        const arr = map.get(m.group) ?? [];
        arr.push(m);
        map.set(m.group, arr);
    });
    return map;
};

const resolveModeValue = (raw) => {
    const val = (raw ?? '').trim();
    const all = flattenModes();
    if (!all.length) {
        getModeSets().then(() => render());
    }
    if (val === '') return '';
    const exact = all.find((m) => m.id === val);
    if (exact) return exact.id;
    const ci = all.find((m) => m.id.toLowerCase() === val.toLowerCase());
    return ci ? ci.id : DEFAULT_MODE;
};

const resolveTonicValue = (raw) => {
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n)) return DEFAULT_TONIC;
    return Math.max(0, n);
};

const getTuningList = () => {
    if (tuningListCache) return Promise.resolve(tuningListCache);
    if (tuningListPromise) return tuningListPromise;
    tuningListPromise = fetch('/api/tunings')
        .then((res) => res.json())
        .then((data) => {
            tuningListCache = Array.isArray(data.tunings) ? data.tunings : [];
            tuningHierarchy = buildTuningHierarchy(tuningListCache);
            render(); // refresh dropdowns once list is ready
            return tuningListCache;
        })
        .catch((err) => {
            console.error('Failed to load tunings', err);
            tuningListCache = [];
            return tuningListCache;
        });
    return tuningListPromise;
};

// ============================================================================
// STATE
// ============================================================================

const state = {
    nodes: new Map(),
    connections: new Map(),
    draggedNode: null,
    dragOffset: { x: 0, y: 0 },
    canvasOffset: { x: 0, y: 0 },
    panning: null,
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
            node.settings[setting.key] = setting.type === 'checkbox' ? false : '';
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

const getNodeOutputValue = (node, portIndex) => {
    if (!node) return undefined;
    if (node.type === 'notes') {
        if (portIndex === 0) return node.settings?.tuning ?? '';
        if (portIndex === 1) return node.settings?.mode ?? '';
        if (portIndex === 2) return node.settings?.tonic === '' ? '' : String(node.settings?.tonic ?? '');
    }
    return node.value;
};

const refreshModeAndTonicForNode = (nodeId) => {
    const node = state.nodes.get(nodeId);
    if (!node) return;
    const config = NODE_TYPES[node.type];
    if (!config) return;
    const inputDefs = getInputDefinitions(config);
    const modePortIndex = inputDefs.findIndex((d) => d.settingKey === 'mode');
    const tonicPortIndex = inputDefs.findIndex((d) => d.settingKey === 'tonic');

    if (node.settings?.hideModeTonic) {
        if (modePortIndex !== -1 && !hasIncomingConnection(nodeId, modePortIndex)) {
            node.settings.mode = '';
            updateModeFields(nodeId, modePortIndex, '');
        }
        if (tonicPortIndex !== -1 && !hasIncomingConnection(nodeId, tonicPortIndex)) {
            node.settings.tonic = '';
            updateTonicField(nodeId, tonicPortIndex, '');
        }
        propagateValuesFrom(nodeId);
        return;
    }

    if (modePortIndex !== -1) {
        updateModeFields(nodeId, modePortIndex, node.settings?.mode);
    }
    if (tonicPortIndex !== -1) {
        updateTonicField(nodeId, tonicPortIndex, node.settings?.tonic);
    }
};

const updateTuningFields = (nodeId, portIndex, rawValue) => {
    const nodeEl = document.querySelector(`[data-node-id="${nodeId}"]`);
    if (!nodeEl || !tuningListCache || !tuningHierarchy) return;

    const selects = Array.from(
        nodeEl.querySelectorAll(`select.setting-field[data-port-index="${portIndex}"]`)
    );
    if (!selects.length) return;

    const connected = hasIncomingConnection(nodeId, portIndex);
    const value = resolveTuningValue(rawValue);
    const { category, subcategory } = splitTuningPath(value);

    const selectCat = selects.find((s) => s.dataset.tuningField === 'category');
    const selectSub = selects.find((s) => s.dataset.tuningField === 'subcategory');
    const selectTun = selects.find((s) => s.dataset.tuningField === 'tuning');

    const setOptions = (el, options) => {
        el.innerHTML = '';
        options.forEach((o) => {
            const op = document.createElement('option');
            op.value = o.value ?? o;
            op.textContent = o.label ?? o;
            el.appendChild(op);
        });
    };

    if (selectCat) {
        const cats = tuningHierarchy.categories.length ? tuningHierarchy.categories : [category];
        setOptions(
            selectCat,
            cats.map((c) => ({ value: c, label: c }))
        );
        if (!cats.includes(category)) {
            const op = document.createElement('option');
            op.value = category;
            op.textContent = category;
            selectCat.appendChild(op);
        }
        selectCat.value = category || (cats[0] ?? '');
    }

    if (selectSub) {
        const subs = tuningHierarchy.subs.get(selectCat?.value) ?? [''];
        setOptions(
            selectSub,
            subs.map((s) => ({ value: s, label: s || 'root' }))
        );
        if (subcategory && !subs.includes(subcategory)) {
            const op = document.createElement('option');
            op.value = subcategory;
            op.textContent = subcategory || 'root';
            selectSub.appendChild(op);
        }
        selectSub.value = subcategory || (subs[0] ?? '');
    }

    if (selectTun) {
        const key = `${selectCat?.value}/${selectSub?.value ?? ''}`;
        const tunes = tuningHierarchy.files.get(key) ?? [];
        setOptions(
            selectTun,
            tunes.map((t) => ({ value: t, label: splitTuningPath(t).file }))
        );
        if (value && !tunes.includes(value)) {
            const op = document.createElement('option');
            op.value = value;
            op.textContent = splitTuningPath(value).file;
            selectTun.appendChild(op);
        }
        selectTun.value = value || tunes[0] || DEFAULT_TUNING;
        if (!selectTun.value) selectTun.value = DEFAULT_TUNING;
    }

    selects.forEach((s) => {
        s.disabled = connected;
    });

    refreshModeAndTonicForNode(nodeId);
};

const updateModeFields = (nodeId, portIndex, rawValue) => {
    const nodeEl = document.querySelector(`[data-node-id="${nodeId}"]`);
    if (!nodeEl) return;

    const selects = Array.from(
        nodeEl.querySelectorAll(`select.setting-field[data-port-index="${portIndex}"]`)
    );
    if (!selects.length) return;

    if (!modeSetsCache) {
        getModeSets().then(() => updateModeFields(nodeId, portIndex, rawValue));
        return;
    }

    const node = state.nodes.get(nodeId);
    const config = NODE_TYPES[node?.type];
    const inputDefs = config ? getInputDefinitions(config) : [];
    const settingKey = inputDefs[portIndex]?.settingKey;
    const tuningPath = resolveTuningValue(node?.settings?.tuning ?? DEFAULT_TUNING);
    const meta = tuningMetaCache.get(tuningPath);
    if (!meta) {
        getTuningMeta(tuningPath).then(() => updateModeFields(nodeId, portIndex, rawValue));
        return;
    }

    const connected = hasIncomingConnection(nodeId, portIndex);
    const value = resolveModeValue(rawValue);
    const availableModes = modesForCount(meta.count, modeSetsCache);
    const groupedModes = modesByGroupForCount(meta.count, modeSetsCache);
    const mode =
        value === ''
            ? null
            : availableModes.find((m) => m.id === value) ?? availableModes[0];
    const group = mode?.group ?? Array.from(groupedModes.keys())[0];

    const selectGroup = selects.find((s) => s.dataset.modeField === 'group');
    const selectMode = selects.find((s) => s.dataset.modeField === 'mode');

    const setOptions = (el, options) => {
        el.innerHTML = '';
        options.forEach((o) => {
            const op = document.createElement('option');
            op.value = o.value ?? o;
            op.textContent = o.label ?? o;
            el.appendChild(op);
        });
    };

    const groups = Array.from(groupedModes.keys());

    if (!availableModes.length) {
        if (selectGroup) setOptions(selectGroup, [{ value: '', label: 'No compatible modes' }]);
        if (selectMode) setOptions(selectMode, [{ value: '', label: 'No compatible modes' }]);
        selects.forEach((s) => {
            s.disabled = true;
        });
        return;
    }

    if (selectGroup) {
        setOptions(
            selectGroup,
            groups.map((g) => ({ value: g, label: g }))
        );
        if (!groups.includes(group)) {
            const op = document.createElement('option');
            op.value = group;
            op.textContent = group;
            selectGroup.appendChild(op);
        }
        selectGroup.value = group || groups[0] || '';
    }

    let chosenMode = mode;
    if (selectMode) {
        const modes = groupedModes.get(selectGroup?.value) ?? [];
        setOptions(
            selectMode,
            [
                { value: '', label: '(none)' },
                ...modes.map((m) => ({ value: m.id, label: m.name }))
            ]
        );
        if (mode && !modes.find((m) => m.id === mode.id)) {
            const op = document.createElement('option');
            op.value = mode.id;
            op.textContent = mode.name;
            selectMode.appendChild(op);
        }
        chosenMode = mode ?? (value === '' ? null : modes[0]);
        selectMode.value = chosenMode?.id ?? (value === '' ? '' : modes[0]?.id ?? DEFAULT_MODE);
    }

    if (!connected && settingKey && node && node.settings) {
        const newVal = chosenMode ? chosenMode.id : '';
        if (node.settings[settingKey] !== newVal) {
            node.settings[settingKey] = newVal;
            updateCodePanel();
            propagateValuesFrom(node.id);
            autoSave();
        }
    }

    selects.forEach((s) => {
        s.disabled = connected;
    });
};

const updateTonicField = (nodeId, portIndex, rawValue) => {
    const nodeEl = document.querySelector(`[data-node-id="${nodeId}"]`);
    if (!nodeEl) return;
    const select = nodeEl.querySelector(
        `select.setting-field[data-port-index="${portIndex}"][data-tonic-field="tonic"]`
    );
    if (!select) return;
    const node = state.nodes.get(nodeId);
    const config = NODE_TYPES[node?.type];
    const inputDefs = config ? getInputDefinitions(config) : [];
    const settingKey = inputDefs[portIndex]?.settingKey;
    const tuningPath = resolveTuningValue(node?.settings?.tuning ?? DEFAULT_TUNING);
    const meta = tuningMetaCache.get(tuningPath);
    if (!meta) {
        getTuningMeta(tuningPath).then(() => updateTonicField(nodeId, portIndex, rawValue));
        return;
    }

    const connected = hasIncomingConnection(nodeId, portIndex);
    const options = [{ value: '', label: '(none)' }, ...tonicOptionsForCount(meta.count, TONIC_OPTIONS)];
    select.innerHTML = '';
    if (options.length) {
        options.forEach(({ value, label }) => {
            const op = document.createElement('option');
            op.value = String(value);
            op.textContent = label;
            select.appendChild(op);
        });
    } else {
        const op = document.createElement('option');
        op.value = '';
        op.textContent = 'No tonic options';
        select.appendChild(op);
    }

    const val = rawValue === '' ? '' : clampTonicToCount(rawValue, meta.count);
    select.value = String(val);

    if (!connected && settingKey && node && node.settings) {
        if (node.settings[settingKey] !== val) {
            node.settings[settingKey] = val;
            updateCodePanel();
            propagateValuesFrom(node.id);
            autoSave();
        }
    }

    select.disabled = connected || !options.length;
};

const updateSettingFieldDom = (nodeId, portIndex, value) => {
    const nodeEl = document.querySelector(`[data-node-id="${nodeId}"]`);
    if (!nodeEl) return;

    const fields = nodeEl.querySelectorAll(`.setting-field[data-port-index="${portIndex}"]`);
    if (!fields.length) return;

    // Special handling for tuning triple dropdown
    if (fields[0].dataset.tuningField) {
        updateTuningFields(nodeId, portIndex, value);
        return;
    }
    if (fields[0].dataset.modeField) {
        updateModeFields(nodeId, portIndex, value);
        return;
    }
    if (fields[0].dataset.tonicField) {
        updateTonicField(nodeId, portIndex, value);
        return;
    }

    const field = fields[0];
    if (field === document.activeElement) return;
    field.value = value ?? '';
};

const getInputDefinitions = (config) => {
    const baseInputs = (config.inputs || []).map(input =>
        typeof input === 'string' ? { label: input } : input
    );

    const settingInputs = (config.settings || []).map(setting => ({
        label: setting.label,
        title: setting.title,
        settingKey: setting.key,
        type: setting.type
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
        if (!fromNode) continue;

        for (const conn of state.connections.values()) {
            if (conn.fromNodeId !== nodeId) continue;
            const fromValue = getNodeOutputValue(fromNode, conn.fromPortIndex);
            if (fromValue === undefined) continue;
            const fromValueStr = String(fromValue);

            const targetNode = state.nodes.get(conn.toNodeId);
            if (!targetNode) continue;

            let changed = false;

            if (targetNode.value !== fromValueStr) {
                targetNode.value = fromValueStr;
                changed = true;
            }

            const targetConfig = NODE_TYPES[targetNode.type];
            const inputDefs = getInputDefinitions(targetConfig);
            const inputDef = inputDefs[conn.toPortIndex];

            if (inputDef?.settingKey) {
                ensureNodeSettings(targetNode);
                let incoming = fromValue;
                if (targetNode.type === 'notes' && inputDef.settingKey === 'tuning') {
                    incoming = resolveTuningValue(fromValue);
                } else if (targetNode.type === 'notes' && inputDef.settingKey === 'mode') {
                    incoming = resolveModeValue(fromValue);
                } else if (targetNode.type === 'notes' && inputDef.settingKey === 'tonic') {
                    incoming = resolveTonicValue(fromValue);
                }

                if (targetNode.settings[inputDef.settingKey] !== incoming) {
                    targetNode.settings[inputDef.settingKey] = incoming;
                    updateSettingFieldDom(targetNode.id, conn.toPortIndex, incoming);
                    changed = true;
                }
            }

            if (changed) {
                // Keep notes output representing tuning; avoid clobbering with mode
                if (!(targetNode.type === 'notes' && inputDef?.settingKey === 'mode')) {
                    const newVal =
                        targetNode.type === 'notes' && inputDef?.settingKey === 'tuning'
                            ? targetNode.settings[inputDef.settingKey]
                            : fromValue;
                    targetNode.value = newVal;
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
    nodeEl.style.left = `${node.x + state.canvasOffset.x}px`;
    nodeEl.style.top = `${node.y + state.canvasOffset.y}px`;

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
            const connected = hasIncomingConnection(node.id, i);
            const isTuningSelect = node.type === 'notes' && def.settingKey === 'tuning';
            const isModeSelect = node.type === 'notes' && def.settingKey === 'mode';
            const isTonicSelect = node.type === 'notes' && def.settingKey === 'tonic';

            if (isTuningSelect) {
                const selectCat = document.createElement('select');
                const selectSub = document.createElement('select');
                const selectTun = document.createElement('select');

                [selectCat, selectSub, selectTun].forEach((sel, idx) => {
                    sel.className = 'setting-field';
                    sel.dataset.portIndex = i;
                    sel.dataset.settingKey = def.settingKey;
                    sel.dataset.tuningField = ['category', 'subcategory', 'tuning'][idx];
                    sel.disabled = connected;
                    if (def.title) sel.title = def.title;
                    sel.addEventListener('mousedown', (evt) => evt.stopPropagation());
                    sel.addEventListener('click', (evt) => evt.stopPropagation());
                });

                const commit = () => {
                    const current = state.nodes.get(node.id);
                    if (!current) return;
                    ensureNodeSettings(current);
                    const val = selectTun.value || '';
                    current.settings[def.settingKey] = val;
                    current.value = val;
                    getTuningMeta(val);
                    propagateValuesFrom(current.id);
                    refreshModeAndTonicForNode(current.id);
                    updateCodePanel();
                    autoSave();
                };

                selectCat.addEventListener('change', () => {
                    const cat = selectCat.value;
                    const subs = (tuningHierarchy?.subs.get(cat) ?? ['']).map((s) => s);
                    selectSub.innerHTML = '';
                    subs.forEach((s) => {
                        const op = document.createElement('option');
                        op.value = s;
                        op.textContent = s || 'root';
                        selectSub.appendChild(op);
                    });
                    selectSub.value = subs[0] ?? '';

                    // Update tuning list
                    const key = `${cat}/${selectSub.value ?? ''}`;
                    const tunes = tuningHierarchy?.files.get(key) ?? [];
                    selectTun.innerHTML = '';
                    tunes.forEach((t) => {
                        const op = document.createElement('option');
                        op.value = t;
                        op.textContent = splitTuningPath(t).file;
                        selectTun.appendChild(op);
                    });
                    selectTun.value = tunes[0] ?? DEFAULT_TUNING;
                    commit();
                });

                selectSub.addEventListener('change', () => {
                    const cat = selectCat.value;
                    const sub = selectSub.value;
                    const key = `${cat}/${sub ?? ''}`;
                    const tunes = tuningHierarchy?.files.get(key) ?? [];
                    selectTun.innerHTML = '';
                    tunes.forEach((t) => {
                        const op = document.createElement('option');
                        op.value = t;
                        op.textContent = splitTuningPath(t).file;
                        selectTun.appendChild(op);
                    });
                    selectTun.value = tunes[0] ?? DEFAULT_TUNING;
                    commit();
                });

                selectTun.addEventListener('change', commit);

                const initDropdowns = () => {
                    const currentVal = resolveTuningValue(node.settings?.[def.settingKey] ?? '');
                    const { category, subcategory } = splitTuningPath(currentVal);

                    // Categories
                    selectCat.innerHTML = '';
                    (tuningHierarchy?.categories ?? []).forEach((c) => {
                        const op = document.createElement('option');
                        op.value = c;
                        op.textContent = c;
                        selectCat.appendChild(op);
                    });
                    selectCat.value = category || '';
                    if (!selectCat.value && selectCat.options.length > 0) {
                        selectCat.value = selectCat.options[0].value;
                    }

                    // Subcategories
                    const subs = tuningHierarchy?.subs.get(selectCat.value) ?? [''];
                    selectSub.innerHTML = '';
                    subs.forEach((s) => {
                        const op = document.createElement('option');
                        op.value = s;
                        op.textContent = s || 'root';
                        selectSub.appendChild(op);
                    });
                    selectSub.value = subcategory || '';
                    if (!selectSub.value && subs.length) {
                        selectSub.value = subs[0];
                    }

                    // Tunings
                    const key = `${selectCat.value}/${selectSub.value ?? ''}`;
                    const tunes = tuningHierarchy?.files.get(key) ?? [];
                    selectTun.innerHTML = '';
                    tunes.forEach((t) => {
                        const op = document.createElement('option');
                        op.value = t;
                        op.textContent = splitTuningPath(t).file;
                        selectTun.appendChild(op);
                    });
                    selectTun.value = currentVal;
                    if (!selectTun.value && tunes.length) {
                        selectTun.value = tunes[0];
                    }
                    if (!selectTun.value && !tunes.length) {
                        selectTun.value = DEFAULT_TUNING;
                    }

                    if (!connected && selectTun.value) {
                        commit();
                    }
                };

                if (tuningListCache && tuningHierarchy) {
                    initDropdowns();
                } else {
                    selectCat.innerHTML = '';
                    const loadingOpt = document.createElement('option');
                    loadingOpt.textContent = 'Loading...';
                    selectCat.appendChild(loadingOpt);
                    selectSub.innerHTML = '';
                    const loadingSub = document.createElement('option');
                    loadingSub.textContent = 'Loading...';
                    selectSub.appendChild(loadingSub);
                    selectTun.innerHTML = '';
                    const loadingTun = document.createElement('option');
                    loadingTun.textContent = 'Loading...';
                    selectTun.appendChild(loadingTun);
                    getTuningList().then(() => initDropdowns());
                }

                const selectCol = document.createElement('div');
                selectCol.className = 'tuning-selects';
                selectCol.append(selectCat, selectSub, selectTun);

                container.append(selectCol);
            } else if (isModeSelect) {
                const selectGroup = document.createElement('select');
                const selectMode = document.createElement('select');

                [selectGroup, selectMode].forEach((sel, idx) => {
                    sel.className = 'setting-field';
                    sel.dataset.portIndex = i;
                    sel.dataset.settingKey = def.settingKey;
                    sel.dataset.modeField = ['group', 'mode'][idx];
                    sel.disabled = connected;
                    if (def.title) sel.title = def.title;
                    sel.addEventListener('mousedown', (evt) => evt.stopPropagation());
                    sel.addEventListener('click', (evt) => evt.stopPropagation());
                });

                let modeGroups = new Map();
                let availableModes = [];

                const commit = () => {
                    const current = state.nodes.get(node.id);
                    if (!current) return;
                    ensureNodeSettings(current);
                    const val = selectMode.value;
                    current.settings[def.settingKey] = val;
                    updateCodePanel();
                    propagateValuesFrom(current.id);
                    autoSave();
                };

                const populateModeSelects = () => {
                    const current = state.nodes.get(node.id);
                    if (!current) return;
                    const tuningPath = resolveTuningValue(current.settings?.tuning ?? DEFAULT_TUNING);
                    if (!modeSetsCache) {
                        selectGroup.innerHTML = '';
                        const loadingG = document.createElement('option');
                        loadingG.textContent = 'Loading...';
                        selectGroup.appendChild(loadingG);
                        selectMode.innerHTML = '';
                        const loadingM = document.createElement('option');
                        loadingM.textContent = 'Loading...';
                        selectMode.appendChild(loadingM);
                        selectGroup.disabled = true;
                        selectMode.disabled = true;
                        getModeSets().then(() => populateModeSelects());
                        return;
                    }

                    const meta = tuningMetaCache.get(tuningPath);
                    if (!meta) {
                        selectGroup.innerHTML = '';
                        const loadingG = document.createElement('option');
                        loadingG.textContent = 'Loading tuning...';
                        selectGroup.appendChild(loadingG);
                        selectMode.innerHTML = '';
                        const loadingM = document.createElement('option');
                        loadingM.textContent = 'Loading tuning...';
                        selectMode.appendChild(loadingM);
                        selectGroup.disabled = true;
                        selectMode.disabled = true;
                        getTuningMeta(tuningPath).then(() => populateModeSelects());
                        return;
                    }

                    availableModes = modesForCount(meta.count, modeSetsCache);
                    modeGroups = modesByGroupForCount(meta.count, modeSetsCache);

                    if (!availableModes.length) {
                        selectGroup.innerHTML = '';
                        const noG = document.createElement('option');
                        noG.value = '';
                        noG.textContent = 'No compatible modes';
                        selectGroup.appendChild(noG);
                        selectMode.innerHTML = '';
                        const noM = document.createElement('option');
                        noM.value = '';
                        noM.textContent = 'No compatible modes';
                        selectMode.appendChild(noM);
                        selectGroup.disabled = true;
                        selectMode.disabled = true;
                        return;
                    }

                    const currentVal = resolveModeValue(current.settings?.[def.settingKey] ?? '');
                    let currentMode = availableModes.find((m) => m.id === currentVal) ?? availableModes[0];
                    let currentGroup = currentMode?.group;

                    const groupList = Array.from(modeGroups.keys());
                    if (!groupList.includes(currentGroup)) {
                        currentGroup = groupList[0];
                        currentMode = (modeGroups.get(currentGroup) ?? [])[0] ?? currentMode;
                    }

                    selectGroup.innerHTML = '';
                    groupList.forEach((g) => {
                        const op = document.createElement('option');
                        op.value = g;
                        op.textContent = g;
                        selectGroup.appendChild(op);
                    });
                    selectGroup.value = currentGroup || selectGroup.options[0]?.value || '';

                    const modes = modeGroups.get(selectGroup.value) ?? [];
                    selectMode.innerHTML = '';
                    const noneOpt = document.createElement('option');
                    noneOpt.value = '';
                    noneOpt.textContent = '(none)';
                    selectMode.appendChild(noneOpt);
                    modes.forEach((m) => {
                        const op = document.createElement('option');
                        op.value = m.id;
                        op.textContent = m.name;
                        selectMode.appendChild(op);
                    });
                    if (!modes.find((m) => m.id === currentMode?.id)) {
                        currentMode = currentVal === '' ? null : modes[0] ?? currentMode;
                    }
                    selectMode.value =
                        currentVal === '' ? '' : currentMode?.id ?? modes[0]?.id ?? DEFAULT_MODE;

                    selectGroup.disabled = connected;
                    selectMode.disabled = connected;

                    if (!connected) commit();
                };

                selectGroup.addEventListener('change', () => {
                    const current = state.nodes.get(node.id);
                    const tuningPath = resolveTuningValue(current?.settings?.tuning ?? DEFAULT_TUNING);
                    const meta = tuningMetaCache.get(tuningPath);
                    const groupsMap = meta ? modesByGroupForCount(meta.count, modeSetsCache) : modeGroups;
                    modeGroups = groupsMap;
                    const modes = groupsMap.get(selectGroup.value) ?? [];
                    selectMode.innerHTML = '';
                    const noneOpt = document.createElement('option');
                    noneOpt.value = '';
                    noneOpt.textContent = '(none)';
                    selectMode.appendChild(noneOpt);
                    modes.forEach((m) => {
                        const op = document.createElement('option');
                        op.value = m.id;
                        op.textContent = m.name;
                        selectMode.appendChild(op);
                    });
                    const existing = current?.settings?.[def.settingKey];
                    selectMode.value = existing === '' ? '' : modes[0]?.id ?? '';
                    commit();
                });

                selectMode.addEventListener('change', commit);

                populateModeSelects();

                const modeCol = document.createElement('div');
                modeCol.className = 'mode-selects';
                modeCol.append(selectGroup, selectMode);
                container.append(modeCol);
            } else if (isTonicSelect) {
                const selectTonic = document.createElement('select');
                selectTonic.className = 'setting-field';
                selectTonic.dataset.portIndex = i;
                selectTonic.dataset.settingKey = def.settingKey;
                selectTonic.dataset.tonicField = 'tonic';
                selectTonic.disabled = connected;
                if (def.title) selectTonic.title = def.title;
                selectTonic.addEventListener('mousedown', (evt) => evt.stopPropagation());
                selectTonic.addEventListener('click', (evt) => evt.stopPropagation());

                const populateTonicOptions = () => {
                    const current = state.nodes.get(node.id);
                    if (!current) return;
                    const tuningPath = resolveTuningValue(current.settings?.tuning ?? DEFAULT_TUNING);
                    selectTonic.disabled = connected;
                    const meta = tuningMetaCache.get(tuningPath);

                    if (!meta) {
                        selectTonic.innerHTML = '';
                        const loading = document.createElement('option');
                        loading.value = '';
                        loading.textContent = 'Loading...';
                        selectTonic.appendChild(loading);
                        selectTonic.disabled = true;
                        getTuningMeta(tuningPath).then(() => populateTonicOptions());
                        return;
                    }

                    const options = [{ value: '', label: '(none)' }, ...tonicOptionsForCount(meta.count, TONIC_OPTIONS)];
                    selectTonic.innerHTML = '';
                    if (options.length) {
                        options.forEach(({ value, label }) => {
                            const op = document.createElement('option');
                            op.value = String(value);
                            op.textContent = label;
                            selectTonic.appendChild(op);
                        });
                    } else {
                        const op = document.createElement('option');
                        op.value = '';
                        op.textContent = 'No tonic options';
                        selectTonic.appendChild(op);
                    }

                    const currentVal = clampTonicToCount(
                        node.settings?.[def.settingKey] ?? DEFAULT_TONIC,
                        meta.count
                    );
                    selectTonic.value = String(currentVal);

                    if (!connected) {
                        ensureNodeSettings(current);
                        current.settings[def.settingKey] = currentVal;
                    }

                    selectTonic.disabled = connected || !options.length;
                };

                selectTonic.addEventListener('change', () => {
                    const current = state.nodes.get(node.id);
                    if (!current) return;
                    ensureNodeSettings(current);
                    const tuningPath = resolveTuningValue(current.settings?.tuning ?? DEFAULT_TUNING);
                    const count = tuningMetaCache.get(tuningPath)?.count;
                    const val = selectTonic.value === '' ? '' : clampTonicToCount(selectTonic.value, count);
                    selectTonic.value = String(val);
                    current.settings[def.settingKey] = val;
                    // Do not override node.value (reserved for tuning)
                    updateCodePanel();
                    propagateValuesFrom(current.id);
                    autoSave();
                });

                populateTonicOptions();

                const tonicCol = document.createElement('div');
                tonicCol.className = 'tonic-select';
                tonicCol.append(selectTonic);
                container.append(tonicCol);
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
                    if (current.settings[def.settingKey]) {
                        current.settings.mode = '';
                        current.settings.tonic = '';
                    }
                    refreshModeAndTonicForNode(current.id);
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
    const canvas = document.getElementById('canvas-container');

    if (canvas) {
        canvas.style.backgroundPosition = `${state.canvasOffset.x}px ${state.canvasOffset.y}px`;
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

    if (state.panning) {
        const dx = e.clientX - state.panning.startX;
        const dy = e.clientY - state.panning.startY;
        state.canvasOffset.x = state.panning.origin.x + dx;
        state.canvasOffset.y = state.panning.origin.y + dy;
        render();
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
            node.x = mousePos.x - state.canvasOffset.x - state.dragOffset.x;
            node.y = mousePos.y - state.canvasOffset.y - state.dragOffset.y;
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

    // Prefetch tunings for dropdowns
    getTuningList();
    getModeSets();
};

init();
