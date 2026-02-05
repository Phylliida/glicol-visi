import { DEFAULT_NOTATION } from './constants.js';
import { notesUiInstances } from './board-ui.js';
import { updateTuningFields, updateModeFields, updateTonicField } from './mode-tonic.js';

const updateSettingFieldDom = ({ node, settingKey, portIndex, value, context }) => {
    const handled =
        settingKey === 'tuning'
            ? (updateTuningFields(node.id, portIndex, value, context), true)
            : settingKey === 'mode'
                ? (updateModeFields(node.id, portIndex, value, context), true)
                : settingKey === 'tonic'
                    ? (updateTonicField(node.id, portIndex, value, context), true)
                    : settingKey === 'notes'
                        ? (() => {
                            const instance = notesUiInstances.get(node.id);
                            if (instance && typeof instance.setNotation === 'function') {
                                instance.setNotation(String(value ?? DEFAULT_NOTATION));
                                return true;
                            }
                            return false;
                        })()
                        : false;
    return handled;
};

export { updateSettingFieldDom };
