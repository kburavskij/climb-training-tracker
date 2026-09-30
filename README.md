# Crux Routine

Crux Routine is a privacy-friendly, offline-capable climbing, strength, mobility and supplement tracker. It is a dependency-free static web app at runtime: all routine data stays in the browser's local storage unless you explicitly export it.

## Run locally

Service workers require HTTP rather than opening `index.html` as a `file://` URL.

```sh
python3 -m http.server 8080
```

Then open <http://localhost:8080>.

## Publish with GitHub Pages

1. Push these files to the repository's default branch.
2. Open **Settings → Pages** in GitHub.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select the default branch and `/ (root)`, then save.
5. Open the HTTPS URL GitHub shows after deployment completes.

App-shell paths are relative, so the app works both on an account site and at `https://kburavskij.github.io/climb-training-tracker/`. Exercise media uses pinned absolute URLs as described below.

## Install on iPhone

1. Open the deployed HTTPS URL in Safari.
2. Tap **Share → Add to Home Screen**.
3. Ensure **Open as Web App** is enabled, then tap **Add**.

Open the installed app online once so its offline shell is cached. iOS caches Home Screen icons aggressively; if the old icon remains, export a JSON backup before removing and re-adding the Home Screen app.

## Offline updates

Crux checks for a new service worker when it starts, returns to the foreground, comes online, or when **Settings → Check for updates** is pressed. A downloaded release waits behind an **Update & reload** button, so the current cached version keeps working until the user applies it. An already-downloaded update can be activated while offline; local data and an active timer stay in local storage.

A failed install does not delete the previous working cache. Every release that changes the app shell or bundled assets must also change `WORKER_VERSION`/`CACHE_NAME` in `service-worker.js`; otherwise an installed cache-first copy will not discover the release.

## Calendar and alerts

Open **Calendar & alerts** on Today to share a day overview, the main session, or every route item as a calendar file. The small calendar button beside an item shares only that item. `.ics` files work with Apple Calendar, Outlook and other calendar apps; one event can also be opened directly in Google Calendar.

The Today view also has a seven-day strip. Its arrows move one week at a time; pressing the date range opens a six-week month grid with separate month arrows. Choosing a date returns to its week. The grid is fitted and horizontally locked for iPhone, so vertical page scrolling does not drag the calendar sideways.

The selected alert time is embedded in calendar files and used for app alerts. A Google Calendar draft uses the reminder defaults configured in your Google account; adjust them in Google Calendar before saving if needed. Google Calendar on desktop can import a multi-event `.ics` file, but its iPhone app cannot directly import one; on iPhone, share the file to Apple Calendar/Files or use the direct Google button for a single event.

App alerts are opt-in and deep-link back to the matching day/item. They can fire while Crux is open and can catch a currently due reminder when the app resumes. A static GitHub Pages app cannot reliably wake a suspended iPhone at a future time, so use calendar alerts when background delivery matters. Reliable Web Push would require a private server-side scheduler and would change the app's local-only privacy model.

## Exercise catalog and demonstrations

`exercise-catalog.json` is a local, English-only catalog generated from the
[Exercises Dataset](https://github.com/hasaneyldrm/exercises-dataset) at the pinned commit
`7455efae41b330c265e7cd4b78dfa848e7ce5ebd`. The build script keeps the bodyweight,
mobility, band, forearm and climbing-support exercises, removes selected duplicates,
and writes the compact catalog used by the app:

```sh
node scripts/build-exercise-catalog.mjs /path/to/upstream/data/exercises.json exercise-catalog.json
```

The service worker precaches the catalog metadata with the app shell, so names,
instructions, filters and saved exercises remain available offline. Thumbnails and
animation GIFs are not bundled or bulk-downloaded: they are requested from the same
pinned upstream commit only when displayed. Successfully viewed media is kept in a
separate, bounded 48-entry runtime cache as a best-effort convenience. Previously
viewed media may therefore work offline, but unviewed media needs a connection and any
browser may evict cached media under storage pressure. Loading new media contacts
`raw.githubusercontent.com`.

The interval timer shows a seven-second movement preview before each new exercise,
while normal rest remains between sets. Matching exercise GIFs animate automatically
wherever they appear and have no playback controls. If a GIF cannot load, the app falls
back to its still image; exercises without matching media remain instruction-only.

### Dataset and media licensing

The current upstream repository publishes its code, dataset structure and instruction
text under the MIT License. Its earlier history identifies ExerciseDB v1/AscendAPI as
the source of the base English data and media; ExerciseDB publishes separate usage
terms, including non-commercial limits. That provenance should be reviewed rather than
assuming the repository's later license change settled every downstream right. The
thumbnail and GIF media are different: they are **© Gym visual**, are
**not covered by MIT**, and are not presented here as free or open-license assets.
The upstream [`LICENSE`](https://github.com/hasaneyldrm/exercises-dataset/blob/7455efae41b330c265e7cd4b78dfa848e7ce5ebd/LICENSE)
and [`NOTICE.md`](https://github.com/hasaneyldrm/exercises-dataset/blob/7455efae41b330c265e7cd4b78dfa848e7ce5ebd/NOTICE.md)
say that its permission to redistribute 180×180 media does not automatically grant
downstream reuse rights. Keep the visible `© Gym visual — https://gymvisual.com/`
attribution, review [Gym visual's terms](https://gymvisual.com/content/3-terms-and-conditions-of-use)
and [ExerciseDB's terms](https://oss.exercisedb.dev/swagger), and obtain any required
permission or license before publicly or commercially deploying the integration.

<details>
<summary>Upstream MIT notice for the catalog data and instructions</summary>

MIT License

Copyright (c) 2026 Hasan Emir Yıldırım

Permission is hereby granted, free of charge, to any person obtaining a copy of this
software and associated documentation and data files (the “Software”), to deal in the
Software without restriction, including without limitation the rights to use, copy,
modify, merge, publish, distribute, sublicense, and/or sell copies of the Software,
and to permit persons to whom the Software is furnished to do so, subject to the
following conditions:

The above copyright notice and this permission notice shall be included in all copies
or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF
CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE
OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

</details>

## Data and timer limitations

- Data does not sync between devices or browser profiles. Export JSON backups regularly, especially before clearing site data or removing the app.
- Data created from a local file or another URL does not automatically move to the GitHub Pages origin. Export it there and import it into the hosted app.
- iOS can suspend web apps when they are backgrounded or the screen locks. The timer corrects itself from timestamps when the app resumes, but background sounds, vibration and continuous on-screen updates are not guaranteed.
- The service worker makes the app shell and exercise catalog available offline. New remote exercise media and external evidence links still require a connection.

This tracker provides general planning information, not individualized medical or nutrition advice.
