/**
 * Pixel-art sprites drawn as SVG squares, one square per character in a pixel map.
 *
 * Each sprite is a list of equal-length rows. A "." is transparent; any other character is a key into the sprite's
 * palette. Reads and writes nothing; drawSprite returns a new <svg> element.
 */

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const TRANSPARENT_PIXEL = ".";

// Small plumber: cap and shirt (R), hair, moustache and shoes (B), skin (S), overalls (O), buttons (Y).
const PLUMBER_ROWS = [
    "...RRRRR....",
    "..RRRRRRRRR.",
    "..BBBSSBS...",
    ".BSBSSSBSSS.",
    ".BSBBSSSBSSS",
    ".BBSSSSBBBB.",
    "...SSSSSSS..",
    "..RRORRR....",
    ".RRRORRORRR.",
    "RRRROOOORRRR",
    "SSROYOOYORSS",
    "SSSOOOOOOSSS",
    "SSOOOOOOOOSS",
    "..OOO..OOO..",
    ".BBB....BBB.",
    "BBBB....BBBB",
];

// The plumber mid-stride: legs together and arms tucked in. Alternating it with PLUMBER_ROWS makes him walk.
const PLUMBER_STRIDE_ROWS = [
    ...PLUMBER_ROWS.slice(0, 10),
    ".SSROYOOYOR.",
    ".SSOOOOOOOR.",
    "..SOOOOOOO..",
    "...OOOOOO...",
    "...BBB.BBB..",
    "..BBBB.BBBB.",
];

const PLUMBER_SHARED_COLORS = { B: "#6b3a12", S: "#fcb08c", O: "#2038ec", Y: "#f8d820" };

export const MARIO_SPRITE = {
    rows: PLUMBER_ROWS,
    palette: { ...PLUMBER_SHARED_COLORS, R: "#d82800" },
};

export const MARIO_STRIDE_SPRITE = {
    rows: PLUMBER_STRIDE_ROWS,
    palette: MARIO_SPRITE.palette,
};

// Luigi is the same plumber in green.
export const LUIGI_SPRITE = {
    rows: PLUMBER_ROWS,
    palette: { ...PLUMBER_SHARED_COLORS, R: "#00a800" },
};

// A chunky arrow pointing right, for drawn arrow keys. Rotate it with CSS for the other directions.
export const ARROW_SPRITE = {
    rows: [
        "...K...",
        "...KK..",
        "KKKKKK.",
        "KKKKKKK",
        "KKKKKK.",
        "...KK..",
        "...K...",
    ],
    palette: { K: "#000000" },
};

// A telecom tower that carries the QKD fiber: red beacon (R), mast and legs (K), dish (W), steel bracing (G).
// Row 8 is the crossarm the fiber hangs from (TELECOM_TOWER_CROSSARM_ROW).
export const TELECOM_TOWER_CROSSARM_ROW = 8;
export const TELECOM_TOWER_SPRITE = {
    rows: [
        ".......R.......",
        "......RRR......",
        ".......K.......",
        "..WWW..K.......",
        ".WWWWW.K.......",
        ".WWWWWKK.......",
        ".WWWWW.K.......",
        "..WWW..K.......",
        "KKKKKKKKKKKKKKK",
        "K.....KKK.....K",
        "......KGK......",
        "......KGK......",
        ".....KG.GK.....",
        ".....K.G.K.....",
        ".....KG.GK.....",
        "....KG...GK....",
        "....K.G.G.K....",
        "....K..G..K....",
        "...KK.G.G.KK...",
        "...K.G...G.K...",
        "...KG.....GK...",
        "..KG.......GK..",
        "..K.G.....G.K..",
        "..K..G...G..K..",
        ".KK...G.G...KK.",
        ".K.....G.....K.",
        "KKKKKKKKKKKKKKK",
    ],
    palette: { R: "#d82800", K: "#000000", W: "#fcfcfc", G: "#a4a4a4" },
};

// ---------- Quantum decorations for the world map ----------

