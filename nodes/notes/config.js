const NOTES_CONFIG = {
    type: 'notes',
    name: 'Notes',
    inputs: [],
    outputs: ['tuning', 'mode', 'tonic', 'notes', 'freq', 'rows', 'freq?', 'octave'],
    settings: [
        { key: 'notes', label: 'notes', title: 'Strudel notation' },
        { key: 'freq', label: 'freq', title: 'freq' },
        { key: 'tuning', label: 'tuning', title: 'tuning' },
        { key: 'mode', label: 'mode', title: 'mode' },
        { key: 'tonic', label: 'tonic', title: 'tonic' },
        { key: 'rows', label: 'rows', title: 'rows' },
        { key: 'octave', label: 'octave', title: 'octave' }
    ]
};

export { NOTES_CONFIG };
