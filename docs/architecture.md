# Marble Sort Architecture

## Decision: standalone web game

The first milestone is a standalone Vite application. This keeps gameplay iteration fast and allows the same build to run locally, in a browser, and inside a later Capacitor Android shell.

## Gameplay state

Tube arrays are stored bottom-to-top. Each tube has a capacity of four. A legal move transfers the contiguous run of the source tube's top color into an empty tube or onto the same color, limited by destination capacity.

Progress, currency, lives and settings are stored in `localStorage` under `marble-sort-state-v1`.

## Economy and lives

Coins use one persisted balance across the home HUD, gameplay HUD, daily rewards and level-completion rewards. The home coin bar routes to the store.

Starting a level spends one life. Lives regenerate every 30 minutes up to a maximum of five. Regeneration is calculated from the persisted timestamp when the application opens, so it does not require a background timer.

## Level data

The app exposes 100 level slots. The first gameplay milestone includes hand-transcribed early layouts and deterministic generated layouts for level references that were blank or not yet transcribed. Generated layouts are clearly isolated in `src/levels.js` so exact source data can replace them without touching gameplay logic.

## Art

Provided full-screen compositions are reused for loading and home presentation. The gameplay scene is assembled responsively from the transparent components extracted from the supplied `game scene.svg`: coin HUD, settings button, level holder, glass tube, and the undo, shuffle and add-tube boosters. This prevents the artwork from baking in stale level or economy values and lets the board expand from four to six columns for later levels.

Gameplay marbles remain DOM objects inside the supplied glass-tube art so selection, transfer animation, collision rules and state changes remain functional and testable. The gameplay HUD reads the persisted level and coin balance on every render. Booster quantities use the existing persisted inventory, and the settings artwork opens the existing music/sound panel with a Home action while a level is active.

The current tube vessel uses the supplied transparent metal-tube PNG. CSS crops its oversized transparent canvas to the painted bounds without altering the artwork, then sizes the inner stack for four equal marble slots. The live marbles render above the vessel body to preserve their color and contrast. Tube rows use separate space-distributed grid tracks, with reserved vertical clearance between both rows and above the booster rail across supported phone aspect ratios.

Legal transfers are animated before their state transaction is committed. The source vessel lifts and tilts; each moved marble exits vertically through its source opening, arcs above both rims, enters through the destination opening, and drops into its exact slot. Multi-marble runs transfer top-first with staggered timing. The destination vessel reacts on arrival, and a newly completed four-marble color set receives a one-time pulse and ring celebration. Geometry is read once from the current DOM for each move and animated with the Web Animations API; no path calculations run per frame. Reduced-motion users receive the same immediate state change without the transfer animation.

The home screen uses three complete artwork states instead of stacking feature cards over a shared background: both daily features locked before level 5, Rewards unlocked at levels 5-6, and both Rewards and Missions unlocked from level 7. The live level, lives and coin values remain DOM overlays so they always reflect persisted player state. Locked feature hotspots show an unlock-level toast and do not open their modal.
