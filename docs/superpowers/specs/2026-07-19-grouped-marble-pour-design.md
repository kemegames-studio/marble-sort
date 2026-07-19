# Grouped Marble Pour Animation

## Problem

Moving a same-color group currently creates and animates one filtered DOM clone per marble. Each clone runs seven transform keyframes while the source tube, destination tube, and destination stack also animate. The duplicated filter and animation work causes visible frame drops on multi-marble pours, especially on lower-powered Android devices.

## Approved Design

Use one GPU-composited flight layer for the complete moving group.

- Read the gameplay, tube, destination stack, and moving-marble geometry once before animation starts.
- Clone the moving marbles into one absolutely positioned group while preserving their order and spacing.
- Hide the source marbles only for the duration of the flight.
- Animate the group exclusively with `translate3d`, scale, and rotation.
- Keep the existing source-tube tilt, destination-tube reaction, sound, and landing feedback.
- Apply the logical board result and rerender exactly once after the grouped animation finishes.
- Restore source visibility and temporary tube styles if the animation is cancelled or fails.
- Keep the existing immediate path when reduced motion is enabled or required DOM elements are unavailable.

## Performance Constraints

- No per-marble `getBoundingClientRect` calls after animation starts.
- No per-marble `drop-shadow` or color filter while the group is flying.
- No game rerender between individual marble landings.
- Multi-marble animation duration remains bounded and should not grow linearly with the number of marbles.
- Gameplay input remains locked until the board state has been committed.

## Functional Constraints

- Preserve marble order and the existing maximum tube capacity.
- Preserve undo history and win/lose detection.
- Preserve Level 1 tutorial restrictions.
- Do not change rewards, boosters, lives, ads, or level data.

## Verification

- Unit tests for move legality and board state continue to pass.
- Exercise one-, two-, three-, and four-marble pours and confirm the final board matches the move result.
- Verify only one flight group is created for a multi-marble pour.
- Measure animation frames in the browser and check for long tasks during a four-marble pour.
- Run the comprehensive mobile UI suite and build signed release APK/AAB artifacts.
