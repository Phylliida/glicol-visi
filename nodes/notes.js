import {
    registerNodeType,
    getInputDefinitions
} from '../node-lib.js';

const TuningUtils = window.TuningUtils || {};
const {
    getTuningMeta,
    tuningMetaCache,
    modesForCount,
    modesByGroupForCount,
    tonicOptionsForCount,
    clampTonicToCount,
    DEFAULT_TUNING,
    DEFAULT_MODE,
    DEFAULT_TONIC,
    TONIC_OPTIONS,
    getTuningList,
    getModeSets,
    resolveTuningValue,
    resolveModeValue,
    resolveTonicValue,
    splitTuningPath
} = TuningUtils;

const DEFAULT_NOTATION = '<->';
const DEFAULT_NOTE_ROWS = 4;
const DEFAULT_NOTE_COL_HEIGHT = 190;
const DEFAULT_NOTE_CONTAINER_WIDTH = 420;
const DEFAULT_NOTE_BUTTON_SCALE = 1;
const BUBBLE_SHIFT_UNIT = 15;

const notesUiInstances = new Map();

const getBoardDepth = (boardEl, rootBoard) => {
    let depth = 0;
    let current = boardEl;
    while (current && current !== rootBoard) {
        if (current.classList?.contains('notes-nested-board')) depth += 1;
        current = current.parentElement?.closest('.notes-board');
    }
    return depth;
};

const bubbleShiftForDepth = (depth, scale) => `${depth * BUBBLE_SHIFT_UNIT * scale}px`;

const setBubbleShiftForBoard = (boardEl, rootBoard, scale) => {
    const depth = getBoardDepth(boardEl, rootBoard);
    const shift = bubbleShiftForDepth(depth, scale);
    boardEl
        .querySelectorAll(':scope > .notes-board-bubble')
        .forEach((b) => b.style.setProperty('--bubble-shift', shift));
    boardEl
        .querySelectorAll(':scope > .notes-col > .notes-bubble')
        .forEach((b) => b.style.setProperty('--bubble-shift', shift));
};

const syncBubbleShifts = (boardEl, rootBoard, scale) => {
    setBubbleShiftForBoard(boardEl, rootBoard, scale);
    boardEl
        .querySelectorAll(':scope > .notes-col > .notes-nested-board')
        .forEach((nested) => syncBubbleShifts(nested, rootBoard, scale));
};

const alignEndBubble = (boardEl) => {
    const endBubble = boardEl.querySelector(':scope > .notes-board-bubble.end');
    const cols = boardEl.querySelectorAll(':scope > .notes-col');
    if (!endBubble || !cols.length) return;
    const boardRect = boardEl.getBoundingClientRect();
    const lastRect = cols[cols.length - 1].getBoundingClientRect();
    const offset = Math.max(0, boardRect.right - lastRect.right);
    endBubble.style.right = `${offset + 1}px`;
};

const clampNumber = (value, min, max, fallback) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.min(max, Math.max(min, num));
};

