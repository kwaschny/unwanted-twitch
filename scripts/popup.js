// jshint esversion: 6

async function openBlacklist() {

	await chrome.tabs.create({ active: true, url: '/views/blacklist.html' });
}

async function getState() {

	const result = await storageGet([ 'enabled', 'renderButtons' ]);

	let enabled       = true;
	let renderButtons = true;

	// enabled
	if (typeof result.enabled === 'boolean') {

		enabled = result.enabled;
	}

	// renderButtons
	if (typeof result.renderButtons === 'boolean') {

		renderButtons = result.renderButtons;
	}

	return [ enabled, renderButtons ];
}

async function enableExtension() {

	try {
		await chrome.runtime.sendMessage({ 'extension': 'enable' });
	}
	catch (error) {
		logError('Failed to enable extension.', error);
	}
}

async function disableExtension() {

	try {
		await chrome.runtime.sendMessage({ 'extension': 'disable' });
	}
	catch (error) {
		logError('Failed to disable extension.', error);
	}
}

function toggleExtension() {

	if (this.classList.contains('enabled')) {

		disableExtension();

	} else if (this.classList.contains('disabled')) {

		enableExtension();
	}

	window.close();
}

async function toggleButtonsToggle() {

	try {
		await chrome.runtime.sendMessage({ 'renderButtons': this.checked });
	}
	catch (error) {
		logError('Failed to toggle button visibility.', error);
	}
}

// prepare elements
const blacklistManagerButton = document.getElementById('open_blacklist');
const stateToggleButton      = document.getElementById('toggle_extension');
const buttonsToggleButton    = document.getElementById('toggle_buttons');

// button actions
blacklistManagerButton.addEventListener('click', openBlacklist);
stateToggleButton.addEventListener('click', toggleExtension);
buttonsToggleButton.addEventListener('change', toggleButtonsToggle);

// localize
blacklistManagerButton.textContent                                = chrome.i18n.getMessage('popup_ManageBlacklist');
stateToggleButton.textContent                                     = chrome.i18n.getMessage('popup_DisableExtension');
buttonsToggleButton.parentNode.querySelector('label').textContent = chrome.i18n.getMessage('popup_ToggleButtons');

// initialize state
const init = async() => {

	const [ enabled, renderButtons ] = await getState();
	console.log(enabled, renderButtons);
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
};
init();
