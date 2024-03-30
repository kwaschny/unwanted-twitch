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

	let relevantTabs = [];

	let tabsLength = tabs.length;
	for (let i = 0; i < tabsLength; i++) {

		if (typeof tabs[i].url === 'string') {

			relevantTabs.push(tabs[i]);
		}
	}

	// only count tabs that received the forwarded message
	let dispatcherIndex = 0;

	tabsLength = relevantTabs.length;
	for (let i = 0; i < tabsLength; i++) {

		request.dispatcherIndex = dispatcherIndex;

		try {
			await chrome.tabs.sendMessage(relevantTabs[i].id, request);
			dispatcherIndex++;
		}
		catch (error) {
			console.error(error);
		}
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

		// get relevant tabs only
		const tabs = await chrome.tabs.query({ url: (twitchUrl + '*') });
		await forwardMessageToTabs(request, tabs);
	}

	return true;
});