const createNotesUi = ({ node, setting, portIndex, connected, context }) => {
    const settings = node.settings ?? {};
    const root = document.createElement('div');
    root.className = 'notes-ui';
    root.dataset.portIndex = portIndex;

    // ---------------------------------------------------------------------
    // State
    // ---------------------------------------------------------------------
    const state = {
        rows: clampNumber(settings.noteRows, 1, 32, DEFAULT_NOTE_ROWS),
        colHeight: clampNumber(settings.noteColHeight, 60, 600, DEFAULT_NOTE_COL_HEIGHT),
        containerWidth: clampNumber(settings.noteContainerWidth, 120, 1200, DEFAULT_NOTE_CONTAINER_WIDTH),
        buttonScale: clampNumber(settings.noteButtonScale, 0.2, 2, DEFAULT_NOTE_BUTTON_SCALE),
        editMode: settings.noteEditMode !== false,
        notation: settings.notes ?? DEFAULT_NOTATION
    };

    const persistUiState = () => {
        const current = context.state?.nodes?.get(node.id) ?? node;
        if (!current?.settings) return;
        current.settings.noteRows = state.rows;
        current.settings.noteColHeight = state.colHeight;
        current.settings.noteContainerWidth = state.containerWidth;
        current.settings.noteButtonScale = state.buttonScale;
        current.settings.noteEditMode = state.editMode;
        if (context.autoSave) context.autoSave();
    };

    // ---------------------------------------------------------------------
    // Controls
    // ---------------------------------------------------------------------
    const controls = document.createElement('div');
    controls.className = 'notes-controls';

    const makeLabel = (text, input) => {
        const label = document.createElement('label');
        label.textContent = text;
        label.appendChild(input);
        return label;
    };

    const rowsInput = document.createElement('input');
    rowsInput.type = 'number';
    rowsInput.min = '1';
    rowsInput.max = '32';
    rowsInput.value = String(state.rows);
    rowsInput.addEventListener('mousedown', (e) => e.stopPropagation());
    rowsInput.addEventListener('click', (e) => e.stopPropagation());
    rowsInput.addEventListener('input', () => {
        const next = clampNumber(rowsInput.value, 1, 32, state.rows);
        rowsInput.value = String(next);
        state.rows = next;
        applyRowChange();
        persistUiState();
    });
    controls.append(makeLabel('Rows', rowsInput));

    const colHeightInput = document.createElement('input');
    colHeightInput.type = 'range';
    colHeightInput.min = '60';
    colHeightInput.max = '600';
    colHeightInput.step = '10';
    colHeightInput.value = String(state.colHeight);
    colHeightInput.addEventListener('mousedown', (e) => e.stopPropagation());
    colHeightInput.addEventListener('click', (e) => e.stopPropagation());
    colHeightInput.addEventListener('input', () => {
        const next = clampNumber(colHeightInput.value, 60, 600, state.colHeight);
        state.colHeight = next;
        root.style.setProperty('--notes-col-height', `${next}px`);
        alignEndBubble(board);
        persistUiState();
    });
    controls.append(makeLabel('Col H', colHeightInput));

    const containerWidthInput = document.createElement('input');
    containerWidthInput.type = 'range';
    containerWidthInput.min = '120';
    containerWidthInput.max = '1200';
    containerWidthInput.step = '10';
    containerWidthInput.value = String(state.containerWidth);
    containerWidthInput.addEventListener('mousedown', (e) => e.stopPropagation());
    containerWidthInput.addEventListener('click', (e) => e.stopPropagation());
    containerWidthInput.addEventListener('input', () => {
        const next = clampNumber(containerWidthInput.value, 120, 1200, state.containerWidth);
        state.containerWidth = next;
        boardShell.style.maxWidth = `${next}px`;
        alignEndBubble(board);
        persistUiState();
    });
    controls.append(makeLabel('Width', containerWidthInput));

    const scaleInput = document.createElement('input');
    scaleInput.type = 'range';
    scaleInput.min = '0.2';
    scaleInput.max = '2';
    scaleInput.step = '0.1';
    scaleInput.value = String(state.buttonScale);
    scaleInput.addEventListener('mousedown', (e) => e.stopPropagation());
    scaleInput.addEventListener('click', (e) => e.stopPropagation());
    scaleInput.addEventListener('input', () => {
        const next = clampNumber(scaleInput.value, 0.2, 2, state.buttonScale);
        state.buttonScale = next;
        root.style.setProperty('--notes-btn-scale', next);
        syncBubbleShifts(board, board, next);
        alignEndBubble(board);
        persistUiState();
    });
    controls.append(makeLabel('Scale', scaleInput));

    const editToggle = document.createElement('button');
    editToggle.type = 'button';
    editToggle.className = 'notes-edit-toggle';
    editToggle.textContent = 'E';
    editToggle.setAttribute('aria-pressed', String(state.editMode));
    editToggle.addEventListener('mousedown', (e) => e.stopPropagation());
    editToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        setEditMode(!state.editMode);
    });
    controls.append(editToggle);

    // ---------------------------------------------------------------------
    // Board + notation input
    // ---------------------------------------------------------------------
    const boardShell = document.createElement('div');
    boardShell.className = 'notes-board-shell';
    boardShell.style.maxWidth = `${state.containerWidth}px`;

    const board = document.createElement('div');
    board.className = 'notes-board';
    boardShell.appendChild(board);

    const notationRow = document.createElement('div');
    notationRow.className = 'notes-notation-row';
    const notationLabel = document.createElement('span');
    notationLabel.textContent = 'Strudel notation';
    const notationInput = document.createElement('input');
    notationInput.type = 'text';
    notationInput.className = 'notes-notation';
    notationInput.value = state.notation;
    notationInput.addEventListener('mousedown', (e) => e.stopPropagation());
    notationInput.addEventListener('click', (e) => e.stopPropagation());
    notationInput.addEventListener('focus', () => {
        root.dataset.typing = 'true';
    });
    notationInput.addEventListener('blur', () => {
        root.dataset.typing = '';
        updateNotation(true);
    });
    notationInput.addEventListener('input', () => {
        const parsed = parseNotation(notationInput.value);
        if (!parsed.ok) {
            notationInput.classList.add('invalid');
            return;
        }
        notationInput.classList.remove('invalid');
        applyParsedBoard(parsed.columns, true);
    });
    notationRow.append(notationLabel, notationInput);

    root.append(controls, boardShell, notationRow);

    const stopPointer = (el) => {
        el.addEventListener('mousedown', (e) => e.stopPropagation());
        el.addEventListener('click', (e) => e.stopPropagation());
    };
    [controls, boardShell, notationRow].forEach(stopPointer);

    // ---------------------------------------------------------------------
    // Board helpers
    // ---------------------------------------------------------------------
    const setEditMode = (on) => {
        state.editMode = on;
        root.classList.toggle('edit-mode', on);
        editToggle.classList.toggle('active', on);
        editToggle.setAttribute('aria-pressed', String(on));
        persistUiState();
    };

    const createCell = () => {
        const cell = document.createElement('div');
        cell.className = 'notes-cell';
        cell.addEventListener('click', () => {
            if (connected) return;
            const nowFilled = !cell.classList.contains('filled');
            cell.classList.toggle('filled', nowFilled);
            cell.textContent = '';
            updateNotation();
        });
        return cell;
    };

    const ensureRows = (col) => {
        if (col.querySelector(':scope > .notes-nested-board')) return;
        const cells = Array.from(col.querySelectorAll(':scope > .notes-cell'));
        const bubble = col.querySelector(':scope > .notes-bubble');
        const splitBtn = col.querySelector(':scope > .notes-split-btn');
        if (cells.length < state.rows) {
            for (let i = cells.length; i < state.rows; i += 1) {
                const newCell = createCell();
                const insertBeforeNode = cells[0] || bubble || splitBtn || null;
                col.insertBefore(newCell, insertBeforeNode);
            }
        } else if (cells.length > state.rows) {
            for (let i = 0; i < cells.length - state.rows; i += 1) col.removeChild(cells[i]);
        }
    };

    const setBubbleShift = (boardEl) => syncBubbleShifts(boardEl, board, state.buttonScale);

    const createBoardBubble = (targetBoard, side = 'start') => {
        const sideClass = side === 'end' ? 'end' : 'start';
        if (targetBoard.querySelector(`:scope > .notes-board-bubble.${sideClass}`)) return null;
        const bubble = document.createElement('button');
        bubble.type = 'button';
        bubble.className = `notes-bubble notes-board-bubble ${sideClass}`;
        bubble.title = sideClass === 'end' ? 'Add column to the end' : 'Add column to the start';
        bubble.textContent = '+';
        bubble.style.setProperty('--bubble-shift', bubbleShiftForDepth(getBoardDepth(targetBoard, board), state.buttonScale));
        bubble.addEventListener('click', (ev) => {
            ev.stopPropagation();
            if (connected) return;
            if (sideClass === 'end') addToEnd(targetBoard);
            else addToStart(targetBoard);
        });
        targetBoard.appendChild(bubble);
        return bubble;
    };

    const createBubble = (col, parentBoard) => {
        const bubble = document.createElement('button');
        bubble.type = 'button';
        bubble.className = 'notes-bubble';
        bubble.textContent = '+';
        bubble.title = 'Add column';
        bubble.style.setProperty('--bubble-shift', bubbleShiftForDepth(getBoardDepth(parentBoard, board), state.buttonScale));
        bubble.addEventListener('click', (ev) => {
            ev.stopPropagation();
            if (connected) return;
            const newCol = createColumn(parentBoard);
            parentBoard.insertBefore(newCol, col.nextElementSibling);
            refreshHeaders(parentBoard);
        });
        return bubble;
    };

    const createRemoveButton = (col, parentBoard) => {
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'notes-remove-btn';
        removeBtn.textContent = '-';
        removeBtn.title = 'Remove column';
        removeBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            if (connected) return;
            parentBoard.removeChild(col);
            const remainingCols = parentBoard.querySelectorAll(':scope > .notes-col');

            if (parentBoard !== board) {
                if (remainingCols.length === 0) {
                    const wrapperCol = parentBoard.parentElement;
                    const grandBoard = wrapperCol && wrapperCol.parentElement;
                    if (wrapperCol?.classList.contains('notes-col') && grandBoard?.classList.contains('notes-board')) {
                        grandBoard.removeChild(wrapperCol);
                        refreshHeaders(grandBoard);
                        return;
                    }
                }

                if (remainingCols.length === 1) {
                    unsplitNestedBoard(parentBoard);
                    return;
                }
            }

            refreshHeaders(parentBoard);
        });
        return removeBtn;
    };

    const createSplitButton = (col, parentBoard) => {
        const splitBtn = document.createElement('button');
        splitBtn.type = 'button';
        splitBtn.className = 'notes-split-btn';
        splitBtn.innerHTML =
            '<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" aria-hidden=\"true\" focusable=\"false\" style=\"transform: scaleY(-1);\"><path fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1\" d=\"M6.5 8.25a2.75 2.75 0 1 0 0-5.5a2.75 2.75 0 0 0 0 5.5m0 0V10a2 2 0 0 0 2 2h3m6-3.75a2.75 2.75 0 1 0 0-5.5a2.75 2.75 0 0 0 0 5.5m0 0V10a2 2 0 0 1-2 2h-4m0 0v3.75m0 0a2.75 2.75 0 1 0 0 5.5a2.75 2.75 0 0 0 0-5.5\"/></svg>';
        splitBtn.title = 'Split this column into nested columns';
        splitBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            if (connected) return;
            splitColumn(col, parentBoard);
        });
        return splitBtn;
    };

    const createColumn = (parentBoard = board) => {
        const col = document.createElement('div');
        col.className = 'notes-col';

        const header = document.createElement('div');
        header.className = 'notes-col-header';
        header.appendChild(createRemoveButton(col, parentBoard));
        col.appendChild(header);

        for (let i = 0; i < state.rows; i += 1) col.appendChild(createCell());

        col.appendChild(createBubble(col, parentBoard));
        col.appendChild(createSplitButton(col, parentBoard));

        return col;
    };

    const unsplitNestedBoard = (nestedBoard) => {
        const wrapperCol = nestedBoard.parentElement;
        const grandBoard = wrapperCol?.parentElement;
        const loneCol = nestedBoard.querySelector(':scope > .notes-col');
        if (!wrapperCol?.classList.contains('notes-col') || !grandBoard?.classList.contains('notes-board') || !loneCol) return;

        const contentNodes = Array.from(loneCol.childNodes).filter((node) => {
            if (node.nodeType !== Node.ELEMENT_NODE) return true;
            const cls = node.classList;
            return !cls.contains('notes-col-header') && !cls.contains('notes-bubble') && !cls.contains('notes-split-btn');
        });

        while (wrapperCol.firstChild) wrapperCol.removeChild(wrapperCol.firstChild);

        const header = document.createElement('div');
        header.className = 'notes-col-header';
        header.appendChild(createRemoveButton(wrapperCol, grandBoard));
        wrapperCol.appendChild(header);

        contentNodes.forEach((node) => wrapperCol.appendChild(node));

        wrapperCol.appendChild(createBubble(wrapperCol, grandBoard));
        wrapperCol.appendChild(createSplitButton(wrapperCol, grandBoard));

        ensureRows(wrapperCol);
        refreshHeaders(grandBoard);
    };

    const splitColumn = (col, parentBoard) => {
        if (col.querySelector(':scope > .notes-nested-board')) return;

        const existingCells = Array.from(col.querySelectorAll(':scope > .notes-cell')).map((cell) => {
            col.removeChild(cell);
            return cell;
        });

        const nestedBoard = document.createElement('div');
        nestedBoard.className = 'notes-board notes-nested-board';

        const leftCol = createColumn(nestedBoard);
        const rightCol = createColumn(nestedBoard);

        Array.from(leftCol.querySelectorAll(':scope > .notes-cell')).forEach((cell) => leftCol.removeChild(cell));
        const leftInsertBefore =
            leftCol.querySelector(':scope > .notes-bubble') || leftCol.querySelector(':scope > .notes-split-btn') || null;
        existingCells.forEach((cell) => leftCol.insertBefore(cell, leftInsertBefore));
        ensureRows(leftCol);

        nestedBoard.appendChild(leftCol);
        nestedBoard.appendChild(rightCol);
        createBoardBubble(nestedBoard, 'start');
        createBoardBubble(nestedBoard, 'end');

        const bubble = col.querySelector(':scope > .notes-bubble');
        const splitBtn = col.querySelector(':scope > .notes-split-btn');
        const header = col.querySelector(':scope > .notes-col-header');
        const insertBeforeNode = bubble || splitBtn || null;
        col.insertBefore(nestedBoard, insertBeforeNode);

        if (splitBtn) splitBtn.remove();
        if (header) header.remove();

        refreshHeaders(nestedBoard);
    };

    const refreshHeaders = (targetBoard = board) => {
        Array.from(targetBoard.querySelectorAll(':scope > .notes-col')).forEach((col) => ensureRows(col));
        setBubbleShift(targetBoard);
        alignEndBubble(targetBoard);
        updateNotation();
    };

    const addToStart = (targetBoard = board) => {
        const newCol = createColumn(targetBoard);
        const firstCol = Array.from(targetBoard.children).find((el) => el.classList && el.classList.contains('notes-col'));
        if (firstCol) targetBoard.insertBefore(newCol, firstCol);
        else targetBoard.appendChild(newCol);
        refreshHeaders(targetBoard);
    };

    const addToEnd = (targetBoard = board) => {
        const newCol = createColumn(targetBoard);
        targetBoard.appendChild(newCol);
        refreshHeaders(targetBoard);
    };

    const applyRowChange = () => {
        Array.from(board.querySelectorAll('.notes-col')).forEach(ensureRows);
        updateNotation();
    };

    // ---------------------------------------------------------------------
    // Notation helpers
    // ---------------------------------------------------------------------
    const boardToColumns = (boardEl) =>
        Array.from(boardEl.querySelectorAll(':scope > .notes-col')).map((col) => columnToNotation(col));

    const columnToNotation = (col) => {
        const nested = col.querySelector(':scope > .notes-nested-board');
        if (nested) {
            const innerCols = boardToColumns(nested);
            return `{${innerCols.join(' ')}}`;
        }

        const cells = Array.from(col.querySelectorAll(':scope > .notes-cell'));
        const filled = cells
            .map((cell, idx) => (cell.classList.contains('filled') ? cells.length - 1 - idx : null))
            .filter((v) => v !== null);

        if (filled.length === 0) return '-';
        if (filled.length === 1) return String(filled[0]);
        return `[${filled.join(',')}]`;
    };

    const updateNotation = (skipBoard) => {
        if (root.dataset.typing === 'true') return;
        const cols = skipBoard ? null : boardToColumns(board);
        const notationText = skipBoard ? notationInput.value : `<${cols.join(' ')}>`;
        notationInput.classList.remove('invalid');
        notationInput.value = notationText;
        state.notation = notationText;
        const current = context.state?.nodes?.get(node.id) ?? node;
        if (current?.settings) {
            current.settings[setting.settingKey] = notationText;
            if (setting.settingKey === 'notes') current.value = current.value ?? notationText;
            if (context.propagateValuesFrom) context.propagateValuesFrom(current.id);
            if (context.updateCodePanel) context.updateCodePanel();
            if (context.autoSave) context.autoSave();
        }
    };

    const isDigit = (ch) => ch >= '0' && ch <= '9';

    const parseNotation = (raw) => {
        const src = raw.trim();
        let i = 0;

        const skipWs = () => {
            while (i < src.length && /\\s/.test(src[i])) i += 1;
        };

        const parseNumber = () => {
            skipWs();
            if (i >= src.length || !isDigit(src[i])) return null;
            const start = i;
            while (i < src.length && isDigit(src[i])) i += 1;
            const num = parseInt(src.slice(start, i), 10);
            return Number.isInteger(num) ? num : null;
        };

        const parseList = () => {
            i += 1;
            skipWs();
            const fills = [];
            if (src[i] === ']') {
                i += 1;
                return fills;
            }
            while (i < src.length) {
                const num = parseNumber();
                if (!Number.isInteger(num)) return null;
                fills.push(num);
                skipWs();
                if (src[i] === ',') {
                    i += 1;
                    continue;
                }
                if (src[i] === ']') {
                    i += 1;
                    return fills;
                }
                return null;
            }
            return null;
        };

        const parseColumns = (endChar) => {
            const cols = [];
            while (i < src.length) {
                skipWs();
                if (src[i] === endChar) {
                    i += 1;
                    return cols;
                }
                const col = parseColumn();
                if (!col) return null;
                cols.push(col);
                skipWs();
                if (src[i] === endChar) {
                    i += 1;
                    return cols;
                }
            }
            return null;
        };

        const parseColumn = () => {
            skipWs();
            const ch = src[i];
            if (ch === '{') {
                i += 1;
                const nested = parseColumns('}');
                if (!nested) return null;
                return { nested };
            }
            if (ch === '[') {
                const fills = parseList();
                return fills !== null ? { fills } : null;
            }
            if (ch === '-') {
                i += 1;
                return { fills: [] };
            }
            if (isDigit(ch)) {
                const num = parseNumber();
                return Number.isInteger(num) ? { fills: [num] } : null;
            }
            return null;
        };

        skipWs();
        if (src[i] !== '<') return { ok: false };
        i += 1;
        const columns = parseColumns('>');
        if (!columns || columns.length === 0) return { ok: false };
        skipWs();
        if (i !== src.length) return { ok: false };
        return { ok: true, columns };
    };

    const neededRows = (columns) => {
        let maxRows = 1;
        columns.forEach((col) => {
            if (col.nested) {
                maxRows = Math.max(maxRows, neededRows(col.nested));
            } else if (col.fills?.length) {
                maxRows = Math.max(maxRows, Math.max(...col.fills) + 1);
            }
        });
        return maxRows;
    };

    const applyColumnState = (colEl, colAst) => {
        if (colAst.nested) {
            const bubble = colEl.querySelector(':scope > .notes-bubble');
            const splitBtn = colEl.querySelector(':scope > .notes-split-btn');
            const header = colEl.querySelector(':scope > .notes-col-header');
            Array.from(colEl.querySelectorAll(':scope > .notes-cell')).forEach((cell) => cell.remove());
            if (header) header.remove();
            if (splitBtn) splitBtn.remove();

            const nestedBoard = document.createElement('div');
            nestedBoard.className = 'notes-board notes-nested-board';
            createBoardBubble(nestedBoard, 'start');
            createBoardBubble(nestedBoard, 'end');
            const nestedEnd = nestedBoard.querySelector(':scope > .notes-board-bubble.end');

            colAst.nested.forEach((child) => {
                const nestedCol = createColumn(nestedBoard);
                nestedBoard.insertBefore(nestedCol, nestedEnd);
                applyColumnState(nestedCol, child);
            });

            colEl.insertBefore(nestedBoard, bubble || null);
            return;
        }

        ensureRows(colEl);
        const cells = Array.from(colEl.querySelectorAll(':scope > .notes-cell'));
        cells.forEach((cell) => cell.classList.remove('filled'));
        (colAst.fills || []).forEach((pos) => {
            const idx = cells.length - 1 - pos;
            if (idx >= 0 && idx < cells.length) cells[idx].classList.add('filled');
        });
    };

    const applyParsedBoard = (columnsAst, skipNotationCommit = false) => {
        const required = Math.max(1, neededRows(columnsAst));
        state.rows = required;
        rowsInput.value = String(required);

        board.innerHTML = '';
        createBoardBubble(board, 'start');
        createBoardBubble(board, 'end');
        const endBubble = board.querySelector(':scope > .notes-board-bubble.end');

        columnsAst.forEach((colAst) => {
            const colEl = createColumn(board);
            board.insertBefore(colEl, endBubble);
            applyColumnState(colEl, colAst);
        });

        refreshHeaders(board);
        if (!skipNotationCommit) updateNotation(true);
    };

    // ---------------------------------------------------------------------
    // Init board
    // ---------------------------------------------------------------------
    root.style.setProperty('--notes-col-height', `${state.colHeight}px`);
    root.style.setProperty('--notes-btn-scale', state.buttonScale);

    createBoardBubble(board, 'start');
    createBoardBubble(board, 'end');
    board.appendChild(createColumn(board));
    setEditMode(state.editMode);
    syncBubbleShifts(board, board, state.buttonScale);
    alignEndBubble(board);

    const parsedInitial = parseNotation(state.notation);
    if (parsedInitial.ok) {
        applyParsedBoard(parsedInitial.columns, true);
    } else {
        updateNotation();
    }

    window.addEventListener('resize', () => alignEndBubble(board));

    const setDisabled = (isDisabled) => {
        root.classList.toggle('notes-disabled', isDisabled);
        [rowsInput, colHeightInput, containerWidthInput, scaleInput, editToggle, notationInput].forEach((el) => {
            el.disabled = isDisabled;
        });
        boardShell.style.pointerEvents = isDisabled ? 'none' : '';
    };

    setDisabled(connected);

    const api = {
        setNotation: (text) => {
            const parsed = parseNotation(text);
            if (!parsed.ok) return;
            state.notation = text;
            notationInput.value = text;
            applyParsedBoard(parsed.columns, true);
            setDisabled(connected);
        },
        root
    };

    notesUiInstances.set(node.id, api);
    return root;
};