// Peach's castle: a stone keep between two towers, brick joints (M), a wooden gate (D), and on the keep's pole the
// quantum flag, a white pennant with a blue ψ (B).
export const PEACH_CASTLE_SPRITE = {
    rows: [
        "...........KKKKKKKKK....",
        "...........KWWWWWWWWK...",
        "...........KWBWBWBWWWK..",
        "...........KWBWBWBWWWWK.",
        "...........KWWBBBWWWWK..",
        "...........KWWWBWWWWK...",
        "...........KKKKKKKKK....",
        "...........K............",
        "...........K............",
        "......KKK.KKKK.KKK......",
        "......KGK.KGGK.KGK......",
        "......KGKKKGGKKKGK......",
        "K.K.K.KGGGGGGGGGGK.K.K.K",
        "KKKKK.KGGGGKKGGGGK.KKKKK",
        "KGGGK.KMMMMKKMMMMK.KGGGK",
        "KGKGK.KGGGGGGGGGGK.KGKGK",
        "KGKGK.KGGMGGGGMGGK.KGKGK",
        "KMMMMKKMMMMMMMMMMKKMMMMK",
        "KGGMGGGMGGGMGGGMGGGMGGGK",
        "KGGMGGGMGGGMGGGMGGGMGGGK",
        "KMMMMMMMMMMMMMMMMMMMMMMK",
        "KGMGGGMGGGKKKKGGGMGGGMGK",
        "KGMGGGMGGKDDDDKGGMGGGMGK",
        "KGMGGGMGKDDDDDDKGMGGGMGK",
        "KMMMMMMMKDDDDDDKMMMMMMMK",
        "KGMGGGMGKDDDDDDKGMGGGMGK",
        "KGMGGGMGKDDDDDDKGMGGGMGK",
        "KKKKKKKKKKKKKKKKKKKKKKKK",
    ],
    palette: { K: "#000000", G: "#bcbcbc", M: "#7c7c7c", W: "#fcfcfc", B: "#0058f8", D: "#6b3a12" },
};

// An ion trap: gold rail electrodes (Y) above and below, end caps, and three ions (W in a cyan glow, C) in a row.
export const ION_TRAP_SPRITE = {
    rows: [
        "KKKKKKKKKKKKKKKKKKKKKKKK",
        "KYYYYYYYYYYYYYYYYYYYYYYK",
        "KKKKKKKKKKKKKKKKKKKKKKKK",
        "........................",
        "KK...CC....CC....CC...KK",
        "KYK.CWWC..CWWC..CWWC.KYK",
        "KYK.CWWC..CWWC..CWWC.KYK",
        "KK...CC....CC....CC...KK",
        "........................",
        "KKKKKKKKKKKKKKKKKKKKKKKK",
        "KYYYYYYYYYYYYYYYYYYYYYYK",
        "KKKKKKKKKKKKKKKKKKKKKKKK",
    ],
    palette: { K: "#000000", Y: "#f8b800", C: "#3cbcfc", W: "#fcfcfc" },
};

// An NV center: a diamond (C, with white glints W) holding one nitrogen atom (R) next to one vacancy (V).
export const NV_CENTER_SPRITE = {
    rows: [
        "...KKKKKKKKK...",
        "..KCCWCCCWCCK..",
        ".KCCCCCCCCCCCK.",
        "KKKKKKKKKKKKKKK",
        ".KCCCRCCCCCCCK.",
        "..KCCCCCVCCCK..",
        "...KCCCCCCCK...",
        "....KCCCCCK....",
        ".....KCCCK.....",
        "......KCK......",
        ".......K.......",
    ],
    palette: { K: "#000000", C: "#a4e4fc", W: "#fcfcfc", R: "#d82800", V: "#202020" },
};

// An infinite square well: two endless brick walls (B) and the n = 2 wavefunction (Q) bouncing between them.
export const INFINITE_WELL_SPRITE = {
    rows: [
        "KKK....................KKK",
        "KBK....................KBK",
        "KBK....................KBK",
        "KBK....................KBK",
        "KKK....QQQ.............KKK",
        "KBK..QQQ.QQQ...........KBK",
        "KBK..Q.....Q...........KBK",
        "KBK.QQ.....QQ..........KBK",
        "KKKQQ.......QQ.........KKK",
        "KBK..........Q.........KBK",
        "KBK..........QQ.......QKBK",
        "KBK...........QQ.....QQKBK",
        "KKK............Q.....Q.KKK",
        "KBK............QQQ.QQQ.KBK",
        "KBK..............QQQ...KBK",
        "KBK....................KBK",
        "KKK....................KKK",
        "KKKKKKKKKKKKKKKKKKKKKKKKKK",
    ],
    palette: { K: "#000000", B: "#c84c0c", Q: "#fcfcfc" },
};

