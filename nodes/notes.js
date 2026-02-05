import { registerNodeType } from '../node-lib.js';
import { NOTES_CONFIG } from './notes/config.js';
import { renderHeaderExtras } from './notes/render-header.js';
import { renderSettingField } from './notes/fields.js';
import { updateSettingFieldDom } from './notes/dom-updates.js';
import {
    ensureSettings,
    getOutputValue,
    resolveIncomingValue,
    valueAfterIncoming
} from './notes/state.js';
import { afterRender } from './notes/mode-tonic.js';
import { init } from './notes/init.js';
import {
    DEFAULT_TUNING,
    DEFAULT_MODE,
    DEFAULT_TONIC,
    resolveTuningValue,
    resolveModeValue,
    resolveTonicValue
} from './notes/constants.js';

registerNodeType({
    ...NOTES_CONFIG,
    hooks: {
        ensureSettings,
        getOutputValue,
        resolveIncomingValue,
        valueAfterIncoming,
        renderHeaderExtras,
        renderSettingField,
        updateSettingFieldDom,
        afterRender,
        init
    }
});

export {
    DEFAULT_TUNING,
    DEFAULT_MODE,
    DEFAULT_TONIC,
    resolveTuningValue,
    resolveModeValue,
    resolveTonicValue
};