const getNode = (context, nodeId) => context?.state?.nodes?.get(nodeId);
const hasIncoming = (context, nodeId, portIndex) =>
    context?.hasIncomingConnection ? context.hasIncomingConnection(nodeId, portIndex) : false;

const alignOutputsToInputs = (nodeEl) => {
    if (!nodeEl) return;
    const inputs = Array.from(nodeEl.querySelectorAll('.inputs .port-container'));
    const outputs = Array.from(nodeEl.querySelectorAll('.outputs .port-container'));
    if (!inputs.length || inputs.length !== outputs.length) return;

    outputs.forEach((outRow, idx) => {
        outRow.style.minHeight = '';
        const inRow = inputs[idx];
        const height = inRow?.getBoundingClientRect().height;
        if (height) {
            outRow.style.minHeight = `${height}px`;
            outRow.style.alignItems = 'center';
        }
    });
};

const shouldForceHideModeTonic = (nodeId, context = {}) => {
    const node = getNode(context, nodeId);
    if (!node) return false;
    const inputDefs = getInputDefinitions(NOTES_CONFIG);
    const modePortIndex = inputDefs.findIndex((d) => d.settingKey === 'mode');
    const tonicPortIndex = inputDefs.findIndex((d) => d.settingKey === 'tonic');
    if (modePortIndex === -1 || tonicPortIndex === -1) return false;
    const modeConnected = hasIncoming(context, nodeId, modePortIndex);
    const tonicConnected = hasIncoming(context, nodeId, tonicPortIndex);
    const modeEmpty = (node.settings?.mode ?? '') === '';
    const tonicEmpty = (node.settings?.tonic ?? '') === '';
    return modeConnected && tonicConnected && modeEmpty && tonicEmpty;
};

