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

function createItemRow(key) {

	let row = document.createElement('tr');
	row.className = 'item';

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

	return row;
}

function addItem(table, key) {

	// prevent adding the same key more than once
	if (itemExists(table, key) === true) {

		return false;
	}

	table.insertBefore(
		createItemRow(key),
		table.children[0].nextSibling
	);
	handleItemCount(table);

	return true;
}

function addItems(table, items) {

	if (typeof items !== 'object') {

		return handleItemCount(table);
	}

	let sortedKeys 			= ( Array.isArray(items) ? items : Object.keys(items) );
	const sortedKeysLength 	= sortedKeys.length;

	// sort items (case insensitive)
	sortedKeys = sortedKeys.sort(function (a, b) {

		return a.toLowerCase().localeCompare( b.toLowerCase() );
	});

	let fragment = document.createDocumentFragment();

	for (let i = 0; i < sortedKeysLength; i++) {

		let key = sortedKeys[i];

		// prevent adding the same key more than once
		if (itemExists(table, key) === true) { continue; }

		fragment.appendChild(
			createItemRow(key)
		);
	}

	table.appendChild(fragment);
	return handleItemCount(table);
}

function clearItems(table) {

	const rows 			= table.querySelectorAll('tr.item');
	const rowsLength 	= rows.length;

	for (let i = (rowsLength - 1); i >= 0; i--) {

		table.removeChild(rows[i]);
	}

	handleItemCount(table);

	flashSaveButton();
}

function itemExists(table, key) {

	key = key.toLowerCase();

	const presentKeys = gatherKeys(table, true);

	return (presentKeys[key] !== undefined);
}

function onAddItem(row) {

	const input = row.querySelector('input');
	const table = row.parentNode;

	let itemToAdd = input.value.trim();

	// remove any whitespace from channel names
	if (table.id === 'table_channels') {

		itemToAdd = itemToAdd.replace(/[\s]/g, '');

	// remove consecutive whitespaces
	} else {

		itemToAdd = itemToAdd.replace(/[\s]{2,}/g, ' ');
	}

	// store manually added keys as all-lowercase
	itemToAdd = itemToAdd.trim().toLowerCase();

	if (itemToAdd.length > 0) {

		addItem(table, itemToAdd);
		input.value = '';
	}

	input.focus();

	flashSaveButton();
}

function onRemoveItem() {

	const row 	= this.parentNode.parentNode;
	const table = row.parentNode;

	row.remove();
	handleItemCount(table);

	flashSaveButton();
}

function handleItemCount(table) {

	const count = table.querySelectorAll('tr.item').length;

	// update count in head
	table.parentNode.querySelector('.count').textContent = ('(' + count + ')');

	// remove row with a note about having no items
	const emptyRow = table.querySelector('tr.empty');
	if (emptyRow !== null) {

		emptyRow.remove();
	}

	// append row with a note about having no items
	if (count === 0) {

		let row = document.createElement('tr');
		row.className = 'empty';

		let cell = document.createElement('td');
		cell.setAttribute('colspan', 2);
		cell.textContent = chrome.i18n.getMessage('blacklist_Empty');

		row.appendChild(cell);
		table.appendChild(row);

		// hide "Clear" button
		table.parentNode.querySelector('button.clear').style.display = 'none';

	} else {

		// show "Clear" button
		table.parentNode.querySelector('button.clear').style.display = 'inline-block';
	}

	return count;
}

function gatherKeys(table, allLowerCase) {

	let result = {};

	let nodes = table.querySelectorAll('[data-key]');
	const nodesLength = nodes.length;

	for (let i = 0; i < nodesLength; i++) {

		let key = nodes[i].getAttribute('data-key');

		if (allLowerCase === true) {

			key = key.toLowerCase();
		}

		result[key] = 1;
	}

	return result;
}

