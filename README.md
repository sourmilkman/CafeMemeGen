# M&S Meme Studio

M&S Meme Studio is an installable, mobile-friendly PWA for building structured image-generation prompts for recurring M&S Cafe cartoon memes. It is local-first: assets, notes, draft choices, and uploaded reference images stay in the browser using IndexedDB.

## Files

- `index.html` - app shell
- `styles.css` - responsive mobile-first UI
- `app.js` - IndexedDB persistence, asset library, builder, prompt generation, import/export
- `manifest.webmanifest` - PWA manifest
- `sw.js` - service worker and offline cache
- `icons/` - install icons

## Run Locally

Use any static web server from this folder. For example:

```bash
npx serve .
```

Or with Python:

```bash
python -m http.server 4173
```

Then open the printed local URL in a browser.

## Install as a PWA

1. Open the app in Chrome, Edge, Safari, or another PWA-capable browser.
2. Use the browser menu and choose Install, Add to Home Screen, or Add to Dock.
3. Launch Meme Studio from the installed app icon.

The service worker caches the app shell so the interface keeps working offline after the first load.

## Deploy with GitHub Pages

This is a static PWA, so GitHub Pages can serve it directly from the repository root.

1. Push these files to a GitHub repository.
2. In GitHub, open Settings -> Pages.
3. Set Source to Deploy from a branch.
4. Choose branch `main` and folder `/ (root)`.
5. Save and wait for GitHub to publish the Pages URL.

## Using the App

1. Go to Library and add reusable assets such as characters, cafe locations, equipment, props, running gags, style rules, and previous memes.
2. Optionally upload image references. Images are stored locally in IndexedDB.
3. Go to Builder, select assets, add the joke idea, dialogue, caption, format, aspect ratio, and tone.
4. Go to Prompt or use Copy Prompt from Builder.
5. Paste the generated prompt into ChatGPT image generation and attach any referenced image files manually.

## Export and Import

Open Settings and choose Export Library as JSON to download a backup. Image uploads are embedded as data URLs in that JSON file.

To transfer to another device, open Meme Studio there, go to Settings, choose Import Library from JSON, and select the exported file.