const applyModeTonicVisibility = (nodeId, context = {}, opts = {}) => {
    const node = getNode(context, nodeId);
    if (!node) return;
    const forceHide = opts.forceHide ?? shouldForceHideModeTonic(nodeId, context);
    const nodeEl = document.querySelector(`[data-node-id="${nodeId}"]`);
    if (!nodeEl) return;

    if (forceHide && !node.settings.hideModeTonic) {
        node.settings.hideModeTonic = true;
    }

    const hidden = opts.hidden ?? !!node.settings?.hideModeTonic;
    nodeEl.querySelectorAll('.mode-selects, .tonic-select').forEach((el) => {
        el.style.display = hidden ? 'none' : '';
    });

    const toggle = nodeEl.querySelector('.mode-tonic-toggle input[type="checkbox"]');
    if (toggle) {
        toggle.checked = !hidden;
        toggle.disabled = forceHide;
    }

    alignOutputsToInputs(nodeEl);
};

const refreshModeAndTonicForNode = (nodeId, context = {}) => {
    const node = getNode(context, nodeId);
    if (!node) return;
    const inputDefs = getInputDefinitions(NOTES_CONFIG);
    const modePortIndex = inputDefs.findIndex((d) => d.settingKey === 'mode');
    const tonicPortIndex = inputDefs.findIndex((d) => d.settingKey === 'tonic');

    const forceHide = shouldForceHideModeTonic(nodeId, context);
    if (forceHide && !node.settings.hideModeTonic) {
        node.settings.hideModeTonic = true;
    }

    if (node.settings?.hideModeTonic) {
        if (modePortIndex !== -1 && !hasIncoming(context, nodeId, modePortIndex)) {
            node.settings.mode = '';
            updateModeFields(nodeId, modePortIndex, '', context);
        }
        if (tonicPortIndex !== -1 && !hasIncoming(context, nodeId, tonicPortIndex)) {
            node.settings.tonic = '';
            updateTonicField(nodeId, tonicPortIndex, '', context);
        }
        if (context.propagateValuesFrom) context.propagateValuesFrom(nodeId);
        applyModeTonicVisibility(nodeId, context, { forceHide });
        return;
    }

    if (modePortIndex !== -1) {
        updateModeFields(nodeId, modePortIndex, node.settings?.mode, context);
    }
    if (tonicPortIndex !== -1) {
        updateTonicField(nodeId, tonicPortIndex, node.settings?.tonic, context);
    }
    applyModeTonicVisibility(nodeId, context, { forceHide });
};

