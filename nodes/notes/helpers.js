import { getInputDefinitions } from '../../node-lib.js';
import { NOTES_CONFIG } from './config.js';

const getNode = (context, nodeId) => context?.state?.nodes?.get(nodeId);
const hasIncoming = (context, nodeId, portIndex) =>
    context?.hasIncomingConnection ? context.hasIncomingConnection(nodeId, portIndex) : false;

const alignOutputsToInputs = (nodeEl) => {
    if (!nodeEl) return;
    const inputs = Array.from(nodeEl.querySelectorAll('.inputs .port-container'));
    const outputs = Array.from(nodeEl.querySelectorAll('.outputs .port-container'));
    if (!inputs.length || inputs.length !== outputs.length) return;

    outputs.forEach((outRow, idx) => {
        outRow.style.minHeight = '';
        const inRow = inputs[idx];
        const height = inRow?.getBoundingClientRect().height;
        if (height) {
            outRow.style.minHeight = `${height}px`;
            outRow.style.alignItems = 'center';
        }
    });
};

const getModePortIndex = () => getInputDefinitions(NOTES_CONFIG).findIndex((d) => d.settingKey === 'mode');
const getTonicPortIndex = () => getInputDefinitions(NOTES_CONFIG).findIndex((d) => d.settingKey === 'tonic');

export { getNode, hasIncoming, alignOutputsToInputs, getModePortIndex, getTonicPortIndex };
