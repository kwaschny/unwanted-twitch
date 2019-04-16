// jshint esversion: 6

// forward all messages to content script
function forwardMessageToTabs(request, tabs) {

	tabsLength = tabs.length;
	for (let i = 0; i < tabsLength; i++) {

		forwardMessageToTab(request, tabs[i]);
	}
}
function forwardMessageToTab(request, tab) {

	if (tab.discarded === true) {

		return false;
	}
	if (tab.hidden === true) {

		return false;
	}
	if (tab.status !== 'complete') {

		return false;
	}

	// causes an error when targeting about:x tabs, no workaround other than closing these tabs
	chrome.tabs.sendMessage(tab.id, request);

	return true;
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