const updateTuningFields = (nodeId, portIndex, rawValue, context = {}) => {
    const nodeEl = document.querySelector(`[data-node-id="${nodeId}"]`);
    if (!nodeEl || !TuningUtils.tuningListCache || !TuningUtils.tuningHierarchy) return;

    const selects = Array.from(
        nodeEl.querySelectorAll(`select.setting-field[data-port-index="${portIndex}"]`)
    );
    if (!selects.length) return;

    const connected = hasIncoming(context, nodeId, portIndex);
    const value = resolveTuningValue(rawValue, context);
    const { category, subcategory } = splitTuningPath(value);

    const selectCat = selects.find((s) => s.dataset.tuningField === 'category');
    const selectSub = selects.find((s) => s.dataset.tuningField === 'subcategory');
    const selectTun = selects.find((s) => s.dataset.tuningField === 'tuning');

    const setOptions = (el, options) => {
        el.innerHTML = '';
        options.forEach((o) => {
            const op = document.createElement('option');
            op.value = o.value ?? o;
            op.textContent = o.label ?? o;
            el.appendChild(op);
        });
    };

    if (selectCat) {
        setOptions(selectCat, TuningUtils.tuningHierarchy.categories);
        selectCat.value = category || selectCat.options[0]?.value || '';
    }

    if (selectSub) {
        const subs = TuningUtils.tuningHierarchy.subs.get(selectCat?.value ?? '') ?? [''];
        setOptions(
            selectSub,
            subs.map((s) => ({ value: s, label: s || 'root' }))
        );
        selectSub.value = subcategory || selectSub.options[0]?.value || '';
    }

    if (selectTun) {
        const key = `${selectCat?.value ?? ''}/${selectSub?.value ?? ''}`;
        const tunes = TuningUtils.tuningHierarchy.files.get(key) ?? [];
        setOptions(
            selectTun,
            tunes.map((t) => ({ value: t, label: splitTuningPath(t).file }))
        );
        if (value && !tunes.includes(value)) {
            const op = document.createElement('option');
            op.value = value;
            op.textContent = splitTuningPath(value).file;
            selectTun.appendChild(op);
        }
        selectTun.value = value || tunes[0] || DEFAULT_TUNING;
        if (!selectTun.value) selectTun.value = DEFAULT_TUNING;
    }

    selects.forEach((s) => {
        s.disabled = connected;
    });

    refreshModeAndTonicForNode(nodeId, context);
};

const updateModeFields = (nodeId, portIndex, rawValue, context = {}) => {
    const nodeEl = document.querySelector(`[data-node-id="${nodeId}"]`);
    if (!nodeEl) return;

    const selects = Array.from(
        nodeEl.querySelectorAll(`select.setting-field[data-port-index="${portIndex}"]`)
    );
    if (!selects.length) return;

    if (!TuningUtils.modeSetsCache) {
        getModeSets(context).then(() => updateModeFields(nodeId, portIndex, rawValue, context));
        return;
    }

    const node = getNode(context, nodeId);
    const settingKey = getInputDefinitions(NOTES_CONFIG)[portIndex]?.settingKey;
    const tuningPath = resolveTuningValue(node?.settings?.tuning ?? DEFAULT_TUNING, context);
    const meta = tuningMetaCache.get(tuningPath);
    if (!meta) {
        getTuningMeta(tuningPath).then(() => updateModeFields(nodeId, portIndex, rawValue, context));
        return;
    }

    const connected = hasIncoming(context, nodeId, portIndex);
    const value = resolveModeValue(rawValue, context);
    const availableModes = modesForCount(meta.count, TuningUtils.modeSetsCache);
    const groupedModes = modesByGroupForCount(meta.count, TuningUtils.modeSetsCache);
    const mode =
        value === ''
            ? null
            : availableModes.find((m) => m.id === value) ?? availableModes[0];
    const group = mode?.group ?? Array.from(groupedModes.keys())[0];

    const selectGroup = selects.find((s) => s.dataset.modeField === 'group');
    const selectMode = selects.find((s) => s.dataset.modeField === 'mode');

    const setOptions = (el, options) => {
        el.innerHTML = '';
        options.forEach((o) => {
            const op = document.createElement('option');
            op.value = o.value ?? o;
            op.textContent = o.label ?? o;
            el.appendChild(op);
        });
    };

    const groups = Array.from(groupedModes.keys());

    if (!availableModes.length) {
        if (selectGroup) setOptions(selectGroup, [{ value: '', label: 'No compatible modes' }]);
        if (selectMode) setOptions(selectMode, [{ value: '', label: 'No compatible modes' }]);
        selects.forEach((s) => {
            s.disabled = true;
        });
        return;
    }

    if (selectGroup) {
        setOptions(
            selectGroup,
            groups.map((g) => ({ value: g, label: g }))
        );
        if (!groups.includes(group)) {
            const op = document.createElement('option');
            op.value = group;
            op.textContent = group;
            selectGroup.appendChild(op);
        }
        selectGroup.value = group || groups[0] || '';
    }

    let chosenMode = mode;
    if (selectMode) {
        const modes = groupedModes.get(selectGroup?.value) ?? [];
        setOptions(
            selectMode,
            [
                { value: '', label: '(none)' },
                ...modes.map((m) => ({ value: m.id, label: m.name }))
            ]
        );
        if (mode && !modes.find((m) => m.id === mode.id)) {
            const op = document.createElement('option');
            op.value = mode.id;
            op.textContent = mode.name;
            selectMode.appendChild(op);
        }
        chosenMode = mode ?? (value === '' ? null : modes[0]);
        selectMode.value = chosenMode?.id ?? (value === '' ? '' : modes[0]?.id ?? DEFAULT_MODE);
    }

    if (!connected && settingKey && node && node.settings) {
        const newVal = chosenMode ? chosenMode.id : '';
        if (node.settings[settingKey] !== newVal) {
            node.settings[settingKey] = newVal;
            if (context.updateCodePanel) context.updateCodePanel();
            if (context.propagateValuesFrom) context.propagateValuesFrom(node.id);
            if (context.autoSave) context.autoSave();
        }
    }

    selects.forEach((s) => {
        s.disabled = connected;
    });

    applyModeTonicVisibility(nodeId, context);
};

