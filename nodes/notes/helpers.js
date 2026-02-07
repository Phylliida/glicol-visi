import { getInputDefinitions } from '../../node-lib.js';
import { NOTES_CONFIG } from './config.js';

const getNode = (context, nodeId) => context?.state?.nodes?.get(nodeId);
const hasIncoming = (context, nodeId, portIndex) =>
    context?.hasIncomingConnection ? context.hasIncomingConnection(nodeId, portIndex) : false;
const FREQ_TOGGLE_OUTPUT_NUDGE_PX = 30;

const alignOutputsToInputs = (nodeEl) => {
    if (!nodeEl) return;
    const inputs = Array.from(nodeEl.querySelectorAll('.inputs .port-container'));
    const outputsRoot = nodeEl.querySelector('.outputs');
    const outputs = Array.from(outputsRoot?.querySelectorAll('.port-container') || []);
    if (!outputsRoot || !inputs.length || !outputs.length) return;

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

    const notesInputRow = inputByKey.get('notes');
    const freqInputRow = inputByKey.get('freq');
    const freqInputHidden = freqInputRow
        ? getComputedStyle(freqInputRow).display === 'none'
        : true;
    const outputsGapRaw = getComputedStyle(outputsRoot).rowGap || getComputedStyle(outputsRoot).gap || '0';
    const outputsGap = parseFloat(outputsGapRaw);

    const orderedOutputs = [];
    inputs.forEach((inRow, idx) => {
        const key = normalizeKey(
            inRow.dataset.settingKey || inRow.querySelector('.port-label')?.textContent
        );
        const outRow = outputByKey.get(key) ?? outputs[idx];
        if (outRow && !orderedOutputs.includes(outRow)) orderedOutputs.push(outRow);
    });
    if (!inputByKey.has('freq')) {
        const freqOutput = outputByKey.get('freq');
        const notesOutput = outputByKey.get('notes');
        if (freqOutput && !orderedOutputs.includes(freqOutput)) {
            const notesIdx = notesOutput ? orderedOutputs.indexOf(notesOutput) : -1;
            if (notesIdx >= 0) orderedOutputs.splice(notesIdx + 1, 0, freqOutput);
            else orderedOutputs.push(freqOutput);
        }
    }

    const insertOutputAfterKey = (anchorKey, keyToInsert) => {
        const anchorRow = outputByKey.get(anchorKey);
        const insertRow = outputByKey.get(keyToInsert);
        if (!insertRow) return;

        const existingIdx = orderedOutputs.indexOf(insertRow);
        if (existingIdx >= 0) orderedOutputs.splice(existingIdx, 1);

        const anchorIdx = anchorRow ? orderedOutputs.indexOf(anchorRow) : -1;
        if (anchorIdx >= 0) orderedOutputs.splice(anchorIdx + 1, 0, insertRow);
        else orderedOutputs.push(insertRow);
    };

    // Keep freq? directly below freq regardless of output declaration order.
    insertOutputAfterKey('freq', 'freq?');

    outputs.forEach((outRow) => {
        if (!orderedOutputs.includes(outRow)) orderedOutputs.push(outRow);
    });
    orderedOutputs.forEach((outRow) => outputsRoot.appendChild(outRow));

    const clearLabelExtras = (row) => {
        if (!row) return;
        row.querySelectorAll('.port').forEach((port) => {
            port.style.marginBottom = '';
        });
        row.querySelectorAll('.port-label').forEach((label) => {
            label.style.marginBottom = '';
        });
    };

    const getNotesCopyOffset = (inRow) => {
        const copyInput = inRow?.querySelector('.notes-notation-copy');
        if (!copyInput) return 0;
        const notationRow = copyInput.closest('.notes-notation-row');
        const gap = notationRow ? parseFloat(getComputedStyle(notationRow).rowGap || '0') : 0;
        return copyInput.offsetHeight + (Number.isFinite(gap) ? gap : 0);
    };

    inputs.forEach((inRow) => {
        clearLabelExtras(inRow);
    });

    let shiftAfterPinnedFreq = 0;
    let pinnedFreqSeen = false;
    let shiftAfterFreqToggle = 0;
    let freqToggleSeen = false;

    orderedOutputs.forEach((outRow, idx) => {
        clearLabelExtras(outRow);
        outRow.style.minHeight = '';
        outRow.style.alignItems = '';
        outRow.style.marginTop = '';
        outRow.style.position = '';
        outRow.style.top = '';
        const key = normalizeKey(outRow.querySelector('.port-label')?.textContent);
        const pinFreqToCopyLine = key === 'freq' && (freqInputHidden || !freqInputRow) && notesInputRow;
        const inRow =
            pinFreqToCopyLine
                ? freqInputRow ?? inputs[idx]
                : inputByKey.get(key) ?? inputs[idx];

        const freqToggleNudge = key === 'freq?' && pinnedFreqSeen ? FREQ_TOGGLE_OUTPUT_NUDGE_PX : 0;
        const cumulativeShift =
            (pinnedFreqSeen && shiftAfterPinnedFreq > 0 ? shiftAfterPinnedFreq : 0) +
            (freqToggleSeen && shiftAfterFreqToggle > 0 ? shiftAfterFreqToggle : 0) +
            freqToggleNudge;
        if (cumulativeShift > 0) {
            outRow.style.position = 'relative';
            outRow.style.top = `-${cumulativeShift}px`;
        }

        const height = inRow?.offsetHeight;
        if (height) {
            outRow.style.minHeight = `${height}px`;
            outRow.style.alignItems =
                key === 'notes'
                    ? 'flex-end'
                    : 'center';
        }
        if (pinFreqToCopyLine) {
            const rowHeight = outRow.offsetHeight;
            const shift = rowHeight + (Number.isFinite(outputsGap) ? outputsGap : 0);
            outRow.style.position = 'relative';
            outRow.style.top = `-${shift}px`;
            shiftAfterPinnedFreq = shift;
            pinnedFreqSeen = true;
        }
        if (key === 'freq?') {
            const rowHeight = outRow.offsetHeight;
            const shift = rowHeight + (Number.isFinite(outputsGap) ? outputsGap : 0);
            shiftAfterFreqToggle = shift;
            freqToggleSeen = true;
        }
        if (key === 'notes') {
            const copyOffset = getNotesCopyOffset(inRow);
            if (copyOffset > 0) {
                const inLabel = inRow?.querySelector('.port-label');
                const inPort = inRow?.querySelector('.port.input');
                const outLabel = outRow.querySelector('.port-label');
                const outPort = outRow.querySelector('.port.output');
                [inLabel, inPort, outLabel, outPort].forEach((el) => {
                    if (el) el.style.marginBottom = `${copyOffset}px`;
                });
            }
        }
    });
};

const getModePortIndex = () => getInputDefinitions(NOTES_CONFIG).findIndex((d) => d.settingKey === 'mode');
const getTonicPortIndex = () => getInputDefinitions(NOTES_CONFIG).findIndex((d) => d.settingKey === 'tonic');

export { getNode, hasIncoming, alignOutputsToInputs, getModePortIndex, getTonicPortIndex };
