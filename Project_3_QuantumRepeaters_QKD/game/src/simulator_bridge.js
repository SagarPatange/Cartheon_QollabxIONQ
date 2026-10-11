/**
 * One way to reach the Python simulator from any page.
 *
 * On Qollab there is no HTTP server: the build's main.js sets globalThis.qollabSimulator, which calls the Python
 * module quantum_bros.api in the browser and returns the parsed answer (or throws Error(message)). Everywhere else
 * (npm run backend), we POST JSON to the FastAPI server as before.
 */


/**
 * The default way to read a fetch Response: a non-2xx answer is an Error, otherwise the JSON body.
 *
 * @param {Response} response
 * @returns {Promise<object>}
 */
async function readJsonOrThrow(response) {
    if (!response.ok) {
        throw new Error(`the simulator answered ${response.status}`);
    }
    return response.json();
}


/**
 * Call one simulator endpoint and return its JSON answer.
 *
 * @param {string} apiPath - e.g. "/api/steane-block".
 * @param {object} body - the request JSON.
 * @param {(response: Response) => Promise<object>} [readResponse] - how to turn the HTTP answer into a result
 *     (and which Error to throw); only used when talking to the HTTP server.
 * @returns {Promise<object>}
 * @throws {Error} when the simulator is unreachable or refuses the request. On Qollab the Error has fromQollab = true.
 */
export async function callSimulator(apiPath, body, readResponse = readJsonOrThrow) {
    if (typeof globalThis.qollabSimulator === "function") {
        try {
            return await globalThis.qollabSimulator(apiPath, body);
        } catch (error) {
            const wrapped = error instanceof Error ? error : new Error(String(error));
            wrapped.fromQollab = true;
            throw wrapped;
        }
    }
    const response = await fetch(apiPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    return readResponse(response);
}