const updateTonicField = (nodeId, portIndex, rawValue, context = {}) => {
    const nodeEl = document.querySelector(`[data-node-id="${nodeId}"]`);
    if (!nodeEl) return;
    const select = nodeEl.querySelector(
        `select.setting-field[data-port-index="${portIndex}"][data-tonic-field="tonic"]`
    );
    if (!select) return;
    const node = getNode(context, nodeId);
    const settingKey = getInputDefinitions(NOTES_CONFIG)[portIndex]?.settingKey;
    const tuningPath = resolveTuningValue(node?.settings?.tuning ?? DEFAULT_TUNING, context);
    const meta = tuningMetaCache.get(tuningPath);
    if (!meta) {
        getTuningMeta(tuningPath).then(() => updateTonicField(nodeId, portIndex, rawValue, context));
        return;
    }

    const connected = hasIncoming(context, nodeId, portIndex);
    const options = [{ value: '', label: '(none)' }, ...tonicOptionsForCount(meta.count, TONIC_OPTIONS)];
    select.innerHTML = '';
    if (options.length) {
        options.forEach(({ value, label }) => {
            const op = document.createElement('option');
            op.value = String(value);
            op.textContent = label;
            select.appendChild(op);
        });
    } else {
        const op = document.createElement('option');
        op.value = '';
        op.textContent = 'No tonic options';
        select.appendChild(op);
    }

    const currentVal = clampTonicToCount(
        node.settings?.[settingKey] ?? DEFAULT_TONIC,
        meta.count
    );
    select.value = String(currentVal);

    if (!connected) {
        node.settings[settingKey] = currentVal;
    }

    select.disabled = connected || !options.length;

    applyModeTonicVisibility(nodeId, context);
};

const buildModeTonicToggle = (node, context = {}) => {
    const toggleWrap = document.createElement('label');
    toggleWrap.className = 'mode-tonic-toggle';
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.checked = !node.settings?.hideModeTonic;
    toggle.addEventListener('mousedown', (evt) => evt.stopPropagation());
    toggle.addEventListener('click', (evt) => evt.stopPropagation());
    toggle.addEventListener('change', () => {
        const current = getNode(context, node.id);
        if (!current) return;
        const defs = getInputDefinitions(NOTES_CONFIG);
        const modePortIndex = defs.findIndex((d) => d.settingKey === 'mode');
        const tonicPortIndex = defs.findIndex((d) => d.settingKey === 'tonic');
        current.settings.hideModeTonic = !toggle.checked;
        if (current.settings.hideModeTonic) {
            if (modePortIndex !== -1 && !hasIncoming(context, current.id, modePortIndex)) {
                current.settings.mode = '';
            }
            if (tonicPortIndex !== -1 && !hasIncoming(context, current.id, tonicPortIndex)) {
                current.settings.tonic = '';
            }
        }
        refreshModeAndTonicForNode(current.id, context);
        if (context.render) context.render();
        if (context.autoSave) context.autoSave();
    });
    const toggleText = document.createElement('span');
    toggleText.textContent = 'Mode/Tonic';
    toggleWrap.append(toggle, toggleText);
    return toggleWrap;
};

