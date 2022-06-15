// jshint esversion: 6
// jshint -W069

/* BEGIN: runtime cache */

	_getMessage_blacklist_Remove = chrome.i18n.getMessage('blacklist_Remove');

/* END: runtime cache */

function createItemRow(key) {

	let row = document.createElement('tr');
	row.className = 'item';

	let cell1 = document.createElement('td');
	cell1.textContent = key;

	let cell2 = document.createElement('td');

	let button = document.createElement('button');
	button.textContent = _getMessage_blacklist_Remove; // from runtime cache
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

	let sortedKeys         = ( Array.isArray(items) ? items : Object.keys(items) );
	const sortedKeysLength = sortedKeys.length;

	// sort items (case insensitive)
	sortedKeys = sortedKeys.sort(function (a, b) {

		return a.toLowerCase().localeCompare( b.toLowerCase() );
	});

	let fragment = document.createDocumentFragment();

	for (let i = 0; i < sortedKeysLength; i++) {

		let key = sortedKeys[i];

		fragment.appendChild(
			createItemRow(key)
		);
	}

	table.appendChild(fragment);
	return handleItemCount(table);
}

function clearItems(table) {

	const rows       = table.querySelectorAll('tr.item');
	const rowsLength = rows.length;

	for (let i = (rowsLength - 1); i >= 0; i--) {

		table.removeChild(rows[i]);
	}

	handleItemCount(table);

	flashSaveButton();
}

function itemExists(table, key) {

	key = key.toLowerCase();
	const presentKeys = gatherKeysArray(table, true);

	return (presentKeys.indexOf(key) >= 0);
}

function onAddItem(row) {

	const input = row.querySelector('input');
	const table = row.parentNode;

	let itemToAdd = input.value.trim();

	// remove consecutive whitespaces
	itemToAdd = itemToAdd.replace(/[\s]{2,}/g, ' ');

	// convert quotes in title patterns
	if (table.id === 'table_titles') {

		itemToAdd = itemToAdd.replace(/^"/, '\'');
		itemToAdd = itemToAdd.replace(/"$/, '\'');

		if (
			(itemToAdd.slice(0, 1) === '/') &&
			(itemToAdd.slice(-1) === '/')
		) {

			try {

				new RegExp(
					itemToAdd.substring(1, itemToAdd.length -1)
				);

			} catch (e) {

				alert('The entered regular expression pattern is invalid.');
			}
		}
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

	const row   = this.parentNode.parentNode;
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

function gatherKeysMap(table, allLowerCase) {

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
function gatherKeysArray(table, allLowerCase) {

	let result = [];

	let nodes = table.querySelectorAll('[data-key]');
	const nodesLength = nodes.length;

	for (let i = 0; i < nodesLength; i++) {

		let key = nodes[i].getAttribute('data-key');

		if (allLowerCase === true) {

			key = key.toLowerCase();
		}

		result.push(key);
	}

	return result;
}

function onSave() {

	// storage mode (store in local storage only)
	chrome.storage.local.set({ 'useLocalStorage': !useSyncStorageCheckbox.checked }, function() {

		// hide following
		storageSet({ 'hideFollowing': hideFollowingCheckbox.checked });

		// hide reruns
		storageSet({ 'hideReruns': hideRerunsCheckbox.checked });

		/* BEGIN: update items */

			let items = {};

			items.categories = gatherKeysMap(categories);
			items.channels   = gatherKeysMap(channels);
			items.tags       = gatherKeysMap(tags);
			items.titles     = gatherKeysArray(titles);

			// store via content script to reflect changes immediately
			chrome.runtime.sendMessage({
				'blacklistedItems': items
			});

		/* END: update items */

		if (isModified === true) {

			alert( chrome.i18n.getMessage('alert_ReloadNote') );
		}

		onCancel();
	});
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

					if ( Array.isArray(deserializedImport.titles) ) {

						addItems(titles, deserializedImport.titles);
					}

					processed = true;

				} else {

					console.warn('UnwantedTwitch: Unexpected content:', deserializedImport);
				}

			} catch (exception) {

				console.error('UnwantedTwitch: Exception caught:', exception);
			}

			toggleLoadingScreen(false);

			if (processed === true) {

				// defer alert to redraw DOM first
				setTimeout(function() {

					alert( chrome.i18n.getMessage('blacklist_ImportSuccess') );

				}, 200);

			} else {

				// defer alert to redraw DOM first
				setTimeout(function() {

					alert( chrome.i18n.getMessage('blacklist_ImportFailure') );

				}, 200);
			}
		});
		reader.addEventListener('error', function() {

			alert('Unwanted Twitch:\nUnexpected error while reading the selected file.');
		});

		toggleLoadingScreen(true);

		reader.readAsText(
			event.target.files[0]
		);
	});

	// trigger dialog
	input.click();
}

