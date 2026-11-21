// The questionnaires agents ask the user: `bh ask` writes one file per ask into the outbox, and an
// answer moves the record aside. The chat and the work pages read the same folder and answer
// through the same `bh answer`, so a card answered on one page goes from the others on their next poll.

import * as fs from "fs/promises";
import { readTextFile, shared, setShared } from "herdr";
import { outboxDir } from "./composer.js";
import { bh, enc } from "./bh.js";
import { openCounts, OPEN_COUNTS } from "./signals.js";
import { entryName } from "./feed.js";

/** Where agents' questions for the user wait (bh ask writes them; answered ones move aside). */
const questionsDir = () => `${outboxDir().replace(/\/replies$/, "")}/questions`;

/** Writes the open questions' count where every page's tab bar reads it; any page's poll may call it. */
export function publishCounts(list) {
  const counts = openCounts(list);
  if (JSON.stringify(shared(OPEN_COUNTS) ?? null) === JSON.stringify(counts)) return;
  setShared(OPEN_COUNTS, counts);
}

/** One question file, or null when it is not an open questionnaire. */
async function questionAt(name) {
  try {
    const q = JSON.parse((await readTextFile(`${questionsDir()}/${name}`)) ?? "null");
    return q?.status === "open" && Array.isArray(q.questions) && q.questions.length ? q : null;
  } catch {
    return null;
  }
}

/** Shared key for question IDs dismissed or answered on any page, suppressing stale cards immediately. */
export const DISMISSED_QUESTIONS = "bot-herdr.dismissed-questions";

function readDismissed() {
  const raw = shared(DISMISSED_QUESTIONS);
  return new Set(Array.isArray(raw) ? raw : []);
}

function writeDismissed(set) {
  const next = [...set];
  const prev = shared(DISMISSED_QUESTIONS);
  if (Array.isArray(prev) && prev.length === next.length && prev.every((v, i) => v === next[i])) return;
  setShared(DISMISSED_QUESTIONS, next);
}

function markDismissed(id) {
  if (!id) return;
  const set = readDismissed();
  if (set.has(id)) return;
  set.add(id);
  writeDismissed(set);
}

function unmarkDismissed(id) {
  if (!id) return;
  const set = readDismissed();
  if (!set.has(id)) return;
  set.delete(id);
  writeDismissed(set);
}

/**
 * The open questions of a window, oldest first: `poll()` reads the folder on a timer, `drop(q)`
 * takes a card off every page straight away, and `send(q, answers, file)` posts it back.
 */
export class OpenQuestions {
  constructor() {
    this.files = {}; // file name → its question, or null once it is answered or closed
    this.fileIds = {}; // file name → question id, to prune shared dismissals once the file leaves disk
    this.raw = []; // open questions from disk, oldest first
    this.shownSig = "";
  }

  /** Open questions not dismissed on any page, oldest first. */
  get list() {
    const dismissed = readDismissed();
    return dismissed.size ? this.raw.filter((q) => !dismissed.has(q.id)) : this.raw;
  }

  /** Reads the folder: true when what is open changed. */
  async poll() {
    let names = [];
    try {
      names = (await fs.readdir(questionsDir())).map(entryName).filter((n) => /^q-.*\.json$/.test(n));
    } catch {
      names = [];
    }
    let changed = false;
    for (const name of names) {
      if (name in this.files) continue;
      const q = await questionAt(name);
      this.files[name] = q;
      if (q?.id) this.fileIds[name] = q.id;
      changed = true;
    }
    for (const name of Object.keys(this.files)) {
      if (names.includes(name)) continue;
      const goneId = this.fileIds[name];
      delete this.files[name];
      delete this.fileIds[name];
      if (goneId) unmarkDismissed(goneId);
      changed = true;
    }
    if (changed) {
      this.raw = Object.values(this.files).filter(Boolean).sort((a, b) => String(a.created).localeCompare(String(b.created)));
    }
    const sig = this.list.map((q) => q.id).join(",");
    if (sig !== this.shownSig) {
      this.shownSig = sig;
      changed = true;
    }
    return changed;
  }

  /** Takes a question off every page's list now; returns its file, for `send` to read again if it cannot go. */
  drop(q) {
    markDismissed(q?.id);
    const file = Object.keys(this.files).find((name) => this.files[name]?.id === q?.id);
    if (file) this.files[file] = null;
    this.raw = this.raw.filter((x) => x.id !== q?.id);
    this.shownSig = this.list.map((x) => x.id).join(",");
    publishCounts(this.list);
    return file;
  }

  /** Sends the answers with `bh answer`: { sent, ok, why }; a card that cannot go is read again on the next poll. */
  async send(q, answers, file) {
    const r = await bh(["answer", q.id, "--json", "--data", enc(answers)]);
    let sent = null;
    try {
      sent = JSON.parse(r.stdout);
    } catch {
      sent = null;
    }
    if (r.code !== 0 || !sent) {
      unmarkDismissed(q?.id);
      if (file) delete this.files[file];
      return { sent: false, ok: false, why: (r.stderr || r.stdout || "node didn't run").trim().split("\n")[0] };
    }
    return { sent: true, ok: Boolean(sent.ok), why: sent.error ?? null };
  }
}
