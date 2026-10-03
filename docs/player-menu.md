# Player menu and durable identity

The menu uses eight bundled vector marble characters rather than emoji fonts. It shares the home palette, purple header, blue glossy surfaces, green support action, and gold level badge. Avatar choices have labels, an explicit check mark, aria-pressed, keyboard focus, and immediate persistence. The player avatar also appears in the leaderboard.

Identity is stored independently in `marble-sort-player-identity-v1`, so a restored progress/cloud snapshot cannot replace the current name/avatar. Existing numeric avatar IDs are migrated without changing backend leaderboard compatibility. The Android PlayerProfile Capacitor plugin also saves identity in private SharedPreferences; this survives process death and in-place updates even when the WebView origin/storage changes. Uninstalling or clearing app data removes these local preferences.

The native read completes asynchronously; a revision guard prevents a delayed read from replacing a newer player selection. Native identity is written on migration and explicit name/avatar edits, not on every progress save. Both the readable source and preserved Android runtime use the shared renderer/storage module. Run `python scripts/update-packaged-profile.py` after shared profile or avatar changes; do not replace the newer Android runtime with a source build.

Validation: npm build and 9 unit tests; packaged navigation/close-button checks at 320,390,430,768 pixels; profile QA covers old avatar migration, all eight choices, name edits, close/reopen, stale progress data, bridge restoration and delayed-read races. Android bridge behavior is simulated in browser QA. An Android APK build and physical-device in-place upgrade test remain required because this environment has no Android SDK.
