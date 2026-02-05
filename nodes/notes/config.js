const NOTES_CONFIG = {
    type: 'notes',
    name: 'Notes',
    inputs: [],
    outputs: ['tuning', 'mode', 'tonic', 'notes'],
    settings: [
        { key: 'notes', label: 'notes', title: 'Strudel notation' },
        { key: 'tuning', label: 'tuning', title: 'tuning' },
        { key: 'mode', label: 'mode', title: 'mode' },
        { key: 'tonic', label: 'tonic', title: 'tonic' }
    ]
};

export { NOTES_CONFIG };
