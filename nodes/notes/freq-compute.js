import {
    TuningUtils,
    DEFAULT_TUNING,
    DEFAULT_TONIC,
    DEFAULT_NOTATION,
    resolveTuningValue,
    getModeSets,
    tuningMetaCache
} from './constants.js';

const BASE_A_FREQ = 440;
const EPS = 1e-6;

const tuningDataCache = new Map(); // path -> { steps, period }
const tuningDataPromises = new Map();
const pendingRefreshes = new Set();

const almost = (a, b, eps = EPS) => Math.abs(a - b) < eps;

const isDigit = (ch) => ch >= '0' && ch <= '9';

const parseScaleValue = (text) => {
    if (typeof TuningUtils.parseValue === 'function') {
        return TuningUtils.parseValue(text);
    }
    const clean = String(text ?? '').trim();
    if (!clean) return null;
    if (clean.includes('/')) {
        const [n, d] = clean.split('/').map((v) => parseFloat(v));
        if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) {
            throw new Error(`Invalid ratio: ${text}`);
        }
        return n / d;
    }
    const cents = parseFloat(clean);
    if (!Number.isFinite(cents)) {
        throw new Error(`Invalid cents value: ${text}`);
    }
    return Math.pow(2, cents / 1200);
};

const normalizeScaleSteps = (entries) => {
    if (typeof TuningUtils.normalizeSteps === 'function') {
        return TuningUtils.normalizeSteps(entries);
    }
    const values = [...entries];
    if (values.length && almost(values[0], 1)) values.shift();

    let period = 2;
    if (values.length && almost(values[values.length - 1], 2)) {
        period = values.pop();
    }

    return { steps: [1, ...values], period };
};

const buildEqualTemperamentData = (count = 12, period = 2) => {
    const safeCount = Number.isFinite(count) && count > 0 ? Math.floor(count) : 12;
    const safePeriod = Number.isFinite(period) && period > 0 ? period : 2;
    const steps = Array.from({ length: safeCount }, (_, idx) =>
        Math.pow(safePeriod, idx / safeCount)
    );
    return { steps, period: safePeriod };
};

const getFallbackTuningData = (tuningPath) => {
    const meta = tuningMetaCache.get(tuningPath);
    return buildEqualTemperamentData(meta?.count ?? 12, meta?.period ?? 2);
};

const parseTuningTextToData = (text) => {
    if (!text) return null;
    const lines = text
        .split(/\r?\n/)
        .map((line) => line.split('!')[0].trim())
        .filter(Boolean);

    if (lines.length < 2) return null;

    const declaredCount = parseInt(lines[1], 10);
    const values = lines
        .slice(2)
        .map((line) => parseScaleValue(line))
        .filter((v) => v !== null);

    const limited =
        Number.isFinite(declaredCount) && declaredCount > 0
            ? values.slice(0, declaredCount)
            : values;

    const { steps, period } = normalizeScaleSteps(limited);
    if (!Array.isArray(steps) || !steps.length) return null;
    return {
        steps,
        period: Number.isFinite(period) && period > 0 ? period : 2
    };
};

const encodeTuningPath = (path) => String(path ?? '').split('/').map(encodeURIComponent).join('/');

const loadTuningData = (tuningPath) => {
    if (tuningDataCache.has(tuningPath)) return Promise.resolve(tuningDataCache.get(tuningPath));
    if (tuningDataPromises.has(tuningPath)) return tuningDataPromises.get(tuningPath);

    const canFetchTuningFile =
        typeof fetch === 'function' &&
        typeof window !== 'undefined' &&
        typeof window.location !== 'undefined';

    if (!canFetchTuningFile) {
        const fallback = getFallbackTuningData(tuningPath);
        tuningDataCache.set(tuningPath, fallback);
        return Promise.resolve(fallback);
    }

    const promise = fetch(`/tunings/${encodeTuningPath(tuningPath)}`)
        .then((res) => {
            if (!res.ok) {
                throw new Error(`Failed to load tuning file ${tuningPath}`);
            }
            return res.text();
        })
        .then((text) => parseTuningTextToData(text) ?? getFallbackTuningData(tuningPath))
        .catch((err) => {
            console.error('Failed to parse tuning data for frequency conversion', err);
            return getFallbackTuningData(tuningPath);
        })
        .then((data) => {
            tuningDataCache.set(tuningPath, data);
            return data;
        })
        .finally(() => {
            tuningDataPromises.delete(tuningPath);
        });

    tuningDataPromises.set(tuningPath, promise);
    return promise;
};

