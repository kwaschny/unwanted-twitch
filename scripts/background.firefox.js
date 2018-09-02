// jshint esversion: 6

// forward all messages to content script
function forwardMessageToTabs(request, tabs, isGlobal) {

	tabsLength = tabs.length;
	for (let i = 0; i < tabsLength; i++) {

		// causes an error when targeting about:x tabs, no workaround other than closing these tabs
		chrome.tabs.sendMessage(tabs[i].id, request);

		if (isGlobal === true) { break; }
	}
}
chrome.runtime.onMessage.addListener(function(request) {

	// prevent forwarding a locking state multiple times
	const isGlobal = (request && (typeof request.blacklistedItems === 'object'));

	// since we cannot detect which tabs are on twitch.tv (would require "tabs" permission), we target all tabs
	chrome.tabs.query({}, function(tabs) {

		forwardMessageToTabs(request, tabs, isGlobal);
	});
});