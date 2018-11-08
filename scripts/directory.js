// jshint esversion: 6
// jshint -W069
// jshint -W083

// debug
// 0 = TRACE, VERBOSE, INFO, WARN, ERROR
// 1 = VERBOSE, INFO, WARN, ERROR
// 2 = INFO, WARN, ERROR
// 3 = WARN, ERROR
// 4 = ERROR
// 5 = NONE
const debug = 4;

/* BEGIN: runtime variables */

	let rootNode;

	// determines if the directory filter is enabled
	let enabled = true;

	// the current page being monitored
	let currentPage = window.location.pathname;

	// indicates that a page load is in progress
	let pageLoads = false;

	// interval handles for page load detection
	let monitorPagesInterval;
	let initInterval;
	let onPageChangeInterval;
	let checkSlotsInterval;

	// currently detected slot type, one of: 'frontpage', 'categories', 'channels' or null
	let currentItemType = getItemType(currentPage);

	// indicates that the storage is currently in use
	let storageLocked = false;

	// maximum size of data that can be stored in the sync storage (in Bytes)
	// chrome.storage.sync.QUOTA_BYTES_PER_ITEM - 192 (wiggle room)
	const storageSyncMaxSize = 8000;

	// maximum number of keys that can be stored in the sync storage
	// chrome.storage.sync.MAX_ITEMS - 12 (wiggle room)
	const storageSyncMaxKeys = 500;

	// collection of blacklisted items, serves as local cache
	let storedBlacklistedItems = {};

	// indicates that the filtering is in progress
	let filterRunning = false;

	// number of items currently registered
	let currentItemsCount = 0;

/* END: runtime variables */

/**
 * Returns if the current page is a supported directory.
 */
function isSupportedPage(page) {
	logTrace('invoking isSupportedPage($)', page);

	const itemType = getItemType(page);

	const result = (itemType !== null);

	if (result === true) {
		logVerbose('Current page IS supported:', page);
	} else {
		logWarn('Current page IS NOT supported:', page);
	}

	return result;
}

/**
 * Returns the item type based on the current page.
 */
function getItemType(page) {
	logTrace('invoking getItemType($)', page);

	let result = null;

	// remove trailing slash
	page = page.replace(/\/$/, '');

	switch (page) {

		case '':
			result = 'frontpage';
		break;

		case '/directory':
			result = 'categories';
		break;

		case '/directory/all':
			result = 'channels';
		break;

		default:
			if (RegExp('^/directory/(all|game)/[^/]+(/[a-z]{2})?$').test(page) === true) {

				result = 'channels';
			}
		break;
	}

	return result;
}

/**
 * Retrieves the enabled state from the storage.
 */
function getEnabledState(callback) {
	logTrace('invoking getEnabledState()');

	storageLocked = true;
	chrome.storage.sync.get([ 'enabled' ], function callback_storageGet(result) {
		logTrace('callback invoked: chrome.storage.sync.get($)', [ 'enabled' ], result);

		storageLocked = false;

		if (typeof result.enabled === 'boolean') {

			enabled = result.enabled;

			if (result.enabled === true) {
				logWarn('Extension\'s enabled state:', result.enabled);
			} else {
				logError('Extension\'s enabled state:', result.enabled);
			}

		} else {

			logWarn('Extension\'s enabled state unknown, assuming:', true);
		}

		if (typeof callback === 'function') {

			callback(enabled);
		}
	});
}

/**
 * Stores the enabled state in the storage.
 */
function putEnabledState(state) {
	logTrace('invoking putEnabledState($)', state);

	enabled = state;

	storageLocked = true;
	chrome.storage.sync.set({ 'enabled': state }, function callback_storageSet() {
		logTrace('callback invoked: chrome.storage.sync.set($)', { 'enabled': state });

		storageLocked = false;

		logInfo('Successfully disabled the blacklist.');
	});
}

/**
 * Waits for the page to load completely, then invokes the directory filter.
 */
function init() {
	logTrace('invoking init()');

	if (enabled === false) { return; }

	const pageSupported = isSupportedPage(currentPage);

	// root
	const rootNodeSelector 	= '#root';
	rootNode 				= document.querySelector(rootNodeSelector);

	if (rootNode === null) {

		logError('Root not found. Expected:', rootNodeSelector);
		return;
	}

	if (pageSupported === true) {

		listenToScroll();
	}

	// prepare blacklist (regardless of the current page support)
	getBlacklistedItems(function callback_getBlacklistedItems(blacklistedItems) {
		logTrace('callback invoked: getBlacklistedItems()', blacklistedItems);

		// initialize defaults in blacklisted items collection
		initBlacklistedItems(blacklistedItems);

		// cache blacklisted items from storage
		storedBlacklistedItems = blacklistedItems;
		logInfo('Blacklist loaded:', blacklistedItems);

		if (pageSupported === true) {

			pageLoads = true;

			// wait for page to load the DOM completely, the loading is deferred, so we need to wait for an indicator
			const pageLoadMonitorInterval = 200;
			window.clearInterval(initInterval);
			initInterval = window.setInterval(function init_waitingForPageLoad() {
				logTrace('polling started in init(): waiting for page to load');

				if (enabled === false) { return; }

				// this is the indicator we are looking for, the attribute is set once the page has fully loaded
				const indicator = rootNode.getAttribute('data-a-page-loaded');
				if (indicator !== null) {

					window.clearInterval(initInterval);
					pageLoads = false;
					logTrace('polling stopped in init(): page loaded');

					placeManagementButton();

					// invoke directory filter
					const remainingItems = filterDirectory();

					// attach hide buttons to the remaining items
					attachHideButtons(remainingItems);

					// invoke recommendations filter
					filterRecommendations();
					observeRecommendations();
				}

			}, pageLoadMonitorInterval);
		}
	});
}

/**
 * Event to fire whenever the page changes. Re-runs the filter.
 */
