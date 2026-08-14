# Round 50 - Web app (velocouriersvc.com) fixes + animated dialogs + coverage-map members

The local `velocouriersvc.com/` static files were ahead of the deployed site (live still served an old Expo
build), so several fixes existed locally but were never deployed. This round finishes the gaps, adds a shared
animated confirm/alert modal, adds signed-up users to the Coverage map, and deploys.

## Web app (`velocouriersvc.com/`, deployed via `vercel --prod`)

- **Issue 1 - precise address drives nearby stores** (`dashboard.html`): the location bar now has an address
  input with Google-backed autocomplete (reusing `attachPlaces` -> backend `/places/autocomplete` +
  `/places/details`). Picking an address sets the shopper's precise coords, re-ranks nearby stores
  (`loadShop` already uses `state.coords`), and persists to localStorage (`veloAddress` + `veloCoords`) so it
  sticks across reloads (restored in `initLocation`, which then skips the auto-GPS override). The profile
  address input and the checkout address input now autocomplete too; checkout uses the picked coordinates for
  delivery.
- **Issue 5 - beautiful animated dialogs** (`assets/velo-dialog.js`, new; included in both pages): a
  self-contained `window.veloConfirm({...}) -> Promise<boolean>` and `window.veloToast(msg,tone)`. Sleek
  (backdrop blur, scale+fade, gradient accent, tone icon, focus trap, Esc/overlay cancel, reduced-motion
  safe). Logout on both pages now uses it (replacing the native `confirm`), the cart error uses a toast, and
  payout withdrawal asks for confirmation.
- **Issue 2 - signed-up users on the Coverage map** (`dashboard.html`): `loadCoverUsers` fetches `/map/users`
  and scatters a capped number of jittered "member" dots around each hub (a density indicator), with a hub
  summary popup and a "Members" legend row, mirroring the driver dots.
- **Issues 3 & 4** were already implemented locally and are shipped by this deploy: the provided logo in both
  headers, the "Hello <name>" greeting, the profile drawer (set name / set address / precise location /
  logout), and the merged "Merchants & Service Providers" card on the landing page.

## Backend (`develop` -> `main`)

- **`GET /map/users`** (public, api-key only, like `/map/live`): returns signed-up user counts grouped by
  country `{ users: [{ country, count }] }`. Aggregate only - users store just a `country`, so no identities
  or precise locations are exposed. Added to `MapController` + `mapRoutes`.

## Verification

- Backend `tsc` clean; all inline web scripts + `velo-dialog.js` pass `node --check`; no em/en dashes.
- Live: `GET /map/users` returns per-country counts; deployed site shows the logo, address autocomplete that
  loads nearby stores, the animated logout confirm, and the coverage map with member dots.