const scheduleNodeRefresh = (promise, nodeId, context, token) => {
    if (!nodeId || typeof context?.propagateValuesFrom !== 'function') return;
    const key = `${nodeId}:${token}`;
    if (pendingRefreshes.has(key)) return;
    pendingRefreshes.add(key);

    Promise.resolve(promise)
        .catch(() => null)
        .then(() => {
            const nodes = context?.state?.nodes;
            if (nodes && typeof nodes.has === 'function' && !nodes.has(nodeId)) return;
            context.propagateValuesFrom(nodeId);
            if (typeof context.updateCodePanel === 'function') context.updateCodePanel();
        })
        .finally(() => {
            pendingRefreshes.delete(key);
        });
};

const getTuningDataSync = (tuningPath, nodeId, context = {}) => {
    const cached = tuningDataCache.get(tuningPath);
    if (cached) return cached;
    const promise = loadTuningData(tuningPath);
    scheduleNodeRefresh(promise, nodeId, context, `tuning:${tuningPath}`);
    return getFallbackTuningData(tuningPath);
};

const findModeDegrees = (modeId) => {
    const modeSets = TuningUtils.modeSetsCache;
    if (!Array.isArray(modeSets) || !modeSets.length) return null;
    const target = String(modeId ?? '').trim();
    if (!target) return null;
    const targetLower = target.toLowerCase();

    for (const group of modeSets) {
        const modes = Array.isArray(group?.modes) ? group.modes : [];
        const mode = modes.find(
            (m) =>
                m?.id === target ||
                (typeof m?.id === 'string' && m.id.toLowerCase() === targetLower)
        );
        if (!mode || !Array.isArray(mode.degrees) || !mode.degrees.length) continue;
        const degrees = mode.degrees
            .map((deg) => Number(deg))
            .filter((deg) => Number.isFinite(deg) && deg >= 0);
        if (degrees.length) return degrees;
    }
    return null;
};

const getModeDegrees = (node, context = {}) => {
    const rawMode = String(node?.settings?.mode ?? '').trim();
    if (!rawMode) return null;
    const found = findModeDegrees(rawMode);
    if (found) return found;

    const modeSets = TuningUtils.modeSetsCache;
    if (!Array.isArray(modeSets) || !modeSets.length) {
        const promise = getModeSets(context);
        scheduleNodeRefresh(promise, node?.id, context, `mode:${rawMode}`);
    }
    return null;
};

const resolveTonic = (raw) => {
    if (raw === '' || raw === undefined || raw === null) return DEFAULT_TONIC;
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n)) return DEFAULT_TONIC;
    return Math.max(0, n);
};

const mapNoteIndexToDegree = (index, modeDegrees, tuningDegreeCount) => {
    const numeric = Number(index);
    const safeIndex = Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0;

    if (!Array.isArray(modeDegrees) || !modeDegrees.length) return safeIndex;

    const modeLen = modeDegrees.length;
    const cycle = Math.floor(safeIndex / modeLen);
    const inCycle = safeIndex % modeLen;
    const modeDegree = Number(modeDegrees[inCycle]);
    const base = Number.isFinite(modeDegree) ? modeDegree : 0;
    return base + cycle * tuningDegreeCount;
};

const degreeToFrequency = (degree, tonic, tuningData) => {
    const steps = Array.isArray(tuningData?.steps) && tuningData.steps.length ? tuningData.steps : [1];
    const stepCount = steps.length;
    const period = Number.isFinite(tuningData?.period) && tuningData.period > 0 ? tuningData.period : 2;
    const absoluteDegree = Math.max(0, Math.floor(Number(degree) + Number(tonic)));
    const stepIndex = absoluteDegree % stepCount;
    const periodShift = Math.floor(absoluteDegree / stepCount);
    const stepRatio = Number(steps[stepIndex]);
    const safeRatio = Number.isFinite(stepRatio) && stepRatio > 0 ? stepRatio : 1;
    return BASE_A_FREQ * safeRatio * Math.pow(period, periodShift);
};

