/**
 * Tests for src/fit_picture.js: shrinking a picture to fit its box.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { MIN_PICTURE_SCALE, findPictureScale } from "../../src/fit_picture.js";


test("a picture that already fits keeps its size", () => {
    assert.equal(findPictureScale({ widthPx: 300, heightPx: 200 }, { widthPx: 600, heightPx: 400 }), 1);
});


test("a picture too tall or too wide shrinks by the tighter of the two", () => {
    assert.equal(findPictureScale({ widthPx: 400, heightPx: 400 }, { widthPx: 800, heightPx: 200 }), 0.5);
    assert.equal(findPictureScale({ widthPx: 1000, heightPx: 100 }, { widthPx: 750, heightPx: 400 }), 0.75);
});


test("a picture is only enlarged when the caller allows it, and then no further than allowed", () => {
    const smallPicture = { widthPx: 100, heightPx: 100 };
    const bigBox = { widthPx: 400, heightPx: 300 };
    assert.equal(findPictureScale(smallPicture, bigBox), 1);
    assert.equal(findPictureScale(smallPicture, bigBox, 1.8), 1.8);
    assert.equal(findPictureScale(smallPicture, { widthPx: 150, heightPx: 300 }, 1.8), 1.5);
});


test("a tiny or hidden box never shrinks the picture below the readable minimum", () => {
    assert.equal(findPictureScale({ widthPx: 400, heightPx: 400 }, { widthPx: 0, heightPx: 0 }), MIN_PICTURE_SCALE);
    assert.equal(findPictureScale({ widthPx: 0, heightPx: 0 }, { widthPx: 100, heightPx: 100 }), 1);
});
