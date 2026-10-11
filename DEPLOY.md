# Put the web app online (free)

The folder `private-diary-web` (from `private-diary-web-v0.18.zip`) is the finished app: plain files, no server code, no accounts, no tracking. Any free static host can serve it. The app sends nothing anywhere; your diary stays on each phone.

You need HTTPS (every host below gives it), because iPhones only allow installing and offline use over HTTPS.

## Option 1: Netlify (drag and drop)
1. Create a free account at netlify.com.
2. In the dashboard choose to add a new site by dragging a folder (the page is called "Deploy manually" or "Netlify Drop").
3. Unzip `private-diary-web-v0.18.zip` and drag the `private-diary-web` folder onto the page.
4. When it finishes you get an address like `https://something.netlify.app`. In Site settings you can rename it. Open it in Safari on the iPhone and follow INSTALL.md.
The bundled `_headers` file is read by Netlify and adds extra protection (the policy that blocks all network use).

## Option 2: Cloudflare Pages (upload)
1. Free account at cloudflare.com, then Workers & Pages, create a Pages project, choose to upload assets directly.
2. Upload the unzipped `private-diary-web` folder. The address looks like `https://name.pages.dev`.

## Option 3: GitHub Pages (automatic from the source; full walkthrough in GITHUB-SETUP.md)
1. Create a free account and a new repository (public is needed for free Pages on a free account).
2. Upload the whole project (the folder that contains `app`, `.github`, `INSTALL.md`). The `.github/workflows/pages.yml` file builds and publishes the app after every push to `main`.
3. In the repository: Settings, Pages, Build and deployment, set Source to **GitHub Actions**. Open the Actions tab and wait for "Publish web app" to turn green.
4. The address is `https://<your-name>.github.io/<repository-name>/`.
The source code is public in that case. The diary data never is (it is not in the repository, only on your phone).
The build runs the tests first, so a broken build is never published.

## Updating later
Upload the new folder (Options 1 and 2) or push the change (Option 3). Keep the same address, otherwise the diary on the phone appears empty (import your JSON backup).

## What cannot be checked from here
These steps were written, not run, because they need your accounts: the exact button names on each host may differ a little. The files themselves were tested in a browser here, including offline use and hosting under a sub-folder.

## Why not the App Store?
It requires a paid Apple Developer account. The Home Screen web app is the free way to get a real, offline, full-screen app on your iPhone.