const formatFrequency = (value) => {
    if (!Number.isFinite(value) || value <= 0) return '0';
    const rounded = Math.round(value * 1000) / 1000;
    return Number.isInteger(rounded) ? String(rounded) : String(rounded);
};

const parseNotation = (raw) => {
    const src = String(raw ?? '').trim();
    let i = 0;

    const skipWs = () => {
        while (i < src.length && /\s/.test(src[i])) i += 1;
    };

    const parseNumber = () => {
        skipWs();
        if (i >= src.length || !isDigit(src[i])) return null;
        const start = i;
        while (i < src.length && isDigit(src[i])) i += 1;
        const num = parseInt(src.slice(start, i), 10);
        return Number.isInteger(num) ? num : null;
    };

    const parseList = () => {
        i += 1;
        skipWs();
        const fills = [];
        if (src[i] === ']') {
            i += 1;
            return fills;
        }
        while (i < src.length) {
            const num = parseNumber();
            if (!Number.isInteger(num)) return null;
            fills.push(num);
            skipWs();
            if (src[i] === ',') {
                i += 1;
                continue;
            }
            if (src[i] === ']') {
                i += 1;
                return fills;
            }
            return null;
        }
        return null;
    };

    const parseColumns = (endChar) => {
        const cols = [];
        while (i < src.length) {
            skipWs();
            if (src[i] === endChar) {
                i += 1;
                return cols;
            }
            const col = parseColumn();
            if (!col) return null;
            cols.push(col);
            skipWs();
            if (src[i] === endChar) {
                i += 1;
                return cols;
            }
        }
        return null;
    };

    const parseColumn = () => {
        skipWs();
        const ch = src[i];
        if (ch === '{') {
            i += 1;
            const nested = parseColumns('}');
            if (!nested) return null;
            return { nested };
        }
        if (ch === '[') {
            const fills = parseList();
            return fills !== null ? { fills } : null;
        }
        if (ch === '-') {
            i += 1;
            return { fills: [] };
        }
        if (isDigit(ch)) {
            const num = parseNumber();
            return Number.isInteger(num) ? { fills: [num] } : null;
        }
        return null;
    };

    skipWs();
    if (src[i] !== '<') return { ok: false };
    i += 1;
    const columns = parseColumns('>');
    if (!columns || columns.length === 0) return { ok: false };
    skipWs();
    if (i !== src.length) return { ok: false };
    return { ok: true, columns };
};

const serializeColumn = (column, mapFilledValue) => {
    if (column?.nested) {
        return `{${column.nested.map((child) => serializeColumn(child, mapFilledValue)).join(' ')}}`;
    }
    const fills = Array.isArray(column?.fills) ? column.fills : [];
    if (!fills.length) return '-';
    if (fills.length === 1) return mapFilledValue(fills[0]);
    return `[${fills.map((value) => mapFilledValue(value)).join(',')}]`;
};

const serializeNotation = (columns, mapFilledValue) =>
    `<${columns.map((col) => serializeColumn(col, mapFilledValue)).join(' ')}>`;

const computeFrequencyNotation = (node, context = {}) => {
    const notation = String(node?.settings?.notes ?? DEFAULT_NOTATION);
    const parsed = parseNotation(notation);
    if (!parsed.ok) return notation;

    const tuningPath = resolveTuningValue(node?.settings?.tuning ?? DEFAULT_TUNING, context);
    const tuningData = getTuningDataSync(tuningPath, node?.id, context);
    const modeDegrees = getModeDegrees(node, context);
    const tonic = resolveTonic(node?.settings?.tonic);
    const tuningDegreeCount =
        Array.isArray(tuningData?.steps) && tuningData.steps.length ? tuningData.steps.length : 12;

    const mapFilledValue = (rawIndex) => {
        const degree = mapNoteIndexToDegree(rawIndex, modeDegrees, tuningDegreeCount);
        const freq = degreeToFrequency(degree, tonic, tuningData);
        return formatFrequency(freq);
    };

    return serializeNotation(parsed.columns, mapFilledValue);
};

export { computeFrequencyNotation };
