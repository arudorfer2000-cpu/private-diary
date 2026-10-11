# Private Diary: install on your iPhone

There are two ways. Pick the first one for daily use.

## A. Web app on your Home Screen (recommended: free, no PC needed after setup)
You put the diary online once (free, see DEPLOY.md). It contains no diary data, only the app. Then on the iPhone:

1. Open the app's address in **Safari** (not Chrome or another browser; only Safari can add an app to the Home Screen on iPhone).
2. Tap the **Share** button (square with an arrow), scroll down, tap **Add to Home Screen**, then **Add**.
3. Open **Diary** from the Home Screen. Create your passcode and write down the recovery key.
4. **Always open the diary from the Home Screen icon, not from Safari.** Safari deletes the stored data of websites you have not visited for a week; an app on the Home Screen is not treated that way.
5. Turn on airplane mode once and open the app: it must still work (it is stored on the phone after the first visit).

Moving from the Expo Go test version: in Expo Go open Settings, Export as JSON, save the file to Files. In the web app open Settings, Import from a file, choose that file. Photos and locations do not travel in exports (they stay in the old app).

Good to know about the web version:
- Face ID and the daily reminder are not available on the web. Use a passphrase, and set a daily alarm in the Clock app.
- The diary lives inside the browser on that phone. Do not use Settings > Safari > Clear History and Website Data, do not delete the Home Screen icon without a JSON backup, and export a JSON backup now and then.
- If the address changes (a new site name), the diary there starts empty. Import your JSON backup.
- Updates: when you put a new version online, the app picks it up the next time it is opened with a connection (close it fully and open it twice).

## B. Expo Go (test setup, needs the PC)
1. Install Node.js (https://nodejs.org, LTS) on the PC and unzip the project.
2. Double-click `START-DIARY.bat` (or run `npm install` then `npx expo start` in the `app` folder).
3. Install **Expo Go** from the App Store, put iPhone and PC on the same Wi-Fi, scan the QR code with the Camera app.
4. If it says "Could not connect to development server": allow Node.js through the Windows firewall (private networks), or run `npx expo start --tunnel`.
The PC must run the command every time you open the app, and Face ID may behave differently inside Expo Go.
