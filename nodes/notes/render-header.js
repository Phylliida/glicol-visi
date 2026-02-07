import { DEFAULT_TUNING, DEFAULT_TONIC, DEFAULT_OCTAVE_SHIFT } from './constants.js';
import { getInputDefinitions } from '../../node-lib.js';
import { NOTES_CONFIG } from './config.js';
import { getNode } from './helpers.js';
import {
    updateTuningFields,
    updateModeFields,
    updateTonicField,
    applyModeTonicVisibility,
    refreshModeAndTonicForNode
} from './mode-tonic.js';

const renderHeaderExtras = (node, context = {}) => {
    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'reset-btn';
    resetBtn.title = 'Reset to standard tuning';
    resetBtn.setAttribute('aria-label', 'Reset to standard tuning');
    resetBtn.innerHTML =
        '<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"18\" height=\"18\" viewBox=\"0 0 24 24\"><path fill=\"currentColor\" d=\"M12 20q-3.35 0-5.675-2.325T4 12t2.325-5.675T12 4q1.725 0 3.3.712T18 6.75V4h2v7h-7V9h4.2q-.8-1.4-2.187-2.2T12 6Q9.5 6 7.75 7.75T6 12t1.75 4.25T12 18q1.925 0 3.475-1.1T17.65 14h2.1q-.7 2.65-2.85 4.325T12 20\"/></svg>';
    resetBtn.addEventListener('mousedown', (evt) => evt.stopPropagation());
    resetBtn.addEventListener('click', (evt) => {
        evt.stopPropagation();
        const current = getNode(context, node.id);
        if (!current) return;
        const defs = getInputDefinitions(NOTES_CONFIG);
        const tuningPortIndex = defs.findIndex((d) => d.settingKey === 'tuning');
        const modePortIndex = defs.findIndex((d) => d.settingKey === 'mode');
        const tonicPortIndex = defs.findIndex((d) => d.settingKey === 'tonic');

        current.settings.tuning = DEFAULT_TUNING;
        current.settings.mode = '';
        current.settings.tonic = '';
        current.settings.octave = DEFAULT_OCTAVE_SHIFT;
        current.settings.hideModeTonic = true;
        current.value = DEFAULT_TUNING;

        if (tuningPortIndex !== -1) updateTuningFields(current.id, tuningPortIndex, DEFAULT_TUNING, context);
        if (modePortIndex !== -1) updateModeFields(current.id, modePortIndex, '', context);
        if (tonicPortIndex !== -1) updateTonicField(current.id, tonicPortIndex, '', context);

        applyModeTonicVisibility(current.id, context, { hidden: true });
        refreshModeAndTonicForNode(current.id, context);
        if (context.propagateValuesFrom) context.propagateValuesFrom(current.id);
        if (context.updateCodePanel) context.updateCodePanel();
        if (context.render) context.render();
        if (context.autoSave) context.autoSave();
    });

    const wrap = document.createElement('div');
    wrap.className = 'reset-wrap';
    wrap.append(resetBtn);
    return wrap;
};

export { renderHeaderExtras };
