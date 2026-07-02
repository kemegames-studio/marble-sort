# Marble Sort Architecture

## Decision: standalone web game

The first milestone is a standalone Vite application. This keeps gameplay iteration fast and allows the same build to run locally, in a browser, and inside a later Capacitor Android shell.

## Android packaging

The production Vite bundle is packaged in a Capacitor Android application with package ID `com.kemegames.marblesort` and app name `Marble Sort`. `npm run android:sync` rebuilds `dist` and copies it into the native project. `npm run android:apk` also runs Gradle `assembleDebug`; the resulting installable APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`.

Android builds require JDK 21 and an Android SDK. This workstation uses the SDK at `C:\Users\walee\AppData\Local\Android\Sdk`; the generated native project records that path in its untracked `local.properties` file.

## Gameplay state

Tube arrays are stored bottom-to-top. Each tube has a capacity of four. A legal move transfers the contiguous run of the source tube's top color into an empty tube or onto the same color, limited by destination capacity.

Progress, currency, lives and settings are stored in `localStorage` under `marble-sort-state-v1`. The current state schema migrates legacy test balances into the production default opening balance of 500 coins.

## Economy and lives

Coins use one persisted balance across the home HUD, gameplay HUD, daily rewards and level-completion rewards. New installs begin with 500 coins, and each level completion awards 40 coins. The home coin bar routes to the store.

Lives regenerate every 30 minutes up to a maximum of five. Starting a level no longer spends a life. Instead, one life is deducted only when the player reaches a no-moves-left loss state. Regeneration is calculated from the persisted timestamp when the application opens, so it does not require a background timer.

## Level data

The app exposes 100 level slots. `src/levels.js` is now a board-by-board source of truth rather than a procedural ladder. Visible levels were transcribed from the full-size per-level reference images, preserving the exact left-to-right tube order and the exact bottom-to-top marble order shown in those source boards.

Most levels use two empty tubes, but the imported set also contains special layouts with one empty tube (level 2), no empty tube (level 1), and three empty tubes (levels 23, 46, and 79). The runtime now keeps those exact tube counts instead of forcing everything into one generic pattern.

Some source image slots were blank or missing. Those bridge levels are explicitly tracked in code as inferred boards: `5, 8, 11, 20, 25, 30, 35, 50, 65, 80, 88, 95, 99, 100`. For those entries, the game derives the color set from the nearest neighboring reference boards and generates a deterministic solvable mix that keeps the surrounding tube-count band.

## Art

Provided full-screen compositions are reused for loading and home presentation. The Android shell now forces immersive full-screen mode so the packaged APK opens like a native game rather than a framed webpage. The gameplay scene is assembled responsively from the transparent components extracted from the supplied `game scene.svg`: coin HUD, settings button, level holder, glass tube, and the undo, shuffle and add-tube boosters. This prevents the artwork from baking in stale level or economy values and lets the board expand from four to six columns for later levels.

Gameplay marbles remain DOM objects inside the supplied glass-tube art so selection, transfer animation, collision rules and state changes remain functional and testable. The gameplay HUD reads the persisted level and coin balance on every render. Booster quantities use the existing persisted inventory, and the settings artwork opens the existing music/sound panel with a Home action while a level is active.

The current tube vessel uses the user-provided transparent gameplay tube reference in `public/assets/game-tube-user-open.png`, with marble positioning recalibrated to that asset's real inner cavity so a four-ball stack sits naturally inside the glass. Tube canvases are no longer laid out like ordinary full-width cards; instead, each row follows the overlap-friendly spacing ratios from the supplied redesign reference so the visible glass tubes match the target size and inter-row rhythm. Completed four-of-a-kind tubes receive both a visible cover-drop animation using the supplied lid art and a sealed top overlay based on the matching closed-top reference, giving solved tubes a visibly finished state instead of leaving them open.

The level importer also revealed that the source game does not use one fixed row split. The board renderer now mirrors those reference patterns: 5-tube boards stay on a single centered row, 7- and 8-tube boards use 4 columns on the first row, 9- and 10-tube boards use 5 columns, and 11- and 12-tube boards use 6 columns.

The latest visual pass replaces the home background with a flattened render of the supplied redesign artwork so the top HUD, feature icons, and bottom navigation match the approved mobile spacing exactly. The level holder on home is now blank in the art and receives only a bold DOM-rendered level number, while gameplay continues to use the existing blank holder art with a centered code-rendered `LEVEL n` label. The Play button is also split into its own asset so pointer-down motion now visibly depresses the button instead of faking the state with a flash overlay.

A follow-up calibration pass shifts both level labels to the optical center of their holders based on device screenshots instead of raw image bounds. The home badge number sits higher inside the lower shield, and the gameplay `LEVEL n` string now sits lower inside the rounded bar so it reads centered in the visible blue panel.

Android WebView font metrics still render slightly differently than desktop Chromium, so the holder values now use dedicated inner text spans with small optical `translateY(...)` offsets instead of relying only on centered bounding boxes. That same treatment is applied to the home lives value, home coin balance, gameplay coin balance, home level badge number, and gameplay level label so numeric text stays visually centered inside the supplied artwork on-device as well as in desktop previews.

The splash screen now uses the newly supplied key art without any baked loading indicator. Only the CSS-drawn loading bar remains, which removes the double-bar issue while preserving the three-second timed progress animation.

Gameplay tubes now render from refined copies of the supplied open, closed-top, and cover tube assets. A light-blue glass rebalance pass brightens the previously black side walls so the tubes read as glass rather than dark metal while keeping the same geometry and completion animation flow.

Marble stacks now use slightly larger artwork, negative inter-marble overlap, and a higher in-tube fit ratio so adjacent balls visibly touch instead of floating with gaps. Transfer motion also includes stronger source-tube tilt, higher travel arcs, softer landing compression, and a short receiving-stack settle animation to make pours feel heavier and more physical.

Completed-tube celebration is now staged after the landing settle instead of overlapping it immediately. The seal sequence uses a brighter aura, rim flash, spark particles, a longer lid bounce, and a fuller tube punch/settle so solving a tube reads as a satisfying lock-in moment rather than a quick overlay swap. Win and fail modals also wait for that completion beat to finish when the final move seals a tube.

Player marbles now use the supplied glossy SVG ball artwork instead of CSS-generated spheres. The imported level set uses nine distinct marble colors across the 100-level ladder: red, orange, green, pink, blue, cyan, purple, gray, and olive. Shared SVG base art is recolored through CSS tone filters for the gray and olive variants so every puzzle color still reads as one coherent asset family. The in-tube marble diameter is intentionally smaller than the clear inner glass width so four balls stack fully inside the vessel without the top marble clipping out of bounds.

Gameplay sound effects are now bundled from Kenney's CC0 UI Audio pack and stored in `public/assets/sfx/`. A curated subset is mapped to the existing `profile.sound` toggle: general UI taps, tube selection, invalid move feedback, marble transfers, booster usage, reward claim, tube-complete sealing, level-complete victory, level-start, and lose-state feedback. Sound playback is handled in `src/audio.js` using short cloned `Audio` nodes so rapid gameplay actions can overlap cleanly without blocking the main thread.

Background music is handled separately from SFX so the existing `profile.music` toggle controls only the looping soundtrack. The current loop is the user-provided WAV copied to `public/assets/music/background-loop.wav`; it starts once the player interacts with the game, keeps playing across screens, pauses when the app is backgrounded, and resumes when the app returns to the foreground.

Legal transfers are animated before their state transaction is committed. The source vessel lifts and tilts; each moved marble exits vertically through its source opening, arcs above both rims, enters through the destination opening, and drops into its exact slot. Multi-marble runs transfer top-first with staggered timing. The destination vessel reacts on arrival, and a newly completed four-marble color set receives a one-time pulse, ring celebration, brighter marble pop, and lid-drop sealing animation. Geometry is read once from the current DOM for each move and animated with the Web Animations API; no path calculations run per frame. Reduced-motion users receive the same immediate state change without the transfer animation.

The level-complete flow now uses the supplied `level-complete-card.svg` artwork instead of the generic blue/white modal. The win overlay sits above a near-black dimmed claim panel, preserves the live board behind it, animates three supplied star-image rewards into place, and sequences the existing victory SFX with a softer reward chime so the popup lands like a game reward screen rather than a plain alert. The base `+40` coin reward is still granted automatically when the puzzle resolves; the popup only visualizes that reward and offers a one-time `+80` bonus action before the player advances.

The splash screen keeps its full-screen illustrated loading art for three seconds and now uses one CSS-drawn capsule track and fill that fully covers the baked artwork bar, preventing the double-loading-bar effect while keeping the timed progress animation. The home screen uses three complete artwork states instead of stacking feature cards over a shared background: both daily features locked before level 5, Rewards unlocked at levels 5-6, and both Rewards and Missions unlocked from level 7. The live level, lives and coin values remain DOM overlays so they always reflect persisted player state. The home level number is positioned from the visual center of the badge, and the Play hotspot now reacts on pointer-down with a pressed shadow state instead of a flash-style shine. Locked feature hotspots show an unlock-level toast and do not open their modal.

## Interaction rendering

The root screen wrapper no longer replays a fade/scale animation on every render. Gameplay marbles also no longer replay their entry animation when the DOM refreshes for tube selection, modals, or HUD updates. Transfer motion is still animated through the dedicated flying-marble path, but ordinary taps now feel stable instead of producing a brief theme-reload flash.

Tube interaction now responds on `pointerdown` with duplicate-click suppression on the later synthetic `click`, which makes mobile taps feel more immediate than waiting for the browser click phase. When a source tube is already selected, tapping another non-complete non-empty tube now switches selection cleanly instead of showing an invalid-move toast, reducing the sense that a second tap is required before the game recognizes intent.

## Customer support

The settings modal now includes a `CUSTOMER SUPPORT` entry backed by Keme. The support surface is implemented in the shared web layer so it works in the browser build and the Capacitor Android APK without duplicating UI. Runtime settings live in `public/keme-support-config.js`, and the full integration notes are documented in `docs/customer-support.md`.

Branding assets are now unified across surfaces: the web shell references `public/assets/favicon.png` and `public/assets/app-icon.png`, and the Android launcher mipmap set is regenerated from the user-supplied square icon so the installed APK uses the same Marble Sort branding on-device.

When `portalBaseUrl` is configured, the game signs the player into Keme's player portal using a persistent local `gameUid`, loads active games, submits tickets, and renders recent ticket history from the Keme API. The Android shell now also includes a native `KemeSupport` Capacitor bridge that initializes on app startup, identifies the guest player before support opens, and prepares Firebase push delegation for the official Keme SDK flow. The remaining native blocker is Keme's missing published Android artifact or a real AAR/JAR delivery.
