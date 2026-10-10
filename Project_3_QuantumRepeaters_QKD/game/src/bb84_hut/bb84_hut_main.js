/**
 * Toad's BB84 hut page: fills in the footer's sources and pages through the BB84 panels from bb84_hut_panels.js,
 * each with its picture from bb84_hut_pictures.js (paging and fitting: hut_pager.js).
 *
 * Reads bb84_hut.html; writes nothing outside the page.
 */

import { findElementsById } from "../page_helpers.js";
import { startHutPager } from "../hut_pager.js";
import { AWARD_SOURCE, AWARD_SOURCE_URL, BB84_PANELS, BB84_SOURCE, WIKIPEDIA_URL } from "./bb84_hut_panels.js";
import { buildPanelPicture } from "./bb84_hut_pictures.js";


/**
 * Fill in the sources, then start paging.
 */
function startBb84Hut() {
    const elements = findElementsById({
        sourceElement: "panel-source",
        awardLink: "award-source-link",
        wikipediaLink: "wikipedia-link",
    });
    elements.sourceElement.textContent = `Source: ${BB84_SOURCE}`;
    elements.awardLink.textContent = `Award: ${AWARD_SOURCE} (new tab)`;
    elements.awardLink.href = AWARD_SOURCE_URL;
    elements.wikipediaLink.href = WIKIPEDIA_URL;
    startHutPager(BB84_PANELS, buildPanelPicture);
}


startBb84Hut();
