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
2. Add a public image URL for reference images, or optionally upload local image references. Local images are stored in IndexedDB.
3. Go to Builder, select assets, add the joke idea, dialogue, caption, format, aspect ratio, and tone.
4. Go to Prompt or use Copy Prompt from Builder.
5. Paste the generated prompt into ChatGPT image generation. Assets with public URLs are listed in the prompt; local-only images still need to be attached manually.

## One-time GitHub Asset Upload

For reusable character sheets and cafe references, put the image files in the repository once and use their GitHub Pages URLs in the Library.

Recommended folder:

```text
assets/
  characters/
  locations/
  equipment/
  props/
```

After GitHub Pages deploys, URLs usually follow this pattern:

```text
https://sourmilkman.github.io/CafeMemeGen/assets/characters/alex.png
```

Paste that URL into the asset's Public image URL field. When the asset is selected in Builder, the app shows a larger preview and includes the URL in the generated prompt.

## Export and Import

Open Settings and choose Export Library as JSON to download a backup. Image uploads are embedded as data URLs in that JSON file.

To transfer to another device, open Meme Studio there, go to Settings, choose Import Library from JSON, and select the exported file.
