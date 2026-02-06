import { DEFAULT_NOTATION, DEFAULT_NOTE_ROWS, clampNumber } from './constants.js';
import { notesUiInstances } from './board-ui.js';
import { updateTuningFields, updateModeFields, updateTonicField } from './mode-tonic.js';

const updateSettingFieldDom = ({ node, nodeEl, settingKey, portIndex, value, context }) => {
    const refreshFrequencyCopy = () => {
        const instance = notesUiInstances.get(node.id);
        if (instance && typeof instance.refreshFrequencyCopy === 'function') {
            instance.refreshFrequencyCopy();
        }
    };
    const handled =
        settingKey === 'tuning'
            ? (() => {
                updateTuningFields(node.id, portIndex, value, context);
                refreshFrequencyCopy();
                return true;
            })()
            : settingKey === 'mode'
                ? (() => {
                    updateModeFields(node.id, portIndex, value, context);
                    refreshFrequencyCopy();
                    return true;
                })()
                : settingKey === 'tonic'
                    ? (() => {
                        updateTonicField(node.id, portIndex, value, context);
                        refreshFrequencyCopy();
                        return true;
                    })()
                    : settingKey === 'notes'
                        ? (() => {
                            const instance = notesUiInstances.get(node.id);
                            if (instance && typeof instance.setNotation === 'function') {
                                instance.setNotation(String(value ?? DEFAULT_NOTATION));
                                return true;
                            }
                            return false;
                        })()
                        : settingKey === 'rows'
                            ? (() => {
                                const next = clampNumber(value, 1, 32, DEFAULT_NOTE_ROWS);
                                const rowsField = nodeEl?.querySelector(
                                    `input.setting-field[data-port-index="${portIndex}"][data-setting-key="rows"]`
                                );
                                if (rowsField && rowsField !== document.activeElement) {
                                    rowsField.value = String(next);
                                }
                                const instance = notesUiInstances.get(node.id);
                                if (instance && typeof instance.setRows === 'function') {
                                    instance.setRows(next);
                                    return true;
                                }
                                return Boolean(rowsField);
                            })()
                        : false;
    return handled;
};

export { updateSettingFieldDom };
