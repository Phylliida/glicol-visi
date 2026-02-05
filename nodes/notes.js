import {
    registerNodeType,
    getInputDefinitions
} from '../node-lib.js';

const TuningUtils = window.TuningUtils || {};
const {
    getTuningMeta,
    tuningMetaCache,
    modesForCount,
    modesByGroupForCount,
    tonicOptionsForCount,
    clampTonicToCount
} = TuningUtils;

const DEFAULT_TUNING = 'equal_temperament/et_<=12/fj-12tet.scl';
const DEFAULT_MODE = 'ionian';
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

let tuningListCache = null;
let tuningListPromise = null;
let tuningHierarchy = null;
let modeSetsCache = null;
let modeListPromise = null;

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

const getModeSets = (context = {}) => {
    if (modeSetsCache) return Promise.resolve(modeSetsCache);
    if (modeListPromise) return modeListPromise;
    modeListPromise = fetch('/modes.json')
        .then((res) => res.json())
        .then((data) => {
            modeSetsCache = Array.isArray(data) ? data : [];
            if (context.render) context.render();
            return modeSetsCache;
        })
        .catch((err) => {
            console.error('Failed to load modes', err);
            modeSetsCache = [];
            return modeSetsCache;
        });
    return modeListPromise;
};

const resolveTuningValue = (raw, context = {}) => {
    const val = (raw ?? '').trim();
    const list = tuningListCache;

    if (!list) {
        getTuningList(context).then(() => context.render && context.render());
        return val || DEFAULT_TUNING;
    }

    if (!val) return DEFAULT_TUNING;

    const lower = val.toLowerCase();

    const exact = list.find((t) => t === val);
    if (exact) return exact;

    const ci = list.find((t) => t.toLowerCase() === lower);
    if (ci) return ci;

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

const resolveModeValue = (raw, context = {}) => {
    const val = (raw ?? '').trim();
    const all = flattenModes();
    if (!all.length) {
        getModeSets(context).then(() => context.render && context.render());
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

const getTuningList = (context = {}) => {
    if (tuningListCache) return Promise.resolve(tuningListCache);
    if (tuningListPromise) return tuningListPromise;
    tuningListPromise = fetch('/api/tunings')
        .then((res) => res.json())
        .then((data) => {
            tuningListCache = Array.isArray(data.tunings) ? data.tunings : [];
            tuningHierarchy = buildTuningHierarchy(tuningListCache);
            if (context.render) context.render();
            return tuningListCache;
        })
        .catch((err) => {
            console.error('Failed to load tunings', err);
            tuningListCache = [];
            return tuningListCache;
        });
    return tuningListPromise;
};

const getNode = (context, nodeId) => context?.state?.nodes?.get(nodeId);
const hasIncoming = (context, nodeId, portIndex) =>
    context?.hasIncomingConnection ? context.hasIncomingConnection(nodeId, portIndex) : false;

const shouldForceHideModeTonic = (nodeId, context = {}) => {
    const node = getNode(context, nodeId);
    if (!node) return false;
    const inputDefs = getInputDefinitions(NOTES_CONFIG);
    const modePortIndex = inputDefs.findIndex((d) => d.settingKey === 'mode');
    const tonicPortIndex = inputDefs.findIndex((d) => d.settingKey === 'tonic');
    if (modePortIndex === -1 || tonicPortIndex === -1) return false;
    const modeConnected = hasIncoming(context, nodeId, modePortIndex);
    const tonicConnected = hasIncoming(context, nodeId, tonicPortIndex);
    const modeEmpty = (node.settings?.mode ?? '') === '';
    const tonicEmpty = (node.settings?.tonic ?? '') === '';
    return modeConnected && tonicConnected && modeEmpty && tonicEmpty;
};

const applyModeTonicVisibility = (nodeId, context = {}, opts = {}) => {
    const node = getNode(context, nodeId);
    if (!node) return;
    const forceHide = opts.forceHide ?? shouldForceHideModeTonic(nodeId, context);
    const nodeEl = document.querySelector(`[data-node-id="${nodeId}"]`);
    if (!nodeEl) return;

    if (forceHide && !node.settings.hideModeTonic) {
        node.settings.hideModeTonic = true;
    }

    const hidden = opts.hidden ?? !!node.settings?.hideModeTonic;
    nodeEl.querySelectorAll('.mode-selects, .tonic-select').forEach((el) => {
        el.style.display = hidden ? 'none' : '';
    });

    const toggle = nodeEl.querySelector('.mode-tonic-toggle input[type="checkbox"]');
    if (toggle) {
        toggle.checked = !hidden;
        toggle.disabled = forceHide;
    }
};

const refreshModeAndTonicForNode = (nodeId, context = {}) => {
    const node = getNode(context, nodeId);
    if (!node) return;
    const inputDefs = getInputDefinitions(NOTES_CONFIG);
    const modePortIndex = inputDefs.findIndex((d) => d.settingKey === 'mode');
    const tonicPortIndex = inputDefs.findIndex((d) => d.settingKey === 'tonic');

    const forceHide = shouldForceHideModeTonic(nodeId, context);
    if (forceHide && !node.settings.hideModeTonic) {
        node.settings.hideModeTonic = true;
    }

    if (node.settings?.hideModeTonic) {
        if (modePortIndex !== -1 && !hasIncoming(context, nodeId, modePortIndex)) {
            node.settings.mode = '';
            updateModeFields(nodeId, modePortIndex, '', context);
        }
        if (tonicPortIndex !== -1 && !hasIncoming(context, nodeId, tonicPortIndex)) {
            node.settings.tonic = '';
            updateTonicField(nodeId, tonicPortIndex, '', context);
        }
        if (context.propagateValuesFrom) context.propagateValuesFrom(nodeId);
        applyModeTonicVisibility(nodeId, context, { forceHide });
        return;
    }

    if (modePortIndex !== -1) {
        updateModeFields(nodeId, modePortIndex, node.settings?.mode, context);
    }
    if (tonicPortIndex !== -1) {
        updateTonicField(nodeId, tonicPortIndex, node.settings?.tonic, context);
    }
    applyModeTonicVisibility(nodeId, context, { forceHide });
};

const updateTuningFields = (nodeId, portIndex, rawValue, context = {}) => {
    const nodeEl = document.querySelector(`[data-node-id="${nodeId}"]`);
    if (!nodeEl || !tuningListCache || !tuningHierarchy) return;

    const selects = Array.from(
        nodeEl.querySelectorAll(`select.setting-field[data-port-index="${portIndex}"]`)
    );
    if (!selects.length) return;

    const connected = hasIncoming(context, nodeId, portIndex);
    const value = resolveTuningValue(rawValue, context);
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
        setOptions(selectCat, tuningHierarchy.categories);
        selectCat.value = category || selectCat.options[0]?.value || '';
    }

    if (selectSub) {
        const subs = tuningHierarchy.subs.get(selectCat?.value ?? '') ?? [''];
        setOptions(
            selectSub,
            subs.map((s) => ({ value: s, label: s || 'root' }))
        );
        selectSub.value = subcategory || selectSub.options[0]?.value || '';
    }

    if (selectTun) {
        const key = `${selectCat?.value ?? ''}/${selectSub?.value ?? ''}`;
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

    refreshModeAndTonicForNode(nodeId, context);
};

const updateModeFields = (nodeId, portIndex, rawValue, context = {}) => {
    const nodeEl = document.querySelector(`[data-node-id="${nodeId}"]`);
    if (!nodeEl) return;

    const selects = Array.from(
        nodeEl.querySelectorAll(`select.setting-field[data-port-index="${portIndex}"]`)
    );
    if (!selects.length) return;

    if (!modeSetsCache) {
        getModeSets(context).then(() => updateModeFields(nodeId, portIndex, rawValue, context));
        return;
    }

    const node = getNode(context, nodeId);
    const settingKey = getInputDefinitions(NOTES_CONFIG)[portIndex]?.settingKey;
    const tuningPath = resolveTuningValue(node?.settings?.tuning ?? DEFAULT_TUNING, context);
    const meta = tuningMetaCache.get(tuningPath);
    if (!meta) {
        getTuningMeta(tuningPath).then(() => updateModeFields(nodeId, portIndex, rawValue, context));
        return;
    }

    const connected = hasIncoming(context, nodeId, portIndex);
    const value = resolveModeValue(rawValue, context);
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
            if (context.updateCodePanel) context.updateCodePanel();
            if (context.propagateValuesFrom) context.propagateValuesFrom(node.id);
            if (context.autoSave) context.autoSave();
        }
    }

    selects.forEach((s) => {
        s.disabled = connected;
    });

    applyModeTonicVisibility(nodeId, context);
};

const updateTonicField = (nodeId, portIndex, rawValue, context = {}) => {
    const nodeEl = document.querySelector(`[data-node-id="${nodeId}"]`);
    if (!nodeEl) return;
    const select = nodeEl.querySelector(
        `select.setting-field[data-port-index="${portIndex}"][data-tonic-field="tonic"]`
    );
    if (!select) return;
    const node = getNode(context, nodeId);
    const settingKey = getInputDefinitions(NOTES_CONFIG)[portIndex]?.settingKey;
    const tuningPath = resolveTuningValue(node?.settings?.tuning ?? DEFAULT_TUNING, context);
    const meta = tuningMetaCache.get(tuningPath);
    if (!meta) {
        getTuningMeta(tuningPath).then(() => updateTonicField(nodeId, portIndex, rawValue, context));
        return;
    }

    const connected = hasIncoming(context, nodeId, portIndex);
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

    const currentVal = clampTonicToCount(
        node.settings?.[settingKey] ?? DEFAULT_TONIC,
        meta.count
    );
    select.value = String(currentVal);

    if (!connected) {
        node.settings[settingKey] = currentVal;
    }

    select.disabled = connected || !options.length;

    applyModeTonicVisibility(nodeId, context);
};

const renderHeaderExtras = (node, context = {}) => {
    const toggleWrap = document.createElement('label');
    toggleWrap.className = 'mode-tonic-toggle';
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.checked = !node.settings?.hideModeTonic;
    toggle.addEventListener('mousedown', (evt) => evt.stopPropagation());
    toggle.addEventListener('click', (evt) => evt.stopPropagation());
    toggle.addEventListener('change', () => {
        const current = getNode(context, node.id);
        if (!current) return;
        const defs = getInputDefinitions(NOTES_CONFIG);
        const modePortIndex = defs.findIndex((d) => d.settingKey === 'mode');
        const tonicPortIndex = defs.findIndex((d) => d.settingKey === 'tonic');
        current.settings.hideModeTonic = !toggle.checked;
        if (current.settings.hideModeTonic) {
            if (modePortIndex !== -1 && !hasIncoming(context, current.id, modePortIndex)) {
                current.settings.mode = '';
            }
            if (tonicPortIndex !== -1 && !hasIncoming(context, current.id, tonicPortIndex)) {
                current.settings.tonic = '';
            }
        }
        refreshModeAndTonicForNode(current.id, context);
        if (context.render) context.render();
        if (context.autoSave) context.autoSave();
    });
    const toggleText = document.createElement('span');
    toggleText.textContent = 'Mode/Tonic';
    toggleWrap.append(toggle, toggleText);
    return toggleWrap;
};

const buildTuningField = ({ node, setting, portIndex, connected, context }) => {
    const selectCat = document.createElement('select');
    const selectSub = document.createElement('select');
    const selectTun = document.createElement('select');

    [selectCat, selectSub, selectTun].forEach((sel, idx) => {
        sel.className = 'setting-field';
        sel.dataset.portIndex = portIndex;
        sel.dataset.settingKey = setting.key;
        sel.dataset.tuningField = ['category', 'subcategory', 'tuning'][idx];
        sel.disabled = connected;
        if (setting.title) sel.title = setting.title;
        sel.addEventListener('mousedown', (evt) => evt.stopPropagation());
        sel.addEventListener('click', (evt) => evt.stopPropagation());
    });

    const commit = () => {
        const current = getNode(context, node.id);
        if (!current) return;
        const val = selectTun.value || '';
        current.settings[setting.key] = val;
        current.value = val;
        getTuningMeta(val);
        if (context.propagateValuesFrom) context.propagateValuesFrom(current.id);
        refreshModeAndTonicForNode(current.id, context);
        if (context.updateCodePanel) context.updateCodePanel();
        if (context.autoSave) context.autoSave();
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
        const currentVal = resolveTuningValue(node.settings?.[setting.key] ?? '', context);
        const { category, subcategory } = splitTuningPath(currentVal);

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
        getTuningList(context).then(() => initDropdowns());
    }

    const selectCol = document.createElement('div');
    selectCol.className = 'tuning-selects';
    selectCol.append(selectCat, selectSub, selectTun);

    return selectCol;
};

const buildModeField = ({ node, setting, portIndex, connected, context }) => {
    const selectGroup = document.createElement('select');
    const selectMode = document.createElement('select');

    [selectGroup, selectMode].forEach((sel, idx) => {
        sel.className = 'setting-field';
        sel.dataset.portIndex = portIndex;
        sel.dataset.settingKey = setting.key;
        sel.dataset.modeField = ['group', 'mode'][idx];
        sel.disabled = connected;
        if (setting.title) sel.title = setting.title;
        sel.addEventListener('mousedown', (evt) => evt.stopPropagation());
        sel.addEventListener('click', (evt) => evt.stopPropagation());
    });

    let modeGroups = new Map();
    let availableModes = [];

    const commit = () => {
        const current = getNode(context, node.id);
        if (!current) return;
        const val = selectMode.value;
        current.settings[setting.key] = val;
        if (context.updateCodePanel) context.updateCodePanel();
        if (context.propagateValuesFrom) context.propagateValuesFrom(current.id);
        if (context.autoSave) context.autoSave();
    };

    const populateModeSelects = () => {
        const current = getNode(context, node.id);
        if (!current) return;
        const tuningPath = resolveTuningValue(current.settings?.tuning ?? DEFAULT_TUNING, context);
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
            getModeSets(context).then(() => populateModeSelects());
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

        const currentVal = resolveModeValue(current.settings?.[setting.key] ?? '', context);
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
        const current = getNode(context, node.id);
        const tuningPath = resolveTuningValue(current?.settings?.tuning ?? DEFAULT_TUNING, context);
        const groupsMap = tuningMetaCache.get(tuningPath)
            ? modesByGroupForCount(tuningMetaCache.get(tuningPath).count, modeSetsCache)
            : modeGroups;
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
        const existing = current?.settings?.[setting.key];
        selectMode.value = existing === '' ? '' : modes[0]?.id ?? '';
        commit();
    });

    selectMode.addEventListener('change', commit);

    populateModeSelects();

    const modeCol = document.createElement('div');
    modeCol.className = 'mode-selects';
    modeCol.append(selectGroup, selectMode);
    return modeCol;
};

