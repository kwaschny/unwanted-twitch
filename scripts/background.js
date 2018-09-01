// jshint esversion: 6

const twitchUrl = 'https://www.twitch.tv/';

// enable icon on twitch.tv tabs only
function checkForSupportedURL(tabID, changeInfo, tab) {

	if ((typeof tab.url === 'string') && (tab.url.indexOf(twitchUrl) === 0)) {

		chrome.pageAction.show(tabID);
	}
}
chrome.tabs.onUpdated.addListener(checkForSupportedURL);

// forward all messages to content script
function forwardMessageToTabs(request, tabs, isGlobal) {

	let relevantTabs = [];

	let tabsLength = tabs.length;
	for (let i = 0; i < tabsLength; i++) {

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

	chrome.tabs.query({ url: (twitchUrl + '*') }, function(tabs) {

		forwardMessageToTabs(request, tabs, isGlobal);
	});
});