function onExport() {

	let result = {};

	result.categories = gatherKeysArray(categories);
	result.channels   = gatherKeysArray(channels);
	result.tags       = gatherKeysArray(tags);
	result.titles     = gatherKeysArray(titles);

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

function onTitlesExplained() {

	alert(
		chrome.i18n.getMessage('blacklist_TitlesExplainedText')
	);
}

function toggleLoadingScreen(show) {

	if (show === true) {

		processingScreen.removeAttribute('hidden');

	} else {

		processingScreen.setAttribute('hidden', '');
	}

	saveButton.disabled   = show;
	importButton.disabled = show;
	exportButton.disabled = show;
}

// indicates if there are changes to save
let isModified = false;

/* BEGIN: prepare elements */

	const hideFollowingCheckbox  = document.getElementById('hideFollowing');
	const hideRerunsCheckbox     = document.getElementById('hideReruns');
	const useSyncStorageCheckbox = document.getElementById('useSyncStorage');

	const categories      = document.getElementById('table_categories');
	const channels        = document.getElementById('table_channels');
	const tags            = document.getElementById('table_tags');
	const titles          = document.getElementById('table_titles');
	const titlesExplained = document.getElementById('titles_explained');

	const saveButton   = document.getElementById('save');
	const cancelButton = document.getElementById('cancel');

	const importButton = document.getElementById('import');
	const exportButton = document.getElementById('export');

	const processingScreen = document.getElementById('processing');

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

	hideFollowingCheckbox.addEventListener('change', flashSaveButton);
	hideRerunsCheckbox.addEventListener('change', flashSaveButton);
	useSyncStorageCheckbox.addEventListener('change', flashSaveButton);

	titlesExplained.addEventListener('click', onTitlesExplained);

	saveButton.addEventListener('click', onSave);
	cancelButton.addEventListener('click', onCancel);

	importButton.addEventListener('click', onImport);
	exportButton.addEventListener('click', onExport);

/* END: button actions */

/* BEGIN: localize */

	document.querySelector('.settings h2').textContent          = chrome.i18n.getMessage('blacklist_SettingsHeadline');
	document.getElementById('label_hideFollowing').textContent  = chrome.i18n.getMessage('blacklist_SettingsHideFollowing');
	document.getElementById('label_hideReruns').textContent     = chrome.i18n.getMessage('blacklist_SettingsHideReruns');
	document.getElementById('label_useSyncStorage').textContent = chrome.i18n.getMessage('blacklist_SettingsSyncStorage');

	document.getElementById('column_Categories').textContent = chrome.i18n.getMessage('blacklist_Categories');
	document.getElementById('column_Channels').textContent   = chrome.i18n.getMessage('blacklist_Channels');
	document.getElementById('column_Tags').textContent       = chrome.i18n.getMessage('blacklist_Tags');
	document.getElementById('column_Titles').textContent     = chrome.i18n.getMessage('blacklist_Titles');

	titlesExplained.textContent = chrome.i18n.getMessage('blacklist_TitlesExplainedLabel');

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
	document.querySelectorAll('#table_titles tr.input input').forEach(function(e) {

		e.placeholder = chrome.i18n.getMessage('blacklist_TitlesInput');
	});

	saveButton.textContent   = chrome.i18n.getMessage('blacklist_Save');
	cancelButton.textContent = chrome.i18n.getMessage('blacklist_Cancel');

	importButton.textContent = chrome.i18n.getMessage('blacklist_Import');
	exportButton.textContent = chrome.i18n.getMessage('blacklist_Export');

	processingScreen.textContent = chrome.i18n.getMessage('blacklist_Processing');

/* END: localize */

// show loading screen on start
toggleLoadingScreen(true);

// load blacklisted items
storageGet(null, function(result) {

	let blacklistedItems = {};
	if (typeof result.blacklistedItems === 'object') {

		blacklistedItems = result.blacklistedItems;

	} else if (typeof result['blItemsFragment0'] === 'object') {

		blacklistedItems = mergeBlacklistFragments(result);
	}

	addItems(categories, blacklistedItems.categories);
	addItems(channels,   blacklistedItems.channels);
	addItems(tags,       blacklistedItems.tags);
	addItems(titles,     blacklistedItems.titles);

	Promise.allSettled([

		loadHideFollowing(),
		loadHideReruns(),
		loadStorageMode(),

	]).then(function() {

		// hide loading screen
		toggleLoadingScreen(false);
	});
});

// hide following
async function loadHideFollowing() {

	return new Promise(function(resolve) {

		storageGet('hideFollowing', function(result) {

			hideFollowingCheckbox.checked = (
				(typeof result.hideFollowing !== 'boolean') ||
				(result.hideFollowing === true)
			);
			resolve();
		});
	});
}

// hide reruns
async function loadHideReruns() {

	return new Promise(function(resolve) {

		storageGet('hideReruns', function(result) {

			hideRerunsCheckbox.checked = (
				(typeof result.hideReruns === 'boolean') &&
				(result.hideReruns === true)
			);
			resolve();
		});
	});
}

// storage mode
async function loadStorageMode() {

	return new Promise(function(resolve) {

		getStorageMode(function(mode) {

			useSyncStorageCheckbox.checked = (mode === 'sync');
			resolve();
		});
	});
}

/* BEGIN: storage size */

	// getBytesInUse() is not supported by Firefox
	if (isFirefox() === false) {

		chrome.storage.sync.getBytesInUse(null, function(result) {

			document.getElementById('storageSize_sync').textContent = result.toLocaleString();
		});

		chrome.storage.local.getBytesInUse(null, function(result) {

			document.getElementById('storageSize_local').textContent = result.toLocaleString();
		});

		document.querySelector('.storage-stats').style.visibility = 'visible';
	}

/* END: storage size */

// report storage contents
if (debug <= 1) {

	chrome.storage.sync.get(null, function(result) {

		logVerbose('storage.sync:', result);
	});

	chrome.storage.local.get(null, function(result) {

		logVerbose('storage.local:', result);
	});

	const clearStoragesButton = document.getElementById('clearStorages');
	clearStoragesButton.style.display = 'inline-block';
	clearStoragesButton.addEventListener('click', function() {

		chrome.storage.sync.clear();
		chrome.storage.local.clear();

		alert('Unwanted Twitch:\nStorages cleared. Reloading...');

		window.location.reload();
	});
}