function onPageChange(page) {
	logTrace('invoking onPageChange($)', page);

	if (isSupportedPage(page) === false) { return; }

	pageLoads = true;

	// wait for page to load the DOM completely, the loading is deferred, so we need to wait for the first slot
	const pageLoadMonitorInterval = 200;
	window.clearInterval(onPageChangeInterval);
	onPageChangeInterval = window.setInterval(function onPageChange_waitingForPageLoad() {
		logTrace('polling started in onPageChange(): waiting for page to load');

		if (enabled === false) { return; }

		let indicator;

		switch (currentItemType) {

			case 'frontpage':

				indicator = rootNode.querySelector('div.anon-front__content-section, div.tw-mg-3');
				if (indicator !== null) {

					window.clearInterval(onPageChangeInterval);
					pageLoads = false;
					logTrace('polling stopped in onPageChange(): page loaded');

					// invoke directory filter
					filterDirectory();
				}

				break;

			case 'channels':
			case 'categories':

				indicator = rootNode.querySelector('div[data-target][style^="order:"]');
				if (indicator !== null) {

					window.clearInterval(onPageChangeInterval);
					pageLoads = false;
					logTrace('polling stopped in onPageChange(): page loaded');

					placeManagementButton();

					// invoke directory filter
					const remainingItems = filterDirectory();

					// attach hide buttons to the remaining items
					attachHideButtons(remainingItems);

					// invoke recommendations filter
					filterRecommendations();
					observeRecommendations();
				}

			break;
		}

	}, pageLoadMonitorInterval);
}

/**
 * Places a button to the right of the filters area in the directory. The button opens the management area of UnwantedTwitch.
 */
function placeManagementButton() {
	logTrace('invoking placeManagementButton()');

	const filtersAreaSelector 	= 'div.browse-header__filters, div.directory-header__filters';
	const filtersArea 			= rootNode.querySelector(filtersAreaSelector);

	if (filtersArea !== null) {

		// prevent adding more than one button
		if (filtersArea.querySelector('div[data-uttv-management]') !== null) {

			logWarn('Management button already added to filters area:', filtersArea);
			return false;
		}

		let container = document.createElement('div');
		container.setAttribute('data-uttv-management', '');
		container.className = 'uttv-button';

		let button = document.createElement('div');
		button.textContent = chrome.i18n.getMessage('label_Management');

		button.addEventListener('click', function() {

			chrome.runtime.sendMessage({ action: 'openBlacklist' });
		});

		container.appendChild(button);
		filtersArea.appendChild(container);

		return true;

	} else {

		logWarn('Filters not found. Expected:', filtersAreaSelector);
	}
}

/**
 * Initializes the blacklisted items collection by setting up the default item types in the provided object.
 */
function initBlacklistedItems(collection) {
	logTrace('invoking initBlacklistedItems($)', collection);

	const itemTypes = [
		'categories',
		'channels',
		'tags'
	];

	if (typeof collection !== 'object') {

		collection = {};
	}

	const itemTypesLength = itemTypes.length;
	for (let i = 0; i < itemTypesLength; i++) {

		let itemType = itemTypes[i];

		if (collection[itemType] === undefined) {

			collection[itemType] = {};
		}
	}

	return collection;
}

/**
 * Retrieves all blacklisted items from the storage.
 */
function getBlacklistedItems(callback) {
	logTrace('invoking getBlacklistedItems()');

	if (storageLocked === true) {

		throw new Error('UnwantedTwitch: Storage currently locked. Cannot proceed with: getBlacklistedItems()');
	}

	storageLocked = true;
	chrome.storage.sync.get(null, function callback_storageGet(result) {
		logTrace('callback invoked: chrome.storage.sync.get($)', null, result);

		storageLocked = false;

		let blacklistedItems = {};
		if (typeof result.blacklistedItems === 'object') {

			blacklistedItems = result.blacklistedItems;

		} else if (typeof result['blItemsFragment0'] === 'object') {

			blacklistedItems = mergeBlacklistFragments(result);
			logVerbose('Successfully merged fragments to blacklist:', result, blacklistedItems);
		}

		// rename previous type "games" to "categories"
		if (typeof blacklistedItems['games'] === 'object') {

			blacklistedItems['categories'] = blacklistedItems['games'];
			delete blacklistedItems['games'];
		}

		if (typeof callback === 'function') {

			callback(blacklistedItems);
		}
	});
}

/**
 * Stores all blacklisted items in the storage.
 */
function putBlacklistedItems(items, callback) {
	logTrace('invoking putBlacklistedItems($)', items);

	// remove no longer existing item types to save storage space
	delete items['communities'];
	delete items['creative'];

	storedBlacklistedItems = items;

	storageLocked = true;

	let dataToStore 	= { 'blacklistedItems': items };
	const requiredSize 	= measureStoredSize(dataToStore);

	if (requiredSize > storageSyncMaxSize) {

		logWarn('Blacklist to store (' + requiredSize + ') exceeds the maximum storage size per item (' + storageSyncMaxSize + '). Splitting required...');
		dataToStore = splitBlacklistItems(items);
		logVerbose('Splitting of blacklist completed:', dataToStore);
	}

	const keysToRemove = [ 'blacklistedItems' ];
	for (let i = 0; i < 100; i++) {

		keysToRemove.push('blItemsFragment' + i);
	}

	chrome.storage.sync.remove(keysToRemove, function callback_storageRemove() {
		logTrace('callback invoked: chrome.storage.sync.remove($)', keysToRemove);

		chrome.storage.sync.set(dataToStore, function callback_storageSet() {
			logTrace('callback invoked: chrome.storage.sync.set($)', dataToStore);

			storageLocked = false;

			// handle storage quota
			if (
				(chrome.runtime.lastError !== undefined) &&
				(chrome.runtime.lastError.message !== undefined) &&
				(typeof chrome.runtime.lastError.message === 'string') &&
				(chrome.runtime.lastError.message.indexOf('QUOTA_BYTES') >= 0)
			) {

				logError(chrome.runtime.lastError);
				alert( chrome.i18n.getMessage('alert_StorageQuota') );

			} else {

				logInfo('Successfully added to blacklist:', items);
			}

			if (typeof callback === 'function') {

				callback(items);
			}
		});
	});
}

