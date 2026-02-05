import { registerNodeType } from '../node-lib.js';

const ensureSettings = (node) => {
    if (!node.settings) node.settings = {};
    if (node.settings.code === undefined) node.settings.code = '';
    if (node.value === undefined) node.value = node.settings.code ?? '';
};

const getOutputValue = (node) => node?.settings?.code ?? node?.value ?? '';

const maybeGrowNodeForContent = (field, node, context = {}) => {
    if (!field) return;
    const nodeEl = field.closest('.node');
    if (!nodeEl) return;

    const required = nodeEl.scrollHeight;
    const current = nodeEl.clientHeight;
    if (required <= current + 1) return;

    nodeEl.style.height = `${required}px`;
    const stateNode = context?.state?.nodes?.get(node.id) ?? node;
    if (stateNode) stateNode.h = required;
};

const createMultilineField = ({ node, setting, portIndex, connected, context }) => {
    const settingKey = setting.settingKey ?? setting.key;
    const textarea = document.createElement('textarea');
    textarea.className = 'setting-field';
    textarea.dataset.portIndex = portIndex;
    textarea.dataset.settingKey = settingKey;
    textarea.disabled = connected;
    textarea.rows = 1;
    textarea.style.minHeight = '1.6rem';
    textarea.style.overflow = 'hidden';
    textarea.spellcheck = false;
    textarea.placeholder = connected ? 'from input' : '';
    textarea.value = node.settings?.[settingKey] ?? '';

    const autosize = () => {
        textarea.style.height = 'auto';
        textarea.style.height = `${textarea.scrollHeight}px`;
    };
    // Run once now (may be detached) and again on next paint to respect final width.
    autosize();
    requestAnimationFrame(autosize);

    textarea.addEventListener('mousedown', (evt) => evt.stopPropagation());
    textarea.addEventListener('click', (evt) => evt.stopPropagation());
    textarea.addEventListener('input', (evt) => {
        const current = context?.state?.nodes?.get(node.id) ?? node;
        if (!current) return;
        current.settings[settingKey] = evt.target.value;
        current.value = evt.target.value;
        autosize();
        maybeGrowNodeForContent(textarea, current, context);
        context?.propagateValuesFrom?.(current.id);
        context?.updateCodePanel?.();
        context?.autoSave?.();
    });

    return textarea;
};

registerNodeType({
    type: 'code',
    name: 'Code',
    inputs: ['inputs'],
    outputs: ['callers', 'code'],
    settings: [{ key: 'code', label: 'code', title: 'code' }],
    hooks: {
        ensureSettings,
        getOutputValue,
        renderSettingField: (opts) => createMultilineField(opts),
        updateSettingFieldDom: ({ node, nodeEl, portIndex, value, context }) => {
            const field = nodeEl.querySelector(
                `.setting-field[data-port-index="${portIndex}"]`
            );
            if (!field) return false;
            if (document.activeElement !== field) {
                field.value = value ?? '';
                const autosize = () => {
                    field.style.height = 'auto';
                    field.style.height = `${field.scrollHeight}px`;
                };
                autosize();
                requestAnimationFrame(autosize);
                maybeGrowNodeForContent(field, node, context);
            }
            return true;
        }
    }
});
