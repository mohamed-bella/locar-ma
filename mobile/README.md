# Rentiq — Android WebView app

Native Android wrapper around **https://app.rentiq-system.com**. Full-screen, no
browser chrome. Handles the things the web app needs:

- **Camera + file upload** (CIN photos, damage photos, logos) via `onShowFileChooser`
- **PDF downloads** (contracts, reports) via the system DownloadManager → Downloads folder
- **External links** (WhatsApp, `tel:`, `mailto:`, other domains) open in their real apps
- **Pull-to-refresh**, progress bar, back-button = WebView history
- **Offline screen** with a retry button
- Cookies + localStorage persisted (stays logged in)

## Requirements
- Android Studio (Koala or newer), or a JDK 17 + Android SDK on the command line
- `minSdk 26` (Android 8.0+), `targetSdk 34`

## Open & run (easiest)
1. Android Studio → **Open** → select this `mobile/` folder
2. Let it sync Gradle (downloads the wrapper automatically)
3. Plug in a phone (USB debugging on) or start an emulator → **Run ▶**

## Build a shareable APK (command line)
From `mobile/`:

```bash
# one-time: generate the Gradle wrapper if it's missing
gradle wrapper --gradle-version 8.7

# debug APK (installable directly, unsigned-debug)
./gradlew assembleDebug
# → app/build/outputs/apk/debug/app-debug.apk
```

### Signed release APK (for distribution / Play Store)
1. Create a keystore (once):
   ```bash
   keytool -genkey -v -keystore rentiq.keystore -alias rentiq -keyalg RSA -keysize 2048 -validity 10000
   ```
2. Add to `app/build.gradle.kts` a `signingConfigs` block referencing it, wire it to
   `buildTypes.release`, then:
   ```bash
   ./gradlew assembleRelease   # APK
   ./gradlew bundleRelease     # AAB for Play Store
   ```

## Change the URL / name / colors
- URL + host → `app/src/main/java/com/rentiq/system/MainActivity.kt` (`startUrl`, `appHost`)
- App name → `app/src/main/res/values/strings.xml`
- Brand color / icon → `res/values/colors.xml`, `res/drawable/ic_launcher_foreground.xml`

## Note on icons
Launcher icon is a pure-XML **adaptive icon** (car glyph on the brand color) — no PNGs
needed. Replace `ic_launcher_foreground.xml` with your own vector (or use Android
Studio → **New → Image Asset**) for a custom logo.

---

### Alternative: TWA (Trusted Web Activity)
Your site is already a PWA. If you'd rather ship a thinner wrapper that reuses the
user's Chrome (and qualifies for Play Store PWA criteria), use Google's
[Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap):
```bash
npm i -g @bubblewrap/cli
bubblewrap init --manifest https://app.rentiq-system.com/manifest.webmanifest
bubblewrap build
```
That path needs a `.well-known/assetlinks.json` hosted on the domain to drop the URL
bar. The WebView project here needs none of that and gives more control over camera,
downloads and external links — which is why it's the default.
