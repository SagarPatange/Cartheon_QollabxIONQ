/**
 * Fixed facts and tunable numbers for the messaging world. The simulation itself runs in the Python backend
 * (backend/src/quantum_bros); these numbers only set up the page and its requests.
 */

// The paper's Fig. 2 chain: Alice and David at the ends, Bob and Charlie swapping in the middle.
export const QKD_TOWER_NAMES = ["Alice", "Bob", "Charlie", "David"];

export const MARIO = "mario";
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


// Must match MAX_MESSAGE_BYTES in backend/src/quantum_bros/protocol/messaging.py.
export const MAX_MESSAGE_BYTES = 24;


// Per-gate error rate p for every error source. Above about 1% the Steane chain fails most pairs.
export const DEFAULT_PHYSICAL_ERROR = 0.001;
export const MAX_PHYSICAL_ERROR = 0.1;
export const PHYSICAL_ERROR_STEP = 0.001;

// Share of photons a turtle taps when the turtles are on.
export const DEFAULT_TAP_FRACTION = 1;
export const TAP_FRACTION_STEP = 0.05;

export const DEFAULT_QKD_SEED = 1985;

export const STEP_DELAY_MS = 1500;

export const SEND_API_PATH = "/api/send";
