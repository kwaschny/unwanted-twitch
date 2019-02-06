// jshint esversion: 6
// jshint -W069
// jshint -W083

/* BEGIN: runtime variables */

	let rootNode;
	let mainNode;

	// determines if the directory filter is enabled
	let enabled = true;

	// determines if attached buttons are rendered/visible
	let renderButtons = true;

	// determines if stream reruns shall be hidden
	let hideReruns = false;

	// the current page being monitored
	let currentPage = window.location.pathname;

	// indicates that a page load is in progress
	let pageLoads = false;

	// interval handles for page load detection
	let monitorPagesInterval;
	let initInterval;
	let onPageChangeInterval;
	let onPageChangeCounter = 0;
	let checkSlotsInterval;

	// indicates that the filtering is in progress
	let filterRunning = false;

	// number of items currently registered (used to detect changes)
	let currentItemsCount = 0;

	// currently detected slot type, one of: 'frontpage', 'categories', 'channels', 'videos', 'clips', 'following' or null
	let currentItemType = getItemType(currentPage);

	// collection of blacklisted items, serves as local cache
	let storedBlacklistedItems = {};

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

	// remove trailing slash
	page = page.replace(/\/$/, '');

	switch (page) {

		case '':
			return 'frontpage';

		case '/directory':
			return 'categories';

		case '/directory/all':
			return 'channels';

		case '/directory/following':
		case '/directory/following/live':
		case '/directory/following/hosts':
		case '/directory/following/games':
			return 'following';

		default:
			if (RegExp('^/directory/(all|game)/').test(page) === true) {

				if (page.indexOf('/videos/') >= 0) {

					return 'videos';
				}

				if (page.indexOf('/clips') >= 0) {

					return 'clips';
				}

				return 'channels';
			}
	}

	logWarn('Failed to detect item type.', page);
	return null;
}

/**
 * Retrieves the extension state from storage.
 */
function initExtensionState(callback) {
	logTrace('invoking initExtensionState()');

	const stateKeys = [
		'enabled',
		'renderButtons',
		'hideReruns'
	];

	storageGet(stateKeys, function callback_storageGet(result) {
		logTrace('callback invoked: storageGet($)', stateKeys, result);

		// enabled
		if (typeof result['enabled'] === 'boolean') {

			enabled = result['enabled'];

			if (result['enabled'] === true) {

				logVerbose('Extension\'s enabled state:', result['enabled']);

			} else {

				logWarn('Extension\'s enabled state:', result['enabled']);
			}

		} else {

			logInfo('Extension\'s enabled state unknown, assuming:', true);
		}

		// renderButtons
		if (typeof result['renderButtons'] === 'boolean') {

			renderButtons = result['renderButtons'];

			if (result['renderButtons'] === true) {

				logVerbose('Extension\'s render buttons state:', result['renderButtons']);

			} else {

				logWarn('Extension\'s render buttons state:', result['renderButtons']);
			}

		} else {

			logInfo('Extension\'s render buttons state unknown, assuming:', true);
		}

		// hideReruns
		if (typeof result['hideReruns'] === 'boolean') {

			hideReruns = result['hideReruns'];

			if (result['hideReruns'] === true) {

				logVerbose('Extension\'s hide reruns state:', result['hideReruns']);

			} else {

				logWarn('Extension\'s hide reruns state:', result['hideReruns']);
			}

		} else {

			logInfo('Extension\'s render hide reruns state unknown, assuming:', false);
		}

		if (typeof callback === 'function') {

			callback(enabled, renderButtons);
		}
	});
}

/**
 * Waits for the page to load completely, then invokes the directory filter.
 */
