// jshint esversion: 6

const twitchUrl = 'https://www.twitch.tv/';

// enable icon on twitch.tv tabs only
async function checkForSupportedURL(tabID, _, tab) {

	if (
		(typeof tab.url === 'string') &&
		(tab.url.indexOf(twitchUrl) === 0)
	) {
		await chrome.action.enable(tabID);
	}
	else {
		await chrome.action.disable(tabID);
	}
}
chrome.tabs.onUpdated.addListener(checkForSupportedURL);

// forward all messages to content script
async function forwardMessageToTabs(request, tabs) {

	tabsLength = tabs.length;
	for (let i = 0; i < tabsLength; i++) {

		// force dispatch to every tab since we cannot identify them
		request.dispatcherIndex = -1;
		await forwardMessageToTab(request, tabs[i]);
	}
}
async function forwardMessageToTab(request, tab) {

	if (
		(tab.discarded === true) ||
		(tab.hidden === true) ||
		(tab.status !== 'complete')
	) {
		return;
	}

	// yields error message for each tab that doesn't match the manifest's "content_scripts": Could not establish connection. Receiving end does not exist.
	// it is safe to ignore this
	await chrome.tabs.sendMessage(tab.id, request);
	const error = chrome.runtime.lastError;

	if (error) {

		logError('chrome.runtime.sendMessage', error);
	}
}
chrome.runtime.onMessage.addListener(async(request) => {

	// actions
	if (request && request.action) {

		switch (request.action) {

			case 'openBlacklist':
				await chrome.tabs.create({ active: true, url: '/views/blacklist.html' });
			break;
		}

	// passthrough
	} else {

		// since we cannot detect which tabs are on twitch.tv (would require "tabs" permission), we target all tabs
		const tabs = await chrome.tabs.query({ windowType: 'normal' });
		await forwardMessageToTabs(request, tabs);
	}
});
