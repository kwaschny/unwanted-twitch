// jshint esversion: 6

function addItems(table, items) {

	// sort items
	const sortedKeys 		= Object.keys(items).sort();
	const sortedKeysLength 	= sortedKeys.length;

	let fragment = document.createDocumentFragment();
	let count = 0;

	for (let i = 0; i < sortedKeysLength; i++) {

		let key = sortedKeys[i];

		if (!items.hasOwnProperty(key)) { continue; }

		let row = document.createElement('tr');

		let cell1 = document.createElement('td');
		cell1.textContent = key;

		let cell2 = document.createElement('td');

		let button = document.createElement('button');
		button.textContent = chrome.i18n.getMessage('blacklist_Remove');
		button.setAttribute('data-key', key);
		button.addEventListener('click', onRemoveItem);

		cell2.appendChild(button);

		row.appendChild(cell1);
		row.appendChild(cell2);

		fragment.appendChild(row);
		count++;
	}

	if (count === 0) {

		let row = document.createElement('tr');

		let cell = document.createElement('td');
		cell.setAttribute('colspan', 2);
		cell.textContent = chrome.i18n.getMessage('blacklist_Empty');

		row.appendChild(cell);

		fragment.appendChild(row);
	}

	table.appendChild(fragment);
}

function onRemoveItem() {

	this.parentNode.parentNode.remove();
	flashSaveButton();
}

function gatherKeys(table) {

	let result = {};

	let nodes = table.querySelectorAll('[data-key]');
	const nodesLength = nodes.length;

	for (let i = 0; i < nodesLength; i++) {

		let key = nodes[i].getAttribute('data-key');
		result[key] = true;
	}

	return result;
}

function onSave() {

	let result = {};

	result.games 		= gatherKeys(games);
	result.channels 	= gatherKeys(channels);
	result.communities 	= gatherKeys(communities);
	result.creative 	= gatherKeys(creative);

	chrome.runtime.sendMessage(
		{ "blacklistedItems": result }
	);

	if (isModified === true) {

		alert( chrome.i18n.getMessage('blacklist_ReloadNote') );
	}

	onCancel();
}

function onCancel() {

	chrome.tabs.getCurrent(function(tab) {

		chrome.tabs.remove(tab.id);
	});
}

function flashSaveButton() {

	if (isModified === true) { return; }
	isModified = true;

	setInterval(function() {

		saveButton.classList.toggle('flashed');

	}, 1000);
}

let isModified = false;

const games 		= document.getElementById('table_games');
const channels 		= document.getElementById('table_channels');
const communities 	= document.getElementById('table_communities');
const creative 		= document.getElementById('table_creative');

const saveButton 	= document.getElementById('save');
const cancelButton 	= document.getElementById('cancel');

chrome.storage.sync.get([ 'blacklistedItems' ], function(result) {

	addItems(games, 		result.blacklistedItems.games);
	addItems(channels, 		result.blacklistedItems.channels);
	addItems(communities, 	result.blacklistedItems.communities);
	addItems(creative, 		result.blacklistedItems.creative);
});

saveButton.addEventListener('click', onSave);
cancelButton.addEventListener('click', onCancel);

// localize
document.getElementById('column_Games').textContent 		= chrome.i18n.getMessage('blacklist_Games');
document.getElementById('column_Channels').textContent 		= chrome.i18n.getMessage('blacklist_Channels');
document.getElementById('column_Communities').textContent 	= chrome.i18n.getMessage('blacklist_Communities');
document.getElementById('column_Creative').textContent 		= chrome.i18n.getMessage('blacklist_Creative');
saveButton.textContent 										= chrome.i18n.getMessage('blacklist_Save');
cancelButton.textContent 									= chrome.i18n.getMessage('blacklist_Cancel');