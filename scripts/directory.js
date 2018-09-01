// jshint esversion: 6

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

	// interval handle for page load detection
	let waitingForPageLoad;

	// currently detected slot type, one of: 'games', 'communities', 'creative', 'channels' or null
	let currentItemType = getItemType(currentPage, false);

	// indicates that the storage is currently in use
	let storageLocked = false;

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
	logTrace('invoking isSupportedPage("' + page + '")');

	const itemType = getItemType(page, false);

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
function getItemType(page, log) {
	if (log !== false) { logTrace('invoking getItemType("' + page + '")'); };

	let result = null;

	// remove trailing slash
	page = page.replace(/\/$/, '');

	switch (page) {

		case '/directory':
			result = 'games';
			break;

		case '/directory/communities':
			result = 'communities';
			break;

		case '/directory/creative':
			result = 'creative';
			break;

		case '/directory/all':
			result = 'channels';
			break;

		default:
			if (RegExp('^/directory/(all|game)/[^/]+(/[a-z]{2})?$').test(page) === true) {

				result = 'channels';

			} else if (RegExp('^/communities/[^/]+(/[a-z]{2})?$').test(page) === true) {

				result = 'channels';
			}
	}

	if (log !== false) { logTrace('getItemType("' + page + '") returned:', result); }
	return result;
}

/**
 * Retrieves the enabled state from the storage.
 */
