# Contributing to UnwantedTwitch

## Report bugs
Something doesn't work or is not working anymore? Please [create a bug report (issue) here on GitHub](https://github.com/kwaschny/unwanted-twitch/issues) and let me know. Put as much information as possible in the report. Please try to answer the following questions:

- What browser and what version of it are you using?
- What version of Unwanted Twitch are you using?
- Are you using other extensions that might affect the Twitch website?
- Does disabling all the other extensions (except Unwanted Twitch) help with the problem?
- What are the steps to reproduce the problem?
- If applicable: Can you show a screenshot of the issue?
- If applicable: Can you share the export of your blacklist?
- Advanced users: Share the console messages and stacktrace. **How to**: Open the developer toolbar pressing `F12` and keep it open. Reload the page you are having the issue on by pressing `F5`. Switch to the `Console` tab in the developer toolbar. Check for warnings/errors starting with `UTTV:` (consider using the filter), click on them to expand the stacktrace. Include a screenshot of it in your report.

## Suggest improvements and/or new features
Do you have suggestions to improve the extension? [Create an issue here on GitHub](https://github.com/kwaschny/unwanted-twitch/issues) and I will comment and tag it accordingly. Please don't be offended if your request is declined or not being worked on immediately. I have a day job and can only spend so much time on free software projects like this one.

## Help with additional language translations
Do you speak a language other than English or German? Help translating the extension's UI into your language. Check `/_locales/en/messages.json` for the reference translation and create a folder ([in ISO 639-1](https://en.wikipedia.org/wiki/List_of_ISO_639-1_codes)) and a `messages.json` file (take a copy of the English one) for the language you are translating into. Send a pull request once you are done. Feel free to contact me if you need further assistance.

## Help fixing bugs and/or introducing new features
If you are a developer and feel comfortable with JavaScript and the DOM, you can help with open issues. Just tell me if you spot something you would like to work on and I will assign you.

### Setting up the extension for debugging
1. Clone the repository using your favorite git tool.
2. Prepare the repository to be loaded by the browser. If you are on Windows, execute `develop_chrome.bat` to work with Chrome or `develop_firefox.bat` to work with Firefox. If you are on a *nix OS, rename `manifest.chrome.json` (for Chrome) or `manifest.firefox.json` (for Firefox) to `manifest.json`. You can only load the extension for one browser at a time.
3. Load the repository as a temporary extension. On Chrome, visit `chrome://extensions/`. On Firefox, visit `about:debugging#/runtime/this-firefox`.
4. Open `/scripts/common.js` in your favorite editor and change the debugging flag to `const debug = 1;`. This will output almost all debug information in the browser console, except trace data. Whenever you change files of a currently loaded extension, you will have to reload the extension, see step 3.

### Understanding the main loops and detection flow
Entry point is `/scripts/directory.js`. When the Twitch page `https://www.twitch.tv/` loads for the first time, the extension will wait for `DOMContentLoaded` event. When the event is fired, `init()` is invoked and loads the blacklist from storage using `getBlacklistedItems()`. It will invoke `onPageChange()` to trigger the first filter process. From now on, page changes are being monitored by comparing the current location path in small intervals of `monitorPages()` (Twitch manipulates the history instead of hard page reloads). Whenever a page change is detected, another filtering process occurs. The filtering process consists of 4 major steps: filter directory, monitor directory for scroll/toggle events, filter sidebar and observe sidebar for mutations. To be continued...
