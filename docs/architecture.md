# Marble Sort Architecture

## Decision: standalone web game

The first milestone is a standalone Vite application. This keeps gameplay iteration fast and allows the same build to run locally, in a browser, and inside a later Capacitor Android shell.

## Gameplay state

Tube arrays are stored bottom-to-top. Each tube has a capacity of four. A legal move transfers the contiguous run of the source tube's top color into an empty tube or onto the same color, limited by destination capacity.

Progress, currency, lives and settings are stored in `localStorage` under `marble-sort-state-v1`.

## Level data

The app exposes 100 level slots. The first gameplay milestone includes hand-transcribed early layouts and deterministic generated layouts for level references that were blank or not yet transcribed. Generated layouts are clearly isolated in `src/levels.js` so exact source data can replace them without touching gameplay logic.

## Art

Provided full-screen compositions are reused for loading and home presentation. Interactive gameplay uses DOM-rendered glass tubes and marble objects so selection, transfer animation and state changes remain functional and testable.