// Schrödinger's cat peeking out of its box: one eye open (alive, W), one eye an X (dead). Grey fur (G), pink nose
// (P), a cardboard box (B) with a question mark on it.
export const SCHRODINGER_CAT_SPRITE = {
    rows: [
        "...KK....KK.....",
        "...KGK..KGK.....",
        "..KGGGKKGGGK....",
        "..KGGGGGGGGK....",
        "..KGWKGKGKGK....",
        "..KGWKGGKGGK....",
        "..KGGGGKGKGK....",
        "..KGGGPPGGGK....",
        "KKKKKKKKKKKKKKKK",
        "KBBBBBBBBBBBBBBK",
        "KBBBBBKKKBBBBBBK",
        "KBBBBBBBKBBBBBBK",
        "KBBBBBBKBBBBBBBK",
        "KBBBBBBBBBBBBBBK",
        "KBBBBBBKBBBBBBBK",
        "KKKKKKKKKKKKKKKK",
    ],
    palette: { K: "#000000", G: "#a4a4a4", W: "#fcfcfc", P: "#fc74b4", B: "#c89058" },
};

// An electric Loch Ness monster: only its head and long neck, two humps and the tip of its tail break the surface
// (foam W); the rest of its long body is hidden under the water between them, where ripples show. Purple scales (C)
// with lightning (Y) crackling off them.
export const ELECTRIC_NESSIE_SPRITE = {
    rows: [
        "..KKKKK.................................................................",
        ".KCCCCCK....Y...............Y....................Y......................",
        "KCKCCCCCK..Y...............YY...................YY..................Y...",
        "KCCCCCCCK...Y.............YY...................YY..................Y....",
        ".KKKCCCK...Y...............YY...................YY......................",
        "...KCCCK..................YY...................YY.......................",
        "...KCCCK..............................................................K.",
        "...KCCCK................KKKKKKK..............KKKKKKK.................KCK",
        "...KCCCK...............KCCCCCCCK............KCCCCCCCK...............KCK.",
        "...KCCCK..............KCCCYCCCCCK..........KCCCYCCCCCK............KKCK..",
        "..KCCCCCK.............KCCCCCCCCCK..........KCCCCCCCCCK...........KCCK...",
        "WWWWWWWWWWW...WW.WW.WWWWWWWWWWWWWWW...WW.WWWWWWWWWWWWWWW...WW..WWWWWWWW.",
    ],
    palette: { K: "#000000", C: "#9c3cfc", Y: "#f8d820", W: "#fcfcfc" },
};

// A Bloch sphere with its spin arrow (R) pointing up. Two of them, one turned over, make the entangled pair.
export const BLOCH_SPHERE_SPRITE = {
    rows: [
        "....KKKKK....",
        "...KWWWWWK...",
        "..KWWRRRWWK..",
        ".KWWRWRWRWWK.",
        "KWWWWWRWWWWWK",
        "KWWWWWRWWWWWK",
        "KSWSWSKSWSWSK",
        "KWWWWWWWWWWWK",
        "KWWWWWWWWWWWK",
        ".KWWWWWWWWWK.",
        "..KWWWWWWWK..",
        "...KWWWWWK...",
        "....KKKKK....",
    ],
    palette: { K: "#000000", W: "#fcfcfc", R: "#d82800", S: "#a4a4a4" },
};

// A flying qubit: a little Bloch sphere (outline K, white W, dashed equator S, red spin arrow R) on white wings.
// Two frames, wings up and wings down, swapped by CSS so it flaps.
const FLYING_QUBIT_PALETTE = { K: "#000000", W: "#fcfcfc", S: "#a4a4a4", R: "#d82800" };

