// jshint esversion: 6

// forward all messages to content script
function forwardMessageToTabs(request, tabs) {

	tabsLength = tabs.length;
	for (let i = 0; i < tabsLength; i++) {

		// force dispatch to every tab since we cannot identify them
		request.dispatcherIndex = -1;
		forwardMessageToTab(request, tabs[i]);
	}
}
function forwardMessageToTab(request, tab) {

	if (
		(tab.discarded === true) ||
		(tab.hidden === true) ||
		(tab.status !== 'complete')
	) {
		return;
	}

	// yields error message for each tab that doesn't match the manifest's "content_scripts": Could not establish connection. Receiving end does not exist.
	// it is safe to ignore this
	chrome.tabs.sendMessage(tab.id, request);
}
chrome.runtime.onMessage.addListener(function(request) {

	// actions
	if (request && request.action) {

		switch (request.action) {

			case 'openBlacklist':

				chrome.tabs.create({ active: true, url: '/views/blacklist.html' });

			break;
		}

	// passthrough
	} else {

		// since we cannot detect which tabs are on twitch.tv (would require "tabs" permission), we target all tabs
		chrome.tabs.query({ windowType: 'normal' }, function(tabs) {

			forwardMessageToTabs(request, tabs);
		});
	}
});
