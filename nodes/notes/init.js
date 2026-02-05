import { getTuningList, getModeSets } from './constants.js';

const init = (context = {}) => {
    getTuningList(context);
    getModeSets(context);
};

export { init };
