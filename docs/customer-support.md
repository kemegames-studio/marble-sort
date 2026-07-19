# Customer Support Integration

## What ships in Marble Sort

Marble Sort now exposes a `CUSTOMER SUPPORT` entry inside the settings modal. The support flow is implemented in the web layer so it works in the Vite browser build and inside the Capacitor Android shell.

The version 26 in-game support center:

- signs the local installation into Keme with the persistent Player Game ID
- routes support to the configured Marble Sort game
- loads real ticket history in pages of 10 with refresh, retry, and load-more controls
- opens a ticket to show its complete chronological player/support conversation
- allows replies while a ticket is Open or Replied
- keeps Closed and Resolved conversations available as read-only history
- creates tickets with a validated category, subject, and description form
- shows honest loading, empty, success, and failure states without sample ticket data
- keeps `support@kemegames.com` available as the email fallback

The enhancement lives in `public/assets/support-center-v26.js` and is mirrored into the versioned Android web payload. It intercepts the existing Support action during event capture, leaving the recovered v25 gameplay bundle unchanged.

## Runtime config

Configure [public/keme-support-config.js](/C:/Users/walee/OneDrive/Desktop/Product%20Management/Keme/marble-sort/public/keme-support-config.js).

Fields:

- `portalBaseUrl`: Keme API origin. The game appends `/api/v1` automatically.
- `preferredGameId`: optional. Restricts support routing to the configured Keme game.
- `gameUid`: optional. If blank, Marble Sort generates and persists one per install.
- `sdkKey`: reserved for the native Android SDK path.
- `organizationId`: reserved for the native Android SDK path.
- `environment`: `production` or `sandbox`.

## What Keme still needs

The portal integration only works after the Keme backend recognizes the player and has at least one active game available:

- a reachable Keme API base URL
- a player record whose `externalGameUid` matches the Player Game ID shown in the game, or a backend that auto-provisions players on first login
- at least one active Keme game for ticket routing

## Native Android SDK notes

The Android snippet shared by Keme is not enough by itself for a full native support build. The current Keme docs in this workspace also require:

- `organizationId`
- the `com.kemegames:support-android:1.2.0` artifact or another accessible distribution path

The downloaded `keme-support-android-1.2.0.zip` currently only contains a README that points back to the Maven coordinate. The coordinate does not resolve from Maven Central or Google Maven in this project.

The Android shell is prepared for the native path in two ways:

- if you receive a real `support-android-1.2.0.aar`, place it in `android/app/libs/`
- if Keme later publishes the artifact correctly, rebuild with `KEME_USE_PUBLISHED_SDK=true`

The native bridge also requires:

- `KEME_SDK_KEY`
- `KEME_ORG_ID`
- optional `KEME_ENVIRONMENT` (`production` or `sandbox`)

## Native SDK flow now wired in the app

Marble Sort now follows the Keme Android SDK flow everywhere the local app can control:

- `MainApplication` initializes the native Keme bridge on app startup
- the Capacitor bridge identifies the player with the persistent Marble Sort `gameUid` before support opens
- the identified native user receives string metadata such as level, unlocked level, lives, platform, and game version
- `KemeMessagingService` forwards Firebase messages and refreshed push tokens to the SDK bridge so Keme push handling is ready once the real SDK artifact is present

Because Marble Sort does not have a full account login yet, the native bridge uses the stable guest-style `gameUid` as the Keme `userId`. If a real login system is added later, replace that identity with the authenticated player ID.

## SDK packaging mismatch found on June 29, 2026

Two Keme Android distributions were checked locally and both were incomplete:

- `keme-support-android-1.2.0.zip` only contains a README pointing to `com.kemegames:support-android:1.2.0`
- `keme-support-android-1.2.0 (1).zip` only contains metadata files and a README pointing to `com.kemegames:keme-support:1.2.0`

Neither Maven coordinate resolved from Google Maven or Maven Central during Gradle validation on June 29, 2026, so the shipped APK is still a bridge-ready build rather than a fully linked native Keme SDK build.
