// jshint esversion: 6

const twitchUrl = 'https://www.twitch.tv/';

// enable icon on twitch.tv tabs only
function checkForSupportedURL(tabID, changeInfo, tab) {

	if ((typeof tab.url === 'string') && (tab.url.indexOf(twitchUrl) === 0)) {

		chrome.pageAction.show(tabID);
	}
}
chrome.tabs.onUpdated.addListener(checkForSupportedURL); // Chrome does not support page_action.show_matches in manifest

// forward all messages to content script
function forwardMessageToTabs(request, tabs, isGlobal) {

	let relevantTabs = [];

	let tabsLength = tabs.length;
	for (let i = 0; i < tabsLength; i++) {

		// tabs where "url" is provided are on twitch.tv (implicit permission)
		if (typeof tabs[i].url === 'string') {

			relevantTabs.push(tabs[i]);
		}
	}

	tabsLength = relevantTabs.length;
	for (let i = 0; i < tabsLength; i++) {

		chrome.tabs.sendMessage(relevantTabs[i].id, request);

		if (isGlobal === true) { break; }
	}
}
chrome.runtime.onMessage.addListener(function(request) {

	const isGlobal = (request && (typeof request.blacklistedItems === 'object'));

	// does not require "tabs" permission (implicit permission on twitch.tv)
	chrome.tabs.query({ url: (twitchUrl + '*') }, function(tabs) {

		forwardMessageToTabs(request, tabs, isGlobal);
	});
});