# Neo 2 Flight Check

A small web app that tells you whether local conditions are safe to fly a **DJI Neo 2**.
It runs in any phone browser and can be installed to your home screen. There's nothing to
build and no API key.

## What it checks

| Check | Go | Caution | No-go |
|---|---|---|---|
| Wind (10 m) | < 5.4 m/s (~12 mph) | 5.4–8.6 m/s | ≥ 8.6 m/s (~19 mph) |
| Gusts | < 7.5 m/s (~17 mph) | 7.5–10.7 m/s | ≥ 10.7 m/s (~24 mph), the Neo 2's rated limit |
| Wind at altitude (80 m) | < 8 m/s | 8–10.7 m/s | ≥ 10.7 m/s |
| Precipitation | dry, < 40% chance | ≥ 40% chance | any rain, snow or drizzle (the Neo 2 isn't waterproof) |
| Thunderstorm | | | any |
| Visibility | ≥ 5 km | 1–5 km | < 1 km |
| Temperature | 5–35 °C | −10–5 °C or 35–40 °C | outside −10–40 °C (operating range) |
| Fog / condensation | temp − dew point ≥ 2 °C | < 2 °C | fog reported |
| Daylight | day | night | |
| GPS (Kp index) | < 5 | 5–6 | ≥ 7 |
| Takeoff elevation | | | > 2000 m |

The overall verdict is the worst of all checks. The **Next 24 hours** strip shows the
same verdict for each hour. It also points out the next good flying window. Tap an hour
to see its breakdown.

The limits come from DJI's Neo 2 specs: 10.7 m/s (Level 5) max wind resistance, a
−10 to 40 °C operating range and a 2000 m max takeoff altitude. You can change the
thresholds in [`conditions.js`](conditions.js).

## Data sources

- [Open-Meteo](https://open-meteo.com/): forecast and place search (free, no key)
- [NOAA SWPC](https://www.swpc.noaa.gov/): planetary K-index, for GPS reliability

## Run it

It's a static site, so serve the folder over HTTP:

```sh
npm start          # or: python3 -m http.server 8080
```

Then open http://localhost:8080. Your browser only lets the app use location (and work
offline) over HTTPS or on localhost.

### Put it on your phone

1. In the GitHub repo, go to **Settings → Pages**. Set the source to *Deploy from a branch*,
   pick the branch and `/ (root)`, and save.
2. Open the Pages URL on your phone and allow location access.
3. Add it to your home screen. On iOS, use Safari's Share menu and tap **Add to Home Screen**.
   On Android, open Chrome's menu and tap **Install app**.

## Tests

```sh
npm test
```

> This is guidance, not a guarantee. Always check airspace restrictions (B4UFLY in the US,
> or your local equivalent), follow local drone rules, and use your own judgment.