export const QUBIT_BIRD_UP_SPRITE = {
    rows: [
        "W...............W",
        "WW.............WW",
        ".WW...KKKKK...WW.",
        "..WW.KWWRWWK.WW..",
        "...WKWWRRRWWKW...",
        "....KWWWRWWWK....",
        "....KSWSKSWSK....",
        "....KWWWWWWWK....",
        "....KWWWWWWWK....",
        ".....KWWWWWK.....",
        "......KKKKK......",
    ],
    palette: FLYING_QUBIT_PALETTE,
};

export const QUBIT_BIRD_DOWN_SPRITE = {
    rows: [
        ".................",
        ".................",
        "......KKKKK......",
        ".....KWWRWWK.....",
        "....KWWRRRWWK....",
        "....KWWWRWWWK....",
        "..WWKSWSKSWSKWW..",
        ".WW.KWWWWWWWK.WW.",
        "WW..KWWWWWWWK..WW",
        ".....KWWWWWK.....",
        "......KKKKK......",
    ],
    palette: FLYING_QUBIT_PALETTE,
};

// A turtle riding a cloud: head and arms (Y), eye (K), shell (G), shell spots (W), cloud (C), cloud shade (D).
export const CLOUD_TURTLE_SPRITE = {
    rows: [
        "......YYYY......",
        ".....YYKYYY.....",
        ".....YYYYYY.....",
        "......YYYY......",
        "....GGGGGGGG....",
        "...GGWGGGGWGG...",
        "..YGGGGGGGGGGY..",
        "..CCCCCCCCCCCC..",
        ".CCCCCCCCCCCCCC.",
        "CCCCCCCCCCCCCCCC",
        "CCDCCCCCCCCCCDCC",
        ".CCDDCCCCCCDDCC.",
        "..CCCCDDDDCCCC..",
        "....CCCCCCCC....",
    ],
    palette: { Y: "#f8d820", K: "#000000", G: "#00a800", W: "#fcfcfc", C: "#fcfcfc", D: "#a4e4fc" },
};

// Princess Peach: crown (Y), hair (H), skin (S), eyes (K), lips (R), dress (P), dress trim (W), shoes (B).
export const PEACH_SPRITE = {
    rows: [
        "....Y.Y.Y...",
        "....YYYYY...",
        "...HHHHHHH..",
        "..HHSSSSSHH.",
        "..HSKSSKSSH.",
        "..HSSSSSSSH.",
        "..HHSSRSSHH.",
        "..HHHSSSHHH.",
        "...PPPPPPP..",
        "..SPPPPPPPS.",
        "..SPPWWWPPS.",
        "...PPPPPPP..",
        "..PPPPPPPPP.",
        ".PPPPPPPPPPP",
        ".PPPPPPPPPPP",
        "..BB....BB..",
    ],
    palette: {
        Y: "#f8d820", H: "#fcd860", S: "#fcb08c", K: "#000000", R: "#d82800", P: "#fc74b4", W: "#fcfcfc",
        B: "#d82800",
    },
};

// Toad: mushroom cap (W with red spots R), face (S), eyes (K), vest (B), shoes (N).
export const TOAD_SPRITE = {
    rows: [
        "...WWWWWW...",
        ".WWRRWWRRWW.",
        "WWRRRWWRRRWW",
        "WWRRWWWWRRWW",
        "WWWWWWWWWWWW",
        ".WWWWWWWWWW.",
        "..SSSSSSSS..",
        "..SKSSSSKS..",
        "..SKSSSSKS..",
        "..SSSSSSSS..",
        "...SSSSSS...",
        "..BBBBBBBB..",
        ".SBWWWWWWBS.",
        "..BWWWWWWB..",
        "...WW..WW...",
        "..NNN..NNN..",
    ],
    palette: { W: "#fcfcfc", R: "#d82800", S: "#fcb08c", K: "#000000", B: "#2038ec", N: "#6b3a12" },
};