/**
 * Splits the provided blacklist items into fragments in order to utilize the storage more efficient.
 */
function splitBlacklistItems(items) {
	logTrace('invoking splitBlacklistItems($)', items);

	const maxValuesPerFragment = 250;

	let fragments 		= {};
	let fragmentIndex 	= 0;

	let remainingSpace 	= maxValuesPerFragment;

	for (let type in items) {
		if (!items.hasOwnProperty(type)) { continue; }

		// max. fragments reached?
		if (fragmentIndex >= storageSyncMaxKeys) { break; }

		let key = ('blItemsFragment' + fragmentIndex);
		if (fragments[key] === undefined) { fragments[key] = {}; }

		let values 			= Object.keys(items[type]);
		let valuesLength 	= values.length;

		let sliceOffset 	= 0;
		let remainingValues = valuesLength;

		if (remainingValues === 0) { continue; }

		while (true) {

			// no more space, start new fragment
			if (remainingSpace === 0) {

				fragmentIndex 			+= 1;
				key 					 = ('blItemsFragment' + fragmentIndex);
				fragments[key] 			 = {};
				fragments[key][type] 	 = [];
				remainingSpace 			 = maxValuesPerFragment;
			}

			// max. fragments reached?
			if (fragmentIndex >= storageSyncMaxKeys) { break; }

			let slice 		= values.slice(sliceOffset, (sliceOffset + Math.min(remainingSpace, maxValuesPerFragment)));
			let sliceLength = slice.length;

			sliceOffset 	+= sliceLength;
			remainingSpace 	-= sliceLength;
			remainingValues -= sliceLength;

			fragments[key][type] = slice;

			// no more values to add, go to next entry type
			if (remainingValues === 0) { break; }
		}
	}

	return fragments;
}

/**
 * Merges the provided blacklist fragments back into blacklist items.
 */
