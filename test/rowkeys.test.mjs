// The keyboard's movement through a page's rows, without drawing: J / K and the arrows move the
// pick, Home and End jump to the ends, Enter opens the picked row, and a chord is left to the app
// (home.js and agents.js move their lists with these; Space to peek is the next step).

import { test } from "node:test";
import assert from "node:assert/strict";
import { appKeyAction, destinationForKey, isChord, keyName, nextPick, opensKeymap, opensRow } from "../mods/bot-herdr/rowkeys.js";

test("nextPick moves J / K and the arrows by one and wraps, Home and End jump to the ends", () => {
  assert.equal(nextPick("j", 0, 3), 1);
  assert.equal(nextPick("down", 2, 3), 0, "down at the last row wraps to the first");
  assert.equal(nextPick("k", 0, 3), 2, "up at the first row wraps to the last");
  assert.equal(nextPick("up", 1, 3), 0);
  assert.equal(nextPick("home", 2, 3), 0);
  assert.equal(nextPick("end", 0, 3), 2);
  assert.equal(nextPick("tab", 0, 3), -1, "Tab is the keyboard's own");
  assert.equal(nextPick("j", 1, 0), -1, "an empty list moves nothing");
  assert.equal(nextPick("j", 9, 3), 0, "a pick past the end starts over");
});

test("Enter opens the picked row, and a chord belongs to the app", () => {
  assert.equal(opensRow("Enter"), true);
  assert.equal(opensRow("enter"), true);
  assert.equal(opensRow("space"), false, "Space peeks (the next step), it does not open");
  assert.equal(opensRow("j"), false);
  assert.equal(isChord({ modifiers: { control: true } }), true);
  assert.equal(isChord({ modifiers: { platform: true } }), true);
  assert.equal(isChord({ modifiers: { alt: true } }), true);
  assert.equal(isChord({ modifiers: {} }), false);
  assert.equal(keyName({ key: "J" }), "j");
});

test("view-local Ctrl+1..5 and ? map to destinations and keymap without clobbering text input", () => {
  assert.equal(destinationForKey({ key: "1", modifiers: { control: true } }), "home");
  assert.equal(destinationForKey({ key: "2", modifiers: { control: true } }), "threads");
  assert.equal(destinationForKey({ key: "3", modifiers: { control: true } }), "agents");
  assert.equal(destinationForKey({ key: "4", modifiers: { control: true } }), "library");
  assert.equal(destinationForKey({ key: "5", modifiers: { platform: true } }), "settings");
  assert.equal(destinationForKey({ key: "6", modifiers: { control: true } }), null);
  assert.equal(destinationForKey({ key: "1", modifiers: {} }), null);
  assert.equal(opensKeymap({ key: "?", key_char: "?", modifiers: {} }), true);
  assert.equal(opensKeymap({ key: "/", modifiers: { shift: true } }), true);
  assert.equal(opensKeymap({ key: "?", modifiers: { control: true } }), false);
  assert.deepEqual(appKeyAction({ key: "?", key_char: "?", modifiers: {} }, { typing: false }), { kind: "keymap" });
  assert.equal(appKeyAction({ key: "?", key_char: "?", modifiers: {} }, { typing: true }), null);
  assert.deepEqual(appKeyAction({ key: "2", modifiers: { control: true } }, { typing: true }), { kind: "page", page: "threads" });
});
