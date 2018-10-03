# Acceptance Tests

## Note about testing in Firefox
If you load the add-on via `about:debugging`, make sure to close the tab or move it to a separate window. Otherwise it will conflict with tab queries in the background script and cause unexpected behavior.

## Test Case: Blacklisting categories works
1. Open [twitch.tv/directory](https://www.twitch.tv/directory).
- [ ] A label named "X" is on the top right corner of each cover.
2. Click on one of the labels.
- [ ] The cover disappeared without leaving behind an empty space.
3. Reload the page.
- [ ] The cover is no longer visible.

## Test Case: Blacklisting channels works
1. Open [twitch.tv/directory/all](https://www.twitch.tv/directory/all).
- [ ] A label named "X" is on the top right corner of each cover.
2. Click on one of the labels.
- [ ] The cover disappeared without leaving behind an empty space.
3. Reload the page.
- [ ] The cover is no longer visible.

## Test Case: Blacklisting tags works in categories directory
1. Open [twitch.tv/directory](https://www.twitch.tv/directory).
- [ ] A label named "X" is on the right side (Firefox: at the bottom) of each tag label below the covers.
2. Click on one of the labels.
- [ ] A prompt asks you to confirm your action.
- [ ] The cover disappeared without leaving behind an empty space.
3. Reload the page.
- [ ] The cover is no longer visible.

## Test Case: Blacklisting tags works in channels directory
1. Open [twitch.tv/directory/all](https://www.twitch.tv/directory/all).
- [ ] A label named "X" is on the right side (Firefox: at the bottom) of each tag label below the covers.
2. Click on one of the labels.
- [ ] A prompt asks you to confirm your action.
- [ ] The cover disappeared without leaving behind an empty space.
3. Reload the page.
- [ ] The cover is no longer visible.

## Test Case: Sidebar is filtered in directory
1. Open [twitch.tv/directory/all](https://www.twitch.tv/directory/all).
2. Block a channel that is listed on the left sidebar under Featured/Recommended channels using the directory view.
3. Reload the page.
- [ ] The corresponding list item is no longer visible in the sidebar.
4. Shrink the browser viewport to the point where the sidebar collapses.
- [ ] The corresponding small cover is no longer visible in the sidebar.

## Test Case: Scrolling is detected in categories directory
1. Open [twitch.tv/directory](https://www.twitch.tv/directory).
2. Scroll down until new covers are added.
- [ ] A label named "X" appears on the top right corner of each cover that was added after scrolling.

## Test Case: Scrolling is detected in channels directory
1. Open [twitch.tv/directory/all](https://www.twitch.tv/directory/all).
2. Scroll down until new covers are added.
- [ ] A label named "X" appears on the top right right of each cover that was added after scrolling.

## Test Case: Frontpage is filtered as anonymous user
1. Open [twitch.tv/](https://www.twitch.tv/) as anonymous user (not being logged in).
- [ ] Previously hidden covers should disappear beneath Featured/Top sections, leaving a blank container.

## Test Case: Frontpage is filtered as authenticated user
1. Open [twitch.tv/](https://www.twitch.tv/) as authenticated user (being logged in).
- [ ] Previously hidden covers should disappear beneath Popular/Recommended sections, leaving a blank container.

## Test Case: Back action page changes are detected
1. Navigate between different pages on [twitch.tv](https://www.twitch.tv/).
2. Use the "back" function (browser history).
- [ ] Previously hidden covers should disappear.
- [ ] A label to hide the item should appear on the top right corner of each cover.

## Test Case: Management button appears in categories directory
1. Open [twitch.tv/directory](https://www.twitch.tv/directory).
- [ ] A button named "Manage Blacklist" appears next to the filters at the top of the directory.
2. Click on the button.
- [ ] A new tab opens up that shows the Blacklist management.

## Test Case: Management button appears in channels directory
1. Open [twitch.tv/directory/all](https://www.twitch.tv/directory/all).
- [ ] A button named "Manage Blacklist" appears next to the filters at the top of the directory.
2. Click on the button.
- [ ] A new tab opens up that shows the Blacklist management.

## Test Case: Toggle extension works
1. Click on the UnwantedTwitch icon in the extension bar.
- [ ] A dialog appears with a button named "Disable Extension".
2. Click on "Disable Extension".
- [ ] The page reloads and all previously hidden covers reappear.
3. Open up the dialog once more and click on "Enable Extension".
- [ ] The page reloads and all previously hidden covers disappear once again.

## Test Case: Blacklist management works
1. Click on the UnwantedTwitch icon in the extension bar.
- [ ] A dialog appears with a button named "Manage Blacklist".
2. Click on "Manage Blacklist".
- [ ] A new tab opens up that shows 3 categories: "Blacklisted Categories", "Blacklisted Channels" and "Blacklisted Tags"
- [ ] Previously hidden covers appear in their category
3. Remove some entries under these categories using the "Remove" button next to each entry and confirm clicking on the "Save" button.
- [ ] An alert shows that notifies about reloading already opened tabs.
4. Reload already opened twitch.tv tabs.
- [ ] The removed entries reappear with their cover in the corresponding categories.