// Toad's mushroom hut on the map: red cap with white spots (R, W), eave (K), walls (T), windows and door (K).
export const MUSHROOM_HUT_SPRITE = {
    rows: [
        "......RRRR......",
        "....RRRRRRRR....",
        "...RRWWRRRRRR...",
        "..RRWWWWRRWWRR..",
        ".RRRRWWRRRWWWWR.",
        ".RRRRRRRRRRWWRR.",
        "RRWWRRRRRRRRRRRR",
        "RWWWWRRRRRWWRRRR",
        "KKKKKKKKKKKKKKKK",
        "..TTTTTTTTTTTT..",
        "..TTKKTTTTKKTT..",
        "..TTKKTTTTKKTT..",
        "..TTTTTKKTTTTT..",
        "..TTTTTKKTTTTT..",
        "..TTTTTKKTTTTT..",
        "..KKKKKKKKKKKK..",
    ],
    palette: { R: "#d82800", W: "#fcfcfc", K: "#000000", T: "#fcd8a8" },
};

// Peach's castle: pink flag (P), grey stone (G), windows (K), door (D).
export const CASTLE_SPRITE = {
    rows: [
        "........P.......",
        "........PPP.....",
        "........P.......",
        "..G.G..GGG..G.G.",
        "..GGG..GGG..GGG.",
        "..GGG..GKG..GGG.",
        "..GGGGGGGGGGGGG.",
        "..GKGGGGGGGGGKG.",
        "..GGGGGGGGGGGGG.",
        "..GGGGGDDDGGGGG.",
        "..GGGGDDDDDGGGG.",
        "..GGGGDDDDDGGGG.",
        "..GGGGDDDDDGGGG.",
    ],
    palette: { P: "#fc74b4", G: "#bcbcbc", K: "#000000", D: "#6b3a12" },
};


/**
 * Draw a sprite as an SVG, scaled so each map character becomes pixelSize × pixelSize screen pixels.
 *
 * @param {{rows: string[], palette: Object<string, string>}} sprite
 * @param {number} pixelSize - screen pixels per sprite pixel.
 * @param {string} className - class for the <svg>.
 * @returns {SVGSVGElement}
 */
export function drawSprite(sprite, pixelSize, className) {
    checkSprite(sprite);
    const widthInPixels = sprite.rows[0].length;
    const heightInPixels = sprite.rows.length;

    const svgElement = document.createElementNS(SVG_NAMESPACE, "svg");
    svgElement.setAttribute("viewBox", `0 0 ${widthInPixels} ${heightInPixels}`);
    svgElement.setAttribute("width", String(widthInPixels * pixelSize));
    svgElement.setAttribute("height", String(heightInPixels * pixelSize));
    svgElement.setAttribute("shape-rendering", "crispEdges");
    svgElement.setAttribute("aria-hidden", "true");
    svgElement.classList.add(className);

    for (let y = 0; y < heightInPixels; y++) {
        for (let x = 0; x < widthInPixels; x++) {
            const colorKey = sprite.rows[y][x];
            if (colorKey !== TRANSPARENT_PIXEL) {
                svgElement.append(createPixel(x, y, sprite.palette[colorKey]));
            }
        }
    }
    return svgElement;
}


/**
 * One 1×1 square of the sprite.
 */
function createPixel(x, y, color) {
    const pixelElement = document.createElementNS(SVG_NAMESPACE, "rect");
    pixelElement.setAttribute("x", String(x));
    pixelElement.setAttribute("y", String(y));
    pixelElement.setAttribute("width", "1");
    pixelElement.setAttribute("height", "1");
    pixelElement.setAttribute("fill", color);
    return pixelElement;
}


/**
 * Fail fast on ragged rows or a character with no palette color.
 *
 * @param {{rows: string[], palette: Object<string, string>}} sprite
 */
export function checkSprite(sprite) {
    const expectedWidth = sprite.rows[0].length;
    for (let y = 0; y < sprite.rows.length; y++) {
        const row = sprite.rows[y];
        if (row.length !== expectedWidth) {
            throw new Error(`sprite row ${y} is ${row.length} wide, expected ${expectedWidth}`);
        }
        for (const colorKey of row) {
            const hasColor = colorKey === TRANSPARENT_PIXEL || colorKey in sprite.palette;
            if (!hasColor) {
                throw new Error(`sprite row ${y} uses "${colorKey}", which the palette does not define`);
            }
        }
    }
}
