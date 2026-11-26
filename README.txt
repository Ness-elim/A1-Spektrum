Spektrum Deutsch A1+ Interactive Study App — v2.11.2
===================================================

Run
---
Open index.html directly, or serve this folder over HTTP(S).
A local HTTP server or HTTPS hosting enables the service worker and offline shell.
There is no build step and no runtime dependency installation.

v2.11.2 — German prompts for each answer
---------------------------------------
Each answer box in the chapters and Start Deutsch 1 shows its German question,
sentence with a gap, or word cues from the exercise. In picture and listening
tasks, use the adjacent book image or recording. Review Mistakes displays the
same prompt when retrying an individual answer.

v2.11.1 — German letters
------------------------
Select a text field, then open the ä button to insert a letter at the cursor or
replace selected text. Press Escape or use the header to collapse the palette.

v2.11.0 — Review Mistakes
-------------------------
Open Review Mistakes below Word Review to retry up to five individual questions
from chapters and Start Deutsch 1. Each question shows the original book visual.
Repeated wrong answers count once. A correct check in either location clears it.
The chapter exercise list shows the remaining count next to each activity.

v2.10.1 — keep book images visible
---------------------------------
Original exercise and full-page images are shown by default, including when word
collection is enabled. Open the "Study text · Add words" section below an image
to use clickable text. Expanding the text keeps the image visible; it no longer
switches away from the book image.

v2.10.0 — save words while reading
---------------------------------
In Settings > Study display, enable "Click words to add to review" (off by default).
Open a chapter activity or exam and use "Study text · Add words". Click a word to
open a confirmation form with its editable dictionary form, meaning and source
sentence. Cancel leaves your vocabulary unchanged. Existing meanings are prefilled;
new words require a meaning. The original page remains visible above the expandable text.
Full-page reading also provides clickable text where extracted text is available.
Image pixels themselves are not word-selectable; no online OCR or translation is used.

Before creating a word, the app checks official test words, discovered words,
original vocabulary, review vocabulary and manual entries. Matching handles case,
spacing, surrounding punctuation, Unicode normalization, der/die/das and supplied
lemma forms. Distinct spellings such as schon/schön remain distinct. An existing
word is reused and the dialog explains this; repeated saves do not create copies.
The existing Add missing word action uses the same duplicate check.

Saved words appear in Word Review > Saved from texts and in the general word review
pool. "Review saved words" in the confirmation message opens that list directly.
Adding a word here does not automatically include it in Vocabulary Testing.
Disabling the feature removes clickable words but keeps saved cards and meanings.
The saved word, sentence, source page and preference use the existing backup/sync
system. Correct OCR errors or choose a dictionary form in the confirmation form.

v2.9.0 — check one answer at a time
----------------------------------
Each automatically checked question now has its own Check answer button.
Press Enter in an answer input to check just that question. Blank or untouched
answers remain neutral and do not reveal their solutions. Checking saves the
answer and its result immediately; Save for later also preserves unchecked drafts.
Partial results survive navigation, reload, export and sync. Editing one answer
invalidates only its own previous result. Previously checked backups still load.
The progress summary counts checked/correct answers; the full activity is marked
complete when all its answers have been checked successfully. This also applies
to objective questions in Start Deutsch 1. Independent answers in the same activity
can merge from two devices without replacing each other.

v2.8.0 fixes
------------
- Progress changes carry per-record revisions. A newer unmark, draft answer,
  review schedule, vocabulary choice or manual-word deletion survives merging.
- Newer saved answers take precedence over old answers with higher scores.
- Full-recall results have their own time, so an old correct answer or a later
  article test cannot hide a newer wrong recall.
- Independent exercises, daily study sections and vocabulary exposure still merge.
  Legacy undated data retains conservative fallback merging; existing backups load.
- Changes made during an upload schedule another sync. Background sync does not
  redraw active exercises, exams, word tests or review cards.
- Storage failures show a persistent notice with Download backup and Retry saving.
  Unreadable existing saves are preserved until an explicit import or reset.
- Reset clears local progress and disconnects sync, leaving the remote copy intact.
- Checked-answer feedback no longer re-completes an intentionally unmarked exercise.
  Editing and saving a checked answer clears its own old result and the activity completed status.
- The selected chapter activity survives reload. Start Deutsch 1 navigation and
  answer saving no longer fail because of invalid DOM query roots.
- Embedded content banks moved out of app.js; duplicate meaning helper removed.
- Offline shell includes the new scripts. Progress fetches and failed HTTP responses
  are not added to the asset cache; cleanup affects this app's shell caches only.

Files
-----
index.html            Application shell and ordered scripts
styles.css            Application styling
app.js                Study interface, persistence, cloud adapters
state-sync.js         Browser-independent revision tracking and merge rules
 data/content.js      Book content used at runtime
 data/content.json    Equivalent content for external tooling
 data/study-banks.js   Vocabulary banks, correction keys and model guidance
assets/               Book page images, recordings and icons
sw.js                 Offline shell and asset caching

Progress and compatibility
--------------------------
Saved progress stays under the existing localStorage key. Exported backups now
include schema 3 revisions. Update all synced devices to this version: older app
versions do not understand the new revision rules. Device clocks should be correct.
For an installed/cached copy, close all app tabs/windows and reopen after deployment
so the updated service worker can activate. No hosting deployment is performed by
editing this folder.

Checks (Node.js 22 or later, no npm dependencies)
------------------------------------------------
npm test

Optional real Edge browser checks on Windows:
node tests/browser-smoke.cjs
Set EDGE_PATH if Edge is installed elsewhere. The check uses a temporary browser
profile and local server; it never uses your normal profile or cloud credentials.
It covers all navigation pages, exam saving, checked exercises, unmark/reload,
draft persistence, mobile overflow, offline loading and direct file launch.

Cloud transport still requires your configured GitHub or Apps Script service.
Automated checks simulate cloud responses; they do not write to a real account.
