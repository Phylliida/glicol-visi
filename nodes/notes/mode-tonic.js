import {
    TuningUtils,
    DEFAULT_TUNING,
    DEFAULT_MODE,
    DEFAULT_TONIC,
    TONIC_OPTIONS,
    getTuningMeta,
    tuningMetaCache,
    modesForCount,
    modesByGroupForCount,
    tonicOptionsForCount,
    clampTonicToCount,
    getModeSets,
    resolveTuningValue,
    resolveModeValue,
    splitTuningPath
} from './constants.js';
import { NOTES_CONFIG } from './config.js';
import { getNode, hasIncoming, alignOutputsToInputs, getModePortIndex, getTonicPortIndex } from './helpers.js';
import { getInputDefinitions } from '../../node-lib.js';

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

    alignOutputsToInputs(nodeEl);
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
    if (!nodeEl || !context || !context.state) return;
    if (!TuningUtils.tuningListCache || !TuningUtils.tuningHierarchy) return;

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
        setOptions(selectCat, TuningUtils.tuningHierarchy.categories);
        selectCat.value = category || selectCat.options[0]?.value || '';
    }

    if (selectSub) {
        const subs = TuningUtils.tuningHierarchy.subs.get(selectCat?.value ?? '') ?? [''];
        setOptions(
            selectSub,
            subs.map((s) => ({ value: s, label: s || 'root' }))
        );
        selectSub.value = subcategory || selectSub.options[0]?.value || '';
    }

    if (selectTun) {
        const key = `${selectCat?.value ?? ''}/${selectSub?.value ?? ''}`;
        const tunes = TuningUtils.tuningHierarchy.files.get(key) ?? [];
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

    if (!TuningUtils.modeSetsCache) {
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
    const availableModes = modesForCount(meta.count, TuningUtils.modeSetsCache);
    const groupedModes = modesByGroupForCount(meta.count, TuningUtils.modeSetsCache);
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

const buildModeTonicToggle = (node, context = {}) => {
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
        const modePortIndex = getModePortIndex();
        const tonicPortIndex = getTonicPortIndex();
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

const moveRowsPortToTop = (nodeEl) => {
    const inputs = nodeEl?.querySelector('.inputs');
    if (!inputs) return;
    const rowsPort = inputs.querySelector('.port-container.setting-port[data-setting-key="rows"]');
    if (rowsPort && inputs.firstElementChild !== rowsPort) {
        inputs.insertBefore(rowsPort, inputs.firstElementChild);
    }
};

const afterRender = (node, nodeEl, context = {}) => {
    moveRowsPortToTop(nodeEl);
    applyModeTonicVisibility(node.id, context);
};

export {
    shouldForceHideModeTonic,
    applyModeTonicVisibility,
    refreshModeAndTonicForNode,
    updateTuningFields,
    updateModeFields,
    updateTonicField,
    buildModeTonicToggle,
    afterRender
};
