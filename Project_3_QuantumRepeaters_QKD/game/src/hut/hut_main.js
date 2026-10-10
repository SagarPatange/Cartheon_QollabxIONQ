/**
 * Toad's QEC hut page: fills in the footer's sources and pages through the QEC panels from qec_hut_panels.js, each
 * with its picture from qec_hut_pictures.js (paging and fitting: hut_pager.js).
 *
 * Reads hut.html; writes nothing outside the page.
 */

import { findElementsById } from "../page_helpers.js";
import { startHutPager } from "../hut_pager.js";
import { QEC_PANELS, QEC_SOURCES, QEC_WIKIPEDIA_URL, STEANE_WIKIPEDIA_URL } from "./qec_hut_panels.js";
import { buildPanelPicture } from "./qec_hut_pictures.js";

// The QEC pictures are SVG and text, which stay sharp when enlarged, so on a big window they grow to fill their box
// (the BB84 hut's pixel art never grows past 1).
const MAX_PICTURE_SCALE = 1.8;


/**
 * Fill in the sources, then start paging.
 */
function startQecHut() {
    const elements = findElementsById({
        sourceElement: "panel-source",
        qecWikipediaLink: "qec-wikipedia-link",
        steaneWikipediaLink: "steane-wikipedia-link",
    });
    elements.sourceElement.textContent = `Sources: ${QEC_SOURCES.join(" ")}`;
    elements.qecWikipediaLink.href = QEC_WIKIPEDIA_URL;
    elements.steaneWikipediaLink.href = STEANE_WIKIPEDIA_URL;
    startHutPager(QEC_PANELS, buildPanelPicture, { maxPictureScale: MAX_PICTURE_SCALE });
}


startQecHut();
