# THE CREATIVE DIMENSION

A cinematic, interactive 3D portfolio for **Danielle Julian**, presented by **Berry Vibes Studio**.

## Open the site

The project is a static HTML5/CSS3/JavaScript website. There is **no Node.js, npm, bundler, package installation, or build step**.

Serve this folder over HTTP(S), then open `index.html` through that server. For example, with Python installed:

```sh
python3 -m http.server 8000
```

Visit `http://localhost:8000/`.

An internet connection is required for the pinned Three.js and GSAP CDN modules and Google Fonts. All portfolio artwork, résumé documents, scene textures, and model assets are included locally.

## Two ways to browse

- **Classic portfolio:** use Home, Work, About, Resume, and Contact. Work includes eight filters, eleven project entries, detailed case studies, image galleries, fullscreen inspection, and next/previous artwork controls. No gameplay is required.
- **Immersive exploration:** select **Enter Experience**. Use WASD or the arrow keys to move, the mouse to look, and E or click to enter a highlighted portal. Escape exits exploration and releases pointer lock. Camera movement is bounded within the exhibition.

On touch devices, drag to look, tap a portal directly, or use the named portal buttons on the homepage. The mobile layout is recomposed for a narrow viewport and defaults to Balanced graphics.

## Controls

- **Sound:** enables or disables locally generated Web Audio ambience. Audio starts only after user interaction.
- **Graphics:** High, Balanced, and Lite change pixel ratio, shadows, bloom, reflective water, and petal density. Lite disables the most expensive effects.
- **Reduced motion:** freezes ambient scene motion and removes guided camera transitions.
- **Help:** explains classic and immersive navigation.

## Résumé and contact

Resume includes the real supplied PDF, an inline desktop preview where supported, a static image fallback, and a working download link. Contact uses direct email and LinkedIn links; there is no fake form or simulated submission.

## GitHub Pages

Upload the **contents** of this folder to a repository, including `.nojekyll`. In GitHub, open **Settings → Pages**, choose **Deploy from a branch**, select the desired branch and `/ (root)`, then save. GitHub performs the hosting; this package itself does not create a repository, change its visibility, commit files, or publish a site.

Hash-based navigation and relative asset URLs are compatible with GitHub Pages project paths.

## Project structure

```text
index.html                  Semantic application shell and import map
styles/main.css             Visual system and component styling
styles/responsive.css       Desktop, tablet, and mobile layouts
src/main.js                 Navigation, dialogs, audio, and UI state
src/scene.js                Real-time Three.js environment and exploration
src/portfolio-data.js       Portfolio and case-study content
assets/documents/           Real résumé and master portfolio PDFs
assets/images/              Optimized portfolio and reference imagery
assets/models/column/       Reusable Three.js column asset
.nojekyll                   Disable Jekyll processing on GitHub Pages
ASSET_CREDITS.md            Asset provenance and third-party notices
```

## Implementation notes

The exhibition is a procedural, stylized real-time environment rather than a literal AAA asset production. Architecture, blossom trees, floating islands, particles, portal shaders, lighting, and ambient audio are generated in code. The classical column is a reused editable design-library asset; see `ASSET_CREDITS.md`.

Modern WebGL2-capable browsers are recommended. If WebGL initialization fails, the site presents its static visual fallback and keeps the complete classic portfolio accessible.
