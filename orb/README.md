# Homepage silver orb

The homepage remains a static GitHub Pages site. `index.html` loads the committed `assets/orb.js` bundle; GitHub Pages needs no Node build step. Paths are relative and also work beneath a project subpath.

## Edit and build

```sh
npm ci
npm run build:orb
```

Commit the updated source **and** `assets/orb.js` plus its license file. Preview through any static HTTP server, for example `python3 -m http.server 8082`. Run `npm run test:orb` while that server is running. Set `SITE_URL` to test another local URL. The tests require Playwright Chromium (`npx playwright install chromium`).

- `orb.js`: local scene, lazy setup, scroll waves, reduced-motion and visibility handling.
- `surface.js`: liquid displacement and per-pixel normals.
- `drag-rotation.js`: globe-style pointer and keyboard rotation.
- `../orb.css`: homepage-only presentation, using existing theme colors.
- `../assets/orb-poster.png`: transparent still image for loading, JavaScript-disabled, and WebGL failures.

The transparent canvas follows the site's existing light and dark backgrounds. A small opening turn settles into a slow idle spin; dragging takes over immediately. Instructions appear only on mouse hover or keyboard focus. There is no visible pause control. Reduced-motion preferences disable automatic animation; direct drag and keyboard rotation remain available. Rendering stops under reduced motion, off-screen, or in a hidden tab, and resumes on demand. Touch dragging only captures the circular orb area, leaving the rest of the page scrollable.

## Assets and licenses

`assets/studio-small-09-1k.hdr` is the 1K version of [Studio Small 09](https://polyhaven.com/a/studio_small_09) by Poly Haven, licensed CC0. It is hosted locally. Three.js is MIT licensed; its bundled notice is in `assets/orb.js.LEGAL.txt`. The poster is a render of this scene.

The orb makes no third-party network requests. Existing site fonts and other page resources retain their own loading behavior.

## CV placement

`cv.html` uses the same bundle with `.silver-orb-traveler`. It opens oversized and shrinks toward a minimum of 50% as its fixed side position moves straight down the viewport. The hover hint counteracts that scale to stay at 12px. Document scroll progress drives both changes, including changes from expanded course listings. Scrolling back up restores its size. Smaller screens reserve space above the CV for the opening orb and a narrow right-hand space for its travel. Reduced motion keeps a smaller, stationary orb at the top; print layouts hide it and reclaim the space.
