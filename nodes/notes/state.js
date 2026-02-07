import {
    TuningUtils,
    tuningMetaCache,
    DEFAULT_TUNING,
    DEFAULT_MODE,
    DEFAULT_TONIC,
    TONIC_OPTIONS,
    DEFAULT_NOTATION,
    DEFAULT_NOTE_ROWS,
    DEFAULT_NOTE_COL_HEIGHT,
    DEFAULT_NOTE_CONTAINER_WIDTH,
    DEFAULT_NOTE_BUTTON_SCALE,
    resolveTuningValue,
    resolveModeValue,
    resolveTonicValue,
    clampNumber
} from './constants.js';
import {
    computeFrequencyNotation,
    renderNotesExpression,
    renderFreqExpression,
    unwrapNotesExpression,
    unwrapFreqExpression
} from './freq-compute.js';

const FREQ_INPUT_PORT_INDEX = 1;
const isFreqEnabled = (node) => node?.settings?.freqEnabled !== false;

const getModeDegreeCount = (modeId, context = {}) => {
    const modeSets = TuningUtils.modeSetsCache;
    if (!Array.isArray(modeSets) || !modeSets.length) return null;
    const resolvedModeId = resolveModeValue(modeId, context);
    for (const group of modeSets) {
        const modes = Array.isArray(group?.modes) ? group.modes : [];
        const mode = modes.find((m) => m?.id === resolvedModeId);
        if (mode && Array.isArray(mode.degrees) && mode.degrees.length) {
            return mode.degrees.length;
        }
    }
    return null;
};

const inferDefaultRows = (node, context = {}) => {
    const selectedMode = String(node?.settings?.mode ?? '').trim();
    if (selectedMode) {
        const modeCount = getModeDegreeCount(selectedMode, context);
        if (Number.isFinite(modeCount) && modeCount > 0) return modeCount;
    }

    const tuningPath = resolveTuningValue(node?.settings?.tuning ?? DEFAULT_TUNING, context);
    const tuningCount = tuningMetaCache.get(tuningPath)?.count;
    if (Number.isFinite(tuningCount) && tuningCount > 0) return tuningCount;

    return TONIC_OPTIONS.length || 12;
};

const getOutputValue = (node, portIndex, context = {}) => {
    if (!node) return undefined;
    if (portIndex === 0) return node.settings?.tuning ?? '';
    if (portIndex === 1) return node.settings?.mode ?? '';
    if (portIndex === 2) return node.settings?.tonic === '' ? '' : String(node.settings?.tonic ?? '');
    if (portIndex === 3) return renderNotesExpression(node.settings?.notes ?? DEFAULT_NOTATION);
    if (portIndex === 4) {
        if (!isFreqEnabled(node)) return '';
        const hasFreqIncoming =
            typeof context?.hasIncomingConnection === 'function'
                ? context.hasIncomingConnection(node.id, FREQ_INPUT_PORT_INDEX)
                : false;
        if (hasFreqIncoming) {
            const incomingFreq = String(node.settings?.freq ?? '');
            const normalized = unwrapFreqExpression(unwrapNotesExpression(incomingFreq));
            return renderFreqExpression(normalized);
        }
        return renderFreqExpression(computeFrequencyNotation(node, context));
    }
    if (portIndex === 5) {
        return clampNumber(
            node.settings?.rows ?? node.settings?.noteRows,
            1,
            32,
            DEFAULT_NOTE_ROWS
        );
    }
    if (portIndex === 6) return isFreqEnabled(node) ? 1 : 0;
    return node.value;
};

const ensureSettings = (node, context = {}) => {
    if (node.settings.hideModeTonic === undefined) {
        node.settings.hideModeTonic = false;
    }
    if (node.settings.notes === undefined) {
        node.settings.notes = DEFAULT_NOTATION;
    }
    if (node.settings.freq === undefined) {
        node.settings.freq = node.settings.notes;
    }
    if (node.settings.freqEnabled === undefined) {
        node.settings.freqEnabled = true;
    }
    const inferredRows = clampNumber(inferDefaultRows(node, context), 1, 32, DEFAULT_NOTE_ROWS);
    const configuredRows =
        node.settings.rows !== undefined && node.settings.rows !== ''
            ? node.settings.rows
            : node.settings.noteRows;
    const normalizedRows = clampNumber(configuredRows, 1, 32, inferredRows);
    node.settings.rows = normalizedRows;
    node.settings.noteRows = normalizedRows;
    const legacyDefaultHeights = new Set([190, 96, 64, 4]);
    const rawNoteColHeight = Number(node.settings.noteColHeight);
    if (
        node.settings.noteColHeight === undefined ||
        !Number.isFinite(rawNoteColHeight) ||
        legacyDefaultHeights.has(rawNoteColHeight)
    ) {
        node.settings.noteColHeight = DEFAULT_NOTE_COL_HEIGHT;
    }
    if (node.settings.noteContainerWidth === undefined) node.settings.noteContainerWidth = DEFAULT_NOTE_CONTAINER_WIDTH;
    if (node.settings.noteButtonScale === undefined) node.settings.noteButtonScale = DEFAULT_NOTE_BUTTON_SCALE;
    if (node.settings.noteEditMode === undefined) node.settings.noteEditMode = true;
};

const resolveIncomingValue = (node, settingKey, incoming, context = {}) => {
    if (settingKey === 'tuning') return resolveTuningValue(incoming, context);
    if (settingKey === 'mode') return resolveModeValue(incoming, context);
    if (settingKey === 'tonic') return resolveTonicValue(incoming);
    if (settingKey === 'notes') {
        const raw = String(incoming ?? '');
        return unwrapNotesExpression(unwrapFreqExpression(raw));
    }
    if (settingKey === 'freq') {
        const raw = String(incoming ?? '');
        return unwrapFreqExpression(unwrapNotesExpression(raw));
    }
    if (settingKey === 'rows') {
        const fallback = clampNumber(
            node?.settings?.rows ?? node?.settings?.noteRows,
            1,
            32,
            DEFAULT_NOTE_ROWS
        );
        return clampNumber(incoming, 1, 32, fallback);
    }
    return incoming;
};

const valueAfterIncoming = (node, inputDef, incoming, fromValue) => {
    if (inputDef?.settingKey === 'mode') return undefined; // preserve tuning value
    if (inputDef?.settingKey === 'tuning') return incoming;
    return fromValue;
};

export { ensureSettings, getOutputValue, resolveIncomingValue, valueAfterIncoming };
