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

const blacklistManager 	= document.getElementById('open_blacklist');
const stateToggle 		= document.getElementById('toggle_extension');

stateToggle.addEventListener('click', toggleExtension);
blacklistManager.addEventListener('click', openBlacklist);

getEnabledState(function onEnabledState(state) {

	if (state === true) {

		document.getElementById('icon').classList.remove('disabled');

		stateToggle.classList.remove('disabled');
		stateToggle.classList.add('enabled');
		stateToggle.innerText = 'Disable Extension';

	} else {

		document.getElementById('icon').classList.add('disabled');

		stateToggle.classList.remove('enabled');
		stateToggle.classList.add('disabled');
		stateToggle.innerText = 'Enable Extension';
	}
});