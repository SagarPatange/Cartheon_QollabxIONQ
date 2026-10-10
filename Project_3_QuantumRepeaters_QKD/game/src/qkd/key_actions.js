/**
 * Decide what a key press means: one of the six send actions, or nothing.
 *
 * Pure; qkd_main.js passes in the key and where focus is.
 */

import { ACTION_KEYS } from "./qkd_constants.js";

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
    const isTyping = TEXT_ENTRY_TAGS.includes(focusedTagName);
    const hasModifier = keyEvent.ctrlKey || keyEvent.metaKey || keyEvent.altKey;
    if (isTyping || hasModifier || keyEvent.repeat) {
        return null;
    }
    const action = ACTION_KEYS[keyEvent.key.toLowerCase()];
    if (action === undefined) {
        return null;
    }
    return action;
}
