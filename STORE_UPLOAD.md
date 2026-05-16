# Chrome Web Store Upload

The Chrome Web Store package root is `dist/`.

Run:

```bash
npm run build
npm run check:store
```

Then compress the contents of `dist/`, not the `caughtcha` folder and not the `dist` folder itself.

The zip must open like this:

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

or:

```text
dist/manifest.json
```

This repo includes source files, `node_modules`, and development config. Those are not the extension package. Only `dist/` is the upload package.
