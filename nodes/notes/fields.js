import {
    TuningUtils,
    DEFAULT_TUNING,
    DEFAULT_MODE,
    DEFAULT_TONIC,
    DEFAULT_NOTE_ROWS,
    DEFAULT_OCTAVE_SHIFT,
    OCTAVE_SHIFT_MIN,
    OCTAVE_SHIFT_MAX,
    TONIC_OPTIONS,
    clampNumber,
    clampTonicToCount,
    resolveTuningValue,
    resolveModeValue,
    splitTuningPath,
    getTuningList,
    getModeSets,
    tonicOptionsForCount,
    modesForCount,
    modesByGroupForCount,
    tuningMetaCache,
    getTuningMeta
} from './constants.js';
import { getNode } from './helpers.js';
import { refreshModeAndTonicForNode, buildModeTonicToggle } from './mode-tonic.js';
import { createNotesUi, notesUiInstances } from './board-ui.js';
import { NOTES_CONFIG } from './config.js';

const NOTES_EDIT_ICON_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M5 19h1.425L16.2 9.225L14.775 7.8L5 17.575zm-1 2q-.425 0-.712-.288T3 20v-2.425q0-.4.15-.763t.425-.637L16.2 3.575q.3-.275.663-.425t.762-.15t.775.15t.65.45L20.425 5q.3.275.437.65T21 6.4q0 .4-.138.763t-.437.662l-12.6 12.6q-.275.275-.638.425t-.762.15zM19 6.4L17.6 5zm-3.525 2.125l-.7-.725L16.2 9.225z"/></svg>';

const refreshFrequencyCopyForNode = (nodeId) => {
    const instance = notesUiInstances.get(nodeId);
    if (instance && typeof instance.refreshFrequencyCopy === 'function') {
        instance.refreshFrequencyCopy();
    }
};

