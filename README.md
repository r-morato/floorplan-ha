# HA Floor plan

An interactive floor plan panel for Home Assistant. You bring the images of your
floors (isometric renders work great), then browse your entities, drag them onto
the plan and choose what a tap and a long press do. Nothing about your house is
hard-coded, so anyone can run their own copy.

- **Viewer**: stacked cards (optional hero image on top, then one per floor) with live
  icons, glowing lights, temperature text and badges.
- **Editor** (press *Edit*): entity browser with search and domain filter, drag to
  place (arrow keys nudge, Delete removes), per-entity icon / display type / size /
  colour, and a tap + hold action picker.
- **Actions**: toggle, more info, call service (with JSON data) and navigate to a
  Home Assistant path.
- **Storage**: one JSON file plus your uploaded images in a data volume.
- **Demo mode**: without a Home Assistant connection it shows sample entities so you can
  try the editor first.

The plan images are plain 2D pictures; entities are overlaid as positioned
icons, so there is no 3D engine to configure.

## How it connects

The browser talks only to this app. The small Node server proxies Home Assistant's
WebSocket API and adds the access token server-side, so the token never reaches the
browser and there are no CORS or mixed-content issues.

## Install

### Option A: Home Assistant add-on (sidebar entry, recommended on HA OS / Supervised)

1. *Settings → Add-ons → Add-on store → ⋮ → Repositories*, add
   `https://github.com/r-morato/floorplan-ha`.
2. Install **Floor plan**, start it and turn on *Show in sidebar*.

It uses ingress, so there is no port to expose and no token to create; the
Supervisor authenticates for you. Layout and images persist in the add-on data
folder and are part of normal backups.

### Option B: Docker container + Webpage dashboard (works on any install)

```bash
git clone https://github.com/r-morato/floorplan-ha && cd floorplan-ha
export HA_URL=http://<home-assistant-ip>:8123
export HA_TOKEN=<long-lived token>   # HA profile page → Security → Long-lived access tokens
docker compose up -d --build         # builds the image locally
```

On Windows PowerShell use `$env:HA_URL = "..."` and `$env:HA_TOKEN = "..."` instead of `export`.

`docker-compose.yml` reads `HA_URL` and `HA_TOKEN` from your environment and persists `./data`.
Then add a sidebar item: *Settings → Dashboards → Add dashboard → Webpage*, enter
`http://<docker-host>:8099`, pick a title and icon (e.g. `mdi:floor-plan`), and keep
*Show in sidebar* on. (The old `panel_iframe` YAML option was removed in Home
Assistant 2024.6.)

Notes for this option:

- If Home Assistant is served over **https**, the iframe URL must be https too
  (browsers block http frames on https pages). Put the container behind your reverse
  proxy.
- The container has no login of its own: anyone who can reach port 8099 can use
  and edit the panel with your token's permissions. Keep it on your LAN or behind an
  authenticating proxy.
- You can also just open `http://<docker-host>:8099` directly.
- The *Navigate* action changes the parent Home Assistant page when the panel runs
  inside an iframe on the same origin (add-on ingress). With a Webpage dashboard on a
  different origin it opens the path in the top window instead.

### Environment variables

| Variable | Default | Meaning |
| --- | --- | --- |
| `HA_URL` | | Home Assistant base URL, e.g. `http://homeassistant.local:8123` |
| `HA_TOKEN` | | Long-lived access token |
| `PORT` | `8099` | Listen port |
| `DATA_DIR` | `/data` | Where `floorplan.json` and `images/` live |

## Using it

1. Press **Edit**. On first run you land on the **Views** tab.
2. **Add floor image** for each floor, **Add hero image** for an optional header
   picture. Reorder, rename or replace them there. Click a card to make it the
   active view (it gets an outline).
3. In **Entities**, search and click an entity to drop it on the active view, then
   drag it where it belongs.
4. In **Selected**, choose the display type (icon, glow, text, badge), icon, size, colour,
   and the **tap** / **hold** actions.
5. Press **Done**. Changes autosave.

Tips: use *Text* for temperature or power sensors, *Glow* for lights, *Badge* for short
status pills such as "Garage · closed". For a custom action pick *Call service*,
e.g. `light.turn_on` with `{"brightness_pct": 40}`; the entity is added automatically.

## Development

```bash
npm install
npm run dev        # server on :8099, Vite on :5173 (open this one)
npm run build && npm start
```

Without `HA_URL`/`HA_TOKEN` the app runs in demo mode. Data is written to `./data`.

Layout: `server/index.mjs` (API, uploads, WebSocket proxy), `src/` (React UI),
`floorplan-ha/` (add-on manifest), `Dockerfile`.

## Publishing the image (maintainers)

Tagging `vX.Y.Z` runs `.github/workflows/docker.yml`, which pushes a multi-arch image to
`ghcr.io/<owner>/floorplan-ha`. Keep `version` in `floorplan-ha/config.yaml` equal to the
tag and make the package public so Home Assistant can pull it.

## Limitations

- Positions are percentages of the image, so replacing an image with a very different
  aspect ratio means re-placing items.
- Icons come from a curated Material Design set rather than every MDI icon.
- No authentication in standalone mode (see above).