const buildTonicField = ({ node, setting, portIndex, connected, context }) => {
    const selectTonic = document.createElement('select');
    selectTonic.className = 'setting-field';
    selectTonic.dataset.portIndex = portIndex;
    selectTonic.dataset.settingKey = setting.key;
    selectTonic.dataset.tonicField = 'tonic';
    selectTonic.disabled = connected;
    if (setting.title) selectTonic.title = setting.title;
    selectTonic.addEventListener('mousedown', (evt) => evt.stopPropagation());
    selectTonic.addEventListener('click', (evt) => evt.stopPropagation());

    const populateTonicOptions = () => {
        const current = getNode(context, node.id);
        if (!current) return;
        const tuningPath = resolveTuningValue(current.settings?.tuning ?? DEFAULT_TUNING, context);
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
            node.settings?.[setting.key] ?? DEFAULT_TONIC,
            meta.count
        );
        selectTonic.value = String(currentVal);

        if (!connected) {
            current.settings[setting.key] = currentVal;
        }

        selectTonic.disabled = connected || !options.length;
    };

    selectTonic.addEventListener('change', () => {
        const current = getNode(context, node.id);
        if (!current) return;
        const tuningPath = resolveTuningValue(current.settings?.tuning ?? DEFAULT_TUNING, context);
        const count = tuningMetaCache.get(tuningPath)?.count;
        const val = selectTonic.value === '' ? '' : clampTonicToCount(selectTonic.value, count);
        selectTonic.value = String(val);
        current.settings[setting.key] = val;
        if (context.updateCodePanel) context.updateCodePanel();
        if (context.propagateValuesFrom) context.propagateValuesFrom(current.id);
        if (context.autoSave) context.autoSave();
    });

    populateTonicOptions();

    const tonicCol = document.createElement('div');
    tonicCol.className = 'tonic-select';
    tonicCol.append(selectTonic);
    return tonicCol;
};

