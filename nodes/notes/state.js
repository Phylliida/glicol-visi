import {
    DEFAULT_TUNING,
    DEFAULT_MODE,
    DEFAULT_TONIC,
    DEFAULT_NOTATION,
    DEFAULT_NOTE_ROWS,
    DEFAULT_NOTE_COL_HEIGHT,
    DEFAULT_NOTE_CONTAINER_WIDTH,
    DEFAULT_NOTE_BUTTON_SCALE,
    resolveTuningValue,
    resolveModeValue,
    resolveTonicValue
} from './constants.js';

const getOutputValue = (node, portIndex) => {
    if (!node) return undefined;
    if (portIndex === 0) return node.settings?.tuning ?? '';
    if (portIndex === 1) return node.settings?.mode ?? '';
    if (portIndex === 2) return node.settings?.tonic === '' ? '' : String(node.settings?.tonic ?? '');
    if (portIndex === 3) return node.settings?.notes ?? DEFAULT_NOTATION;
    return node.value;
};

const ensureSettings = (node) => {
    if (node.settings.hideModeTonic === undefined) {
        node.settings.hideModeTonic = false;
    }
    if (node.settings.notes === undefined) {
        node.settings.notes = DEFAULT_NOTATION;
    }
    if (node.settings.noteRows === undefined) node.settings.noteRows = DEFAULT_NOTE_ROWS;
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
    if (settingKey === 'notes') return String(incoming ?? '');
    return incoming;
};

const valueAfterIncoming = (node, inputDef, incoming, fromValue) => {
    if (inputDef?.settingKey === 'mode') return undefined; // preserve tuning value
    if (inputDef?.settingKey === 'tuning') return incoming;
    return fromValue;
};

export { ensureSettings, getOutputValue, resolveIncomingValue, valueAfterIncoming };
