# Put Private Diary on your iPhone with GitHub (step by step)

**Easiest way:** unzip, then double-click `PUBLISH-TO-GITHUB.bat`. It installs Git and the GitHub tool if needed, asks you to sign in once in the browser, creates the repository, switches on Pages and uploads everything. The manual steps below are the fallback. An illustrated version of this guide is published as the artifact "Private Diary on GitHub".

Cost: nothing. Time: about 20 minutes the first time. You need a Windows PC (what you used before) and your iPhone.
GitHub builds the app for you and hosts it for free at an address like `https://YOURNAME.github.io/private-diary/`. Your diary is never stored there. It is created on your phone.

## Part 1: Accounts and tools (once)
1. Create a free account at https://github.com (Sign up). Remember your **username**.
2. Install **Git for Windows**: open PowerShell and run `winget install Git.Git`, or download it from https://git-scm.com. Close and reopen PowerShell afterwards.
3. Tell Git who you are (PowerShell, one time):
   `git config --global user.name "YOURNAME"`
   `git config --global user.email "you@example.com"`

## Part 2: Create the repository on GitHub
1. On github.com click the **+** (top right), then **New repository**.
2. Repository name: `private-diary` (keep it simple, lowercase; the name becomes part of the address).
3. Choose **Public**. (Free GitHub Pages needs a public repository. Only the app's code is public, never your diary.)
4. Leave "Add a README", ".gitignore" and "license" all **unchecked**. Click **Create repository**.
5. Leave that page open. It shows the address of the repository, for example `https://github.com/YOURNAME/private-diary.git`.

## Part 3: Upload the project from your PC
1. Unzip `private-diary-v0.18.zip`. Open the folder `diary-app`. It contains `app`, `.github`, `INSTALL.md` and more.
2. Click into the address bar of that folder window, type `powershell` and press Enter. A PowerShell window opens inside the folder.
3. Run these commands one at a time (replace YOURNAME):
   ```
   git init
   git add .
   git commit -m "Private Diary v0.18"
   git branch -M main
   git remote add origin https://github.com/YOURNAME/private-diary.git
   git push -u origin main
   ```
4. The first push opens a browser window asking you to sign in to GitHub. Approve it. When the command finishes, refresh the repository page: you see your files, including a folder called `.github`.

## Part 4: Turn on GitHub Pages
1. In the repository click **Settings** (top row of tabs), then **Pages** in the left list.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**. (Nothing else to fill in.)

## Part 5: Build and publish
1. Click the **Actions** tab. You see a run called **Publish web app** from your push. It probably failed or is waiting, because Pages was not switched on yet.
2. Open that run and click **Re-run all jobs** (or choose **Publish web app** on the left, then **Run workflow**).
3. Wait 3 to 6 minutes. Both steps, **build** and **deploy**, must turn green.
   - The build step runs all the unit tests and the security checks first. If one fails, nothing is published. Open the red step and send me a screenshot.
4. Click the finished **deploy** step. It shows the address of your app: `https://YOURNAME.github.io/private-diary/`. You can also find it under Settings, Pages.

## Part 6: Install on the iPhone
1. On the iPhone open **Safari** and type the address from Part 5. The Private Diary opens (the first load needs internet).
2. Tap the **Share** button (square with an arrow up), scroll down, tap **Add to Home Screen**, then **Add**.
3. Close Safari. Open **Diary** from the Home Screen.
4. Create your passcode (a passphrase is stronger) and write the recovery key on paper.
5. Test once: switch on airplane mode and open the app. It must still work.
6. From now on open the diary only from the Home Screen icon, never from Safari. Safari deletes stored data of sites you have not visited for a week.

## Part 7: Move your old diary over (if you used Expo Go)
1. In the old app: Settings, **Export as JSON**, save the file to Files.
2. In the new app: Settings, **Import from a file**, choose that file, tap Import.
Photos and locations do not move.

## Later: updating the app
Replace the files in your folder with a new version, then in PowerShell in that folder:
```
git add .
git commit -m "Update"
git push
```
GitHub publishes it automatically. On the iPhone close the app completely and open it again twice while online. Keep the same repository name, otherwise the address changes and the diary on the phone shows empty (import your JSON backup).

## If something goes wrong
- **"remote origin already exists"**: run `git remote remove origin` and repeat the `git remote add` line.
- **Push is refused or asks for a password**: sign in through the browser window that Git opens, or install GitHub Desktop and sign in there.
- **Actions tab shows no run**: check that the `.github` folder is in the repository (it must be at the top level next to `app`). Then use Run workflow.
- **"There isn't a GitHub Pages site here" (404)**: you opened `https://YOURNAME.github.io` without the repository name. Use `https://YOURNAME.github.io/private-diary/`.
- **The full address still shows "404"**: Pages is not set to GitHub Actions (Part 4), or the deploy step has not finished. Wait a minute and refresh.
- **The page opens but is blank**: the repository name must be the same as in the address. Do not rename the repository after publishing.
- **Remember**: the diary exists only on your phone. Export a JSON backup now and then.

- **"[rejected] main -> main (fetch first)"**: the repository already had other content. Use the newest `PUBLISH-TO-GITHUB.bat` (it replaces that content), or run `git push -u origin main --force` in the project folder.
- **The script says the folder is a temporary preview**: right-click the zip, choose Extract All, and run the file from the extracted `diary-app` folder.
