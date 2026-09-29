# Crux Routine

Crux Routine is a privacy-friendly, offline-capable climbing, strength, mobility and supplement tracker. It is a dependency-free static web app: all routine data stays in the browser's local storage unless you explicitly export it.

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

All asset paths are relative, so the app works both on an account site and at `https://kburavskij.github.io/climb-training-tracker/`.

## Install on iPhone

1. Open the deployed HTTPS URL in Safari.
2. Tap **Share → Add to Home Screen**.
3. Ensure **Open as Web App** is enabled, then tap **Add**.

Open the installed app online once so its offline shell is cached. If an old icon remains after an update, remove the Home Screen app and add it again; iOS caches icons aggressively.

## Offline updates

Crux checks for a new service worker when it starts, returns to the foreground, comes online, or when **Settings → Check for updates** is pressed. A downloaded release waits behind an **Update & reload** button, so the current cached version keeps working until the user applies it. An already-downloaded update can be activated while offline; local data and an active timer stay in local storage.

A failed install does not delete the previous working cache. Every release that changes the app shell or bundled assets must also change `WORKER_VERSION`/`CACHE_NAME` in `service-worker.js`; otherwise an installed cache-first copy will not discover the release.

## Calendar and alerts

Open **Calendar & alerts** on Today to share a day overview, the main session, or every route item as a calendar file. The small calendar button beside an item shares only that item. `.ics` files work with Apple Calendar, Outlook and other calendar apps; one event can also be opened directly in Google Calendar.

The Today view also has a seven-day strip. Its arrows move one week at a time; pressing the date range opens a six-week month grid with separate month arrows. Choosing a date returns to its week. The grid is fitted and horizontally locked for iPhone, so vertical page scrolling does not drag the calendar sideways.

The selected alert time is embedded in calendar files and used for app alerts. A Google Calendar draft uses the reminder defaults configured in your Google account; adjust them in Google Calendar before saving if needed. Google Calendar on desktop can import a multi-event `.ics` file, but its iPhone app cannot directly import one; on iPhone, share the file to Apple Calendar/Files or use the direct Google button for a single event.

App alerts are opt-in and deep-link back to the matching day/item. They can fire while Crux is open and can catch a currently due reminder when the app resumes. A static GitHub Pages app cannot reliably wake a suspended iPhone at a future time, so use calendar alerts when background delivery matters. Reliable Web Push would require a private server-side scheduler and would change the app's local-only privacy model.

## Exercise demonstrations

The library and interval timer use three-frame professional movement sequences. A seven-second preview appears before each new exercise, while normal rest remains between sets. Reduced-motion users see the three positions side by side instead of an animation. Movements without a trustworthy matching asset remain instruction-only rather than showing an inaccurate substitute.

The unmodified SVG frames come from [Workout Guide](https://github.com/bryllim/workout-guide) at commit `aac599224bb9780305239607ef98540b7e0ce389`, based on original Everkinetic artwork. They are licensed [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Full source and attribution details are in [`demos/ATTRIBUTION.md`](demos/ATTRIBUTION.md).

## Data and timer limitations

- Data does not sync between devices or browser profiles. Export JSON backups regularly, especially before clearing site data or removing the app.
- Data created from a local file or another URL does not automatically move to the GitHub Pages origin. Export it there and import it into the hosted app.
- iOS can suspend web apps when they are backgrounded or the screen locks. The timer corrects itself from timestamps when the app resumes, but background sounds, vibration and continuous on-screen updates are not guaranteed.
- The service worker makes the app itself available offline. External evidence links still require a connection.

This tracker provides general planning information, not individualized medical or nutrition advice.