function mergeBlacklistFragments(fragments) {
	logTrace('invoking mergeBlacklistFragments($)', fragments);

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

/**
 * Returns if the specified item is blacklisted as the specified type.
 */
function isBlacklistedItem(item, type) {
	logTrace('invoking isBlacklistedItem($, $)', item, type);

	if (typeof item !== 'string') { return false; }
	if (storedBlacklistedItems[type] === undefined) { return false; }

	// always check all-lowercase spelling
	const itemL = item.toLowerCase();

	return (
		(storedBlacklistedItems[type][item]  !== undefined) ||
		(storedBlacklistedItems[type][itemL] !== undefined)
	);
}

/**
 * Returns if the specified category is blacklisted.
 */
function isBlacklistedCategory(category) {

	return isBlacklistedItem(category, 'categories');
}

/**
 * Returns if the specified channel is blacklisted.
 */
function isBlacklistedChannel(channel) {

	return isBlacklistedItem(channel, 'channels');
}

/**
 * Returns if the specified tag is blacklisted. Also accepts an array of tags.
 */
function isBlacklistedTag(tag) {

	if (Array.isArray(tag)) {

		const tagsLength = tag.length;

		for (let i = 0; i < tagsLength; i++) {

			if ( isBlacklistedItem(tag[i], 'tags') === true ) {

				return true;
			}
		}

		return false;

	} else {

		return isBlacklistedItem(tag, 'tags');
	}
}

/**
 * Filters directory by removing blacklisted items. Returns the remaining items.
 */
function filterDirectory() {
	logTrace('invoking filterDirectory()');

	if (filterRunning === true) {

		logWarn('Filter already running.');
		return [];
	}
	filterRunning = true;

	const currentItems = getItems();

	let remainingItems = [];
	if (currentItems.length > 0) {

		remainingItems = filterItems(currentItems);
	}
	filterRunning = false;

	switch (currentItemType) {

		case 'channels':
		case 'categories':

			if (remainingItems.length < currentItems.length) {

				logVerbose('Attempting to re-populate items.');
				triggerScroll();
			}

		break;
	}

	return remainingItems;
}

/**
 * Returns all items found in the directory.
 */
function getItems() {
	logTrace('invoking getItems()');

	let items = [];

	// items
	let itemContainersSelector;
	let itemContainers;
	let itemContainersLength;

	switch (currentItemType) {

		case 'frontpage':

			// channels, clips, videos
			itemContainersSelector 	= 'a[data-a-target="preview-card-image-link"]:not([data-uttv-hidden])';
			itemContainers 			= rootNode.querySelectorAll(itemContainersSelector);
			itemContainersLength 	= itemContainers.length;

			if (itemContainersLength > 0) {

				for (let i = 0; i < itemContainersLength; i++) {

					const itemSibling = itemContainers[i].parentNode.nextSibling;
					if (itemSibling === null) { continue; }

					const wrapper = itemSibling.querySelector('div.preview-card-titles__subtitle-wrapper');

					if (
						(wrapper === null) ||
						(wrapper.children.length === 0)
					) {
						continue;
					}

					let itemName = wrapper.children[0].querySelector('a[data-a-target]');
					if (itemName === null) { continue; }

					let itemLink = itemName.getAttribute('href');
					    itemName = itemName.textContent;
					if (typeof itemLink === 'string') {

						itemLink = itemLink.split('/');

						if ( (itemLink.length === 1) && (itemLink[0].length > 0) ) {

							itemName = itemLink[0];

						} else if ( (itemLink.length >= 2) && (itemLink[1].length > 0) ) {

							itemName = itemLink[1];
						}
					}

					// category might not be set
					let subItem = 'uttv_unknown';
					if (wrapper.children.length >= 2) {

						subItem = wrapper.children[1].querySelector('a[data-a-target]');
						if ((subItem !== null) && subItem.textContent) {

							subItem = subItem.textContent;
						}
					}

					/* BEGIN: tags */

						let tagsData = [];

						let tagContainer = itemSibling.parentNode;
						if (tagContainer !== null) {

							const tagsSelector 	= '.tw-tag__content div';
							const tags 			= tagContainer.querySelectorAll(tagsSelector);
							const tagsLength 	= tags.length;

							if (tagsLength > 0) {

								for (let n = 0; n < tagsLength; n++) {

									const tagName = tags[n].textContent;

									tagsData.push(tagName);
								}

							} else {

								logWarn('Tags not found. Expected:', tagsSelector, tagContainer);
							}

						} else {

							logWarn('No tags found on frontpage for card:', itemSibling);
						}

					/* END: tags */

					items.push({
						item: 		itemName,
						subItem: 	subItem,
						tags: 		tagsData,
						node: 		itemContainers[i]
					});
				}

			} else {

				logWarn('Item containers (channels, clips, videos) not found in frontpage container. Expected:', itemContainersSelector);
			}

			// categories
			itemContainersSelector 	= 'div[data-a-target^="card-"]:not([data-uttv-hidden])';
			itemContainers 			= rootNode.querySelectorAll(itemContainersSelector);
			itemContainersLength 	= itemContainers.length;

			if (itemContainersLength > 0) {

				for (let i = 0; i < itemContainersLength; i++) {

					const headline = itemContainers[i].querySelector('h3[title]');
					if (headline === null) { continue; }

					itemName = headline.textContent;
					if (!itemName) { continue; }

					/* BEGIN: tags */

						let tagsData = [];

						let tagContainer = itemContainers[i].parentNode;
						if (tagContainer !== null) {

							const tagsSelector 	= '.tw-tag__content div';
							const tags 			= tagContainer.querySelectorAll(tagsSelector);
							const tagsLength 	= tags.length;

							if (tagsLength > 0) {

								for (let n = 0; n < tagsLength; n++) {

									const tagName = tags[n].textContent;

									tagsData.push(tagName);
								}

							} else {

								logWarn('Tags not found. Expected:', tagsSelector, tagContainer);
							}

						} else {

							logWarn('No tags found on frontpage for card:', itemSibling);
						}

					/* END: tags */

					items.push({
						item: 		itemName,
						subItem: 	null,
						tags: 		tagsData,
						node: 		itemContainers[i]
					});
				}

			} else {

				logWarn('Item containers (categories) not found in frontpage container. Expected:', itemContainersSelector);
			}

		break;

		case 'channels':

			// items
			itemContainersSelector 	= 'a[data-a-target="preview-card-image-link"]:not([data-uttv-hidden])';
			itemContainers 			= rootNode.querySelectorAll(itemContainersSelector);
			itemContainersLength 	= itemContainers.length;

			if (itemContainersLength === 0) {

				logError('Item containers not found in directory container. Expected:', itemContainersSelector);
				return [];
			}

			for (let i = 0; i < itemContainersLength; i++) {

				let itemData = null;

				// card
				const itemName = itemContainers[i].getAttribute('href');
				if ((typeof itemName === 'string') && (itemName.length > 0)) {

					// try to find category
					let subItem = null;
					let subNode = itemContainers[i].parentNode.parentNode;
					if (subNode.classList.contains('preview-card')) {

						subNode = subNode.querySelector('[data-a-target="preview-card-game-link"]');
						if (subNode !== null) {

							subItem = subNode.textContent;
						}
					}

					itemData = {
						item: 		itemName.replace('/', ''),
						subItem: 	subItem,
						tags: 		[],
						node: 		itemContainers[i]
					};
				}

				/* BEGIN: tags */

					let tagContainer = itemContainers[i].parentNode;
					if (tagContainer === null) {

						logWarn('No tags found on channels for card:', itemContainers[i]);
						continue;
					}

					tagContainer = tagContainer.nextSibling;
					if (tagContainer !== null) {

						const tagsSelector 	= '.tw-tag__content div';
						const tags 			= tagContainer.querySelectorAll(tagsSelector);
						const tagsLength 	= tags.length;

						if (tagsLength > 0) {

							for (let n = 0; n < tagsLength; n++) {

								const tagName = tags[n].textContent;

								itemData.tags.push(tagName);
							}

						} else {

							logWarn('Tags not found. Expected:', tagsSelector, tagContainer);
						}

					} else {

						logWarn('No tags found on channels for card:', itemContainers[i]);
					}

				/* END: tags */

				if (itemData !== null) {

					items.push(itemData);
				}
			}

		break;

		case 'categories':

			// items
			itemContainersSelector 	= 'a[data-a-target="tw-box-art-card-link"]:not([data-uttv-hidden])';
			itemContainers 			= rootNode.querySelectorAll(itemContainersSelector);
			itemContainersLength 	= itemContainers.length;

			if (itemContainersLength === 0) {

				logError('Item containers not found in directory container. Expected:', itemContainersSelector);
				return [];
			}

			for (let i = 0; i < itemContainersLength; i++) {

				let itemData = null;

				// card
				const itemName = itemContainers[i].getAttribute('aria-label');
				if ((typeof itemName === 'string') && (itemName.length > 0)) {

					itemData = {
						item: 		itemName,
						subItem: 	null,
						tags: 		[],
						node: 		itemContainers[i]
					};
				}

				/* BEGIN: tags */

					const tagContainer = itemContainers[i].parentNode.parentNode.nextSibling;
					if (tagContainer !== null) {

						const tagsSelector 	= '.tw-tag__content div';
						const tags 			= tagContainer.querySelectorAll(tagsSelector);
						const tagsLength 	= tags.length;

						if (tagsLength > 0) {

							for (let n = 0; n < tagsLength; n++) {

								const tagName = tags[n].textContent;

								itemData.tags.push(tagName);
							}

						} else {

							logWarn('Tags not found. Expected:', tagsSelector, tagContainer);
						}

					} else {

						logWarn('No tags found on categories for card:', itemContainers[i]);
					}

				/* END: tags */

				if (itemData !== null) {

					items.push(itemData);
				}
			}

		break;
	}

	currentItemsCount = items.length;

	logVerbose('Items found on the current page:', items);
	return items;
}

/**
 * Removes all blacklisted items and returns the remaining items.
 */
function filterItems(items) {
	logTrace('invoking filterItems($)', items);

	if (typeof currentItemType !== 'string') {

		throw new Error('UnwantedTwitch: Current item type is invalid. Cannot proceed with: filterItems()');
	}

	let remainingItems 	= [];
	const itemsLength = items.length;

	switch (currentItemType) {

		case 'frontpage':

			for (let i = 0; i < itemsLength; i++) {

				const entry = items[i];

				// category
				if (entry.subItem === null) {

					if (
						(isBlacklistedCategory(entry.item) === true) ||
						(isBlacklistedTag(entry.tags) === true)
					) {

						if (removeItem(entry.node) === true) {

							logInfo('Blacklisted frontpage item:', entry.item, entry.node);
						}

					} else {

						remainingItems.push(entry);
					}

				// channel, clip, video
				} else {

					if (isBlacklistedChannel(entry.item) === true) {

						if (removeItem(entry.node) === true) {

							logInfo('Blacklisted frontpage channel:', entry.item, entry.node);
						}

					} else if (isBlacklistedCategory(entry.subItem) === true) {

						if (removeItem(entry.node) === true) {

							logInfo('Blacklisted frontpage category:', entry.subItem, entry.node);
						}

					} else if (isBlacklistedTag(entry.tags) === true) {

						if (removeItem(entry.node) === true) {

							logInfo('Blacklisted frontpage tag:', entry.tags, entry.node);
						}

					} else {

						remainingItems.push(entry);
					}
				}
			}

		break;

		case 'channels':

			for (let i = 0; i < itemsLength; i++) {

				const entry = items[i];

				if (isBlacklistedChannel(entry.item) === true) {

					if (removeItem(entry.node) === true) {

						logInfo('Blacklisted channel:', entry.item, entry.node);
					}

				} else if (isBlacklistedCategory(entry.subItem) === true) {

					if (removeItem(entry.node) === true) {

						logInfo('Blacklisted category:', entry.subItem, entry.node);
					}

				} else if (isBlacklistedTag(entry.tags) === true) {

					if (removeItem(entry.node) === true) {

						logInfo('Blacklisted by tag:', entry.tags, entry.node);
					}

				} else {

					remainingItems.push(entry);
				}
			}

		break;

		case 'categories':

			for (let i = 0; i < itemsLength; i++) {

				const entry = items[i];

				if (
					(isBlacklistedItem(entry.item, currentItemType) === true) ||
					(isBlacklistedTag(entry.tags) === true)
				 ) {

					if (removeItem(entry.node) === true) {

						logInfo('Blacklisted item:', entry.item, entry.node);
					}

				} else {

					remainingItems.push(entry);
				}
			}

		break;
	}

	currentItemsCount = remainingItems.length;

	logVerbose('Remaining items on the current page:', remainingItems);
	return remainingItems;
}

/**
 * Removes all blacklisted items in the recommendation sidebar.
 */
function filterRecommendations() {
	logTrace('invoking filterRecommendations()');

	switch (currentItemType) {

		case 'frontpage':
			logWarn('Recommendations not present on frontpage. Filtering aborted.');
			return;
	}

	const recommSelector 	= 'div[data-a-target="side-nav-bar"] div.simplebar-content div.tw-mg-b-2 div[data-a-target="side-nav-card-metadata"]';
	const recomm 			= rootNode.querySelectorAll(recommSelector);
	const recommLength 		= recomm.length;

	let items = [];

	// expanded
	if (recommLength > 0) {

		for (let i = 0; i < recommLength; i++) {

			// channel
			let channelTitle = recomm[i].querySelector('div[data-a-target="side-nav-title"]');
			if (channelTitle !== null) {

				channelTitle = channelTitle.getAttribute('title');
			}

			// category
			let categoryTitle = recomm[i].querySelector('div[data-a-target="featured-channel-game-title"]');
			if (categoryTitle !== null) {

				categoryTitle = categoryTitle.getAttribute('title');
			}

			items.push({
				channel: 	channelTitle,
				category: 	categoryTitle,
				node: 		recomm[i]
			});
		}

		const itemsLength = items.length;

		if (itemsLength > 0) {

			for (let i = 0; i < itemsLength; i++) {

				const entry = items[i];

				if (isBlacklistedCategory(entry.category) === true) {

					if (removeRecommendation(entry.node, 'expanded') === true) {

						logInfo('Blacklisted recommendation:', entry.category);
					}

				} else if (isBlacklistedChannel(entry.channel) === true) {

					if (removeRecommendation(entry.node, 'expanded') === true) {

						logInfo('Blacklisted recommendation:', entry.channel);
					}
				}
			}

		} else {

			logWarn('No recommendations (expanded) found.', recomm);
		}

	// collapsed
	} else {

		logWarn('Recommendations (expanded) not found. Expected:', recommSelector);

		const recommAltSelector 	= 'div[data-test-selector="side-nav-card-collapsed"] a[href]';
		const recommAlt 			= rootNode.querySelectorAll(recommAltSelector);
		const recommAltLength 		= recommAlt.length;

		if (recommAltLength > 0) {

			for (let i = 0; i < recommAltLength; i++) {

				let channelTitle = recommAlt[i].getAttribute('href').replace(/^\//, '');

				items.push({
					channel: 	channelTitle,
					node: 		recommAlt[i]
				});
			}

			const itemsLength = items.length;

			if (itemsLength > 0) {

				for (let i = 0; i < itemsLength; i++) {

					const entry = items[i];

					if (isBlacklistedChannel(entry.channel) === true) {

						if (removeRecommendation(entry.node, 'collapsed') === true) {

							logInfo('Blacklisted recommendation:', entry.channel);
						}
					}
				}

			} else {

				logWarn('No recommendations (collapsed) found.', recomm);
			}

		} else {

			logWarn('Recommendations (collapsed) not found. Expected:', recommAltSelector);
		}
	}
}

/**
 * Attaches "Hide Item" button to each item container.
 */
function attachHideButtons(items) {
	logTrace('invoking attachHideButtons($)', items);

	if (items.length === 0) { return; }

	const ffWorkaround 	= isFirefox();
	const attachedKey 	= 'data-uttv-hide-attached';

	// button on items
	let hideItem = document.createElement('div');
	switch (currentItemType) {

		case 'frontpage':
			return;

		case 'categories':
			hideItem.className 		= 'uttv-hide-item category';
			hideItem.textContent 	= 'X';
			hideItem.title 			= chrome.i18n.getMessage('label_HideCategory');
		break;

		case 'channels':
			hideItem.className 		= 'uttv-hide-item channel';
			hideItem.textContent 	= 'X';
			hideItem.title 			= chrome.i18n.getMessage('label_HideChannel');
		break;

		default:
			return;
	}

	// button for tags
	let hideTag 			= document.createElement('div');
	hideTag.className 		= 'uttv-hide-tag';
	hideTag.textContent 	= 'X';
	hideTag.title 			= chrome.i18n.getMessage('label_HideTag');

	const itemsLength = items.length;
	for (let i = 0; i < itemsLength; i++) {

		// prevent attaching more than once
		if (items[i].node.getAttribute(attachedKey) !== null) { continue; }

		items[i].node.setAttribute(attachedKey, 'true');

		// button on item
		let hideItemNode = hideItem.cloneNode(true);
		hideItemNode.setAttribute('data-uttv-item', items[i].item);
		hideItemNode.addEventListener('click', onHideItem);
		items[i].node.parentNode.appendChild(hideItemNode);

		// button for tags
		let tagContainer;
		switch (currentItemType) {

			case 'categories':

				tagContainer = items[i].node.parentNode.parentNode.nextSibling;
				if (tagContainer !== null) {

					const tagsSelector 	= '.tw-tag__content div';
					const tags 			= tagContainer.querySelectorAll(tagsSelector);
					const tagsLength 	= tags.length;

					if (tagsLength > 0) {

						for (let n = 0; n < tagsLength; n++) {

							const tagName = tags[n].textContent;

							let hideTagNode = hideTag.cloneNode(true);
							hideTagNode.setAttribute('data-uttv-tag', tagName);
							hideTagNode.addEventListener('click', function(event) {

								// cancel click on tag event
								event.preventDefault();
								event.stopPropagation();

								const decision = confirm( chrome.i18n.getMessage('confirm_HideTag') + ' [' + tagName + ']' );
								if (decision === true) {

									onHideTag(this);
								}
							});

							// Firefox doesn't support click events within button tags
							if (ffWorkaround === true) {

								hideTagNode.classList.add('firefox');

								// place next to the button element
								tags[n].parentNode.parentNode.parentNode.appendChild(hideTagNode);

							} else {

								tags[n].parentNode.appendChild(hideTagNode);
							}
						}


					} else {

						logWarn('Tags not found. Expected:', tagsSelector, tagContainer);
					}

				} else {

					logWarn('No tags found for card:', items[i].node);
				}

			break;

			case 'channels':

				tagContainer = items[i].node.parentNode;
				if (tagContainer === null) {

					logWarn('No tags found for card:', items[i].node);
					continue;
				}

				tagContainer = tagContainer.nextSibling;
				if (tagContainer !== null) {

					const tagsSelector 	= '.tw-tag__content div';
					const tags 			= tagContainer.querySelectorAll(tagsSelector);
					const tagsLength 	= tags.length;

					if (tagsLength > 0) {

						for (let n = 0; n < tagsLength; n++) {

							const tagName = tags[n].textContent;

							let hideTagNode = hideTag.cloneNode(true);
							hideTagNode.setAttribute('data-uttv-tag', tagName);
							hideTagNode.addEventListener('click', function(event) {

								// cancel click on tag event
								event.preventDefault();
								event.stopPropagation();

								const decision = confirm( chrome.i18n.getMessage('confirm_HideTag') + ' [' + tagName + ']' );
								if (decision === true) {

									onHideTag(this);
								}
							});

							// Firefox doesn't support click events within button tags
							if (ffWorkaround === true) {

								hideTagNode.classList.add('firefox');

								// place next to the button element
								tags[n].parentNode.parentNode.parentNode.appendChild(hideTagNode);

							} else {

								tags[n].parentNode.appendChild(hideTagNode);
							}
						}


					} else {

						logWarn('Tags not found. Expected:', tagsSelector, tagContainer);
					}

				} else {

					logWarn('No tags found for card:', items[i].node);
				}

			break;
		}
	}
}

/**
 * Event to fire by the "Hide Item" button. Adds the selected item to the blacklist in storage.
 */
function onHideItem() {
	logTrace('invoking onHideItem()');

	// determine item to blacklist
	const item = this.getAttribute('data-uttv-item');
	if ((typeof item !== 'string') || (item.length === 0)) { return; }

	if (storageLocked === true) {

		throw new Error('UnwantedTwitch: Storage currently locked. Cannot proceed with: onHideItem()');
	}

	// update cache
	if (storedBlacklistedItems[currentItemType] === undefined) {

		storedBlacklistedItems[currentItemType] = {};
	}
	storedBlacklistedItems[currentItemType][item] = 1;

	// update storage
	putBlacklistedItems(storedBlacklistedItems);

	// remove item
	if (removeItem(this) === true) {

		logVerbose('Node removed due to item being blacklisted:', this);
	}
}

/**
 * Event to fire by the "Hide Tag" button. Adds the selected tag to the blacklist in storage.
 */
function onHideTag(node) {
	logTrace('invoking onHideTag()');

	if ((node === undefined) || (node.nodeType !== 1)) { return false; }

	// determine tag to blacklist
	const tag = node.getAttribute('data-uttv-tag');
	if ((typeof tag !== 'string') || (tag.length === 0)) { return; }

	if (storageLocked === true) {

		throw new Error('UnwantedTwitch: Storage currently locked. Cannot proceed with: onHideTag()');
	}

	// update cache
	if (storedBlacklistedItems['tags'] === undefined) {

		storedBlacklistedItems['tags'] = {};
	}
	storedBlacklistedItems['tags'][tag] = 1;

	// update storage
	putBlacklistedItems(storedBlacklistedItems);

	// remove item
	if (removeItem(node) === true) {

		logVerbose('Node removed due to tag being blacklisted:', node);

		// trigger full filtering since the just blacklisted tag might be present in other items
		filterDirectory();
	}
}

/**
 * Removes the node from the DOM based on the current item type.
 */
function removeItem(node) {
	logTrace('invoking removeItem($)', node);

	let topNode;

	switch (currentItemType) {

		case 'frontpage':

			topNode = node;

			while (true) {

				if (
					(topNode === undefined) ||
					(topNode === document.documentElement)
				) {
					logError('Could not find the expected parent node to remove item:', node);
					break;
				}

				if (
					topNode.classList.contains('tw-col-2') || 					// featured
					topNode.classList.contains('anon-top-channels') || 			// top channels
					topNode.classList.contains('list-animation__item-animate') 	// popular
				) {
					node.setAttribute('data-uttv-hidden', '');
					// don't hide topmost node because it causes the remaining items to scale/cover the full width,
					// instead hide the first child node
					topNode.children[0].style.display = 'none';
					return true;
				}

				topNode = topNode.parentNode;
			}

		break;

		case 'channels':

			topNode = node;

			while (true) {

				if (
					(topNode === undefined) ||
					(topNode === document.documentElement)
				) {
					logError('Could not find the expected parent node to remove item:', node);
					break;
				}

				if (
					(topNode.classList.contains('stream-thumbnail') === true) ||
					(
						(topNode.getAttribute('data-target') !== null) &&
						(
							(typeof topNode.getAttribute('style') === 'string') &&
							(topNode.getAttribute('style').indexOf('order:') === 0)
						)
					)
				) {

					node.setAttribute('data-uttv-hidden', '');
					topNode.style.display = 'none';
					return true;
				}

				topNode = topNode.parentNode;
			}

		break;

		case 'categories':

			topNode = node;

			while (true) {

				if (
					(topNode === undefined) ||
					(topNode === document.documentElement)
				) {
					logError('Could not find the expected parent node to remove item:', node);
					break;
				}

				if (
					(topNode.getAttribute('data-target') !== null) &&
					(
						(typeof topNode.getAttribute('style') === 'string') &&
						(topNode.getAttribute('style').indexOf('order:') === 0)
					)
				) {

					node.setAttribute('data-uttv-hidden', '');
					topNode.style.display = 'none';
					return true;
				}

				topNode = topNode.parentNode;
			}

		break;
	}

	return false;
}

/**
 * Removes the recommendation node from the DOM.
 */
function removeRecommendation(node, type) {
	logTrace('invoking removeRecommendation($, $)', node, type);

	let topNode = node;

	switch (type) {

		case 'expanded':

			while (true) {

				if (
					(topNode === undefined) ||
					(topNode === document.documentElement)
				) {
					logError('Could not find the expected parent node to remove item:', node);
					break;
				}

				if (
					(Object.keys(topNode.dataset).length === 0) &&
					(topNode.classList.length === 0)
				) {

					node.setAttribute('data-uttv-hidden', '');
					topNode.style.display = 'none';
					return true;
				}

				topNode = topNode.parentNode;
			}

		break;

		case 'collapsed':

			while (true) {

				if (
					(topNode === undefined) ||
					(topNode === document.documentElement)
				) {
					logError('Could not find the expected parent node to remove item:', node);
					break;
				}

				if (
					(topNode.getAttribute('data-test-selector') === 'side-nav-card-collapsed')
				) {

					node.setAttribute('data-uttv-hidden', '');
					topNode.style.display = 'none';
					return true;
				}

				topNode = topNode.parentNode;
			}

		break;

	}

	return false;
}

/**
 * Monitors scrollbar offset periodically and fires custom onScroll event if the scroll progressed further down.
 */
function listenToScroll() {
	logTrace('invoking listenToScroll()');

	const scrollChangeMonitoringInterval = 1000;
	window.clearInterval(checkSlotsInterval);
	checkSlotsInterval = window.setInterval(function checkSlots() {

		if (enabled === false) { return; }

		if (pageLoads === true) { return; }

		let itemsInDOM = 0;

		switch (currentItemType) {

			case 'frontpage':

				itemsInDOM = rootNode.querySelectorAll('a[data-a-target="preview-card-image-link"]:not([data-uttv-hidden]), div[data-a-target^="card-"]:not([data-uttv-hidden])').length;

			break;

			case 'channels':

				itemsInDOM = rootNode.querySelectorAll('div.stream-thumbnail:not([style*="display"]), div[data-target="directory-container"] div[data-target][style^="order:"]:not([style*="display"])').length;

			break;

			case 'categories':

				itemsInDOM = rootNode.querySelectorAll('div[data-target="directory-container"] div[data-target][style^="order:"]:not([style*="display"])').length;

			break;
		}

		if ((itemsInDOM > 0) && (itemsInDOM !== currentItemsCount)) {

			// number of items changed, thus assuming that slots were added
			logVerbose('Scrolling detected!', '[in DOM: ' + itemsInDOM + ']', '[in MEM: ' + currentItemsCount + ']');
			onScroll();
		}

	}, scrollChangeMonitoringInterval);
}

/**
 * Event to fire on scroll. Re-runs the filter.
 */
function onScroll() {
	logTrace('invoking onScroll()');

	if (pageLoads === true) {

		logWarn('invocation of onScroll() canceled, page load is in progress');
		return;
	}

	// directory adds items on scroll down, thus we need to run the filter again
	const remainingItems = filterDirectory();

	// attach hide buttons to the remaining items
	attachHideButtons(remainingItems);
}

/**
 * Trigger scroll event to load more items.
 */
function triggerScroll() {
	logTrace('invoking triggerScroll()');

	if (isFFZ() === true) {

		logWarn('FFZ detected. Scroll trigger aborted.');
		return false;
	}

	const scrollbarNodeSelector = '.simplebar-content.root-scrollable__content';
	const scrollbarNode 		= rootNode.querySelector(scrollbarNodeSelector);

	if (scrollbarNode !== null) {

		scrollbarNode.dispatchEvent( new Event('scroll') );
		return true;

	} else {

		logError('Scrollbar not found. Expected:', scrollbarNodeSelector);
	}

	return false;
}

/**
 * Attaches the observer to the recommendations.
 */
function observeRecommendations() {
	logTrace('invoking observeRecommendations()');

	switch (currentItemType) {

		case 'frontpage':
			logWarn('Recommendations not present on frontpage. Observing aborted.');
			return;
	}

	const targetSelector 	= 'div.side-nav';
	const target 			= rootNode.querySelector(targetSelector);

	if (target !== null) {

		const observer = new MutationObserver(function callback_observeRecommendations() {
			logTrace('callback invoked: observeRecommendations()');

			// trigger recommendations filter
			filterRecommendations();
		});
		observer.observe(target, { childList: true, subtree: true });

	} else {

		logWarn('Cannot observe recommendations. Expected:', targetSelector);
	}
}

/* BEGIN: utility */

	/**
	 * Returns if the extension is loaded via Firefox.
	 */
	function isFirefox() {
		logTrace('invoking isFirefox()');

		return (
			(typeof chrome  !== 'undefined') &&
			(typeof browser !== 'undefined')
		);
	}

	/**
	 * Returns if the FrankerFaceZ extension is loaded.
	 */
	function isFFZ() {
		logTrace('invoking isFFZ()');

		return (document.getElementById('ffz-script') !== null);
	}

	/**
	 * Returns if the BetterTTV extension is loaded.
	 */
	function isBTTV() {
		logTrace('invoking isBTTV()');

		return (document.querySelector('img.bttv-logo') !== null);
	}

	/**
	 * Returns the approx. size required to store the provided data in the storage.
	 */
	function measureStoredSize(o) {
		logTrace('invoking measureStoredSize($)', o);

		let serialized;
		if (typeof o !== 'string') {

			serialized = JSON.stringify(o);

		} else {

			serialized = o;
		}

		return serialized.length;
	}

	function logTrace() {

		if (debug > 0) { return; }

		var args = Array.prototype.slice.call(arguments);
		args.unshift('UnwantedTwitch TRACE:');

		console.log.apply(console, args);
	}
	function logVerbose() {

		if (debug > 1) { return; }

		var args = Array.prototype.slice.call(arguments);
		args.unshift('UnwantedTwitch VERBOSE:');

		console.log.apply(console, args);
	}
	function logInfo() {

		if (debug > 2) { return; }

		var args = Array.prototype.slice.call(arguments);
		args.unshift('UnwantedTwitch INFO:');

		console.log.apply(console, args);
	}
	function logWarn() {

		if (debug > 3) { return; }

		var args = Array.prototype.slice.call(arguments);
		args.unshift('UnwantedTwitch WARN:');

		console.log.apply(console, args);
	}
	function logError() {

		if (debug > 4) { return; }

		var args = Array.prototype.slice.call(arguments);
		args.unshift('UnwantedTwitch ERROR:');

		console.log.apply(console, args);
	}

/* END: utility */

window.addEventListener('load', function callback_windowLoad() {
	logTrace('event invoked: window.load()');

	// init extension's enabled state
	getEnabledState(function callback_getEnabledState(state) {
		logTrace('callback invoked: getEnabledState($)', state);

		if (state === false) { return; }

		logInfo('Page initialization for:', currentPage);
		init();
	});
});

/**
 * Constantly monitor path to notice change of page.
 */
const pageChangeMonitorInterval = 333;
window.clearInterval(monitorPagesInterval);
monitorPagesInterval = window.setInterval(function monitorPages() {

	if (enabled === false) { return; }

	if (window.location.pathname !== currentPage) {

		currentPage 	= window.location.pathname;
		currentItemType = getItemType(currentPage);

		logWarn('Page changed to:', currentPage);
		onPageChange(currentPage);
	}

}, pageChangeMonitorInterval);

// listen to chrome extension messages
chrome.runtime.onMessage.addListener(function callback_runtimeOnMessage(request) {
	logTrace('event invoked: chrome.runtime.onMessage($)', request);

	logWarn('Command received:', request);

	// extension
	if (typeof request.extension === 'string') {

		if (request.extension === 'disable') {

			putEnabledState(false);
			window.location.reload();

		} else if (request.extension === 'enable') {

			putEnabledState(true);
			window.location.reload();
		}
	}

	// blacklistedItems
	if (typeof request.blacklistedItems === 'object') {

		putBlacklistedItems(request.blacklistedItems);
	}
});