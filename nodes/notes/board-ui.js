import {
    DEFAULT_NOTATION,
    DEFAULT_NOTE_ROWS,
    DEFAULT_NOTE_COL_HEIGHT,
    DEFAULT_NOTE_CONTAINER_WIDTH,
    BUBBLE_SHIFT_UNIT,
    clampNumber
} from './constants.js';
import { alignOutputsToInputs } from './helpers.js';
import {
    computeFrequencyNotation,
    renderFreqExpression,
    renderNotesExpression,
    unwrapNotesExpression
} from './freq-compute.js';

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

const isDigit = (ch) => ch >= '0' && ch <= '9';
const MIN_NOTE_COL_HEIGHT = 10;
const BUTTON_SIZE_MULTIPLIER = 1.35;
const MAX_BUTTON_GROWTH_FACTOR = 2;
const FLOAT_ZOOM_THRESHOLD = 1.8;
const FLOAT_TOP_MARGIN = 10;
const FLOAT_BOTTOM_MARGIN = 10;
const FLOAT_RIGHT_MARGIN = 10;
const NOTES_REMOVE_ICON_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2.25" d="M6 12h12"/></svg>';

const createNotesUi = ({ node, setting, portIndex, connected, context }) => {
    const settings = node.settings ?? {};
    const root = document.createElement('div');
    root.className = 'notes-ui';
    root.dataset.portIndex = portIndex;
    const configuredRows =
        settings.rows !== undefined && settings.rows !== '' ? settings.rows : settings.noteRows;

    const state = {
        rows: clampNumber(configuredRows, 1, 32, DEFAULT_NOTE_ROWS),
        colHeight: clampNumber(settings.noteColHeight, MIN_NOTE_COL_HEIGHT, 600, DEFAULT_NOTE_COL_HEIGHT),
        containerWidth: clampNumber(settings.noteContainerWidth, 120, 1200, DEFAULT_NOTE_CONTAINER_WIDTH),
        buttonScale: Math.max(0.1, Number(context?.state?.scale) || 1),
        editMode: settings.noteEditMode !== false,
        notation: settings.notes ?? DEFAULT_NOTATION
    };

    const syncRowsControls = (isDisabled = connected) => {
        const nodeEl = root.closest('.node');
        if (!nodeEl) return;
        const field = nodeEl.querySelector('.setting-field[data-setting-key="rows"]');
        if (field && field !== document.activeElement) {
            field.value = String(state.rows);
        }
        const editToggle = nodeEl.querySelector('.rows-edit-toggle');
        if (editToggle) {
            editToggle.classList.toggle('active', state.editMode);
            editToggle.setAttribute('aria-pressed', String(state.editMode));
            editToggle.disabled = Boolean(isDisabled);
        }
    };

    const persistUiState = ({ propagateRows = false, autoSave = true } = {}) => {
        const current = context.state?.nodes?.get(node.id) ?? node;
        if (!current?.settings) return;
        const previousRows = clampNumber(
            current.settings.rows ?? current.settings.noteRows,
            1,
            32,
            state.rows
        );
        current.settings.noteRows = state.rows;
        current.settings.rows = state.rows;
        current.settings.noteColHeight = state.colHeight;
        current.settings.noteContainerWidth = state.containerWidth;
        current.settings.noteEditMode = state.editMode;
        syncRowsControls();
        if (propagateRows && previousRows !== state.rows && context.propagateValuesFrom) {
            context.propagateValuesFrom(current.id);
        }
        if (autoSave && context.autoSave) context.autoSave();
    };

    const boardShell = document.createElement('div');
    boardShell.className = 'notes-board-shell';

    const board = document.createElement('div');
    board.className = 'notes-board';
    boardShell.appendChild(board);

    const clearFloatingOffsets = () => {
        root.style.removeProperty('--notes-float-top-offset');
        root.style.removeProperty('--notes-float-bottom-offset');
        root.style.removeProperty('--notes-float-center-offset');
        root.style.removeProperty('--notes-edit-top-offset');
        root.style.removeProperty('--notes-edit-right-offset');
    };

    const updateFloatingControls = () => {
        if (!root.isConnected) return;
        const zoom = Math.max(0.001, Number(context?.state?.scale) || 1);
        const canvasRect = document.getElementById('canvas-container')?.getBoundingClientRect();
        const topLimit = (canvasRect?.top ?? 0) + FLOAT_TOP_MARGIN;
        const bottomLimit = (canvasRect?.bottom ?? window.innerHeight) - FLOAT_BOTTOM_MARGIN;
        const rightLimit = (canvasRect?.right ?? window.innerWidth) - FLOAT_RIGHT_MARGIN;
        const boardRect = boardShell.getBoundingClientRect();
        const rootRect = root.getBoundingClientRect();
        const visibleCenter = (topLimit + bottomLimit) / 2;
        const boardCenter = boardRect.top + boardRect.height / 2;
        const topOverflow = topLimit - boardRect.top;
        const bottomOverflow = boardRect.bottom - bottomLimit;
        const shouldFloat =
            !connected && zoom >= FLOAT_ZOOM_THRESHOLD && (topOverflow > 0 || bottomOverflow > 0);

        root.classList.toggle('notes-floating-controls', shouldFloat);
        if (!shouldFloat) {
            clearFloatingOffsets();
            return;
        }

        root.style.setProperty('--notes-float-top-offset', `${Math.max(0, topOverflow) / zoom}px`);
        root.style.setProperty('--notes-float-bottom-offset', `${Math.max(0, bottomOverflow) / zoom}px`);
        root.style.setProperty('--notes-float-center-offset', `${(visibleCenter - boardCenter) / zoom}px`);
        root.style.setProperty('--notes-edit-top-offset', `${Math.max(0, topLimit - rootRect.top) / zoom}px`);
        root.style.setProperty(
            '--notes-edit-right-offset',
            `${(rootRect.right - rightLimit) / zoom}px`
        );
    };

    const applyZoomButtonScale = () => {
        const zoom = Math.max(0.001, Number(context?.state?.scale) || 1);
        const next = Math.min(BUTTON_SIZE_MULTIPLIER / zoom, BUTTON_SIZE_MULTIPLIER * MAX_BUTTON_GROWTH_FACTOR);
        state.buttonScale = next;
        root.style.setProperty('--notes-btn-scale', `${next}`);
        root.style.setProperty('--notes-canvas-zoom', `${zoom}`);
        root.style.setProperty('--notes-grid-line-width', `${1 / zoom}px`);
        syncBubbleShifts(board, board, next);
        updateFloatingControls();
    };

    const applyNotesHeights = (colHeight, shellHeight = null) => {
        state.colHeight = colHeight;
        root.style.setProperty('--notes-col-height', `${colHeight}px`);
        if (shellHeight !== null) boardShell.style.height = `${shellHeight}px`;
    };

    const notationRow = document.createElement('div');
    notationRow.className = 'notes-notation-row';
    const notationInput = document.createElement('input');
    notationInput.type = 'text';
    notationInput.className = 'notes-notation setting-field';
    notationInput.value = renderNotesExpression(state.notation);
    const notationCopyInput = document.createElement('input');
    notationCopyInput.type = 'text';
    notationCopyInput.className = 'notes-notation-copy setting-field';
    notationCopyInput.value = '';
    notationCopyInput.readOnly = true;
    notationCopyInput.tabIndex = -1;
    const getCurrentNode = () => context.state?.nodes?.get(node.id) ?? node;
    const isFreqEnabled = (current = getCurrentNode()) => current?.settings?.freqEnabled !== false;
    const refreshFrequencyCopy = () => {
        const current = getCurrentNode();
        if (!isFreqEnabled(current)) {
            notationCopyInput.value = '';
            return;
        }
        notationCopyInput.value = renderFreqExpression(
            computeFrequencyNotation(current, context)
        );
    };
    const freqToggleWrap = document.createElement('label');
    freqToggleWrap.className = 'mode-tonic-toggle freq-output-toggle';
    freqToggleWrap.addEventListener('mousedown', (e) => e.stopPropagation());
    freqToggleWrap.addEventListener('click', (e) => e.stopPropagation());
    const freqToggle = document.createElement('input');
    freqToggle.type = 'checkbox';
    freqToggle.checked = isFreqEnabled();
    freqToggle.setAttribute('aria-label', 'Enable freq output');
    freqToggle.addEventListener('mousedown', (e) => e.stopPropagation());
    freqToggle.addEventListener('click', (e) => e.stopPropagation());
    freqToggle.addEventListener('change', () => {
        const current = getCurrentNode();
        if (!current?.settings) return;
        current.settings.freqEnabled = freqToggle.checked;
        refreshFrequencyCopy();
        if (context.propagateValuesFrom) context.propagateValuesFrom(current.id);
        if (context.updateCodePanel) context.updateCodePanel();
        if (context.autoSave) context.autoSave();
    });
    const freqToggleText = document.createElement('span');
    freqToggleText.textContent = 'freq';
    freqToggleWrap.append(freqToggle, freqToggleText);
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
        const rawNotation = unwrapNotesExpression(notationInput.value);
        const parsed = parseNotation(rawNotation);
        if (!parsed.ok) {
            notationInput.classList.add('invalid');
            return;
        }
        notationInput.classList.remove('invalid');
        const current = getCurrentNode();
        if (current?.settings) {
            const previewNode = {
                ...current,
                settings: { ...current.settings, [setting.settingKey]: rawNotation }
            };
            notationCopyInput.value = isFreqEnabled(current)
                ? renderFreqExpression(computeFrequencyNotation(previewNode, context))
                : '';
        }
        applyParsedBoard(parsed.columns, true, { preserveRows: true });
    });
    notationRow.append(notationInput, notationCopyInput, freqToggleWrap);

    root.append(boardShell, notationRow);

    const stopPointer = (el) => {
        el.addEventListener('mousedown', (e) => e.stopPropagation());
        el.addEventListener('click', (e) => e.stopPropagation());
    };
    [boardShell, notationRow].forEach(stopPointer);

    const setEditMode = (on) => {
        state.editMode = on;
        root.classList.toggle('edit-mode', on);
        syncRowsControls();
        updateFloatingControls();
        persistUiState();
        return state.editMode;
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
        removeBtn.innerHTML = NOTES_REMOVE_ICON_SVG;
        removeBtn.setAttribute('aria-label', 'Remove column');
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
            '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false" style="transform: scaleY(-1);"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M6.5 8.25a2.75 2.75 0 1 0 0-5.5a2.75 2.75 0 0 0 0 5.5m0 0V10a2 2 0 0 0 2 2h3m6-3.75a2.75 2.75 0 1 0 0-5.5a2.75 2.75 0 0 0 0 5.5m0 0V10a2 2 0 0 1-2 2h-4m0 0v3.75m0 0a2.75 2.75 0 1 0 0 5.5a2.75 2.75 0 0 0 0-5.5"/></svg>';
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
        const notationText = skipBoard
            ? unwrapNotesExpression(notationInput.value)
            : `<${cols.join(' ')}>`;
        notationInput.classList.remove('invalid');
        notationInput.value = renderNotesExpression(notationText);
        state.notation = notationText;
        const current = getCurrentNode();
        if (current?.settings) {
            current.settings[setting.settingKey] = notationText;
            if (setting.settingKey === 'notes') current.value = current.value ?? notationText;
            refreshFrequencyCopy();
            if (context.propagateValuesFrom) context.propagateValuesFrom(current.id);
            if (context.updateCodePanel) context.updateCodePanel();
            if (context.autoSave) context.autoSave();
        }
    };

    const parseNotation = (raw) => {
        const src = raw.trim();
        let i = 0;

        const skipWs = () => {
            while (i < src.length && /\s/.test(src[i])) i += 1;
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

    const applyParsedBoard = (columnsAst, skipNotationCommit = false, options = {}) => {
        const required = Math.max(1, neededRows(columnsAst));
        const nextRows = options.preserveRows ? Math.max(state.rows, required) : required;
        state.rows = nextRows;
        persistUiState({ autoSave: false });

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

    applyNotesHeights(state.colHeight);
    applyZoomButtonScale();

    createBoardBubble(board, 'start');
    createBoardBubble(board, 'end');
    board.appendChild(createColumn(board));
    setEditMode(state.editMode);
    syncBubbleShifts(board, board, state.buttonScale);
    alignEndBubble(board);

    const parsedInitial = parseNotation(state.notation);
    if (parsedInitial.ok) {
        applyParsedBoard(parsedInitial.columns, true, { preserveRows: true });
    } else {
        updateNotation();
    }
    refreshFrequencyCopy();

    const updateAutoSize = () => {
        const nodeEl = root.closest('.node');
        if (!nodeEl) return;
        applyZoomButtonScale();
        const nodeRect = nodeEl.getBoundingClientRect();
        const shellTop = boardShell.getBoundingClientRect().top;
        const notationHeight = notationRow.getBoundingClientRect().height;
        const zoom = Math.max(0.001, Number(context?.state?.scale) || 1);
        const gap = parseFloat(getComputedStyle(root).rowGap || '0');
        const paddingBottom = parseFloat(getComputedStyle(nodeEl).paddingBottom || '0');
        const shellStyles = getComputedStyle(boardShell);
        const shellVerticalChrome =
            parseFloat(shellStyles.paddingTop || '0') +
            parseFloat(shellStyles.paddingBottom || '0') +
            parseFloat(shellStyles.borderTopWidth || '0') +
            parseFloat(shellStyles.borderBottomWidth || '0');
        const notesPortRow = root.closest('.port-container.setting-port[data-setting-key="notes"]');
        let belowUiHeight = 0;
        if (notesPortRow?.parentElement) {
            const inputsRect = notesPortRow.parentElement.getBoundingClientRect();
            const notesRowRect = notesPortRow.getBoundingClientRect();
            belowUiHeight = Math.max(0, (inputsRect.bottom - notesRowRect.bottom) / zoom);
        }
        const available = Math.max(
            MIN_NOTE_COL_HEIGHT,
            (nodeRect.bottom - shellTop - notationHeight) / zoom - gap - paddingBottom - belowUiHeight
        );
        const colHeight = Math.max(MIN_NOTE_COL_HEIGHT, available - shellVerticalChrome);
        applyNotesHeights(colHeight, available);
        boardShell.style.maxWidth = '100%';
        alignEndBubble(board);
        updateFloatingControls();
        alignOutputsToInputs(nodeEl);
    };

    const nodeObserver =
        typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => updateAutoSize()) : null;
    const hasFixedNodeHeight = () => {
        const current = context.state?.nodes?.get(node.id) ?? node;
        return Number.isFinite(Number(current?.h));
    };
    const initializeNodeHeight = () => {
        const current = context.state?.nodes?.get(node.id) ?? node;
        if (!current || Number.isFinite(Number(current.h))) return;
        const nodeEl = root.closest('.node');
        if (!nodeEl) return;
        const zoom = Math.max(0.001, Number(context?.state?.scale) || 1);
        const measuredHeight = nodeEl.getBoundingClientRect().height / zoom;
        if (!Number.isFinite(measuredHeight) || measuredHeight <= 0) return;
        current.h = measuredHeight;
        nodeEl.style.height = `${measuredHeight}px`;
    };
    const observeNode = () => {
        if (!nodeObserver) return;
        nodeObserver.disconnect();
        const nodeEl = root.closest('.node');
        if (nodeEl && hasFixedNodeHeight()) nodeObserver.observe(nodeEl);
    };
    observeNode();

    window.addEventListener('resize', updateAutoSize);
    requestAnimationFrame(() => {
        initializeNodeHeight();
        observeNode();
        updateAutoSize();
    });

    const setDisabled = (isDisabled) => {
        root.classList.toggle('notes-disabled', isDisabled);
        [notationInput, notationCopyInput].forEach((el) => {
            el.disabled = isDisabled;
        });
        boardShell.style.pointerEvents = isDisabled ? 'none' : '';
        syncRowsControls(isDisabled);
        updateFloatingControls();
    };

    setDisabled(connected);

    const api = {
        setEditMode: (on) => setEditMode(Boolean(on)),
        toggleEditMode: () => setEditMode(!state.editMode),
        getEditMode: () => state.editMode,
        setRows: (value) => {
            const next = clampNumber(value, 1, 32, state.rows);
            if (next === state.rows) return;
            state.rows = next;
            persistUiState({ autoSave: false });
            applyRowChange();
            setDisabled(connected);
        },
        setNotation: (text) => {
            const normalizedText = unwrapNotesExpression(String(text ?? DEFAULT_NOTATION));
            const parsed = parseNotation(normalizedText);
            if (!parsed.ok) return;
            state.notation = normalizedText;
            notationInput.value = renderNotesExpression(normalizedText);
            applyParsedBoard(parsed.columns, true, { preserveRows: true });
            setDisabled(connected);
        },
        refreshFrequencyCopy: () => {
            refreshFrequencyCopy();
        },
        root
    };

    notesUiInstances.set(node.id, api);
    return root;
};

export { createNotesUi, notesUiInstances, alignEndBubble, syncBubbleShifts };