function init() {
	logTrace('invoking init()');

	if (enabled === false) { return; }

	const pageSupported = isSupportedPage(currentPage);

	/* BEGIN: root */

		const rootNodeSelector 	= '#root';
		rootNode 				= document.querySelector(rootNodeSelector);

		if (rootNode === null) {

			logError('Root not found. Expected:', rootNodeSelector);
			return;
		}

	/* END: root */

	/* BEGIN: main */

		const mainNodeSelector 	= 'main div.simplebar-scroll-content';
		mainNode 				= document.querySelector(mainNodeSelector);

		if (mainNode === null) {

			logError('Main not found. Expected:', mainNodeSelector);
			return;
		}

	/* END: main */

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
			const pageLoadMonitorInterval = 100;
			window.clearInterval(initInterval);
			initInterval = window.setInterval(function init_waitingForPageLoad() {
				logTrace('polling started in init(): waiting for page to load');

				// this is the indicator we are looking for, the attribute is set once the page has fully loaded
				const indicator = rootNode.getAttribute('data-a-page-loaded');
				if (indicator !== null) {

					const placeholderNode = rootNode.querySelector('.tw-placeholder');
					if (placeholderNode !== null) {

						logVerbose('Found a placeholder. Assuming the page is not fully loaded yet.', placeholderNode);
						return;
					}

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

	if (enabled === false) { return; }

	if (pageLoads === true) { return; }

	if (isSupportedPage(page) === false) { return; }

	pageLoads = true;

	onPageChangeCounter 			= 0;
	const pageLoadMonitorInterval 	= 100;
	const pageLoadTimeout 			= (20000 / pageLoadMonitorInterval);

	// wait for page to load the DOM completely, the loading is deferred, so we need to wait for the first slot
	window.clearInterval(onPageChangeInterval);
	onPageChangeInterval = window.setInterval(function onPageChange_waitingForPageLoad() {
		logTrace('polling started in onPageChange(): waiting for page to load');

		let indicator;
		onPageChangeCounter += 1;

		switch (currentItemType) {

			case 'frontpage':

				indicator = mainNode.querySelector('div.anon-front__content-section, div.tw-mg-3');
				if (indicator !== null) {

					const placeholderNode = rootNode.querySelector('.tw-placeholder');
					if (placeholderNode !== null) {

						logVerbose('Found a placeholder. Assuming the page is not fully loaded yet.', placeholderNode);
						return;
					}

					window.clearInterval(onPageChangeInterval);
					pageLoads = false;
					logTrace('polling stopped in onPageChange(): page loaded');

					// invoke directory filter
					filterDirectory();
				}

				break;

			case 'categories':
			case 'channels':

				indicator = mainNode.querySelector('div[data-target][style^="order:"]');
				if (indicator !== null) {

					const placeholderNode = rootNode.querySelector('.tw-placeholder');
					if (placeholderNode !== null) {

						logVerbose('Found a placeholder. Assuming the page is not fully loaded yet.', placeholderNode);
						return;
					}

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

			case 'videos':

				indicator = mainNode.querySelector('div[data-a-target^="video-tower-card-"]');
				if (indicator !== null) {

					const placeholderNode = rootNode.querySelector('.tw-placeholder');
					if (placeholderNode !== null) {

						logVerbose('Found a placeholder. Assuming the page is not fully loaded yet.', placeholderNode);
						return;
					}

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

			case 'clips':

				indicator = mainNode.querySelector('div[data-a-target^="clips-card-"]');
				if (indicator !== null) {

					const placeholderNode = rootNode.querySelector('.tw-placeholder');
					if (placeholderNode !== null) {

						logVerbose('Found a placeholder. Assuming the page is not fully loaded yet.', placeholderNode);
						return;
					}

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

			case 'following':

				indicator = mainNode.querySelector('a[data-a-target="preview-card-image-link"]');
				if (indicator !== null) {

					const placeholderNode = rootNode.querySelector('.tw-placeholder');
					if (placeholderNode !== null) {

						logVerbose('Found a placeholder. Assuming the page is not fully loaded yet.', placeholderNode);
						return;
					}

					window.clearInterval(onPageChangeInterval);
					pageLoads = false;
					logTrace('polling stopped in onPageChange(): page loaded');

					// invoke directory filter
					filterDirectory();

					// invoke recommendations filter
					filterRecommendations();
					observeRecommendations();
				}

			break;

			default:

				logError('Attempted to detect page loading for unhandled item type:', currentItemType, page);

			break;
		}

		// prevent waiting infinitely for page load in case the content is unknown
		if (onPageChangeCounter > pageLoadTimeout) {

			window.clearInterval(onPageChangeInterval);
			pageLoads = false;
			logWarn('polling stopped in onPageChange(): page did not load within 20 seconds');
		}

	}, pageLoadMonitorInterval);
}

/**
 * Places a button to the right of the filters area in the directory. The button opens the management area of UnwantedTwitch.
 */
function placeManagementButton() {
	logTrace('invoking placeManagementButton()');

	let filtersAreaSelector;
	let filtersArea;

	switch (currentItemType) {

		case 'frontpage':
		case 'following':
			return false;

		case 'categories':
		case 'channels':

			filtersAreaSelector = 'div.browse-header__filters, div.directory-header__filters';
			filtersArea 		= mainNode.querySelector(filtersAreaSelector);

			if (filtersArea !== null) {

				return buildManagementButton(filtersArea);

			} else {

				logWarn('Filters not found. Expected:', filtersAreaSelector);
			}

		break;

		case 'videos':
		case 'clips':

			filtersAreaSelector = 'div.inline-dropdown, div.filter-dropdown-button';
			filtersArea 		= mainNode.querySelectorAll(filtersAreaSelector);
			filtersArea 		= ( (filtersArea.length > 0) ? filtersArea[filtersArea.length - 1] : null );

			if (filtersArea !== null) {

				filtersArea = filtersArea.parentNode.parentNode;

				return buildManagementButton(filtersArea);

			} else {

				logWarn('Filters not found. Expected:', filtersAreaSelector);
			}

		break;

		default:

			logError('Attempted to place management button for unhandled item type:', currentItemType);

		break;
	}

	return false;
}

/**
 * Builds a button to open the management area of UnwantedTwitch.
 */
function buildManagementButton(areaNode) {

	// prevent adding more than one button
	if (areaNode.querySelector('div[data-uttv-management]') !== null) {

		logWarn('Management button already added to filters area:', areaNode);
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
	areaNode.appendChild(container);

	return true;
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

	storageGet(null, function callback_storageGet(result) {
		logTrace('callback invoked: storageGet($)', null, result);

		let blacklistedItems = {};
		if (typeof result.blacklistedItems === 'object') {

			blacklistedItems = result.blacklistedItems;

		} else if (typeof result['blItemsFragment0'] === 'object') {

			blacklistedItems = mergeBlacklistFragments(result);
			logVerbose('Successfully merged fragments to blacklist:', result, blacklistedItems);
		}

		// backward compatibility: rename previous type "games" to "categories"
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

	// backward compatibility: remove no longer existing item types to save storage space
	delete items['communities'];
	delete items['creative'];

	storedBlacklistedItems = items;

	let dataToStore 	= { 'blacklistedItems': items };
	const requiredSize 	= measureStoredSize(dataToStore);

	if (requiredSize > storageSyncMaxSize) {

		logWarn('Blacklist to store (' + requiredSize + ') exceeds the maximum storage size per item (' + storageSyncMaxSize + '). Splitting required...');
		dataToStore = splitBlacklistItems(items);
		logVerbose('Splitting of blacklist completed:', dataToStore);
	}

	const keysToRemove = [ 'blacklistedItems' ];
	for (let i = 0; i < (storageMaxFragments - 1); i++) {

		keysToRemove.push('blItemsFragment' + i);
	}

	storageRemove(keysToRemove, function callback_storageRemove() {
		logTrace('callback invoked: storageRemove($)', keysToRemove);

		storageSet(dataToStore, function callback_storageSet(error) {
			logTrace('callback invoked: storageSet($)', dataToStore);

			// inform user about storage quota
			if (
				(error !== null) &&
				(error.message !== undefined) &&
				(typeof error.message === 'string')
			) {

				if (error.message.indexOf('QUOTA_BYTES') >= 0) {

					alert( chrome.i18n.getMessage('alert_StorageQuota') );

				} else if (error.message.indexOf('MAX_') >= 0) {

					alert( chrome.i18n.getMessage('alert_StorageThrottle') );
				}

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

	// prevent filtering more than once at the same time
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

	if (remainingItems.length < currentItems.length) {

		if (currentItemType !== 'frontpage') {

			logVerbose('Attempting to re-populate items.');
			triggerScroll();
		}
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
			itemContainers 			= mainNode.querySelectorAll(itemContainersSelector);
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

							logWarn('No tags found for card in frontpage view:', itemSibling);
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
			itemContainers 			= mainNode.querySelectorAll(itemContainersSelector);
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

							logWarn('No tags found for card in frontpage view:', itemSibling);
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

		case 'categories':

			// items
			itemContainersSelector 	= 'a[data-a-target="tw-box-art-card-link"]:not([data-uttv-hidden])';
			itemContainers 			= mainNode.querySelectorAll(itemContainersSelector);
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

							logWarn('No tags found for card in categories view:', itemContainers[i]);
						}

					/* END: tags */
				}

				if (itemData !== null) {

					items.push(itemData);
				}
			}

		break;

		case 'channels':

			// items
			itemContainersSelector 	= 'a[data-a-target="preview-card-image-link"]:not([data-uttv-hidden])';
			itemContainers 			= mainNode.querySelectorAll(itemContainersSelector);
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
						item: 		extractItemName(itemName),
						subItem: 	subItem,
						tags: 		[],
						isRerun: 	false,
						node: 		itemContainers[i]
					};

					/* BEGIN: tags */

						let tagContainer = itemContainers[i].parentNode;
						if (tagContainer === null) {

							logWarn('No tags found for card in channels view:', itemContainers[i]);
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

							logWarn('No tags found for card in channels view:', itemContainers[i]);
						}

					/* END: tags */

					/* BEGIN: check for rerun */

						const streamTypeSelector 	= 'div.stream-type-indicator';
						const streamTypeNode 		= itemContainers[i].querySelector(streamTypeSelector);

						if (streamTypeNode !== null) {

							itemData.isRerun = streamTypeNode.classList.contains('stream-type-indicator--rerun');

						} else {

							logWarn('No stream type indicator found for card in categories view:', itemContainers[i]);
						}

					/* END: check for rerun */
				}

				if (itemData !== null) {

					items.push(itemData);
				}
			}

		break;

		case 'videos':
		case 'clips':

			// items
			itemContainersSelector 	= 'a[data-a-target="preview-card-image-link"]:not([data-uttv-hidden])';
			itemContainers 			= mainNode.querySelectorAll(itemContainersSelector);
			itemContainersLength 	= itemContainers.length;

			if (itemContainersLength === 0) {

				logError('Item containers not found in directory container. Expected:', itemContainersSelector);
				return [];
			}

			for (let i = 0; i < itemContainersLength; i++) {

				let itemData = null;

				// card
				const itemNode = itemContainers[i].parentNode.parentNode.querySelector('a[data-a-target="preview-card-channel-link"]');
				if (itemNode !== null) {

					const itemName = itemNode.getAttribute('href');

					itemData = {
						item: 		extractItemName(itemName),
						subItem: 	null,
						tags: 		[],
						isRerun: 	false,
						node: 		itemContainers[i]
					};

					/* BEGIN: tags */

						if (currentItemType !== 'clips') {

							let tagContainer = itemContainers[i].parentNode;
							if (tagContainer === null) {

								logWarn('No tags found for card in channels view:', itemContainers[i]);
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

								logWarn('No tags found for card in channels view:', itemContainers[i]);
							}
						}

					/* END: tags */
				}

				if (itemData !== null) {

					items.push(itemData);
				}
			}

		break;

		case 'following':

			// items
			itemContainersSelector 	= 'a[data-a-target="preview-card-image-link"]:not([data-uttv-hidden])';
			itemContainers 			= mainNode.querySelectorAll(itemContainersSelector);
			itemContainersLength 	= itemContainers.length;

			if (itemContainersLength === 0) {

				logError('Item containers not found in directory container. Expected:', itemContainersSelector);
				return [];
			}

			for (let i = 0; i < itemContainersLength; i++) {

				let itemData = null;

				// card
				let itemName = itemContainers[i].getAttribute('href');
				if ((typeof itemName === 'string') && (itemName.length > 0)) {

					let subItem = null;

					// try to find channel and category
					let subNode = itemContainers[i].parentNode.parentNode;

					itemName = subNode.querySelector('a[data-a-target="preview-card-channel-link"]');

					subNode = subNode.querySelector('a[data-a-target="preview-card-game-link"]');
					if (subNode !== null) {

						subItem = subNode.textContent;
					}

					itemData = {
						item: 		extractItemName(itemName),
						subItem: 	extractItemName(subItem),
						tags: 		[],
						isRerun: 	false,
						node: 		itemContainers[i]
					};

					/* BEGIN: tags */

						let tagContainer = itemContainers[i].parentNode;
						if (tagContainer === null) {

							logWarn('No tags found for card in channels view:', itemContainers[i]);
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

							logWarn('No tags found for card in channels view:', itemContainers[i]);
						}

					/* END: tags */
				}

				if (itemData !== null) {

					items.push(itemData);
				}
			}

		break;

		default:

			logError('Attempted to get items for unhandled item type:', currentItemType);

		break;
	}

	currentItemsCount = items.length;

	if (items.length > 0) {

		logVerbose('Items found on the current page:', items);

	} else {

		logWarn('No items found on the current page!');
	}

	return items;
}

/**
 * Attempts to extract the item name from the provided node.
 */
function extractItemName(node) {

	let buffer = node;

	if (!buffer) {

		return null;
	}

	if (buffer.nodeType === 1) {

		buffer = node.getAttribute('href');
		if (buffer === null) {

			buffer = node.textContent;
		}
	}

	if (typeof buffer === 'string') {

		buffer = buffer.split('/');

		for (let i = 0; i < buffer.length; i++) {

			let value = buffer[i].trim();

			if (value.length > 0) {

				return value;
			}
		}
	}

	return null;
}

/**
 * Removes all blacklisted items and returns the remaining items.
 */
function filterItems(items) {
	logTrace('invoking filterItems($)', items);

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

		case 'categories':

			if (typeof currentItemType !== 'string') {

				logError('Current item type is illegal:', currentItemType);
				return remainingItems;
			}

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

		case 'channels':
		case 'following':

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

				} else if ( (hideReruns === true) && (entry.isRerun === true) ) {

					if (removeItem(entry.node) === true) {

						logInfo('Blacklisted for being a rerun:', entry.node);
					}

				} else {

					remainingItems.push(entry);
				}
			}

		break;

		case 'videos':

			for (let i = 0; i < itemsLength; i++) {

				const entry = items[i];

				if (isBlacklistedChannel(entry.item) === true) {

					if (removeItem(entry.node) === true) {

						logInfo('Blacklisted channel:', entry.item, entry.node);
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

		case 'clips':

			for (let i = 0; i < itemsLength; i++) {

				const entry = items[i];

				if (isBlacklistedChannel(entry.item) === true) {

					if (removeItem(entry.node) === true) {

						logInfo('Blacklisted channel:', entry.item, entry.node);
					}

				} else {

					remainingItems.push(entry);
				}
			}

		break;

		default:

			logError('Attempted to filter items for unhandled item type:', currentItemType);

		break;
	}

	// register new items
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

				let channelTitle = extractItemName(recommAlt[i]);

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
 * Attaches "Hide Item/Tag" button to each item container.
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
		case 'following':
			return;

		case 'categories':
			hideItem.className 		= 'uttv-hide-item category';
			hideItem.textContent 	= 'X';
			hideItem.title 			= chrome.i18n.getMessage('label_HideCategory');
		break;

		case 'channels':
		case 'videos':
		case 'clips':
			hideItem.className 		= 'uttv-hide-item channel';
			hideItem.textContent 	= 'X';
			hideItem.title 			= chrome.i18n.getMessage('label_HideChannel');
		break;

		default:

			logError('Attempted to attach hide buttons (items) for unhandled item type:', currentItemType);
			return;
	}

	// button for tags
	let hideTag 			= document.createElement('div');
	hideTag.className 		= 'uttv-hide-tag';
	hideTag.textContent 	= 'X';
	hideTag.title 			= chrome.i18n.getMessage('label_HideTag');

	if (renderButtons === false) {

		hideItem.classList.add('uttv-hidden');
		hideTag.classList.add('uttv-hidden');
	}

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

					logWarn('No tags found for card in categories view:', items[i].node);
				}

			break;

			case 'channels':
			case 'videos':

				tagContainer = items[i].node.parentNode;
				if (tagContainer === null) {

					logWarn('No tags found for card in channels view:', items[i].node);
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

					logWarn('No tags found for card in channels view:', items[i].node);
				}

			break;

			default:

				logError('Attempted to attach hide buttons (tags) for unhandled item type:', currentItemType);

			break;
		}
	}
}

/**
 * Refreshes all present "Hide Item/Tag" buttons to reflect the current visibility state.
 */
function toggleHideButtonRendering() {
	logTrace('invoking toggleHideButtonRendering()');

	const buttonsSelector 	= '.uttv-hide-item, .uttv-hide-tag';
	const buttons 			= mainNode.querySelectorAll(buttonsSelector);
	const buttonsLength 	= buttons.length;

	if (buttonsLength > 0) {

		if (renderButtons === true) {

			for (let i = 0; i < buttonsLength; i++) {

				buttons[i].classList.remove('uttv-hidden');
			}

		} else {

			for (let i = 0; i < buttonsLength; i++) {

				buttons[i].classList.add('uttv-hidden');
			}
		}

	} else {

		logWarn('Hide buttons not found. Expected:', buttonsSelector);
	}

	return buttons;
}

/**
 * Event to fire by the "Hide Item" button. Adds the selected item to the blacklist in storage.
 */
function onHideItem() {
	logTrace('invoking onHideItem()');

	let itemType = currentItemType;

	// merge item types
	switch (itemType) {

		case 'videos':
		case 'clips':

			itemType = 'channels';

		break;
	}

	if (typeof itemType !== 'string') {

		logError('Current item type is illegal:', itemType);
		return;
	}

	// determine item to blacklist
	const item = this.getAttribute('data-uttv-item');
	if ((typeof item !== 'string') || (item.length === 0)) { return; }

	// update cache
	if (storedBlacklistedItems[itemType] === undefined) {

		storedBlacklistedItems[itemType] = {};
	}
	storedBlacklistedItems[itemType][item] = 1;

	// update storage
	putBlacklistedItems(storedBlacklistedItems);

	// remove item
	if (removeItem(this) === true) {

		logVerbose('Node removed due to item being blacklisted:', this);

		switch (currentItemType) {

			case 'videos':
			case 'clips':

				// trigger full filtering since the just blacklisted channel might be present in other items
				filterDirectory();

			break;
		}
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
					topNode = topNode.children[0];

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

		case 'videos':

			topNode = node;

			while (true) {

				if (
					(topNode === undefined) ||
					(topNode === document.documentElement)
				) {

					logError('Could not find the expected parent node to remove item:', node);
					break;
				}

				let attr = topNode.getAttribute('data-a-target');
				if (
					(attr !== null) &&
					(
						(typeof attr === 'string') &&
						(attr.indexOf('video-tower-card-') === 0)
					)
				) {

					node.setAttribute('data-uttv-hidden', '');

					topNode.style.display = 'none';
					return true;
				}

				topNode = topNode.parentNode;
			}

		break;

		case 'clips':

			topNode = node;

			while (true) {

				if (
					(topNode === undefined) ||
					(topNode === document.documentElement)
				) {

					logError('Could not find the expected parent node to remove item:', node);
					break;
				}

				let attr = topNode.getAttribute('data-a-target');
				if (
					(attr !== null) &&
					(
						(typeof attr === 'string') &&
						(attr.indexOf('clips-card-') === 0)
					)
				) {

					node.setAttribute('data-uttv-hidden', '');

					topNode.style.display = 'none';
					return true;
				}

				topNode = topNode.parentNode;
			}

		break;

		case 'following':

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
					(topNode.classList.contains('preview-card') === true)
				) {

					node.setAttribute('data-uttv-hidden', '');

					topNode.style.display = 'none';
					return true;
				}

				topNode = topNode.parentNode;
			}

		break;

		default:

			logError('Attempted to remove item for unhandled item type:', currentItemType, node);

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

	if (enabled === false) { return; }

	const scrollChangeMonitoringInterval = 1000;
	window.clearInterval(checkSlotsInterval);
	checkSlotsInterval = window.setInterval(function checkSlots() {

		// prevent monitoring during page load
		if (pageLoads === true) {

			logWarn('Invocation of checkSlots() skipped, page load is in progress.');
			return;
		}

		let itemsInDOM = 0;

		switch (currentItemType) {

			case 'frontpage':

				itemsInDOM = mainNode.querySelectorAll('a[data-a-target="preview-card-image-link"]:not([data-uttv-hidden]), div[data-a-target^="card-"]:not([data-uttv-hidden])').length;

			break;

			case 'categories':

				itemsInDOM = mainNode.querySelectorAll('div[data-target="directory-container"] div[data-target][style^="order:"]:not([style*="display"])').length;

			break;

			case 'channels':

				itemsInDOM = mainNode.querySelectorAll('div.stream-thumbnail:not([style*="display"]), div[data-target="directory-container"] div[data-target][style^="order:"]:not([style*="display"])').length;

			break;

			case 'videos':
			case 'clips':
			case 'following':

				itemsInDOM = mainNode.querySelectorAll('a[data-a-target="preview-card-image-link"]:not([data-uttv-hidden])').length;

			break;

			default:

				logError('Attempted to check slots for unhandled item type:', currentItemType);

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

	// prevent scroll event during page load
	if (pageLoads === true) {

		logWarn('Invocation of onScroll() canceled, page load is in progress.');
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

/* END: utility */

window.addEventListener('load', function callback_windowLoad() {
	logTrace('event invoked: window.load()');

	if (enabled === false) { return; }

	// init extension's state
	initExtensionState(function callback_initExtensionState(enabled, renderButtons) {
		logTrace('callback invoked: initExtensionState($)', enabled, renderButtons);

		logInfo('Page initialization for:', currentPage);
		init();
	});
});

/**
 * Constantly monitor path to notice change of page.
 */
const pageChangeMonitorInterval = 100;
window.clearInterval(monitorPagesInterval);
monitorPagesInterval = window.setInterval(function monitorPages() {

	if (enabled === false) { return; }

	if (window.location.pathname !== currentPage) {

		currentPage 	= window.location.pathname;
		currentItemType = getItemType(currentPage);

		logInfo('Page changed to:', currentPage);

		onPageChange(currentPage);
	}

}, pageChangeMonitorInterval);

// listen to chrome extension messages
chrome.runtime.onMessage.addListener(function callback_runtimeOnMessage(request) {
	logTrace('event invoked: chrome.runtime.onMessage($)', request);

	logVerbose('Command received:', request);

	// renderButtons
	if (typeof request['renderButtons'] === 'boolean') {

		renderButtons = request['renderButtons'];
		storageSet({ 'renderButtons': renderButtons });

		toggleHideButtonRendering();
		return;
	}

	// extension
	if (typeof request.extension === 'string') {

		if (request.extension === 'disable') {

			enabled = false;
			storageSet({ 'enabled': enabled });

			window.location.reload();
			return;

		} else if (request.extension === 'enable') {

			enabled = true;
			storageSet({ 'enabled': enabled });

			window.location.reload();
			return;
		}
	}

	// blacklistedItems
	if (typeof request.blacklistedItems === 'object') {

		putBlacklistedItems(request.blacklistedItems);
		return;
	}

	logWarn('Unknown command received. The following command was ignored:', request);
});