function getEnabledState() {
	logTrace('invoking getEnabledState()');

	storageLocked = true;
	chrome.storage.sync.get([ 'enabled' ], function(response) {
		storageLocked = false;

		if (typeof response.enabled === 'boolean') {

			enabled = response.enabled;

			if (response.enabled === true) {
				logWarn('Extension\'s enabled state:', response.enabled);
			} else {
				logError('Extension\'s enabled state:', response.enabled);
			}

		} else {

			logWarn('Extension\'s enabled state unknown, assuming:', true);
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
	chrome.storage.sync.set({ 'enabled': state }, function() {
		storageLocked = false;

		logWarn('Successfully disabled the blacklist.');
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
	getBlacklistedItems(function(blacklistedItems) {

		// cache blacklisted items from storage
		storedBlacklistedItems = blacklistedItems;
		logTrace('[storedBlacklistedItems] initialized', storedBlacklistedItems);
		logVerbose('Blacklist loaded:', blacklistedItems);

		if (pageSupported === true) {

			pageLoads = true;

			// wait for page to load the DOM completely, the loading is deferred, so we need to wait for an indicator
			const pageLoadMonitorInterval = 200;
			waitingForPageLoad = window.setInterval(function init_waitingForPageLoad() {
				logTrace('polling started in init(): waiting for page to load');

				if (enabled === false) { return; }

				// this is the indicator we are looking for, the attribute is set once the page has fully loaded
				const indicator = rootNode.getAttribute('data-a-page-loaded');
				if (indicator !== null) {

					window.clearInterval(waitingForPageLoad);
					pageLoads = false;
					logTrace('polling stopped in init(): page loaded');

					// invoke directory filter
					const remainingItems = filterDirectory();

					// attach hide buttons to the remaining items
					attachHideButtons(remainingItems);
				}

			}, pageLoadMonitorInterval);
		}
	});
}

/**
 * Event to fire whenever the page changes. Re-runs the filter.
 */
function onPageChange(page) {
	logTrace('invoking onPageChange()');

	if (isSupportedPage(page) === false) { return; }

	pageLoads = true;

	// wait for page to load the DOM completely, the loading is deferred, so we need to wait for the first slot
	const pageLoadMonitorInterval = 200;
	waitingForPageLoad = window.setInterval(function onPageChange_waitingForPageLoad() {
		logTrace('polling started in onPageChange(): waiting for page to load');

		if (enabled === false) { return; }

		const indicator = rootNode.querySelector('div[data-target][style^="order:"]');
		if (indicator !== null) {

			window.clearInterval(waitingForPageLoad);
			pageLoads = false;
			logTrace('polling stopped in onPageChange(): page loaded');

			// invoke directory filter
			const remainingItems = filterDirectory();

			// attach hide buttons to the remaining items
			attachHideButtons(remainingItems);
		}

	}, pageLoadMonitorInterval);
}

/**
 * Initializes the blacklisted items collection by setting up the default item types in the provided object.
 */
function initBlacklistedItems(collection) {
	logTrace('invoking initBlacklistedItems($)', collection);

	const itemTypes = [
		'games',
		'communities',
		'creative',
		'channels'
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
	chrome.storage.sync.get([ 'blacklistedItems' ], function(result) {
		storageLocked = false;

		let blacklistedItems = {};
		if (typeof result.blacklistedItems === 'object') {

			blacklistedItems = result.blacklistedItems;
		}

		if (typeof callback === 'function') {

			callback(blacklistedItems);
		}
	});
}

/**
 * Stores all blacklisted items in the storage.
 */
function putBlacklistedItems(blacklistedItems, callback) {
	logTrace('invoking putBlacklistedItems($)', blacklistedItems);

	storedBlacklistedItems = blacklistedItems;

	storageLocked = true;
	chrome.storage.sync.set({ 'blacklistedItems': blacklistedItems }, function() {
		storageLocked = false;

		logInfo('Successfully added to blacklist:', item);
	});
}

/**
 * Removes the node from the DOM based on the current item type.
 */
function removeItem(node) {

	if (currentItemType === 'channels') {

		let topNode = node;

		// find parent with class .stream-thumbnail or attribute [data-target] + [style^="order:"]
		while (true) {

			if (topNode === undefined) { break; }

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

	} else {

		let topNode = node;

		// find parent with attribute [data-target] + [style^="order:"]
		while (true) {

			if (topNode === undefined) { break; }

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
	}

	return false;
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

		remainingItems = filterItems(storedBlacklistedItems, currentItems);
	}
	filterRunning = false;

	if (remainingItems.length < currentItems.length) {

		logVerbose('Attempting to re-populate items.');
		triggerScroll();
	}

	return remainingItems;
}

/**
 * Returns all items found in the directory.
 */
function getItems() {
	logTrace('invoking getItems()');

	let items = [];

	if (currentItemType === 'channels') {

		// items
		const itemContainersSelector 	= 'a[data-a-target="preview-card-image-link"]:not([data-uttv-hidden])';
		const itemContainers 			= rootNode.querySelectorAll(itemContainersSelector);
		const itemContainersLength 		= itemContainers.length;

		if (itemContainersLength === 0) {

			logError('Item containers not found in directory container. Expected:', itemContainersSelector);
			return [];
		}

		for (let i = 0; i < itemContainersLength; i++) {

			const itemName = itemContainers[i].getAttribute('href');
			if ((typeof itemName === 'string') && (itemName.length > 0)) {

				// try to find game
				let subItem = null;
				let subNode = itemContainers[i].parentNode.parentNode;
				if (subNode.classList.contains('preview-card')) {

					subNode = subNode.querySelector('[data-a-target="preview-card-game-link"]');
					if (subNode !== null) {

						subItem = subNode.textContent;
					}
				}

				items.push({
					item: 		itemName.replace('/', ''),
					subItem: 	subItem,
					node: 		itemContainers[i]
				});
			}
		}

	} else {

		// items
		const itemContainersSelector 	= 'a[data-a-target="tw-box-art-card-link"]:not([data-uttv-hidden])';
		const itemContainers 			= rootNode.querySelectorAll(itemContainersSelector);
		const itemContainersLength 		= itemContainers.length;

		if (itemContainersLength === 0) {

			logError('Item containers not found in directory container. Expected:', itemContainersSelector);
			return [];
		}

		for (let i = 0; i < itemContainersLength; i++) {

			const itemName = itemContainers[i].getAttribute('aria-label');
			if ((typeof itemName === 'string') && (itemName.length > 0)) {

				items.push({
					item: 		itemName,
					subItem: 	null,
					node: 		itemContainers[i]
				});
			}
		}
	}

	currentItemsCount = items.length;

	logVerbose('Items found on the current page:', items);
	return items;
}

/**
 * Removes all blacklisted items and returns the remaining items.
 */
function filterItems(blacklisted, present) {
	logTrace('invoking filterItems($, $)', blacklisted, present);

	if (typeof currentItemType !== 'string') {

		throw new Error('UnwantedTwitch: Current item type is invalid. Cannot proceed with: filterItems()');
	}

	// initialize defaults in blacklisted items collection
	initBlacklistedItems(blacklisted);

	let remainingItems = [];

	if (currentItemType === 'channels') {

		const presentLength = present.length;
		for (let i = 0; i < presentLength; i++) {

			const entry = present[i];

			if (
				(blacklisted.channels[entry.item] !== undefined) ||
				(
					(entry.subItem !== null) &&
					(blacklisted.games[entry.subItem] !== undefined)
				)
			 ) {

				if (removeItem(entry.node) === true) {

					logInfo('Blacklisted:', entry.item);
				}

			} else {

				remainingItems.push(entry);
			}
		}

	} else {

		const presentLength = present.length;
		for (let i = 0; i < presentLength; i++) {

			const entry = present[i];

			if (blacklisted[currentItemType][entry.item] !== undefined) {

				if (removeItem(entry.node) === true) {

					logInfo('Blacklisted:', entry.item);
				}

			} else {

				remainingItems.push(entry);
			}
		}
	}

	currentItemsCount = remainingItems.length;

	logVerbose('Remaining items on the current page:', remainingItems);
	return remainingItems;
}

/**
 * Attaches "Hide Item" button to each item container.
 */
function attachHideButtons(items) {
	logTrace('invoking attachHideButtons($)', items);

	if (items.length === 0) { return; }

	const attachedKey = 'data-uttv-hide-attached';

	// button prototype
	let hideNode = document.createElement('div');

	switch (currentItemType) {

		case 'games':
			hideNode.className 		= 'uttv-hide game';
			hideNode.textContent 	= chrome.i18n.getMessage('label_HideGame');
			break;

		case 'communities':
		case 'creative':
			hideNode.className 		= 'uttv-hide community';
			hideNode.textContent 	= chrome.i18n.getMessage('label_HideCommunity');
			break;

		case 'channels':
			hideNode.className 		= 'uttv-hide channel';
			hideNode.textContent 	= chrome.i18n.getMessage('label_HideChannel');
			break;

		default:
			hideNode.className 		= 'uttv-hide';
			hideNode.textContent 	= 'Hide Item';
			break;
	}

	const itemsLength = items.length;
	for (let i = 0; i < itemsLength; i++) {

		// prevent attaching more than once
		if (items[i].node.getAttribute(attachedKey) !== null) { continue; }

		items[i].node.setAttribute(attachedKey, 'true');

		let newNode = hideNode.cloneNode(true);
		newNode.setAttribute('data-uttv-item', items[i].item);
		newNode.addEventListener('click', onHideItem);

		items[i].node.parentNode.appendChild(newNode);
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
	storedBlacklistedItems[currentItemType][item] = true;

	// update storage
	putBlacklistedItems(storedBlacklistedItems);

	// remove item
	if (removeItem(this) === true) {

		logVerbose('Node removed due to item being blacklisted:', this);
	}
}

/**
 * Monitors scrollbar offset periodically and fires custom onScroll event if the scroll progressed further down.
 */
function listenToScroll() {
	logTrace('invoking listenToScroll()');

	const scrollChangeMonitoringInterval = 1000;
	window.setInterval(function checkSlots() {
		//logTrace('invoking checkSlots()');

		if (enabled === false) { return; }

		if (pageLoads === true) { return; }

		let itemsInDOM = 0;

		if (currentItemType === 'channels') {

			itemsInDOM = rootNode.querySelectorAll('div.stream-thumbnail:not([style*="display"]), div[data-target="directory-container"] div[data-target][style^="order:"]:not([style*="display"])').length;

		} else {

			itemsInDOM = rootNode.querySelectorAll('div[data-target="directory-container"] div[data-target][style^="order:"]:not([style*="display"])').length;
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

		logTrace('invocation of onScroll() canceled, page load is in progress');
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
	const scrollbarNode 		= document.querySelector(scrollbarNodeSelector);

	if (scrollbarNode !== null) {

		scrollbarNode.dispatchEvent( new Event('scroll') );
		return true;

	} else {

		logError('Scrollbar not found. Expected:', scrollbarNodeSelector);
	}

	return false;
}

/* BEGIN: utility */

	/**
	 * Returns if the FrankerFaceZ extension is loaded.
	 */
	function isFFZ() {

		return (document.getElementById('ffz-script') !== null);
	}

	/**
	 * Returns if the BetterTTV extension is loaded.
	 */
	function isBTTV() {

		return (document.querySelector('img.bttv-logo') !== null);
	}

	function logTrace() {

		if (debug > 0) { return; }

		var args = Array.prototype.slice.call(arguments);
		args.unshift('UnwantedTwitch:');

		console.log.apply(console, args);
	}
	function logVerbose() {

		if (debug > 1) { return; }

		var args = Array.prototype.slice.call(arguments);
		args.unshift('UnwantedTwitch:');

		console.log.apply(console, args);
	}
	function logInfo() {

		if (debug > 2) { return; }

		var args = Array.prototype.slice.call(arguments);
		args.unshift('UnwantedTwitch:');

		console.info.apply(console, args);
	}
	function logWarn() {

		if (debug > 3) { return; }

		var args = Array.prototype.slice.call(arguments);
		args.unshift('UnwantedTwitch:');

		console.warn.apply(console, args);
	}
	function logError() {

		if (debug > 4) { return; }

		var args = Array.prototype.slice.call(arguments);
		args.unshift('UnwantedTwitch:');

		console.error.apply(console, args);
	}

/* END: utility */

window.addEventListener('load', function() {

	logWarn('Page initialization for:', currentPage);
	init();
});

window.addEventListener('popstate', function() {

	logWarn('Page changed to:', page);
	onPageChange(currentPage);
});

/**
 * Constantly monitor path to notice change of page.
 */
const pageChangeMonitorInterval = 333;
window.setInterval(function monitorPages() {
	//logTrace('invoking monitorPages()');

	if (enabled === false) { return; }

	if (window.location.pathname !== currentPage) {

		currentPage 	= window.location.pathname;
		currentItemType = getItemType(currentPage);

		logWarn('Page changed to:', currentPage);
		onPageChange(currentPage);
	}

}, pageChangeMonitorInterval);

// init extension's enabled state
getEnabledState();

// listen to chrome extension messages
chrome.runtime.onMessage.addListener(function(request) {

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