const renderSettingField = ({ node, setting, portIndex, connected, context }) => {
    if (setting.key === 'tuning') {
        return buildTuningField({ node, setting, portIndex, connected, context });
    }
    if (setting.key === 'mode') {
        return buildModeField({ node, setting, portIndex, connected, context });
    }
    if (setting.key === 'tonic') {
        return buildTonicField({ node, setting, portIndex, connected, context });
    }
    return null;
};

const updateSettingFieldDom = ({ node, nodeEl, settingKey, portIndex, value, context }) => {
    const handled =
        settingKey === 'tuning'
            ? (updateTuningFields(node.id, portIndex, value, context), true)
            : settingKey === 'mode'
                ? (updateModeFields(node.id, portIndex, value, context), true)
                : settingKey === 'tonic'
                    ? (updateTonicField(node.id, portIndex, value, context), true)
                    : false;
    return handled;
};

const getOutputValue = (node, portIndex) => {
    if (!node) return undefined;
    if (portIndex === 0) return node.settings?.tuning ?? '';
    if (portIndex === 1) return node.settings?.mode ?? '';
    if (portIndex === 2) return node.settings?.tonic === '' ? '' : String(node.settings?.tonic ?? '');
    return node.value;
};

const ensureSettings = (node) => {
    if (node.settings.hideModeTonic === undefined) {
        node.settings.hideModeTonic = false;
    }
};

