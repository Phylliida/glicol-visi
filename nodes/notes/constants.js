const TuningUtils = window.TuningUtils || {};

const {
    getTuningMeta,
    tuningMetaCache,
    modesForCount,
    modesByGroupForCount,
    tonicOptionsForCount,
    clampTonicToCount,
    DEFAULT_TUNING,
    DEFAULT_MODE,
    DEFAULT_TONIC,
    TONIC_OPTIONS,
    getTuningList,
    getModeSets,
    resolveTuningValue,
    resolveModeValue,
    resolveTonicValue,
    splitTuningPath
} = TuningUtils;

const DEFAULT_NOTATION = '<->';
const DEFAULT_NOTE_ROWS = 4;
const DEFAULT_NOTE_COL_HEIGHT = 10;
const DEFAULT_NOTE_CONTAINER_WIDTH = 420;
const DEFAULT_NOTE_BUTTON_SCALE = 1;
const BUBBLE_SHIFT_UNIT = 15;

const clampNumber = (value, min, max, fallback) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.min(max, Math.max(min, num));
};

export {
    TuningUtils,
    getTuningMeta,
    tuningMetaCache,
    modesForCount,
    modesByGroupForCount,
    tonicOptionsForCount,
    clampTonicToCount,
    DEFAULT_TUNING,
    DEFAULT_MODE,
    DEFAULT_TONIC,
    TONIC_OPTIONS,
    getTuningList,
    getModeSets,
    resolveTuningValue,
    resolveModeValue,
    resolveTonicValue,
    splitTuningPath,
    DEFAULT_NOTATION,
    DEFAULT_NOTE_ROWS,
    DEFAULT_NOTE_COL_HEIGHT,
    DEFAULT_NOTE_CONTAINER_WIDTH,
    DEFAULT_NOTE_BUTTON_SCALE,
    BUBBLE_SHIFT_UNIT,
    clampNumber
};
