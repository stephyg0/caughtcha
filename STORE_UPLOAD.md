# Chrome Web Store Upload

The `caughtcha` folder root is organized as the extension package root.

Run:

```bash
npm run prepare:store
npm run check:store
```

After that, the upload files live directly in the `caughtcha` folder:

```text
manifest.json
index.html
background.js
samuel.webp
assets/
```

The zip you upload must also open like this:

```text
manifest.json
index.html
background.js
samuel.webp
assets/
```

If the zip opens like this, Chrome Web Store will reject it:

```text
caughtcha/manifest.json
```

macOS Finder adds the folder name to a zip when you compress the folder itself. Chrome Web Store requires `manifest.json` at the zip root, so open `caughtcha`, select the package files, and compress the selected files.

Do not include source folders like `src`, `scripts`, `node_modules`, `public`, or `dist` in the upload zip.
