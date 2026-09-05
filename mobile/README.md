# The Atlantic · Print Edition — Expo Go

A minimal Expo SDK 57 app for iOS and Android. It opens the published Atlantic reader in Expo Go's native WebView, preserving the print layouts, page curl, continuous scrolling, search, contents, bookmarks, and light/dark modes. Native chrome respects safe areas and reader appearance; external links open in the device browser. Android Back closes reader overlays before leaving the app.

## Run on your phone

Install or update [Expo Go](https://expo.dev/go). From this repository:

```sh
npm --prefix mobile ci
npm run mobile
```

Keep the Mac and phone on the same Wi-Fi. Scan the terminal QR with the iPhone Camera app, or with Expo Go on Android. Keep the development server running while using the app. Metro serves the native app code; the reader and PDFs load from GitHub Pages, so internet access is required. No App Store build is needed.

If your network isolates devices, run `npm run mobile:tunnel` instead. Expo may ask to install its ngrok helper. A tunnel is only needed for the development connection; it does not change where magazine content is hosted.

The default reader URL is defined in `App.tsx`. To use a different deployed or phone-accessible development URL, set `EXPO_PUBLIC_READER_URL` before starting Expo. Do not use `localhost` as a phone destination.

## Continuous scrolling

Open an issue, choose Reading settings → Page view → Scroll. Pages form one continuous vertical issue on phones and desktop. Only nearby pages are rendered. Contents and page-number jumps remain available, and Continue restores your page-relative position even after a viewport resize. Fit, Page width, Column, and Classic curl remain available.

## Validate

```sh
npm --prefix mobile run typecheck
cd mobile
npx expo-doctor
npm run export
```

Both iOS and Android production JavaScript bundles have been exported successfully, and Expo Doctor passes 21/21 checks. The reader has been checked in desktop and phone-sized Chromium views. A physical-phone session has not been verified by the agent. Reading progress in the app is separate from Safari or Chrome because the WebView has its own storage. This package streams the hosted archive; it does not include the approximately 1 GB archive for offline use.

References: [Expo Go WebView](https://docs.expo.dev/versions/v57.0.0/sdk/webview/), [launching on a device](https://docs.expo.dev/get-started/start-developing/).