const buildTuningField = ({ node, setting, portIndex, connected, context }) => {
    const settingKey = setting.settingKey ?? setting.key;
    const selectCat = document.createElement('select');
    const selectSub = document.createElement('select');
    const selectTun = document.createElement('select');

    [selectCat, selectSub, selectTun].forEach((sel, idx) => {
        sel.className = 'setting-field';
        sel.dataset.portIndex = portIndex;
        sel.dataset.settingKey = settingKey;
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
        current.settings[settingKey] = val;
        current.value = val;
        getTuningMeta(val);
        if (context.propagateValuesFrom) context.propagateValuesFrom(current.id);
        refreshModeAndTonicForNode(current.id, context);
        refreshFrequencyCopyForNode(current.id);
        if (context.updateCodePanel) context.updateCodePanel();
        if (context.autoSave) context.autoSave();
    };

    selectCat.addEventListener('change', () => {
        const cat = selectCat.value;
        const subs = (TuningUtils.tuningHierarchy?.subs.get(cat) ?? ['']).map((s) => s);
        selectSub.innerHTML = '';
        subs.forEach((s) => {
            const op = document.createElement('option');
            op.value = s;
            op.textContent = s || 'root';
            selectSub.appendChild(op);
        });
        selectSub.value = subs[0] ?? '';

        const key = `${cat}/${selectSub.value ?? ''}`;
        const tunes = TuningUtils.tuningHierarchy?.files.get(key) ?? [];
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
        const tunes = TuningUtils.tuningHierarchy?.files.get(key) ?? [];
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
        const currentVal = resolveTuningValue(node.settings?.[settingKey] ?? '', context);
        const { category, subcategory } = splitTuningPath(currentVal);

        selectCat.innerHTML = '';
        (TuningUtils.tuningHierarchy?.categories ?? []).forEach((c) => {
            const op = document.createElement('option');
            op.value = c;
            op.textContent = c;
            selectCat.appendChild(op);
        });
        selectCat.value = category || '';
        if (!selectCat.value && selectCat.options.length > 0) {
            selectCat.value = selectCat.options[0].value;
        }

        const subs = TuningUtils.tuningHierarchy?.subs.get(selectCat.value) ?? [''];
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
        const tunes = TuningUtils.tuningHierarchy?.files.get(key) ?? [];
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

    if (TuningUtils.tuningListCache && TuningUtils.tuningHierarchy) {
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
    const settingKey = setting.settingKey ?? setting.key;
    const selectGroup = document.createElement('select');
    const selectMode = document.createElement('select');

    [selectGroup, selectMode].forEach((sel, idx) => {
        sel.className = 'setting-field';
        sel.dataset.portIndex = portIndex;
        sel.dataset.settingKey = settingKey;
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
        current.settings[settingKey] = val;
        refreshFrequencyCopyForNode(current.id);
        if (context.updateCodePanel) context.updateCodePanel();
        if (context.propagateValuesFrom) context.propagateValuesFrom(current.id);
        if (context.autoSave) context.autoSave();
    };

    const populateModeSelects = () => {
        const current = getNode(context, node.id);
        if (!current) return;
        const tuningPath = resolveTuningValue(current.settings?.tuning ?? DEFAULT_TUNING, context);
        if (!TuningUtils.modeSetsCache) {
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

        availableModes = modesForCount(meta.count, TuningUtils.modeSetsCache);
        modeGroups = modesByGroupForCount(meta.count, TuningUtils.modeSetsCache);

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

        const currentVal = resolveModeValue(current.settings?.[settingKey] ?? '', context);
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
            ? modesByGroupForCount(tuningMetaCache.get(tuningPath).count, TuningUtils.modeSetsCache)
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
        const existing = current?.settings?.[settingKey];
        selectMode.value = existing === '' ? '' : modes[0]?.id ?? '';
        commit();
    });

    selectMode.addEventListener('change', commit);

    populateModeSelects();

    const modeSelects = document.createElement('div');
    modeSelects.className = 'mode-selects';
    modeSelects.append(selectGroup, selectMode);

    const modeBlock = document.createElement('div');
    modeBlock.className = 'mode-block';
    modeBlock.append(buildModeTonicToggle(node, context), modeSelects);
    return modeBlock;
};

const buildTonicField = ({ node, setting, portIndex, connected, context }) => {
    const settingKey = setting.settingKey ?? setting.key;
    const selectTonic = document.createElement('select');
    selectTonic.className = 'setting-field';
    selectTonic.dataset.portIndex = portIndex;
    selectTonic.dataset.settingKey = settingKey;
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

        const currentVal = clampTonicToCount(node.settings?.[settingKey] ?? DEFAULT_TONIC, meta.count);
        selectTonic.value = String(currentVal);

        if (!connected) {
            current.settings[settingKey] = currentVal;
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
        current.settings[settingKey] = val;
        refreshFrequencyCopyForNode(current.id);
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

const buildRowsField = ({ node, setting, portIndex, connected, context }) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'rows-setting-controls';
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '1';
    input.max = '32';
    input.className = 'setting-field';
    input.dataset.portIndex = portIndex;
    input.dataset.settingKey = setting.settingKey ?? setting.key;
    input.disabled = connected;
    if (setting.title) input.title = setting.title;
    input.value = String(
        clampNumber(node.settings?.rows ?? node.settings?.noteRows, 1, 32, DEFAULT_NOTE_ROWS)
    );
    input.addEventListener('mousedown', (evt) => evt.stopPropagation());
    input.addEventListener('click', (evt) => evt.stopPropagation());
    input.addEventListener('input', () => {
        const current = getNode(context, node.id);
        if (!current) return;
        const next = clampNumber(
            input.value,
            1,
            32,
            clampNumber(current.settings?.rows ?? current.settings?.noteRows, 1, 32, DEFAULT_NOTE_ROWS)
        );
        input.value = String(next);
        current.settings.rows = next;
        current.settings.noteRows = next;
        const instance = notesUiInstances.get(current.id);
        if (instance && typeof instance.setRows === 'function') {
            instance.setRows(next);
            return;
        }
        if (context.propagateValuesFrom) context.propagateValuesFrom(current.id);
        if (context.updateCodePanel) context.updateCodePanel();
        if (context.autoSave) context.autoSave();
    });

    const inputDefs =
        typeof context?.getInputDefinitions === 'function'
            ? context.getInputDefinitions(NOTES_CONFIG)
            : [];
    const notesPortIndex = inputDefs.findIndex((d) => d.settingKey === 'notes');
    const notesConnected =
        notesPortIndex !== -1 && context?.hasIncomingConnection
            ? context.hasIncomingConnection(node.id, notesPortIndex)
            : false;

    const editToggle = document.createElement('button');
    editToggle.type = 'button';
    editToggle.className = 'notes-edit-toggle rows-edit-toggle';
    editToggle.innerHTML = NOTES_EDIT_ICON_SVG;
    editToggle.setAttribute('aria-label', 'Toggle notes edit mode');
    editToggle.setAttribute('aria-pressed', String(node.settings?.noteEditMode !== false));
    editToggle.classList.toggle('active', node.settings?.noteEditMode !== false);
    editToggle.disabled = notesConnected;
    editToggle.addEventListener('mousedown', (evt) => evt.stopPropagation());
    editToggle.addEventListener('click', (evt) => {
        evt.stopPropagation();
        const current = getNode(context, node.id);
        if (!current) return;
        const instance = notesUiInstances.get(current.id);
        if (instance && typeof instance.toggleEditMode === 'function') {
            const active = instance.toggleEditMode();
            editToggle.classList.toggle('active', active);
            editToggle.setAttribute('aria-pressed', String(active));
            return;
        }
        const next = !(current.settings?.noteEditMode !== false);
        current.settings.noteEditMode = next;
        editToggle.classList.toggle('active', next);
        editToggle.setAttribute('aria-pressed', String(next));
        if (context.autoSave) context.autoSave();
    });

    wrapper.append(input, editToggle);
    return wrapper;
};

const buildOctaveField = ({ node, setting, portIndex, connected, context }) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'rows-setting-controls';

    const input = document.createElement('input');
    input.type = 'number';
    input.step = '1';
    input.min = String(OCTAVE_SHIFT_MIN);
    input.max = String(OCTAVE_SHIFT_MAX);
    input.className = 'setting-field';
    input.dataset.portIndex = portIndex;
    input.dataset.settingKey = setting.settingKey ?? setting.key;
    input.disabled = connected;
    if (setting.title) input.title = setting.title;
    input.value = String(
        Math.round(
            clampNumber(node.settings?.octave, OCTAVE_SHIFT_MIN, OCTAVE_SHIFT_MAX, DEFAULT_OCTAVE_SHIFT)
        )
    );

    input.addEventListener('mousedown', (evt) => evt.stopPropagation());
    input.addEventListener('click', (evt) => evt.stopPropagation());
    input.addEventListener('input', () => {
        const current = getNode(context, node.id);
        if (!current) return;
        const next = clampNumber(
            input.value,
            OCTAVE_SHIFT_MIN,
            OCTAVE_SHIFT_MAX,
            clampNumber(current.settings?.octave, OCTAVE_SHIFT_MIN, OCTAVE_SHIFT_MAX, DEFAULT_OCTAVE_SHIFT)
        );
        const normalized = Math.round(next);
        input.value = String(normalized);
        current.settings.octave = normalized;
        refreshFrequencyCopyForNode(current.id);
        if (context.propagateValuesFrom) context.propagateValuesFrom(current.id);
        if (context.updateCodePanel) context.updateCodePanel();
        if (context.autoSave) context.autoSave();
    });

    wrapper.append(input);
    return wrapper;
};

const renderSettingField = ({ node, setting, portIndex, connected, context }) => {
    const settingKey = setting.settingKey ?? setting.key;
    if (settingKey === 'rows') {
        return buildRowsField({ node, setting, portIndex, connected, context });
    }
    if (settingKey === 'octave') {
        return buildOctaveField({ node, setting, portIndex, connected, context });
    }
    if (settingKey === 'tuning') {
        return buildTuningField({ node, setting, portIndex, connected, context });
    }
    if (settingKey === 'mode') {
        return buildModeField({ node, setting, portIndex, connected, context });
    }
    if (settingKey === 'tonic') {
        return buildTonicField({ node, setting, portIndex, connected, context });
    }
    if (settingKey === 'notes') {
        return createNotesUi({ node, setting, portIndex, connected, context });
    }
    return null;
};

export { buildTuningField, buildModeField, buildTonicField, buildRowsField, buildOctaveField, renderSettingField };
