// Lightweight registry for node definitions used by the visual editor.
// Each node module should call registerNodeType with this template:
//
// registerNodeType({
//     type: 'example',
//     name: 'Example',
//     inputs: ['in'], // or [{ label, title }]
//     outputs: ['out'],
//     settings: [{ key: 'value', label: 'Value', title: 'Value', type: 'checkbox' }],
//     hooks: {
//         ensureSettings(node, ctx) {}, // set node.settings defaults beyond the base handling
//         getOutputValue(node, portIndex, ctx) {}, // return value for an output port
//         resolveIncomingValue(node, settingKey, incoming, ctx) {}, // massage incoming connection value
//         valueAfterIncoming(node, inputDef, incoming, fromValue, ctx) {}, // decide node.value after a connection update
//         renderHeaderExtras(node, ctx) {}, // optional DOM inserted under header
//         renderSettingField({ node, setting, portIndex, connected, context }) {}, // custom field; return HTMLElement or null
//         updateSettingFieldDom({ node, nodeEl, settingKey, portIndex, value, context }) {}, // return true if handled
//         afterRender(node, nodeEl, ctx) {}, // run after node element is in the DOM
//         init(ctx) {} // run once during app init
//     }
// });

const registry = new Map();

const defaultHooks = {
    ensureSettings: () => {},
    getOutputValue: (node) => node?.value,
    resolveIncomingValue: (_node, _key, incoming) => incoming,
    valueAfterIncoming: (_node, inputDef, incoming, fromValue) =>
        inputDef?.settingKey ? incoming : fromValue,
    renderHeaderExtras: () => null,
    renderSettingField: () => null,
    updateSettingFieldDom: () => false,
    afterRender: () => {},
    init: () => {}
};

const normalizeDefinition = (definition) => ({
    ...definition,
    inputs: definition.inputs ?? [],
    outputs: definition.outputs ?? [],
    settings: definition.settings ?? [],
    hooks: { ...defaultHooks, ...(definition.hooks || {}) }
});

export const registerNodeType = (definition) => {
    if (!definition?.type) throw new Error('Node definition requires a type');
    const normalized = normalizeDefinition(definition);
    registry.set(normalized.type, normalized);
};

export const getNodeConfig = (type) => registry.get(type);
export const listNodeTypes = () => Array.from(registry.values());

export const getInputDefinitions = (config) => {
    const baseInputs = (config?.inputs || []).map((input) =>
        typeof input === 'string' ? { label: input } : input
    );

    const settingInputs = (config?.settings || []).map((setting) => ({
        label: setting.label,
        title: setting.title,
        settingKey: setting.key,
        type: setting.type
    }));

    return [...baseInputs, ...settingInputs];
};

export const ensureNodeSettings = (node, context = {}) => {
    const config = getNodeConfig(node?.type);
    if (!config) return;

    if (!node.settings) node.settings = {};
    config.settings.forEach((setting) => {
        if (node.settings[setting.key] === undefined) {
            node.settings[setting.key] = setting.type === 'checkbox' ? false : '';
        }
    });

    config.hooks.ensureSettings(node, context);

    if (node.value === undefined && config.settings.length) {
        const firstKey = config.settings[0].key;
        const initialValue = node.settings[firstKey];
        if (initialValue !== undefined && initialValue !== '') {
            node.value = initialValue;
        }
    }
};

export const getNodeOutputValue = (node, portIndex, context = {}) => {
    const config = getNodeConfig(node?.type);
    if (!config) return node?.value;
    return config.hooks.getOutputValue(node, portIndex, context);
};

export const resolveIncomingValue = (node, settingKey, incoming, context = {}) => {
    const config = getNodeConfig(node?.type);
    if (!config) return incoming;
    return config.hooks.resolveIncomingValue(node, settingKey, incoming, context);
};

export const valueAfterIncoming = (node, inputDef, incoming, fromValue, context = {}) => {
    const config = getNodeConfig(node?.type);
    if (!config) return fromValue;
    return config.hooks.valueAfterIncoming(node, inputDef, incoming, fromValue, context);
};

export const renderHeaderExtras = (node, context = {}) => {
    const config = getNodeConfig(node?.type);
    return config?.hooks.renderHeaderExtras(node, context) || null;
};

export const renderSettingField = (options) => {
    const config = getNodeConfig(options?.node?.type);
    if (!config) return null;
    return config.hooks.renderSettingField(options) || null;
};

export const updateSettingFieldDom = (options) => {
    const config = getNodeConfig(options?.node?.type);
    if (!config) return false;
    return Boolean(config.hooks.updateSettingFieldDom(options));
};

export const afterRender = (node, nodeEl, context = {}) => {
    const config = getNodeConfig(node?.type);
    if (config?.hooks.afterRender) {
        config.hooks.afterRender(node, nodeEl, context);
    }
};

export const initNodeTypes = (context = {}) => {
    registry.forEach((def) => {
        if (def.hooks.init) def.hooks.init(context);
    });
};
