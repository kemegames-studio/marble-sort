# Home visual system

The home page remains the visual reference. Shared styles in `public/assets/design-system.css` extend its sky blue background, glossy cyan-edged blue panels, lime green primary actions, purple feature ribbons, white display text and warm gold currency accents to gameplay and secondary views.

The store now renders responsive bundle and coin cards with the existing coin/booster artwork. Android passes the live product catalog and localized Google Play price function to `renderStore`; product IDs, purchase handlers, restore handlers and grants are unchanged. This also removes price/reward text baked into store raster images. The older source-only web entry point displays the same layout with purchasing disabled because it does not contain Android billing integration.

Leaderboard rankings, tabs, empty states, info popup and player highlighting retain their data/behavior. Its podium uses flexible columns to fit 320px screens. Settings, menu, daily login, missions, no-ads, support, tutorials, failures, completion and timed challenge panels use the shared surfaces and action styles. Existing home/loading art and matching reward/booster/lives artwork are retained.

`python3 scripts/update-packaged-design.py` copies the two shared presentation files and applies narrow, repeatable presentation changes to the preserved production bundle. Do not replace that bundle with a build of the older source or run Capacitor sync for this change.

Validation: Vite build, Node tests, `scripts/qa-design-system.cjs` (320x568, 390x844, 430x932, 768x1024), and rewarded-time browser regression. Browser checks cover product buttons/prices, scrolling, rankings/tabs, popups, setting toggles and unchanged coins/lives. Real Google Play purchase validation requires an Android device.

Dismiss controls are anchored 12px inside the panel's top-right corner with a 44px target. Header artwork reserves a separate region; the painted X in the daily-login title is clipped so only the working close control appears. Customer support's nested header uses the same placement. Browser checks also verify close-control bounds, viewport visibility, and unobstructed hit targets at all four sizes.
