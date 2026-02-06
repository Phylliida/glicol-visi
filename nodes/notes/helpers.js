import { getInputDefinitions } from '../../node-lib.js';
import { NOTES_CONFIG } from './config.js';

const getNode = (context, nodeId) => context?.state?.nodes?.get(nodeId);
const hasIncoming = (context, nodeId, portIndex) =>
    context?.hasIncomingConnection ? context.hasIncomingConnection(nodeId, portIndex) : false;

const alignOutputsToInputs = (nodeEl) => {
    if (!nodeEl) return;
    const inputs = Array.from(nodeEl.querySelectorAll('.inputs .port-container'));
    const outputsRoot = nodeEl.querySelector('.outputs');
    const outputs = Array.from(outputsRoot?.querySelectorAll('.port-container') || []);
    if (!outputsRoot || !inputs.length || inputs.length !== outputs.length) return;

    const normalizeKey = (value) => String(value ?? '').trim().toLowerCase();
    const inputByKey = new Map();
    inputs.forEach((inRow) => {
        const key = normalizeKey(
            inRow.dataset.settingKey || inRow.querySelector('.port-label')?.textContent
        );
        if (key) inputByKey.set(key, inRow);
    });

    const outputByKey = new Map();
    outputs.forEach((outRow) => {
        const key = normalizeKey(outRow.querySelector('.port-label')?.textContent);
        if (key && !outputByKey.has(key)) outputByKey.set(key, outRow);
    });

    const orderedOutputs = [];
    inputs.forEach((inRow, idx) => {
        const key = normalizeKey(
            inRow.dataset.settingKey || inRow.querySelector('.port-label')?.textContent
        );
        const outRow = outputByKey.get(key) ?? outputs[idx];
        if (outRow && !orderedOutputs.includes(outRow)) orderedOutputs.push(outRow);
    });
    outputs.forEach((outRow) => {
        if (!orderedOutputs.includes(outRow)) orderedOutputs.push(outRow);
    });
    orderedOutputs.forEach((outRow) => outputsRoot.appendChild(outRow));

    orderedOutputs.forEach((outRow, idx) => {
        outRow.style.minHeight = '';
        outRow.style.alignItems = '';
        const key = normalizeKey(outRow.querySelector('.port-label')?.textContent);
        const inRow = inputByKey.get(key) ?? inputs[idx];
        const height = inRow?.offsetHeight;
        if (height) {
            outRow.style.minHeight = `${height}px`;
            outRow.style.alignItems = key === 'notes' ? 'flex-end' : 'center';
        }
    });
};

const getModePortIndex = () => getInputDefinitions(NOTES_CONFIG).findIndex((d) => d.settingKey === 'mode');
const getTonicPortIndex = () => getInputDefinitions(NOTES_CONFIG).findIndex((d) => d.settingKey === 'tonic');

export { getNode, hasIncoming, alignOutputsToInputs, getModePortIndex, getTonicPortIndex };
