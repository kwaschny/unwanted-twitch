// jshint esversion: 6

function openBlacklist() {

	chrome.tabs.create({ active: true, url: '/views/blacklist.html' });
}

function getEnabledState(callback) {

	chrome.storage.sync.get([ 'enabled' ], function(response) {

		if (typeof response.enabled === 'boolean') {

			callback(response.enabled);

		} else {

			callback(true);
		}
	});
}

function enableExtension() {

	chrome.runtime.sendMessage(
		{ "extension": "enable" }
	);
}

function disableExtension() {

	chrome.runtime.sendMessage(
		{ "extension": "disable" }
	);
}

function toggleExtension() {

	if (this.classList.contains('enabled')) {

		disableExtension();

	} else if (this.classList.contains('disabled')) {

		enableExtension();
	}

	window.close();
}

const blacklistManagerButton 	= document.getElementById('open_blacklist');
const stateToggleButton 		= document.getElementById('toggle_extension');

blacklistManagerButton.addEventListener('click', openBlacklist);
stateToggleButton.addEventListener('click', toggleExtension);

getEnabledState(function onEnabledState(state) {

	if (state === true) {

		document.getElementById('icon').classList.remove('disabled');

		stateToggleButton.classList.remove('disabled');
		stateToggleButton.classList.add('enabled');
		stateToggleButton.textContent = chrome.i18n.getMessage('popup_DisableExtension');

	} else {

		document.getElementById('icon').classList.add('disabled');

		stateToggleButton.classList.remove('enabled');
		stateToggleButton.classList.add('disabled');
		stateToggleButton.textContent = chrome.i18n.getMessage('popup_EnableExtension');
	}
});

// localize
blacklistManagerButton.textContent 	= chrome.i18n.getMessage('popup_ManageBlacklist');
stateToggleButton.textContent 		= chrome.i18n.getMessage('popup_DisableExtension');