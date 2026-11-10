Spektrum Deutsch A1+ Interactive Study App — v2.7.0
===================================================

Open index.html to study locally or host on GitHub Pages.

v2.7.0 changes (Multi-Device Sync & Anti-Wipe Protection)
---------------------------------------------------------
- Fixed the multi-device progress wipe bug: previously, navigating to Settings on a second (empty) device called save() and set localUpdatedAt = Date.now(), causing cloudSyncNow() to think the empty device was "newer" and overwrite the cloud backup with an empty state.
- separated view-navigation state (saveViewOnly) from study progress saves (save).
- Added Smart Union Merging (mergeStudyStates) and Anti-Wipe Guard (stateRichness): an empty device can never overwrite remote progress, and syncing across two devices merges completed exercises, answers, streak days, and vocabulary progress from both devices without losing either.
- Added Direct GitHub Repository Sync (via GitHub API to data/user-progress.json) AND automatic startup loading of ./data/user-progress.json from your GitHub Pages repository.
- Added Quick Progress Recovery in Settings so you can restore completed status, model answers, and seen vocabulary for any previously completed chapters in one click.
- Added Automatic Local Safety Snapshots (keeps up to 12 snapshots before any sync, import, or reset).
