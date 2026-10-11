/**
 * Fixed facts and tunable numbers for the messaging world. The simulation itself runs in the Python backend
 * (backend/src/quantum_bros); these numbers only set up the page and its requests.
 */

// The repeater chain: Alice and Charlie at the ends, Bob swapping in the middle. Must match NODE_NAMES in
// backend/src/quantum_bros/protocol/qre_cec.py.
export const QKD_TOWER_NAMES = ["Alice", "Bob", "Charlie"];

export const MARIO = "mario";
// Peach stands at Charlie's end. Her sender id is still "luigi", the value the backend's API expects.
export const LUIGI = "luigi";

export const CLASSICAL = "classical";
export const ENCRYPTED = "encrypted";
export const QUANTUM = "quantum";

// Keys trigger actions only; they never move the plumbers. Mario's keys are on the left of the keyboard.
export const ACTION_KEYS = {
    q: { sender: MARIO, kind: CLASSICAL },
    w: { sender: MARIO, kind: ENCRYPTED },
    e: { sender: MARIO, kind: QUANTUM },
    i: { sender: LUIGI, kind: CLASSICAL },
    o: { sender: LUIGI, kind: ENCRYPTED },
    p: { sender: LUIGI, kind: QUANTUM },
};

// The swap tutorial's keys: Space plays the next step, R starts a new run, Esc skips to the messages, and T (once the
// messages are on) plays the tutorial again.
export const NEXT_STEP = "next";
export const NEW_RUN = "new-run";
export const SKIP_TUTORIAL = "skip";
export const REPLAY_TUTORIAL = "replay";
export const TUTORIAL_KEYS = {
    " ": NEXT_STEP,
    r: NEW_RUN,
    Escape: SKIP_TUTORIAL,
    t: REPLAY_TUTORIAL,
};


// Must match MAX_MESSAGE_BYTES in backend/src/quantum_bros/protocol/messaging.py.
export const MAX_MESSAGE_BYTES = 24;


// Per-gate error rate p for every error source. Above about 1% the Steane chain fails most pairs, so the slider
// stops at 2% and moves in 0.01% steps (200 of them), where the interesting range is.
export const DEFAULT_PHYSICAL_ERROR = 0.001;
export const MAX_PHYSICAL_ERROR = 0.02;
export const PHYSICAL_ERROR_STEP = 0.0001;
// 0.01% steps need two decimals in the label ("0.25%").
export const PHYSICAL_ERROR_DECIMALS = 2;

// Share of photons a turtle taps when the turtles are on.
export const DEFAULT_TAP_FRACTION = 1;
export const TAP_FRACTION_STEP = 0.05;

export const DEFAULT_QKD_SEED = 1985;

// Each message step stays up long enough to read its card in the sky.
export const STEP_DELAY_MS = 2600;

export const SEND_API_PATH = "/api/send";
export const SWAP_TUTORIAL_API_PATH = "/api/repetition-swap";
