import { registerNodeType } from '../node-lib.js';

registerNodeType({
    type: 'code',
    name: 'Code',
    inputs: ['inputs'],
    outputs: ['callers', 'code'],
    settings: [{ key: 'code', label: 'code', title: 'code' }]
});
