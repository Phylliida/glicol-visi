import { registerNodeType } from '../node-lib.js';

registerNodeType({
    type: 'text',
    name: 'Text',
    inputs: [],
    outputs: ['text'],
    settings: [{ key: 'text', label: 'text', title: 'text' }]
});
