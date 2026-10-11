/**
 * Decide what a key press means: one of the six send actions, a swap tutorial command, or nothing.
 *
 * Pure; qkd_main.js passes in the key and where focus is.
 */

import { ACTION_KEYS, TUTORIAL_KEYS } from "./qkd_constants.js";

// Typing in these must never fire an action.
const TEXT_ENTRY_TAGS = ["INPUT", "TEXTAREA", "SELECT"];


/**
 * The action for a key press, or null when the key is not an action key or focus is in a text box.
 *
 * @param {{key: string, ctrlKey: boolean, metaKey: boolean, altKey: boolean, repeat: boolean}} keyEvent
 * @param {string} focusedTagName - tagName of the focused element, e.g. "BODY" or "INPUT".
 * @returns {{sender: string, kind: string} | null}
 */
export function findKeyAction(keyEvent, focusedTagName) {
    if (isKeyIgnored(keyEvent, focusedTagName)) {
        return null;
    }
    const action = ACTION_KEYS[keyEvent.key.toLowerCase()];
    if (action === undefined) {
        return null;
    }
    return action;
}


/**
 * The swap tutorial command for a key press ("next", "new-run", "skip" or "replay"), or null for any other key or
 * when focus is in a text box.
 *
 * @param {{key: string, ctrlKey: boolean, metaKey: boolean, altKey: boolean, repeat: boolean}} keyEvent
 * @param {string} focusedTagName
 * @returns {string | null}
 */
export function findTutorialCommand(keyEvent, focusedTagName) {
    if (isKeyIgnored(keyEvent, focusedTagName)) {
        return null;
    }
    const key = keyEvent.key.length === 1 ? keyEvent.key.toLowerCase() : keyEvent.key;
    const command = TUTORIAL_KEYS[key];
    if (command === undefined) {
        return null;
    }
    return command;
}


/**
 * Typing, a held-down key and shortcuts with a modifier never fire anything.
 */
function isKeyIgnored(keyEvent, focusedTagName) {
    const isTyping = TEXT_ENTRY_TAGS.includes(focusedTagName);
    const hasModifier = keyEvent.ctrlKey || keyEvent.metaKey || keyEvent.altKey;
    return isTyping || hasModifier || keyEvent.repeat;
}