function onSave() {

	let result = {};

	result.categories 	= gatherKeys(categories);
	result.channels 	= gatherKeys(channels);
	result.tags 		= gatherKeys(tags);

	chrome.runtime.sendMessage(
		{ 'blacklistedItems': result }
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

function onImport() {

	let input = document.createElement('input');
	input.type = 'file';
	input.accept = '.json,.txt';

	input.addEventListener('change', function(event) {

		if (event.target.files.length === 0) { return; }

		// reader
		const reader = new FileReader();
		reader.addEventListener('load', function() {

			let processed = false;

			try {

				const deserializedImport = JSON.parse(reader.result);

				if (typeof deserializedImport === 'object') {

					if ( Array.isArray(deserializedImport.categories) ) {

						addItems(categories, deserializedImport.categories);
					}

					if ( Array.isArray(deserializedImport.channels) ) {

						addItems(channels, deserializedImport.channels);
					}

					if ( Array.isArray(deserializedImport.tags) ) {

						addItems(tags, deserializedImport.tags);
					}

					processed = true;

				} else {

					console.warn('UnwantedTwitch: Unexpected content:', deserializedImport);
				}

			} catch (exception) {

				console.error('UnwantedTwitch: Exception caught:', exception);
			}

			if (processed === true) {

				alert( chrome.i18n.getMessage('blacklist_ImportSuccess') );

			} else {

				alert( chrome.i18n.getMessage('blacklist_ImportFailure') );
			}
		});
		reader.addEventListener('error', function() {

			alert('Unwanted Twitch:\nUnexpected error while reading the selected file.');
		});

		const content = reader.readAsText(
			event.target.files[0]
		);
	});

	// trigger dialog
	input.click();
}

function onExport() {

	let result = {};

	result.categories 	= Object.keys( gatherKeys(categories) );
	result.channels 	= Object.keys( gatherKeys(channels)   );
	result.tags 		= Object.keys( gatherKeys(tags)       );

	const serializedBlacklist = JSON.stringify(result);

	let download = document.createElement('a');
	download.setAttribute('href', 'data:application/json;charset=utf-8,' + encodeURIComponent(serializedBlacklist));
	download.setAttribute('download', 'UnwantedTwitch_Blacklist.json');

	// trigger dialog
	document.body.appendChild(download);
	download.click();
	document.body.removeChild(download);
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

// indicates if there are changes to save
let isModified = false;

/* BEGIN: prepare elements */

	const categories 	= document.getElementById('table_categories');
	const channels 		= document.getElementById('table_channels');
	const tags 			= document.getElementById('table_tags');

	const saveButton 	= document.getElementById('save');
	const cancelButton 	= document.getElementById('cancel');

	const importButton 	= document.getElementById('import');
	const exportButton 	= document.getElementById('export');

/* END: prepare elements */

// "clear" buttons
document.querySelectorAll('button.clear').forEach(function(e) {

	e.addEventListener('click', function() {

		const table = e.parentNode.parentNode.parentNode.parentNode.querySelector('tbody');
		clearItems(table);
	});
});

// "add" buttons
document.querySelectorAll('button.add').forEach(function(e) {

	e.addEventListener('click', function() {

		onAddItem(this.parentNode.parentNode);
	});
});

// "add" inputs
document.querySelectorAll('tr.input input').forEach(function(e) {

	e.addEventListener('keydown', function(event) {

		// listen to ENTER key
		if (event.which === 13) {

			onAddItem(this.parentNode.parentNode);
		}
	});
});

/* BEGIN: button actions */

	saveButton.addEventListener('click', onSave);
	cancelButton.addEventListener('click', onCancel);

	importButton.addEventListener('click', onImport);
	exportButton.addEventListener('click', onExport);

/* END: button actions */

/* BEGIN: localize */

	document.getElementById('column_Categories').textContent 	= chrome.i18n.getMessage('blacklist_Categories');
	document.getElementById('column_Channels').textContent 		= chrome.i18n.getMessage('blacklist_Channels');
	document.getElementById('column_Tags').textContent 			= chrome.i18n.getMessage('blacklist_Tags');

	document.querySelectorAll('button.clear').forEach(function(e) {

		e.textContent = chrome.i18n.getMessage('blacklist_RemoveAll');
	});
	document.querySelectorAll('button.add').forEach(function(e) {

		e.textContent = chrome.i18n.getMessage('blacklist_Add');
	});

	document.querySelectorAll('#table_categories tr.input input').forEach(function(e) {

		e.placeholder = chrome.i18n.getMessage('blacklist_CategoriesInput');
	});
	document.querySelectorAll('#table_channels tr.input input').forEach(function(e) {

		e.placeholder = chrome.i18n.getMessage('blacklist_ChannelsInput');
	});
	document.querySelectorAll('#table_tags tr.input input').forEach(function(e) {

		e.placeholder = chrome.i18n.getMessage('blacklist_TagsInput');
	});

	saveButton.textContent 		= chrome.i18n.getMessage('blacklist_Save');
	cancelButton.textContent 	= chrome.i18n.getMessage('blacklist_Cancel');

	importButton.textContent 	= chrome.i18n.getMessage('blacklist_Import');
	exportButton.textContent 	= chrome.i18n.getMessage('blacklist_Export');

/* END: localize */

// load blacklisted items
chrome.storage.sync.get(null, function(result) {

	let blacklistedItems = {};
	if (typeof result.blacklistedItems === 'object') {

		blacklistedItems = result.blacklistedItems;

	} else if (typeof result['blItemsFragment0'] === 'object') {

		blacklistedItems = mergeBlacklistFragments(result);
	}

	// backward compatibility: rename previous type "games" to "categories"
	if (typeof blacklistedItems['games'] === 'object') {

		blacklistedItems['categories'] = blacklistedItems['games'];
		delete blacklistedItems['games'];
	}

	addItems(categories, 	blacklistedItems.categories);
	addItems(channels, 		blacklistedItems.channels);
	addItems(tags, 			blacklistedItems.tags);
});