const renderHeaderExtras = (node, context = {}) => {
    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'reset-btn';
    resetBtn.title = 'Reset to standard tuning';
    resetBtn.setAttribute('aria-label', 'Reset to standard tuning');
    resetBtn.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"><path fill="currentColor" d="M12 20q-3.35 0-5.675-2.325T4 12t2.325-5.675T12 4q1.725 0 3.3.712T18 6.75V4h2v7h-7V9h4.2q-.8-1.4-2.187-2.2T12 6Q9.5 6 7.75 7.75T6 12t1.75 4.25T12 18q1.925 0 3.475-1.1T17.65 14h2.1q-.7 2.65-2.85 4.325T12 20"/></svg>';
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

const buildTuningField = ({ node, setting, portIndex, connected, context }) => {
    const settingKey = setting.settingKey ?? setting.key;
    const selectCat = document.createElement('select');
    const selectSub = document.createElement('select');
    const selectTun = document.createElement('select');

    [selectCat, selectSub, selectTun].forEach((sel, idx) => {
        sel.className = 'setting-field';
        sel.dataset.portIndex = portIndex;
        sel.dataset.settingKey = settingKey;
        sel.dataset.tuningField = ['category', 'subcategory', 'tuning'][idx];
        sel.disabled = connected;
        if (setting.title) sel.title = setting.title;
        sel.addEventListener('mousedown', (evt) => evt.stopPropagation());
        sel.addEventListener('click', (evt) => evt.stopPropagation());
    });

    const commit = () => {
        const current = getNode(context, node.id);
        if (!current) return;
        const val = selectTun.value || '';
        current.settings[settingKey] = val;
        current.value = val;
        getTuningMeta(val);
        if (context.propagateValuesFrom) context.propagateValuesFrom(current.id);
        refreshModeAndTonicForNode(current.id, context);
        if (context.updateCodePanel) context.updateCodePanel();
        if (context.autoSave) context.autoSave();
    };

    selectCat.addEventListener('change', () => {
        const cat = selectCat.value;
        const subs = (TuningUtils.tuningHierarchy?.subs.get(cat) ?? ['']).map((s) => s);
        selectSub.innerHTML = '';
        subs.forEach((s) => {
            const op = document.createElement('option');
            op.value = s;
            op.textContent = s || 'root';
            selectSub.appendChild(op);
        });
        selectSub.value = subs[0] ?? '';

        const key = `${cat}/${selectSub.value ?? ''}`;
        const tunes = TuningUtils.tuningHierarchy?.files.get(key) ?? [];
        selectTun.innerHTML = '';
        tunes.forEach((t) => {
            const op = document.createElement('option');
            op.value = t;
            op.textContent = splitTuningPath(t).file;
            selectTun.appendChild(op);
        });
        selectTun.value = tunes[0] ?? DEFAULT_TUNING;
        commit();
    });

    selectSub.addEventListener('change', () => {
        const cat = selectCat.value;
        const sub = selectSub.value;
        const key = `${cat}/${sub ?? ''}`;
        const tunes = TuningUtils.tuningHierarchy?.files.get(key) ?? [];
        selectTun.innerHTML = '';
        tunes.forEach((t) => {
            const op = document.createElement('option');
            op.value = t;
            op.textContent = splitTuningPath(t).file;
            selectTun.appendChild(op);
        });
        selectTun.value = tunes[0] ?? DEFAULT_TUNING;
        commit();
    });

    selectTun.addEventListener('change', commit);

    const initDropdowns = () => {
        const currentVal = resolveTuningValue(node.settings?.[settingKey] ?? '', context);
        const { category, subcategory } = splitTuningPath(currentVal);

        selectCat.innerHTML = '';
        (TuningUtils.tuningHierarchy?.categories ?? []).forEach((c) => {
            const op = document.createElement('option');
            op.value = c;
            op.textContent = c;
            selectCat.appendChild(op);
        });
        selectCat.value = category || '';
        if (!selectCat.value && selectCat.options.length > 0) {
            selectCat.value = selectCat.options[0].value;
        }

        const subs = TuningUtils.tuningHierarchy?.subs.get(selectCat.value) ?? [''];
        selectSub.innerHTML = '';
        subs.forEach((s) => {
            const op = document.createElement('option');
            op.value = s;
            op.textContent = s || 'root';
            selectSub.appendChild(op);
        });
        selectSub.value = subcategory || '';
        if (!selectSub.value && subs.length) {
            selectSub.value = subs[0];
        }

        const key = `${selectCat.value}/${selectSub.value ?? ''}`;
        const tunes = TuningUtils.tuningHierarchy?.files.get(key) ?? [];
        selectTun.innerHTML = '';
        tunes.forEach((t) => {
            const op = document.createElement('option');
            op.value = t;
            op.textContent = splitTuningPath(t).file;
            selectTun.appendChild(op);
        });
        selectTun.value = currentVal;
        if (!selectTun.value && tunes.length) {
            selectTun.value = tunes[0];
        }
        if (!selectTun.value && !tunes.length) {
            selectTun.value = DEFAULT_TUNING;
        }

        if (!connected && selectTun.value) {
            commit();
        }
    };

    if (TuningUtils.tuningListCache && TuningUtils.tuningHierarchy) {
        initDropdowns();
    } else {
        selectCat.innerHTML = '';
        const loadingOpt = document.createElement('option');
        loadingOpt.textContent = 'Loading...';
        selectCat.appendChild(loadingOpt);
        selectSub.innerHTML = '';
        const loadingSub = document.createElement('option');
        loadingSub.textContent = 'Loading...';
        selectSub.appendChild(loadingSub);
        selectTun.innerHTML = '';
        const loadingTun = document.createElement('option');
        loadingTun.textContent = 'Loading...';
        selectTun.appendChild(loadingTun);
        getTuningList(context).then(() => initDropdowns());
    }

    const selectCol = document.createElement('div');
    selectCol.className = 'tuning-selects';
    selectCol.append(selectCat, selectSub, selectTun);

    return selectCol;
};

const buildModeField = ({ node, setting, portIndex, connected, context }) => {
    const settingKey = setting.settingKey ?? setting.key;
    const selectGroup = document.createElement('select');
    const selectMode = document.createElement('select');

    [selectGroup, selectMode].forEach((sel, idx) => {
        sel.className = 'setting-field';
        sel.dataset.portIndex = portIndex;
        sel.dataset.settingKey = settingKey;
        sel.dataset.modeField = ['group', 'mode'][idx];
        sel.disabled = connected;
        if (setting.title) sel.title = setting.title;
        sel.addEventListener('mousedown', (evt) => evt.stopPropagation());
        sel.addEventListener('click', (evt) => evt.stopPropagation());
    });

    let modeGroups = new Map();
    let availableModes = [];

    const commit = () => {
        const current = getNode(context, node.id);
        if (!current) return;
        const val = selectMode.value;
        current.settings[settingKey] = val;
        if (context.updateCodePanel) context.updateCodePanel();
        if (context.propagateValuesFrom) context.propagateValuesFrom(current.id);
        if (context.autoSave) context.autoSave();
    };

    const populateModeSelects = () => {
        const current = getNode(context, node.id);
        if (!current) return;
        const tuningPath = resolveTuningValue(current.settings?.tuning ?? DEFAULT_TUNING, context);
        if (!TuningUtils.modeSetsCache) {
            selectGroup.innerHTML = '';
            const loadingG = document.createElement('option');
            loadingG.textContent = 'Loading...';
            selectGroup.appendChild(loadingG);
            selectMode.innerHTML = '';
            const loadingM = document.createElement('option');
            loadingM.textContent = 'Loading...';
            selectMode.appendChild(loadingM);
            selectGroup.disabled = true;
            selectMode.disabled = true;
            getModeSets(context).then(() => populateModeSelects());
            return;
        }

        const meta = tuningMetaCache.get(tuningPath);
        if (!meta) {
            selectGroup.innerHTML = '';
            const loadingG = document.createElement('option');
            loadingG.textContent = 'Loading tuning...';
            selectGroup.appendChild(loadingG);
            selectMode.innerHTML = '';
            const loadingM = document.createElement('option');
            loadingM.textContent = 'Loading tuning...';
            selectMode.appendChild(loadingM);
            selectGroup.disabled = true;
            selectMode.disabled = true;
            getTuningMeta(tuningPath).then(() => populateModeSelects());
            return;
        }

        availableModes = modesForCount(meta.count, TuningUtils.modeSetsCache);
        modeGroups = modesByGroupForCount(meta.count, TuningUtils.modeSetsCache);

        if (!availableModes.length) {
            selectGroup.innerHTML = '';
            const noG = document.createElement('option');
            noG.value = '';
            noG.textContent = 'No compatible modes';
            selectGroup.appendChild(noG);
            selectMode.innerHTML = '';
            const noM = document.createElement('option');
            noM.value = '';
            noM.textContent = 'No compatible modes';
            selectMode.appendChild(noM);
            selectGroup.disabled = true;
            selectMode.disabled = true;
            return;
        }

        const currentVal = resolveModeValue(current.settings?.[settingKey] ?? '', context);
        let currentMode = availableModes.find((m) => m.id === currentVal) ?? availableModes[0];
        let currentGroup = currentMode?.group;

        const groupList = Array.from(modeGroups.keys());
        if (!groupList.includes(currentGroup)) {
            currentGroup = groupList[0];
            currentMode = (modeGroups.get(currentGroup) ?? [])[0] ?? currentMode;
        }

        selectGroup.innerHTML = '';
        groupList.forEach((g) => {
            const op = document.createElement('option');
            op.value = g;
            op.textContent = g;
            selectGroup.appendChild(op);
        });
        selectGroup.value = currentGroup || selectGroup.options[0]?.value || '';

        const modes = modeGroups.get(selectGroup.value) ?? [];
        selectMode.innerHTML = '';
        const noneOpt = document.createElement('option');
        noneOpt.value = '';
        noneOpt.textContent = '(none)';
        selectMode.appendChild(noneOpt);
        modes.forEach((m) => {
            const op = document.createElement('option');
            op.value = m.id;
            op.textContent = m.name;
            selectMode.appendChild(op);
        });
        if (!modes.find((m) => m.id === currentMode?.id)) {
            currentMode = currentVal === '' ? null : modes[0] ?? currentMode;
        }
        selectMode.value =
            currentVal === '' ? '' : currentMode?.id ?? modes[0]?.id ?? DEFAULT_MODE;

        selectGroup.disabled = connected;
        selectMode.disabled = connected;

        if (!connected) commit();
    };

    selectGroup.addEventListener('change', () => {
        const current = getNode(context, node.id);
        const tuningPath = resolveTuningValue(current?.settings?.tuning ?? DEFAULT_TUNING, context);
        const groupsMap = tuningMetaCache.get(tuningPath)
            ? modesByGroupForCount(tuningMetaCache.get(tuningPath).count, TuningUtils.modeSetsCache)
            : modeGroups;
        modeGroups = groupsMap;
        const modes = groupsMap.get(selectGroup.value) ?? [];
        selectMode.innerHTML = '';
        const noneOpt = document.createElement('option');
        noneOpt.value = '';
        noneOpt.textContent = '(none)';
        selectMode.appendChild(noneOpt);
        modes.forEach((m) => {
            const op = document.createElement('option');
            op.value = m.id;
            op.textContent = m.name;
            selectMode.appendChild(op);
        });
        const existing = current?.settings?.[settingKey];
        selectMode.value = existing === '' ? '' : modes[0]?.id ?? '';
        commit();
    });

    selectMode.addEventListener('change', commit);

    populateModeSelects();

    const modeSelects = document.createElement('div');
    modeSelects.className = 'mode-selects';
    modeSelects.append(selectGroup, selectMode);

    const modeBlock = document.createElement('div');
    modeBlock.className = 'mode-block';
    modeBlock.append(buildModeTonicToggle(node, context), modeSelects);
    return modeBlock;
};

const buildTonicField = ({ node, setting, portIndex, connected, context }) => {
    const settingKey = setting.settingKey ?? setting.key;
    const selectTonic = document.createElement('select');
    selectTonic.className = 'setting-field';
    selectTonic.dataset.portIndex = portIndex;
    selectTonic.dataset.settingKey = settingKey;
    selectTonic.dataset.tonicField = 'tonic';
    selectTonic.disabled = connected;
    if (setting.title) selectTonic.title = setting.title;
    selectTonic.addEventListener('mousedown', (evt) => evt.stopPropagation());
    selectTonic.addEventListener('click', (evt) => evt.stopPropagation());

    const populateTonicOptions = () => {
        const current = getNode(context, node.id);
        if (!current) return;
        const tuningPath = resolveTuningValue(current.settings?.tuning ?? DEFAULT_TUNING, context);
        selectTonic.disabled = connected;
        const meta = tuningMetaCache.get(tuningPath);

        if (!meta) {
            selectTonic.innerHTML = '';
            const loading = document.createElement('option');
            loading.value = '';
            loading.textContent = 'Loading...';
            selectTonic.appendChild(loading);
            selectTonic.disabled = true;
            getTuningMeta(tuningPath).then(() => populateTonicOptions());
            return;
        }

        const options = [{ value: '', label: '(none)' }, ...tonicOptionsForCount(meta.count, TONIC_OPTIONS)];
        selectTonic.innerHTML = '';
        if (options.length) {
            options.forEach(({ value, label }) => {
                const op = document.createElement('option');
                op.value = String(value);
                op.textContent = label;
                selectTonic.appendChild(op);
            });
        } else {
            const op = document.createElement('option');
            op.value = '';
            op.textContent = 'No tonic options';
            selectTonic.appendChild(op);
        }

        const currentVal = clampTonicToCount(node.settings?.[settingKey] ?? DEFAULT_TONIC, meta.count);
        selectTonic.value = String(currentVal);

        if (!connected) {
            current.settings[settingKey] = currentVal;
        }

        selectTonic.disabled = connected || !options.length;
    };

    selectTonic.addEventListener('change', () => {
        const current = getNode(context, node.id);
        if (!current) return;
        const tuningPath = resolveTuningValue(current.settings?.tuning ?? DEFAULT_TUNING, context);
        const count = tuningMetaCache.get(tuningPath)?.count;
        const val = selectTonic.value === '' ? '' : clampTonicToCount(selectTonic.value, count);
        selectTonic.value = String(val);
        current.settings[settingKey] = val;
        if (context.updateCodePanel) context.updateCodePanel();
        if (context.propagateValuesFrom) context.propagateValuesFrom(current.id);
        if (context.autoSave) context.autoSave();
    });

    populateTonicOptions();

    const tonicCol = document.createElement('div');
    tonicCol.className = 'tonic-select';
    tonicCol.append(selectTonic);
    return tonicCol;
};

const renderSettingField = ({ node, setting, portIndex, connected, context }) => {
    const settingKey = setting.settingKey ?? setting.key;
    if (settingKey === 'tuning') {
        return buildTuningField({ node, setting, portIndex, connected, context });
    }
    if (settingKey === 'mode') {
        return buildModeField({ node, setting, portIndex, connected, context });
    }
    if (settingKey === 'tonic') {
        return buildTonicField({ node, setting, portIndex, connected, context });
    }
    if (settingKey === 'notes') {
        return createNotesUi({ node, setting, portIndex, connected, context });
    }
    return null;
};

const updateSettingFieldDom = ({ node, nodeEl, settingKey, portIndex, value, context }) => {
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

const getOutputValue = (node, portIndex) => {
    if (!node) return undefined;
    if (portIndex === 0) return node.settings?.tuning ?? '';
    if (portIndex === 1) return node.settings?.mode ?? '';
    if (portIndex === 2) return node.settings?.tonic === '' ? '' : String(node.settings?.tonic ?? '');
    if (portIndex === 3) return node.settings?.notes ?? DEFAULT_NOTATION;
    return node.value;
};

const ensureSettings = (node) => {
    if (node.settings.hideModeTonic === undefined) {
        node.settings.hideModeTonic = false;
    }
    if (node.settings.notes === undefined) {
        node.settings.notes = DEFAULT_NOTATION;
    }
    if (node.settings.noteRows === undefined) node.settings.noteRows = DEFAULT_NOTE_ROWS;
    if (node.settings.noteColHeight === undefined) node.settings.noteColHeight = DEFAULT_NOTE_COL_HEIGHT;
    if (node.settings.noteContainerWidth === undefined) node.settings.noteContainerWidth = DEFAULT_NOTE_CONTAINER_WIDTH;
    if (node.settings.noteButtonScale === undefined) node.settings.noteButtonScale = DEFAULT_NOTE_BUTTON_SCALE;
    if (node.settings.noteEditMode === undefined) node.settings.noteEditMode = true;
};

const resolveIncomingValue = (node, settingKey, incoming, context = {}) => {
    if (settingKey === 'tuning') return resolveTuningValue(incoming, context);
    if (settingKey === 'mode') return resolveModeValue(incoming, context);
    if (settingKey === 'tonic') return resolveTonicValue(incoming);
    if (settingKey === 'notes') return String(incoming ?? '');
    return incoming;
};

const valueAfterIncoming = (node, inputDef, incoming, fromValue) => {
    if (inputDef?.settingKey === 'mode') return undefined; // preserve tuning value
    if (inputDef?.settingKey === 'tuning') return incoming;
    return fromValue;
};

const afterRender = (node, _nodeEl, context = {}) => {
    applyModeTonicVisibility(node.id, context);
};

const init = (context = {}) => {
    getTuningList(context);
    getModeSets(context);
};

const NOTES_CONFIG = {
    type: 'notes',
    name: 'Notes',
    inputs: [],
    outputs: ['tuning', 'mode', 'tonic', 'notes'],
    settings: [
        { key: 'tuning', label: 'tuning', title: 'tuning' },
        { key: 'mode', label: 'mode', title: 'mode' },
        { key: 'tonic', label: 'tonic', title: 'tonic' },
        { key: 'notes', label: 'notes', title: 'Strudel notation' }
    ]
};

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
