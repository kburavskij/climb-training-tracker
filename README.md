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

## Data and timer limitations

- Data does not sync between devices or browser profiles. Export JSON backups regularly, especially before clearing site data or removing the app.
- Data created from a local file or another URL does not automatically move to the GitHub Pages origin. Export it there and import it into the hosted app.
- iOS can suspend web apps when they are backgrounded or the screen locks. The timer corrects itself from timestamps when the app resumes, but background sounds, vibration and continuous on-screen updates are not guaranteed.
- The service worker makes the app itself available offline. External evidence links still require a connection.

This tracker provides general planning information, not individualized medical or nutrition advice.
