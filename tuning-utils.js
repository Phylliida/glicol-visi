(function (global) {
    const isNode = typeof module !== 'undefined' && module.exports;
    let fs = null;
    let path = null;
    let MODE_SETS = [];

    if (isNode) {
        fs = require('fs');
        path = require('path');
        try {
            MODE_SETS = require('./modes.json');
        } catch (err) {
            MODE_SETS = [];
        }
    } else {
        MODE_SETS = global.MODE_SETS ?? [];
    }

    const TUNINGS_DIR = path ? path.join(__dirname, 'tunings') : null;
    const EPS = 1e-6;
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
    let modeSetsCache = MODE_SETS && MODE_SETS.length ? MODE_SETS : null;
    let modeListPromise = null;
    const almost = (a, b, eps = EPS) => Math.abs(a - b) < eps;

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

    const parseValue = (text) => {
        if (!text) return null;
        const clean = text.trim();
        if (!clean) return null;
        if (clean.includes('/')) {
            const [n, d] = clean.split('/').map((v) => parseFloat(v));
            if (!Number.isFinite(n) || !Number.isFinite(d)) {
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

    const normalizeSteps = (entries) => {
        const values = [...entries];
        if (values.length && almost(values[0], 1)) values.shift();

        let period = 2;
        if (values.length && almost(values[values.length - 1], 2)) {
            period = values.pop();
        }

        const steps = [1, ...values];
        return { steps, period };
    };

    const parseScl = (filePath) => {
        if (!fs) throw new Error('parseScl is only available in Node.');
        const raw = fs.readFileSync(filePath, 'utf8');
        const lines = raw
            .split(/\r?\n/)
            .map((line) => line.split('!')[0].trim())
            .filter(Boolean);

        if (lines.length < 2) {
            throw new Error(`Not enough data in ${filePath}`);
        }

        const description = lines[0];
        const declaredCount = parseInt(lines[1], 10);
        const values = lines
            .slice(2)
            .map(parseValue)
            .filter((v) => v !== null);

        const limited =
            Number.isFinite(declaredCount) && declaredCount > 0
                ? values.slice(0, declaredCount)
                : values;

        const { steps, period } = normalizeSteps(limited);

        return {
            description,
            count: steps.length,
            steps,
            period,
            path: filePath
        };
    };

    const listAllTunings = (root = TUNINGS_DIR) => {
        if (!fs || !path) return [];
        const out = [];
        const stack = [root];
        while (stack.length) {
            const dir = stack.pop();
            fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    stack.push(full);
                } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.scl')) {
                    out.push(path.relative(root, full));
                }
            });
        }
        return out.sort();
    };

    const loadTuning = (relativePath, root = TUNINGS_DIR) => {
        if (!fs || !path) throw new Error('loadTuning is only available in Node.');
        return parseScl(path.join(root, relativePath));
    };

    const positionsToFrequencies = (tuning, positions, opts = {}) => {
        const period = opts.period ?? tuning.period ?? 2;
        const ref = {
            freq: opts.baseFreq ?? 440,
            octave: opts.baseOctave ?? 4,
            degree: opts.baseDegree ?? 0
        };

        if (ref.degree < 0 || ref.degree >= tuning.steps.length) {
            throw new Error(`baseDegree ${ref.degree} out of range`);
        }

        return positions.map(([octave, degree]) => {
            const step = tuning.steps[degree];
            if (step === undefined) {
                throw new Error(`degree ${degree} out of range`);
            }
            const ratioToRef = step / tuning.steps[ref.degree];
            const octaveFactor = Math.pow(period, octave - ref.octave);
            return ref.freq * ratioToRef * octaveFactor;
        });
    };

    // -----------------------------------------------------------------------
    // Browser-friendly helpers (tuning metadata, mode filtering, tonic labels)
    // -----------------------------------------------------------------------

    const tuningMetaCache = new Map(); // path -> { count, period }
    const tuningMetaPromises = new Map();
    const DEFAULT_TUNING_META = { count: 12, period: 2 };

    const parseTuningTextToMeta = (text) => {
        if (!text) return null;
        const lines = text
            .split(/\r?\n/)
            .map((line) => line.split('!')[0].trim())
            .filter(Boolean);

        if (lines.length < 2) return null;

        const declaredCount = parseInt(lines[1], 10);
        const values = lines
            .slice(2)
            .map((line) => parseValue(line))
            .filter((v) => v !== null);

        const limited =
            Number.isFinite(declaredCount) && declaredCount > 0
                ? values.slice(0, declaredCount)
                : values;

        const { steps, period } = normalizeSteps(limited);
        return { count: steps.length, period };
    };

    const fetchTuningText = (relativePath, opts = {}) => {
        if (isNode && fs && path && opts.root) {
            const full = path.join(opts.root, relativePath);
            return Promise.resolve(fs.readFileSync(full, 'utf8'));
        }
        if (typeof fetch === 'function') {
            const base = opts.baseUrl ?? '/tunings/';
            return fetch(`${base}${relativePath}`).then((res) => {
                if (!res.ok) throw new Error(`Failed to load tuning file ${relativePath}`);
                return res.text();
            });
        }
        return Promise.reject(new Error('No way to load tuning text'));
    };

    const getTuningMeta = (relativePath, opts = {}) => {
        const resolved = (opts.resolvePath ? opts.resolvePath(relativePath) : relativePath) ?? '';
        if (tuningMetaCache.has(resolved)) return Promise.resolve(tuningMetaCache.get(resolved));
        if (tuningMetaPromises.has(resolved)) return tuningMetaPromises.get(resolved);

        const promise = fetchTuningText(resolved, opts)
            .then((text) => {
                const meta = parseTuningTextToMeta(text) ?? DEFAULT_TUNING_META;
                tuningMetaCache.set(resolved, meta);
                return meta;
            })
            .catch((err) => {
                console.error('Failed to load tuning metadata', err);
                tuningMetaCache.set(resolved, DEFAULT_TUNING_META);
                return DEFAULT_TUNING_META;
            })
            .finally(() => tuningMetaPromises.delete(resolved));

        tuningMetaPromises.set(resolved, promise);
        return promise;
    };

    const flattenModes = (modeSets = MODE_SETS) =>
        (modeSets ?? []).flatMap((set) => set.modes.map((m) => ({ ...m, group: set.group })));

    const modesForCount = (count, modeSets = MODE_SETS) => {
        const all = flattenModes(modeSets);
        if (!Number.isFinite(count)) return all;
        return all.filter((m) => Math.max(...m.degrees) < count);
    };

    const modesByGroupForCount = (count, modeSets = MODE_SETS) => {
        const filtered = modesForCount(count, modeSets);
        const map = new Map();
        filtered.forEach((m) => {
            const arr = map.get(m.group) ?? [];
            arr.push(m);
            map.set(m.group, arr);
        });
        return map;
    };

    const tonicOptionsForCount = (count, baseOptions = []) => {
        const base = baseOptions.length ? baseOptions : null;
        const total = Number.isFinite(count) && count > 0 ? count : base?.length ?? 12;
        const options = [];
        for (let i = 0; i < total; i++) {
            const preset = base ? base[i % base.length] : null;
            let label = preset?.label ?? `Degree ${i}`;
            const repeats = base ? Math.floor(i / base.length) : 0;
            if (preset && repeats > 0) {
                const suffix = '#'.repeat(repeats * 2); // double-sharp per 12 steps
                label = label
                    .split('/')
                    .map((part) => `${part}${suffix}`)
                    .join('/');
            }
            options.push({ value: i, label });
        }
        return options;
    };

    const clampTonicToCount = (val, count) => {
        const n = parseInt(val, 10);
        if (!Number.isFinite(n)) return 0;
        if (!Number.isFinite(count) || count <= 0) return Math.max(0, n);
        return Math.max(0, Math.min(count - 1, n));
    };

    // ---------------------------------------------------------------------------
    // Shared caches & fetch helpers (browser-focused, used by notes node UI)
    // ---------------------------------------------------------------------------

    const getModeSets = (context = {}) => {
        if (modeSetsCache) return Promise.resolve(modeSetsCache);
        if (modeListPromise) return modeListPromise;

        if (MODE_SETS && MODE_SETS.length) {
            modeSetsCache = MODE_SETS;
            return Promise.resolve(modeSetsCache);
        }

        if (typeof fetch !== 'function') {
            modeSetsCache = [];
            return Promise.resolve(modeSetsCache);
        }

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

    const getTuningList = (context = {}) => {
        if (tuningListCache) return Promise.resolve(tuningListCache);
        if (tuningListPromise) return tuningListPromise;

        if (typeof fetch !== 'function') {
            tuningListCache = [];
            tuningHierarchy = buildTuningHierarchy(tuningListCache);
            return Promise.resolve(tuningListCache);
        }

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
                tuningHierarchy = buildTuningHierarchy(tuningListCache);
                return tuningListCache;
            });
        return tuningListPromise;
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

    const resolveModeValue = (raw, context = {}) => {
        const val = (raw ?? '').trim();
        const all = flattenModes(modeSetsCache ?? MODE_SETS);
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

    // ---------------------------------------------------------------------------
    // Modal vocabulary (major / minor / color / symmetric) - Node-focused helpers
    // ---------------------------------------------------------------------------

    const modeFitsTuning = (mode, tuning) => {
        if (!tuning || !Array.isArray(tuning.steps)) return false;
        const maxDegree = Math.max(...mode.degrees);
        return maxDegree < tuning.steps.length;
    };

    const listAllModes = () => flattenModes();

    const listModesForTuning = (tuning) => flattenModes().filter((m) => modeFitsTuning(m, tuning));

    const getModeById = (id) => flattenModes().find((m) => m.id === id);

    const exportsObj = {
        TUNINGS_DIR,
        EPS,
        almost,
        listAllTunings,
        parseScl,
        loadTuning,
        positionsToFrequencies,
        listAllModes,
        listModesForTuning,
        getModeById,
        // Browser helpers & shared tuning utilities
        normalizeSteps,
        parseValue,
        parseTuningTextToMeta,
        tuningMetaCache,
        tuningMetaPromises,
        DEFAULT_TUNING_META,
        getTuningMeta,
        modesForCount,
        modesByGroupForCount,
        tonicOptionsForCount,
        clampTonicToCount,
        // Tuning selection helpers
        DEFAULT_TUNING,
        DEFAULT_MODE,
        DEFAULT_TONIC,
        TONIC_OPTIONS,
        getModeSets,
        getTuningList,
        resolveTuningValue,
        resolveModeValue,
        resolveTonicValue,
        splitTuningPath,
        buildTuningHierarchy
    };

    Object.defineProperties(exportsObj, {
        tuningListCache: { get: () => tuningListCache },
        tuningHierarchy: { get: () => tuningHierarchy },
        modeSetsCache: { get: () => modeSetsCache }
    });

    if (isNode) {
        module.exports = exportsObj;
    }
    global.TuningUtils = exportsObj;
})(typeof globalThis !== 'undefined' ? globalThis : window);
