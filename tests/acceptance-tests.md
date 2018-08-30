# Acceptance Tests

## Test Case 1
1. Open [twitch.tv/directory](https://www.twitch.tv/directory).
- [ ] A label named "Hide Game" is on the top left corner of each cover.
2. Click on one of the labels.
- [ ] The cover disappeared without leaving behind an empty space.
3. Reload the page.
- [ ] The cover is no longer visible.

## Test Case 2
1. Open [twitch.tv/directory/communities](https://www.twitch.tv/directory/communities).
- [ ] A label named "Hide Community" is on the top left corner of each cover.
2. Click on one of the labels.
- [ ] The cover disappeared without leaving behind an empty space.
3. Reload the page.
- [ ] The cover is no longer visible.

## Test Case 3
1. Open [twitch.tv/directory/creative](https://www.twitch.tv/directory/creative).
- [ ] A label named "Hide Community" is on the top left corner of each cover.
2. Click on one of the labels.
- [ ] The cover disappeared without leaving behind an empty space.
3. Reload the page.
- [ ] The cover is no longer visible.

## Test Case 4
1. Open [twitch.tv/directory/all](https://www.twitch.tv/directory/all).
- [ ] A label named "Hide Channel" is on the top left corner of each cover.
2. Click on one of the labels.
- [ ] The cover disappeared without leaving behind an empty space.
3. Reload the page.
- [ ] The cover is no longer visible.

## Test Case 5
1. Open [twitch.tv/directory](https://www.twitch.tv/directory).
2. Scroll down until new covers are added.
- [ ] A label named "Hide Game" appears on the top left corner of each cover that was added after scrolling.

## Test Case 6
1. Open [twitch.tv/directory/all](https://www.twitch.tv/directory/all).
2. Scroll down until new covers are added.
- [ ] A label named "Hide Channel" appears on the top left corner of each cover that was added after scrolling.

## Test Case 7
1. Navigate between different pages on [twitch.tv](https://www.twitch.tv/).
2. Use the "back" function (browser history).
- [ ] Previously hidden covers should disappear.
- [ ] A label to hide the item should appear on the top left corner of each cover.

## Test Case 8
1. Click on the UnwantedTwitch icon in the extension bar.
- [ ] A dialog appears with a button named "Disable Extension".
2. Click on "Disable Extension".
- [ ] The page reloads and all previously hidden covers reappear.
3. Open up the dialog once more and click on "Enable Extension".
- [ ] The page reloads and all previously hidden covers disappear once again.

## Test Case 9
1. Click on the UnwantedTwitch icon in the extension bar.
- [ ] A dialog appears with a button named "Manage Blacklist".
2. Click on "Manage Blacklist".
- [ ] A new tab opens up that shows 4 categories: "Blacklisted Games", "Blacklisted Channels", "Blacklisted Communities" and "Blacklisted Creative"
- [ ] Previously hidden covers appear in their category
3. Remove some entries under these categories using the "Remove" button next to each entry and confirm clicking on the "Save" button.
- [ ] An alert shows that notifies about reloading already opened tabs.
4. Reload already opened twitch.tv tabs.
- [ ] The removed entries reappear with their cover in the corresponding categories.