const resolveIncomingValue = (node, settingKey, incoming, context = {}) => {
    if (settingKey === 'tuning') return resolveTuningValue(incoming, context);
    if (settingKey === 'mode') return resolveModeValue(incoming, context);
    if (settingKey === 'tonic') return resolveTonicValue(incoming);
    return incoming;
};

const valueAfterIncoming = (node, inputDef, incoming, fromValue) => {
    if (inputDef?.settingKey === 'mode') return undefined; // preserve tuning value
    if (inputDef?.settingKey === 'tuning') return incoming;
    return fromValue;
};

const afterRender = (node, _nodeEl, context = {}) => {
    applyModeTonicVisibility(node.id, context);
};

const init = (context = {}) => {
    getTuningList(context);
    getModeSets(context);
};

const NOTES_CONFIG = {
    type: 'notes',
    name: 'Notes',
    inputs: [],
    outputs: ['tuning', 'mode', 'tonic'],
    settings: [
        { key: 'tuning', label: 'tuning', title: 'tuning' },
        { key: 'mode', label: 'mode', title: 'mode' },
        { key: 'tonic', label: 'tonic', title: 'tonic' }
    ]
};

registerNodeType({
    ...NOTES_CONFIG,
    hooks: {
        ensureSettings,
        getOutputValue,
        resolveIncomingValue,
        valueAfterIncoming,
        renderHeaderExtras,
        renderSettingField,
        updateSettingFieldDom,
        afterRender,
        init
    }
});

export {
    DEFAULT_TUNING,
    DEFAULT_MODE,
    DEFAULT_TONIC,
    resolveTuningValue,
    resolveModeValue,
    resolveTonicValue
};
