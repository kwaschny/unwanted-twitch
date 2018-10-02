// jshint esversion: 6
// jshint -W069

// maximum number of keys that can be stored in the sync storage
// chrome.storage.sync.MAX_ITEMS - 12 (wiggle room)
const storageSyncMaxKeys = 500;

/**
 * Merges the provided blacklist fragments back into blacklist items.
 */
function mergeBlacklistFragments(fragments) {

	let result = {};

	for (let i = 0; i < storageSyncMaxKeys; i++) {

		let fragmentKey = ('blItemsFragment' + i);

		let fragment = fragments[fragmentKey];
		if (fragment === undefined) { break; }

		for (let type in fragment) {
			if (!fragment.hasOwnProperty(type)) { continue; }

			if (result[type] === undefined) {

				result[type] = {};
			}

			const itemList 			= fragment[type];
			const itemListLength 	= itemList.length;
			for (let n = 0; n < itemListLength; n++) {

				result[type][itemList[n]] = 1;
			}
		}

	}

	return result;
}

function addItems(table, items) {

	if (typeof items !== 'object') {

		return handleItemCount(table);
	}

	// sort items (case insensitive)
	const sortedKeys = Object.keys(items).sort(function (a, b) {

		return a.toLowerCase().localeCompare( b.toLowerCase() );
	});
	const sortedKeysLength = sortedKeys.length;

	let fragment = document.createDocumentFragment();

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
	}

	table.appendChild(fragment);
	handleItemCount(table, sortedKeysLength);
}

function clearItems(table) {

	while (table.firstChild) {

		table.removeChild(table.firstChild);
	}
	handleItemCount(table);

	flashSaveButton();
}

function onRemoveItem() {

	const row 	= this.parentNode.parentNode;
	const table = row.parentNode;

	row.remove();
	handleItemCount(table);

	flashSaveButton();
}

function handleItemCount(table, count) {

	if (count === undefined) {

		count = table.children.length;
	}

	table.parentNode.querySelector('.count').textContent = ('(' + count + ')');

	// append row with a note about having no items
	if (count === 0) {

		let row = document.createElement('tr');

		let cell = document.createElement('td');
		cell.setAttribute('colspan', 2);
		cell.textContent = chrome.i18n.getMessage('blacklist_Empty');

		row.appendChild(cell);
		table.appendChild(row);

		table.parentNode.querySelector('button.clear').style.display = 'none';
	}
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

	result.categories 	= gatherKeys(categories);
	result.channels 	= gatherKeys(channels);
	result.tags 		= gatherKeys(tags);

	chrome.runtime.sendMessage(
		{ "blacklistedItems": result }
	);

	if (isModified === true) {

		alert( chrome.i18n.getMessage('alert_ReloadNote') );
	}

	onCancel();
}

function onCancel() {

	chrome.tabs.getCurrent(function(tab) {

		chrome.tabs.remove(tab.id);
	});
}

function flashSaveButton(interval) {

	if (typeof interval !== 'number') {

		interval = 400;
	}

	if (isModified === true) { return; }
	isModified = true;

	setInterval(function() {

		saveButton.classList.toggle('flashed');

	}, interval);
}

let isModified = false;

const categories 	= document.getElementById('table_categories');
const channels 		= document.getElementById('table_channels');
const tags 			= document.getElementById('table_tags');

const saveButton 	= document.getElementById('save');
const cancelButton 	= document.getElementById('cancel');

document.querySelectorAll('button.clear').forEach(function(e) {

	e.addEventListener('click', function() {

		const table = e.parentNode.parentNode.parentNode.parentNode.querySelector('tbody');
		clearItems(table);
	});
});

saveButton.addEventListener('click', onSave);
cancelButton.addEventListener('click', onCancel);

/* BEGIN: localize */

	document.getElementById('column_Categories').textContent 	= chrome.i18n.getMessage('blacklist_Categories');
	document.getElementById('column_Channels').textContent 		= chrome.i18n.getMessage('blacklist_Channels');
	document.getElementById('column_Tags').textContent 			= chrome.i18n.getMessage('blacklist_Tags');

	document.querySelectorAll('button.clear').forEach(function(e) {

		e.textContent = chrome.i18n.getMessage('blacklist_RemoveAll');
	});

	saveButton.textContent 		= chrome.i18n.getMessage('blacklist_Save');
	cancelButton.textContent 	= chrome.i18n.getMessage('blacklist_Cancel');

/* END: localize */

// load blacklisted items
chrome.storage.sync.get(null, function(result) {

	let blacklistedItems = {};
	if (typeof result.blacklistedItems === 'object') {

		blacklistedItems = result.blacklistedItems;

	} else if (typeof result['blItemsFragment0'] === 'object') {

		blacklistedItems = mergeBlacklistFragments(result);
	}

	// rename previous type "games" to "categories"
	if (typeof blacklistedItems['games'] === 'object') {

		blacklistedItems['categories'] = blacklistedItems['games'];
		delete blacklistedItems['games'];
	}

	addItems(categories, 	blacklistedItems.categories);
	addItems(channels, 		blacklistedItems.channels);
	addItems(tags, 			blacklistedItems.tags);
});