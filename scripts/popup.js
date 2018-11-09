// jshint esversion: 6

function openBlacklist() {

	chrome.tabs.create({ active: true, url: '/views/blacklist.html' });
}

function getState(callback) {

	chrome.storage.sync.get([ 'enabled', 'renderButtons' ], function(response) {

		let enabled 		= true;
		let renderButtons 	= true;

		// enabled
		if (typeof response.enabled === 'boolean') {

			enabled = response.enabled;
		}

		// renderButtons
		if (typeof response.renderButtons === 'boolean') {

			renderButtons = response.renderButtons;
		}

		callback(enabled, renderButtons);
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

function toggleButtonsToggle() {

	chrome.runtime.sendMessage(
		{ "renderButtons": this.checked }
	);
}

const blacklistManagerButton 	= document.getElementById('open_blacklist');
const stateToggleButton 		= document.getElementById('toggle_extension');
const buttonsToggleButton 		= document.getElementById('toggle_buttons');

blacklistManagerButton.addEventListener('click', openBlacklist);
stateToggleButton.addEventListener('click', toggleExtension);
buttonsToggleButton.addEventListener('change', toggleButtonsToggle);

getState(function onGetState(enabled, renderButtons) {

	// enabled
	if (enabled === true) {

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

	// renderButtons
	buttonsToggleButton.checked = renderButtons;
});

// localize
blacklistManagerButton.textContent 									= chrome.i18n.getMessage('popup_ManageBlacklist');
stateToggleButton.textContent 										= chrome.i18n.getMessage('popup_DisableExtension');
buttonsToggleButton.parentNode.querySelector('label').textContent 	= chrome.i18n.getMessage('popup_ToggleButtons');