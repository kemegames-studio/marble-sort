# Android release signing

Marble Sort release bundles are signed through the Android Gradle release build type.

## Local signing files

The local keystore and signing properties are intentionally ignored by Git:

- `android/app/keystores/marble-sort-release.jks`
- `android/keystore.properties`

`android/keystore.properties` must define:

```properties
RELEASE_STORE_FILE=app/keystores/marble-sort-release.jks
RELEASE_STORE_PASSWORD=<store-password>
RELEASE_KEY_ALIAS=marble-sort-release
RELEASE_KEY_PASSWORD=<key-password>
```

The same values can also be supplied as Gradle properties or environment variables with those names.

## Build command

Generate a Google Play release App Bundle with:

```powershell
npm run android:bundle:release
```

The signed bundle is generated at:

```text
android/app/build/outputs/bundle/release/app-release.aab
```

This is a release `.aab`, not a debug build. It is compatible with Google Play App Signing because it is signed with the upload key configured in the release signing config.
