// jshint esversion: 6
// jshint -W069
// jshint -W083

/* BEGIN: runtime variables */

	// reference nodes for query selectors
	let rootNode = null;
	let mainNode = null;

	/* BEGIN: default settings */

		// determines if the filtering is enabled
		let enabled = true;

		// determines if attached hide buttons are visible
		let renderButtons = true;

		// determines if followed channels/categories shall be hidden
		let hideFollowing = true;

		// determines if stream reruns shall be hidden
		let hideReruns = false;

	/* END: default settings */

	// collection of blacklisted items, serves as local cache
	let storedBlacklistedItems = {};
	let backupBlacklistedItems = {};

	// internal cache to improve matching performance
	let cacheExactTerms  = {};
	let cacheLooseTerms  = {};
	let cacheRegExpTerms = {};

	// interval handles for page load detection
	let monitorPagesInterval;
	let onPageChangeInterval;
	let onPageChangeCounter = 0;
	let checkForItemsInterval;

	// semaphore for the extension initialization
	let initRun = false;

	// semaphore for page load progress
	let pageLoads = false;

	// track number of loops when waiting for placeholders to prevent infinite waiting
	let placeholderLoop = 0;
	const MAX_PLACEHOLDER_LOOP = 20;

	// semaphore for filter progress
	let directoryFilterRunning = false;
	let sidebarFilterRunning   = false;

	// last time the sidebar filtering was triggered by the observer
	let lastSidebarChange = new Date();

	// current page
	let currentPage = getCurrentPage();

	// currently detected page type
	let currentPageType = getPageType(currentPage);

/* END: runtime variables */

/* BEGIN: runtime listeners */

	/**
	 * Listens for chrome extension messages and dispatches corresponding actions.
	 */
	chrome.runtime.onMessage.addListener(async function callback_runtimeOnMessage(request) {
		logTrace('event invoked: chrome.runtime.onMessage($)', request);

		logVerbose('Command received:', request);

		// renderButtons
		if (typeof request['renderButtons'] === 'boolean') {

			await toggleHideButtonsVisibility(request['renderButtons']);
			return true;
		}

		// extension
		if (typeof request.extension === 'string') {

			if (request.extension === 'disable') {

				enabled = false;
				await storageSet({ 'enabled': enabled });

				window.location.reload();
				return true;

			} else if (request.extension === 'enable') {

				enabled = true;
				await storageSet({ 'enabled': enabled });

				window.location.reload();
				return true;
			}
		}

		// blacklistedItems
		if (typeof request.blacklistedItems === 'object') {

			const items     = request.blacklistedItems;
			const cacheOnly = (request.storage === false);

			if (cacheOnly) {

				logInfo('Synchronizing new blacklist.', items);

				// store new items in cache
				modifyBlacklistedItems(items);

			} else {

				if (
					(typeof request.dispatcherIndex !== 'number') ||
					(request.dispatcherIndex <= 0)
				) {

					logInfo('Storing new blacklist.', items);
					await putBlacklistedItems(items);

				} else {

					logInfo('Ignoring request to store new blacklist, because the request is already being processed by another tab.', request);
				}
			}

			// invoke directory filter
			if (
				(currentPageType !== 'following') ||
				(hideFollowing === true)
			) {

				filterDirectory();

			} else {

				// invoke directory filter for recommended section
				filterDirectory('recommended');

				// mark remaining items as being processed
				filterDirectory('unprocessed', false);
			}

			// invoke sidebar filter
			if (hideFollowing === true) {

				filterSidebar();

			} else {

				filterSidebar('recommended');
			}

			return true;
		}

		logError('Unknown command received. The following command was ignored:', request);
		return true;
	});

/* END: runtime listeners */

/* BEGIN: page state */

	/**
	 * Returns the current page.
	 */
	function getCurrentPage(traceThis = true) {

		if (traceThis) {

			logTrace('invoking getCurrentPage()');
		}

		// remove trailing slash
		var result = window.location.pathname.replace(/\/$/, '');

		return result;
	}

	/**
	 * Returns if the specified page is a known and supported type.
	 */
	function isSupportedPage(page, traceThis = true) {

		if (traceThis) {

			logTrace('invoking isSupportedPage($)', page);
		}

		const pageType = getPageType(page);
		const result   = (pageType !== null);

		if (traceThis) {

			if (result === true) {

				logVerbose('Current page is supported:', page, pageType);

			} else {

				logWarn('Current page is not supported:', page, pageType);
			}
		}

		return result;
	}

	/**
	 * Returns the type of the current page.
	 */
	function getPageType(page) {
		logTrace('invoking getPageType($)', page);

		// remove trailing slash
		page = page.replace(/\/$/, '');

		switch (page) {

			case '':
				return 'frontpage';

			case '/directory':
				return 'categories';

			case '/directory/all':
				return 'channels';

			case '/directory/gaming':
			case '/directory/irl':
			case '/directory/music':
			case '/directory/creative':
			case '/directory/esports':
				return 'explore';

			case '/directory/following':
			case '/directory/following/live':
			case '/directory/following/videos':
			case '/directory/following/hosts':
			case '/directory/following/games':
				return 'following';

			case '/directory/following/channels':
				return null;

			default:

				// order of checks matters!
				if (RegExp('^/directory/.+').test(page) === true) {

					if (page.indexOf('/all/tags/') >= 0) {

						return 'channels';
					}

					if (page.indexOf('/tags/') >= 0) {

						return 'categories';
					}

					if (page.indexOf('/videos/') >= 0) {

						return 'videos';
					}

					if (page.indexOf('/clips') >= 0) {

						return 'clips';
					}

					if (page.indexOf('/game/') >= 0) {

						return 'game';
					}

					if (page.indexOf('/collection/') >= 0) {

						return 'collection';
					}

					return 'channels';
				}
		}

		return logWarn('Unable to detect type of page:', page);
	}

	/**
	 * Constantly checks the current location path to detect change of page.
	 */
	const pageChangeMonitorInterval = 100;
	window.clearInterval(monitorPagesInterval);
	monitorPagesInterval = window.setInterval(function monitorPages() {

		if (enabled === false) {

			window.clearInterval(monitorPagesInterval);
			logWarn('Page monitoring stopped. Extension is not enabled.');
			return;
		}

		var page = getCurrentPage(false);

		// location path change = view/page changed
		if (page !== currentPage) {

			currentPage     = page;
			currentPageType = getPageType(page);

			logInfo('Page changed to:', currentPage);

			if (initRun === true) {

				onPageChange(currentPage);
			}
		}

	}, pageChangeMonitorInterval);

	/**
	 * Stops the current page change polling.
	 */
	function stopPageChangePolling() {
		logTrace('invoking stopPageChangePolling()');

		window.clearInterval(onPageChangeInterval);
		placeholderLoop = 0;
		pageLoads       = false;
	}

	/**
	 * Attaches an observer to the sidebar of the current page, which will filter its items.
	 */
	function observeSidebar() {
		logTrace('invoking observeSidebar()');

		const observerCooldown = 500;

		const targetSelector = '[data-a-target^="side-nav-bar"]';
		const target         = rootNode.querySelector(targetSelector);

		if (target !== null) {

			const observer = new MutationObserver(function callback_observeSidebar() {
				logTrace('callback invoked: observeSidebar()');

				// force cooldown to avoid processing multiple mutations at once
				const timeElapsed = (new Date() - lastSidebarChange);
				if (timeElapsed < observerCooldown) {

					return logVerbose('Skipping sidebar mutation, because it was fired within the ' + observerCooldown + ' ms cooldown.');
				}

				lastSidebarChange = new Date();

				// trigger sidebar filter
				if (hideFollowing === true) {

					filterSidebar();

				} else {

					filterSidebar('recommended');
				}

			});
			observer.observe(target, { childList: true, subtree: true });

		} else {

			logWarn('Unable to find sidebar. Expected:', targetSelector);
		}
	}

	/**
	 * Checks for unprocessed items in the directory of the current page and dispatches a scroll event if necessary.
	 */
	function listenToScroll() {
		logTrace('invoking listenToScroll()');

		const interval = 1000;

		window.clearInterval(checkForItemsInterval);
		checkForItemsInterval = window.setInterval(function checkForItems() {

			// prevent listening during page load
			if (pageLoads === true) {

				logVerbose('Stopped checkForItems(), because page load is in progress.');
				window.clearInterval(checkForItemsInterval);
				return;
			}

			// prevent filtering the directory more than once at the same time
			if (directoryFilterRunning === true) {

				logVerbose('Aborted invocation of checkForItems(), because page load is in progress.');
				return;
			}

			// page not supported, no reason to listen
			if (isSupportedPage(currentPage, false) === false) {

				logWarn('Stopped checkForItems(), because page is not supported.');
				window.clearInterval(checkForItemsInterval);
				return;
			}

			const nodes       = getDirectoryItemNodes('unprocessed');
			const nodesLength = nodes.length;

			// when there are unprocessed items in the directory, assume that the user scrolled down
			if (nodesLength > 0) {

				logInfo('Found ' + nodesLength + ' unprocessed nodes in the directory of the current page.', nodes);
				onScroll();
			}

		}, interval);
	}

	/**
	 * Triggers scroll event to load more directory items on the current page. Returns if the event could be dispatched to the custom scrolbar.
	 */
	function triggerScroll() {
		logTrace('invoking triggerScroll()');

		const scrollbarNodeSelector = '.simplebar-content.root-scrollable__content';
		const scrollbarNode         = rootNode.querySelector(scrollbarNodeSelector);

		if (scrollbarNode !== null) {

			// dispatch scroll event to custom scrollbar
			scrollbarNode.dispatchEvent(
				new Event('scroll')
			);
			return true;

		} else {

			logError('Unable to find scrollbar. Expected:', scrollbarNodeSelector);
		}

		return false;
	}

	/**
	 * Returns if the current document invokes the FFZ extension.
	 */
	function usingFFZ() {

		return (document.getElementById('ffz-script') !== null);
	}

/* END: page state */

/* BEGIN: filter operations */

	/**
	 * Filters directory on the current page. Returns the remaining (not blacklisted) items.
	 */
	function filterDirectory(mode = 'visible', remove = true) {
		logTrace('invoking filterDirectory()');

		// prevent filtering more than once at the same time
		if (directoryFilterRunning === true) {

			logWarn('Directory filter already running.');
			return [];
		}

		directoryFilterRunning = true;

		const items          = getDirectoryItems(mode);
		const remainingItems = filterDirectoryItems(items, remove);

		directoryFilterRunning = false;

		// if items were removed, trigger scroll event to request more items
		if (remainingItems.length < items.length) {

			// the frontpage has no additional items
			if (currentPageType !== 'frontpage') {

				logVerbose('Items in the directory were removed. Attempting to request more items.');
				triggerScroll();
			}
		}

		return remainingItems;
	}

	/**
	 * Filters the provided items and returns the remaining (not blacklisted) items.
	 */
	function filterDirectoryItems(items, remove = true) {
		logTrace('invoking filterDirectoryItems($)', items);

		let remainingItems = [];

		const itemsLength = items.length;
		for (let i = 0; i < itemsLength; i++) {

			const item = items[i];

			// mark item node as being processed
			item.node.setAttribute('data-uttv-processed', '');

			if (remove === false) { continue; }

			if (isBlacklistedItem(item) === true) {

				if (removeDirectoryItem(item) === true) {

					logVerbose('Removed item in directory due to being blacklisted:', item);
					continue;

				} else {

					logError('Unable to remove blacklisted item in directory:', item);
				}
			}

			remainingItems.push(item);
		}

		return remainingItems;
	}

	/**
	 * Filters items in the sidebar of the current page. Returns the remaining (not blacklisted) items.
	 */
	function filterSidebar(mode = 'visible') {
		logTrace('invoking filterSidebar()');

		// prevent filtering more than once at the same time
		if (sidebarFilterRunning === true) {

			logWarn('Sidebar filter already running.');
			return [];
		}

		sidebarFilterRunning = true;

		const items          = getSidebarItems(mode);
		const remainingItems = filterSidebarItems(items);

		sidebarFilterRunning = false;

		return remainingItems;
	}

	/**
	 * Filters the provided sidebar items and returns the remaining (not blacklisted) items.
	 */
	function filterSidebarItems(items) {
		logTrace('invoking filterSidebarItems($)', items);

		let remainingItems = [];

		const itemsLength = items.length;
		for (let i = 0; i < itemsLength; i++) {

			const item = items[i];

			// mark item node as being processed
			item.node.setAttribute('data-uttv-processed', '');

			if (isBlacklistedItem(item) === true) {

				if (removeSidebarItem(item) === true) {

					logVerbose('Removed item in sidebar due to being blacklisted:', item);
					continue;

				} else {

					logError('Unable to remove blacklisted item in sidebar:', item);
				}
			}

			remainingItems.push(item);
		}

		return remainingItems;
	}

/* END: filter operations */

/* BEGIN: item operations */

	/**
	 * Returns all items matching the specified mode in the directory of the current page.
	 */
	function getDirectoryItems(mode) {
		logTrace('invoking getDirectoryItems($)', mode);

		const items = [];

		const itemNodes       = getDirectoryItemNodes(mode);
		const itemNodesLength = itemNodes.length;

		for (let i = 0; i < itemNodesLength; i++) {

			const item = readItem(
				itemNodes[i]
			);
			if (item === null) { continue; }

			items.push(item);
		}

		const itemsLength = items.length;

		if (itemsLength > 0) {

			logVerbose('Found ' + itemsLength + ' items on the current page:', items);

		} else {

			logWarn('No items found on the current page. Provided nodes:', itemNodes);
		}

		return items;
	}

	/**
	 * Returns all item nodes matching the specified mode in the directory of the current page.
	 */
	function getDirectoryItemNodes(mode) {
		logTrace('invoking getDirectoryItemNodes($)', mode);

		if (typeof mode !== 'string') {

			throw new Error('Argument "mode" is required. Expected a string.');
		}

		const modes = {
			'visible':     { prefix: '',          suffix: ':not([data-uttv-hidden])'    },
			'hidden':      { prefix: '',          suffix: '[data-uttv-hidden]'          },
			'unprocessed': { prefix: '',          suffix: ':not([data-uttv-processed])' },
			'processed':   { prefix: '',          suffix: '[data-uttv-processed]'       },
			'recommended': { prefix: '.find-me ', suffix: ':not([data-uttv-processed])' }
		};

		let selector;
		let subSelector = { prefix: '', suffix: '' };

		if (modes[mode]) {

			subSelector = modes[mode];

		} else {

			throw new Error('Value of argument "mode", which is "' + mode + '", is unknown.');
		}

		// "!" will be replaced with prefix, "%" will be replaced with suffix
		switch (currentPageType) {

			case 'frontpage':
			case 'explore':
			case 'following':

				selector = '!a[data-a-target="preview-card-image-link"]%, !a[data-a-target="tw-box-art-card-link"]%';

			break;

			case 'categories':

				selector = '!a[data-a-target="tw-box-art-card-link"]%';

			break;

			case 'channels':
			case 'game':
			case 'videos':
			case 'clips':

				selector = '!a[data-a-target="preview-card-image-link"]%';

			break;

			case 'collection':

				selector = '!article[data-a-target^="card-"]%';

			break;

			default:

				logError('Unable to get item nodes of directory, because the page type is unhandled:', currentPageType);
		}

		// replace selector wildcards
		if (typeof selector === 'string') {

			selector = selector.replace(/!/g, subSelector.prefix);
			selector = selector.replace(/%/g, subSelector.suffix);
		}

		const nodes       = mainNode.querySelectorAll(selector);
		const nodesLength = nodes.length;

		if (nodesLength > 0) {

			logTrace('Found ' + nodesLength + ' nodes in directory.', nodes);

		} else {

			logTrace('Unable to find nodes in directory. Expected:', selector);
		}

		return nodes;
	}

	/**
	 * Returns all items matching the specified mode in the sidebar of the current page.
	 */
	function getSidebarItems(mode) {
		logTrace('invoking getSidebarItems($)', mode);

		const items = [];

		const itemNodes       = getSidebarItemNodes(mode);
		const itemNodesLength = itemNodes.length;

		for (let i = 0; i < itemNodesLength; i++) {

			const item = readSidebarItem(
				itemNodes[i]
			);
			if (item === null) { continue; }

			items.push(item);
		}

		const itemsLength = items.length;

		if (itemsLength > 0) {

			logVerbose('Found ' + itemsLength + ' sidebar items on the current page:', items);

		} else {

			logWarn('No sidebar items found on the current page. Provided nodes:', itemNodes);
		}

		return items;
	}

	/**
	 * Returns all item nodes matching the specified mode in the sidebar of the current page.
	 */
	function getSidebarItemNodes(mode) {
		logTrace('invoking getSidebarItemNodes($)', mode);

		if (typeof mode !== 'string') {

			throw new Error('Argument "mode" is required. Expected a string.');
		}

		const modes = {
			'visible':     { prefix: '', suffix: ':not([data-uttv-hidden])'    },
			'hidden':      { prefix: '', suffix: '[data-uttv-hidden]'          },
			'unprocessed': { prefix: '', suffix: ':not([data-uttv-processed])' },
			'processed':   { prefix: '', suffix: '[data-uttv-processed]'       },
			'recommended': { prefix: '', suffix: ':not([data-uttv-hidden])'    }
		};

		let selector;
		let subSelector = { prefix: '', suffix: '' };

		if (modes[mode]) {

			subSelector = modes[mode];

		} else {

			throw new Error('Value of argument "mode", which is "' + mode + '", is unknown.');
		}

		// "!" will be replaced with prefix, "%" will be replaced with suffix
		selector = [

			'!a[data-a-id^="followed-channel-"]%',
			'!a[data-a-id^="recommended-channel-"]%',
			'!a[data-a-id^="popular-channel-"]%',
			'!a[data-a-id^="similarity-channel-"]%',
			'!a.side-nav-card%'

		].join(', ');

		// replace selector wildcards
		if (typeof selector === 'string') {

			selector = selector.replace(/!/g, subSelector.prefix);
			selector = selector.replace(/%/g, subSelector.suffix);
		}

		let nodes = [];

		const sidebarSelector = '[data-a-target^="side-nav-bar"]';
		const sidebarNode     = rootNode.querySelector(sidebarSelector);

		if (sidebarNode !== null) {

			// if there are two or more sections in the sidebar, the second section is for recommended channels
			if (mode === 'recommended') {

				const sidebarSectionsSelector = '.side-nav-section';
				const sidebarSectionsNodes    = sidebarNode.querySelectorAll(sidebarSectionsSelector);

				logVerbose('Looking for recommended channels section in sidebar.', sidebarSectionsSelector);

				let sidebarLabel = null;
				if (sidebarSectionsNodes.length === 1) {

					sidebarLabel = sidebarSectionsNodes[0].getAttribute('aria-label');

				} else if (sidebarSectionsNodes.length >= 2) {

					sidebarLabel = sidebarSectionsNodes[1].getAttribute('aria-label');

				} else {

					logVerbose('Unable to determine recommended channels section.');
				}

				if (sidebarLabel !== null) {

					logVerbose('Determined recommended channels section to be:', sidebarLabel, sidebarSectionsNodes);

					// prefix selector with more specific section
					selector = ('.side-nav-section[aria-label="' + sidebarLabel + '"] ' + selector);
				}
			}

			nodes             = sidebarNode.querySelectorAll(selector);
			const nodesLength = nodes.length;

			if (nodesLength > 0) {

				logTrace('Found ' + nodesLength + ' nodes in sidebar.', nodes);

			} else {

				logTrace('Unable to find nodes in sidebar. Expected:', selector);
			}

		} else {

			logWarn('Unable to find sidebar on the current page. Expected:', sidebarSelector);
		}

		return nodes;
	}

	/**
	 * Returns item information based on the provided node.
	 */
	function readItem(node) {
		logTrace('invoking readItem($)', node);

		if (!node) { return null; }

		const target = node.getAttribute('data-a-target');

		// category
		if (/^card\-[0-9]+$/.test(target)) {

			if (node.nodeName === 'ARTICLE') {

				return readChannel(node);
			}

			return readCategory(node);
		}

		// channel
		if (/^(video\-tower|clips)\-card\-[0-9]+$/.test(target)) {

			return readChannel( node.querySelector('article') );
		}

		switch (target) {

			// channel
			case 'preview-card-channel-link':
				return readChannel(node);

			// channel on game page
			case 'preview-card-image-link':
				return readChannel(node, false, true);

			// category
			case 'tw-box-art-card-link':
				return readCategory(node);
		}

		return logError('Unable to identify item:', node);
	}

	/**
	 * Returns information for a channel item based on the provided node.
	 */
	function readChannel(node, findCategory = true, findTags = true) {
		logTrace('invoking readChannel($, $, $)', node, findCategory, findTags);

		let result = {
			type:     'channels',
			name:     '',
			category: '',
			tags:     [],
			title:    '',
			rerun:    false,
			node:     node
		};

		let buffer;
		let parent = (node.closest('article') ?? node);

		/* BEGIN: title */

			buffer = parent.querySelector('a[data-a-target="preview-card-title-link"], h3[title]');

			if (buffer) {

				result.title = buffer.textContent.trim();

			} else {

				buffer = parent.querySelectorAll('p[title]');

				if (buffer && (buffer.length >= 2)) {

					result.title = buffer[1].textContent.trim();

				} else {

					logVerbose('Unable to determine title of channel.', node);
				}
			}

		/* END: title */

		/* BEGIN: name */

			buffer = parent.querySelector('[data-a-target="preview-card-channel-link"] p[title]');
			if (!buffer) {
				buffer = parent.querySelector('[data-a-target="preview-card-channel-link"] > div');
			}

			// collab channel @ videos/clips
			if (buffer && (buffer.querySelector('p[data-a-target]'))) {

				buffer = buffer.firstChild.firstChild;
			}

			if (buffer) {

				result.name = (buffer.firstChild?.textContent ?? buffer.textContent).trim();

			} else {

				return logError('Unable to determine name of channel.', node);
			}

		/* END: name */

		/* BEGIN: category */

			buffer = parent.querySelector('a[data-a-target="preview-card-game-link"]');

			if (buffer) {

				result.category = buffer.textContent.trim();

			} else if (findCategory) {

				logVerbose('Unable to determine category of channel.', node);
			}

		/* END: category */

		/* BEGIN: tags */

			buffer = parent.querySelector('.tw-tag[data-a-target]');

			if (buffer) {

				const tags = readTags(buffer.parentNode.parentNode);
				for (let i = 0; i < tags.length; i++) {

					result.tags.push(
						tags[i]
					);
				}

			} else if (findTags) {

				logVerbose('Unable to determine tags of channel.', node);
			}

		/* END: tags */

		// rerun
		result.rerun = (node.querySelector('.stream-type-indicator--rerun') !== null);

		return result;
	}

	/**
	 * Returns information for a category item based on the provided node.
	 */
	function readCategory(node, findTags = true) {
		logTrace('invoking readCategory($, $)', node, findTags);

		let result = {
			type:     'categories',
			name:     '',
			category: '',
			tags:     [],
			title:    '',
			rerun:    false,
			node:     node
		};

		let buffer;

		/* BEGIN: name */

			buffer = node.closest('.game-card');
			if (buffer !== null) {

				buffer = buffer.querySelector('h2');
				if (buffer !== null) {

					result.name     = buffer.textContent;
					result.category = result.name;

				} else {

					return logError('Unable to determine name of category.', node);
				}

			} else {

				return logError('Unable to determine name of category.', node);
			}

		/* END: name */

		/* BEGIN: tags */

			buffer = node;

			if (
				buffer.parentNode &&
				buffer.parentNode.parentNode &&
				buffer.parentNode.parentNode.nextSibling
			) {

				result.tags = [];

				const tags = readTags(buffer.parentNode.parentNode.nextSibling);
				for (let i = 0; i < tags.length; i++) {

					result.tags.push(
						tags[i]
					);
				}

			} else if (findTags) {

				logVerbose('Unable to determine tags of category.', node);
			}

		/* END: tags */

		return result;
	}

	/**
	 * Returns all tags found in the provided node.
	 */
	function readTags(node) {
		logTrace('invoking readTags($)', node);

		let tags = [];

		if (!node) { return tags; }

		const tagsSelector = '[data-a-target]';
		const nodes        = node.querySelectorAll(tagsSelector);
		const nodesLength  = nodes.length;

		if (nodesLength > 0) {

			for (let i = 0; i < nodesLength; i++) {

				const tagNode = nodes[i];
				const tagName = tagNode.getAttribute('data-a-target');

				if (!tagName) { continue; }

				// ignore meta targets
				if (tagName.indexOf('preview-card') >= 0) { continue; }

				tags.push({
					name: tagName,
					node: tagNode
				});
			}

		} else {

			logInfo('Unable to find any tags. Expected:', tagsSelector);
		}

		return tags;
	}

	/**
	 * Returns sidebar item information based on the provided node.
	 */
	function readSidebarItem(node, findCategory = false) {
		logTrace('invoking readSidebarItem($, $)', node, findCategory);

		let result = {
			type:     'channels',
			name:     '',
			category: '',
			tags:     [],
			title:    '',
			rerun:    false,
			node:     node
		};

		let buffer;

		/* BEGIN: name */

			// collapsed sidebar
			if (node.classList.contains('side-nav-card')) {

				// automatically collapsed
				buffer = node.querySelector('.tw-avatar');

				if (buffer !== null) {

					buffer = buffer.getAttribute('aria-label');

					if (buffer !== null) {

						result.name = buffer;

					} else {

						// manually collapsed
						buffer = node.querySelector('.tw-image-avatar');

						if ((buffer !== null) && (buffer.alt)) {

							result.name = buffer.alt;

						} else {

							return logError('Unable to determine name of channel.', node);
						}
					}

				} else {

					return logError('Unable to determine name of channel.', node);
				}

			// expanded sidebar
			} else {

				buffer = node.querySelector('[data-a-target="side-nav-title"] p[title], [data-a-target="side-nav-card-metadata"] p[title]');

				if (buffer) {

					result.name = buffer.textContent;

				} else {

					return logError('Unable to determine name of channel.', node);
				}
			}

		/* END: name */

		/* BEGIN: category */

			buffer = node.querySelector('[data-a-target="side-nav-game-title"]');

			if (buffer !== null) {

				result.category = buffer.textContent;

			} else if (findCategory) {

				logVerbose('Unable to determine category of channel.', node);
			}

		/* END: category */

		// rerun
		result.rerun = (node.querySelector('.tw-svg__asset--videorerun') !== null);

		return result;
	}

	/**
	 * Returns if the specified item is blacklisted.
	 */
	function isBlacklistedItem(item) {
		logTrace('invoking isBlacklistedItem($)', item);

		// blacklisted for being a rerun
		if (hideReruns && (item.rerun === true)) { return true; }

		if (storedBlacklistedItems[item.type] === undefined) { return false; }

		// blacklisted by name
		if (matchTerms(item.name, item.type)) {

			logTrace('blacklisted by name:', item.name);
			return true;
		}

		// blacklisted by category
		if (matchTerms(item.category, 'categories')) {

			logTrace('blacklisted by category:', item.category);
			return true;
		}

		// blacklisted by tag
		const tagsLength = item.tags.length;
		for (let i = 0; i < tagsLength; i++) {

			if (matchTerms(item.tags[i].name, 'tags')) {

				logTrace('blacklisted by tag:', item.tags[i].name);
				return true;
			}
		}

		// blacklisted by title
		if (matchTerms(item.title, 'titles')) {

			logTrace('blacklisted by title:', item.title);
			return true;
		}

		return false;
	}

	/**
	 * Returns if the specified term matches against the provided blacklist.
	 */
	function matchTerms(term, type) {

		if (typeof term !== 'string') { return false; }
		if (term.length === 0)        { return false; }

		const termL = normalizeCase(term);

		// match against map
		if (
			(storedBlacklistedItems[type][term]  !== undefined) ||
			(storedBlacklistedItems[type][termL] !== undefined)
		) {
			return true;
		}

		// check for exact match
		if (cacheExactTerms[type] !== undefined) {

			for (const exactTerm of cacheExactTerms[type]) {

				if (term === exactTerm) { return true; }
			}
		}

		// check for loose match
		if (cacheLooseTerms[type] !== undefined) {

			for (const looseTerm of cacheLooseTerms[type]) {

				if (termL.indexOf(looseTerm) >= 0) { return true; }
			}
		}

		// check for regular expression match
		if (cacheRegExpTerms[type] !== undefined) {

			for (const regexp of cacheRegExpTerms[type]) {

				if (regexp.test(term) === true) { return true; }
			}
		}

		return false;
	}

	/**
	 * Removes the provided item node. Returns if the node could be removed.
	 */
	function removeDirectoryItem(item) {
		logTrace('invoking removeDirectoryItem($)', item);

		const topNodes = [];
		let topNode    = item.node;

		switch (item.type) {

			case 'categories':

				// traverse through the DOM and hide the topmost node
				while (true) {

					if (
						(!topNode) ||
						(topNode === document.documentElement)
					) {
						if (topNodes.length > 0) {

							item.node.setAttribute('data-uttv-hidden', '');

							topNodes[topNodes.length - 1].style.cssText += '; display: none !important;';
							return true;

						} else {

							logError('Could not find the expected parent node to remove category item:', item);
							break;
						}
					}

					// order by vague to most specific selector
					if (
						topNode.classList.contains('tw-transition') ||
						(
							(topNode.getAttribute('data-target') !== null) &&
							(
								(typeof topNode.getAttribute('style') === 'string') &&
								(topNode.getAttribute('style').indexOf('order:') === 0)
							)
						)
					) {
						// matching node
						topNodes.push(topNode);

					} else if (
						(topNode.getAttribute('data-a-target') === 'shelf-card')
					) {
						// parent node of match
						topNodes.push(topNode.parentNode);
					}

					// keep looking
					topNode = topNode.parentNode;
				}

			break;

			case 'channels':

				// traverse through the DOM and hide the topmost node
				while (true) {

					if (
						(!topNode) ||
						(topNode === document.documentElement)
					) {
						if (topNodes.length > 0) {

							item.node.setAttribute('data-uttv-hidden', '');

							topNodes[topNodes.length - 1].style.cssText += '; display: none !important;';
							return true;

						} else {

							logError('Could not find the expected parent node to remove channel item:', item);
							break;
						}
					}

					const aTarget = (topNode.getAttribute('data-a-target') ?? '');

					// order by vague to most specific selector
					if (
						topNode.classList.contains('tw-transition') ||
						topNode.classList.contains('stream-thumbnail') ||
						(aTarget.indexOf('video-tower-card') >= 0) ||
						(aTarget.indexOf('clips-card') >= 0) ||
						(
							(topNode.getAttribute('data-target') !== null) &&
							(
								(typeof topNode.getAttribute('style') === 'string') &&
								(topNode.getAttribute('style').indexOf('order:') === 0)
							)
						)
					) {
						// matching node
						topNodes.push(topNode);

					} else if (
						topNode.classList.contains('live-channel-card') ||
						(aTarget === 'shelf-card') ||
						(
							(topNode.getAttribute('href') !== null) &&
							(topNode.getAttribute('tabindex') === '-1')
						)
					) {
						// parent node of match
						switch (currentPageType) {

							case 'explore':
								topNodes.push(topNode.parentNode.parentNode);
							break;

							default:
								topNodes.push(topNode.parentNode);
							break;
						}

					} else if (
						(aTarget.indexOf('followed-vod') >= 0)
					) {
						// parent's parent node of match
						topNodes.push(topNode.parentNode.parentNode);

					} else if (
						(topNode.nodeName === 'ARTICLE') &&
						(aTarget.indexOf('card-') >= 0)
					) {

						// parent's parent node of match
						switch (currentPageType) {

							case 'collection':
								topNodes.push(topNode.parentNode.parentNode.parentNode.parentNode);
							break;

							default:
								topNodes.push(topNode.parentNode.parentNode.parentNode);
							break;
						}
					}

					// keep looking
					topNode = topNode.parentNode;
				}

			break;

			default:

				logError('Unable to remove directory item, because its type is unhandled:', item);

			break;
		}

		return false;
	}

	/**
	 * Removes the provided sidebar item node. Returns if the node could be removed.
	 */
	function removeSidebarItem(item) {
		logTrace('invoking removeSidebarItem($)', item);

		const topNodes = [];
		let topNode    = item.node;

		switch (item.type) {

			case 'channels':

				// traverse through the DOM and hide the topmost node
				while (true) {

					if (
						(!topNode) ||
						(topNode === document.documentElement)
					) {
						if (topNodes.length > 0) {

							item.node.setAttribute('data-uttv-hidden', '');

							const nodeToRemove = topNodes[topNodes.length - 1];

							if (nodeToRemove.classList.contains('side-nav-card')) {

								nodeToRemove.parentNode.parentNode.style.cssText += '; display: none !important;';

							} else {

								nodeToRemove.style.cssText += '; display: none !important;';
							}

							return true;

						} else {

							logError('Could not find the expected parent node to remove sidebar channel item:', item);
							break;
						}
					}

					// order by vague to most specific selector
					if (
						topNode.classList.contains('side-nav-card') ||
						(
							topNode.classList.contains('tw-transition') &&
							topNode.classList.contains('tw-transition--duration-medium') &&
							topNode.classList.contains('tw-transition__scale-over')
						)
					) {
						topNodes.push(topNode);
					}

					topNode = topNode.parentNode;
				}

			break;

			default:

				logError('Unable to remove sidebar item, because its type is unhandled:', item);

			break;
		}

		return false;
	}

/* END: item operations */

/* BEGIN: controls */

	/**
	 * Attaches a hide button to all cards and tags in the directory of the current page.
	 */
	function attachHideButtons(items) {
		logTrace('invoking attachHideButtons($)', items);

		const itemsLength = items.length;

		for (let i = 0; i < itemsLength; i++) {

			const item = items[i];

			attachHideButtonToCard(item);
			attachHideButtonsToTags(item);
		}
	}

	/**
	 * Attaches a hide button to the provided card node.
	 */
	function attachHideButtonToCard(item) {
		logTrace('invoking attachHideButtonToCard($)', item);

		const attachedKey = 'data-uttv-card-attached';

		// prevent attaching the button more than once
		if (item.node.getAttribute(attachedKey) !== null) {

			return logVerbose('Hide button already attached to card.', item);
		}

		// mark item as being processed
		item.node.setAttribute(attachedKey, '');

		/* BEGIN: build hide button */

			let hideItem = document.createElement('div');

			switch (item.type) {

				case 'categories':
					hideItem.className   = 'uttv-hide-item uttv-category';
					hideItem.textContent = 'X';
					hideItem.title       = chrome.i18n.getMessage('label_HideCategory');
				break;

				case 'channels':

					hideItem.className   = 'uttv-hide-item uttv-channel';
					hideItem.textContent = 'X';
					hideItem.title       = chrome.i18n.getMessage('label_HideChannel');

					// offset the "X" button on live channels when FFZ is used (to prevent overlap with stream runtime)
					if ( usingFFZ() ) {

						const isLive = /^\/[^\/]+\/?$/.test(
							item.node.getAttribute('href')
						);

						if (isLive) {

							hideItem.className += ' uttv-ffz';
						}
					}
				break;

				default:

					return logError('Unable to attach hide button to card, because the item type is unhandled:', item);
			}

			if (renderButtons === false) {

				hideItem.classList.add('uttv-hidden');
			}

		/* END: build hide button */

		// attach action listener with backreference to item
		hideItem.setAttribute('data-uttv-type', item.type);
		hideItem.setAttribute('data-uttv-name', item.name);
		hideItem.addEventListener('click', async(event) => {

			// cancel regular click event on card
			event.preventDefault();
			event.stopPropagation();

			await onHideItem(item);
		});

		item.node.parentNode.style.position = 'relative';
		item.node.parentNode.appendChild(hideItem);

		return hideItem;
	}

	/**
	 * Attaches a hide button to each tag node in the provided node.
	 */
	function attachHideButtonsToTags(item) {
		logTrace('invoking attachHideButtonsToTags($)', item);

		const attachedKey = 'data-uttv-tags-attached';

		// prevent attaching the button more than once
		if (item.node.getAttribute(attachedKey) !== null) {

			return logVerbose('Hide buttons already attached to tags.', item);
		}

		// mark item as being processed
		item.node.setAttribute(attachedKey, '');

		/* BEGIN: build hide button */

			let hideTag = document.createElement('div');

			hideTag.className   = 'uttv-hide-tag';
			hideTag.textContent = 'X';
			hideTag.title       = chrome.i18n.getMessage('label_HideTag');

			if (renderButtons === false) {

				hideTag.classList.add('uttv-hidden');
			}

		/* END: build hide button */

		const tagsLength = item.tags.length;
		for (let i = 0; i < tagsLength; i++) {

			const tag         = item.tags[i];
			const hideTagNode = hideTag.cloneNode(true);

			// attach action listener with backreference to item
			hideTagNode.setAttribute('data-uttv-tag', tag.name);
			hideTagNode.addEventListener('click', async(event) => {

				// cancel regular click event on tag
				event.preventDefault();
				event.stopPropagation();

				// ask user to confirm action
				const decision = confirm( chrome.i18n.getMessage('confirm_HideTag') + ' [' + tag.name + ']' );
				if (decision === true) {

					await onHideTag(item, tag);
				}
			});

			const pNode = (tag.node.firstChild || tag.node);

			// parent node might have been replaced after first discovery
			if (pNode.querySelector('[data-uttv-tag]') === null) {

				pNode.appendChild(hideTagNode);

				// reduce padding
				// known issue: toggling button rendering at runtime won't fix the padding for already attached buttons
				if (renderButtons) {

					pNode.style.paddingRight = '0';
				}

			} else {
				logVerbose('Hide buttons already attached to tags.', item);
			}
		}

		return hideTag;
	}

	/**
	 * Toggles visibility state of all present hide buttons in the directory of the current page. Returns all present hide buttons.
	 */
	async function toggleHideButtonsVisibility(state) {
		logTrace('invoking toggleHideButtonsVisibility($)', state);

		if (typeof state !== 'boolean') {

			throw new Error('Argument "state" is illegal. Expected a boolean.');
		}

		// store state globally
		renderButtons = state;
		await storageSet({ 'renderButtons': renderButtons });

		const buttonsSelector = '.uttv-hide-item, .uttv-hide-tag';
		const buttons         = mainNode.querySelectorAll(buttonsSelector);
		const buttonsLength   = buttons.length;

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

			logWarn('Unable to find hide buttons. Expected:', buttonsSelector);
		}

		return buttons;
	}

	/**
	 * Adds a button to open the management view in the directory of the current page.
	 */
	function addManagementButton() {
		logTrace('invoking addManagementButton()');

		let areaSelector;
		let area;

		switch (currentPageType) {

			case 'frontpage':

				areaSelector = '.root-scrollable__wrapper .front-page-carousel';
				area         = mainNode.querySelector(areaSelector);

				if (area !== null) {

					return buildManagementButton(area, 'uttv-frontpage');

				} else {

					logWarn('Unable to find filters area on current page. Expected:', areaSelector);
				}

			break;

			case 'categories':
			case 'channels':
			case 'game':

				areaSelector = 'div[data-a-target="tags-filter-dropdown"]';
				area         = mainNode.querySelector(areaSelector);

				if (area !== null) {

					return buildManagementButton(area.parentNode.parentNode);

				} else {

					logWarn('Unable to find filters area on current page. Expected:', areaSelector);
				}

			break;

			case 'videos':

				areaSelector = 'div.directory-game-videos-page__filters > div';
				area         = mainNode.querySelector(areaSelector);

				if (area !== null) {

					return buildManagementButton(area, 'uttv-videos');

				} else {

					logWarn('Unable to find filters area on current page. Expected:', areaSelector);
				}

			break;

			case 'clips':

				areaSelector = 'div.directory-game-clips-page__filters';
				area         = mainNode.querySelector(areaSelector);

				if (area !== null) {

					return buildManagementButton(area, 'uttv-clips');

				} else {

					logWarn('Unable to find filters area on current page. Expected:', areaSelector);
				}

			break;

			case 'explore':

				areaSelector = '.verticals__header-wrapper';
				area         = mainNode.querySelector(areaSelector);

				if (area !== null) {

					return buildManagementButton(area.firstChild, 'uttv-explore');

				} else {

					logWarn('Unable to find filters area on current page. Expected:', areaSelector);
				}

			break;

			case 'following':

				areaSelector = 'ul[role="tablist"]';
				area         = mainNode.querySelector(areaSelector);

				if (area !== null) {

					return buildManagementButton(area.parentNode);

				} else {

					logWarn('Unable to find filters area on current page. Expected:', areaSelector);
				}

			break;

			case 'collection':

				areaSelector = '#directory-game-main-content h1';
				area         = mainNode.querySelector(areaSelector);

				if (area !== null) {

					return buildManagementButton(area.parentNode, 'uttv-collection');
				}

			break;

			default:

				logError('Unable to add management button, because the page type is unhandled:', currentPageType);

			break;
		}

		return false;
	}

	/**
	 * Adds a button to open the management view in the specified area.
	 */
	function buildManagementButton(areaNode, className = '', position = 'append') {
		logTrace('invoking buildManagementButton($, $)', areaNode, className);

		// prevent adding more than one button in the specified area
		if (areaNode.querySelector('div[data-uttv-management]') !== null) {

			logInfo('Management button already present in the specified area:', areaNode);
			return false;
		}

		let container = document.createElement('div');
		container.setAttribute('data-uttv-management', '');

		// container's class
		if (Array.isArray(className)) {

			className = className.join(' ');
		}
		if (typeof className === 'string') {

			container.className = className;
		}

		let button = document.createElement('div');
		button.className = 'uttv-button';

		let buttonText = document.createElement('div');
		buttonText.className = 'uttv-manage';
		buttonText.textContent = chrome.i18n.getMessage('label_Management');

		// click action for label
		buttonText.addEventListener('click', async() => {

			try {
				await chrome.runtime.sendMessage({ action: 'openBlacklist' });
			}
			catch {
				logError('Failed to open blacklist tab.', error);
			}
		});

		let buttonToggle = document.createElement('div');
		buttonToggle.className = 'uttv-toggle';
		buttonToggle.textContent = '👁';

		// click action for eye symbol
		buttonToggle.addEventListener('click', async() => {

			// require the user to confirm his intent to hide the "X" buttons (prevent accidental toggle)
			if (renderButtons === true) {

				const confirmed = confirm( chrome.i18n.getMessage('confirm_HideButtons') );
				if (!confirmed) { return; }
			}

			await toggleHideButtonsVisibility(!renderButtons);
		});

		button.appendChild(buttonText);
		button.appendChild(buttonToggle);
		container.appendChild(button);

		if (position === 'append') {

			areaNode.appendChild(container);

		} else if (position === 'prepend') {

			areaNode.parentNode.insertBefore(container, areaNode.parentNode.firstChild);

		} else {

			throw new Error('Argument "position" is illegal. Expected one of: "append", "prepend"');
		}

		return true;
	}

/* END: controls */

/* BEGIN: events */

	/**
	 * Event that is emitted whenever the page changes.
	 */
	function onPageChange(page) {
		logTrace('invoking onPageChange($)', page);

		// prevent page change before the first initialization completed
		if (initRun !== true) {

			return logWarn('Aborting invocation of onPageChange($), because the extension is not yet initialized.', page);
		}

		// prevent running multiple page changes at once
		if (pageLoads === true) {

			return logWarn('Aborting invocation of onPageChange($), because the current page is still loading.', page);
		}

		if (isSupportedPage(page) === false) {

			stopPageChangePolling();

			// try to observe sidebar anyway
			observeSidebar();

			return logWarn('Stopped onPageChange($) polling, because the current page is not supported.', page);
		}

		pageLoads = true;

		onPageChangeCounter           = 0;
		const pageLoadMonitorInterval = 100;
		const pageLoadTimeout         = (20000 / pageLoadMonitorInterval);

		// wait until the directory is fully loaded
		window.clearInterval(onPageChangeInterval);
		onPageChangeInterval = window.setInterval(function onPageChange_waitingForPageLoad() {
			logTrace('polling started in onPageChange(): waiting for page to load');

			onPageChangeCounter += 1;

			/* BEGIN: main */

				if (mainNode === null) {

					const mainNodeSelector = 'main';
					mainNode               = document.querySelector(mainNodeSelector);

					if (mainNode === null) {

						logWarn('Main not found. Expected:', mainNodeSelector);
					}
				}

			/* END: main */

			if (mainNode !== null) {

				let indicator;

				switch (currentPageType) {

					case 'frontpage':
					case 'explore':

						const placeholderNode = rootNode.querySelector('.tw-placeholder');
						if (
							(placeholderNode !== null) &&
							(placeholderLoop < MAX_PLACEHOLDER_LOOP)
						) {

							placeholderLoop++;
							return logVerbose(`Found a placeholder in loop ${placeholderLoop}. Assuming the page is not fully loaded yet.`, placeholderNode);
						}

						stopPageChangePolling();
						logTrace('polling stopped in onPageChange(): page loaded');

						addManagementButton();

						// invoke directory filter
						const remainingItems = filterDirectory();

						// attach hide buttons to the remaining items
						attachHideButtons(remainingItems);

						// invoke sidebar filter
						if (hideFollowing === true) {

							filterSidebar();
							observeSidebar();

						} else {

							filterSidebar('recommended');
							observeSidebar('recommended');
						}

						// detect changes (delayed loading, clicking on "Show more")
						listenToScroll();

					break;

					case 'categories':
					case 'channels':
					case 'game':

						indicator = mainNode.querySelector('div[data-target][style^="order:"], article[data-a-target="shelf-card"]');
						if (indicator !== null) {

							const placeholderNode = rootNode.querySelector('.tw-placeholder');
							if (
								(placeholderNode !== null) &&
								(placeholderLoop < MAX_PLACEHOLDER_LOOP)
							) {

								placeholderLoop++;
								return logVerbose(`Found a placeholder in loop ${placeholderLoop}. Assuming the page is not fully loaded yet.`, placeholderNode);
							}

							stopPageChangePolling();
							logTrace('polling stopped in onPageChange(): page loaded');

							addManagementButton();

							// invoke directory filter
							const remainingItems = filterDirectory();

							// attach hide buttons to the remaining items
							attachHideButtons(remainingItems);

							// invoke sidebar filter
							if (hideFollowing === true) {

								filterSidebar();
								observeSidebar();

							} else {

								filterSidebar('recommended');
								observeSidebar('recommended');
							}

							// detect scrolling
							listenToScroll();
						}

					break;

					case 'videos':

						indicator = mainNode.querySelector('div[data-a-target^="video-tower-card-"]');
						if (indicator !== null) {

							const placeholderNode = rootNode.querySelector('.tw-placeholder');
							if (
								(placeholderNode !== null) &&
								(placeholderLoop < MAX_PLACEHOLDER_LOOP)
							) {

								placeholderLoop++;
								return logVerbose(`Found a placeholder in loop ${placeholderLoop}. Assuming the page is not fully loaded yet.`, placeholderNode);
							}

							stopPageChangePolling();
							logTrace('polling stopped in onPageChange(): page loaded');

							addManagementButton();

							// invoke directory filter
							const remainingItems = filterDirectory();

							// attach hide buttons
							attachHideButtons(remainingItems);

							// invoke sidebar filter
							if (hideFollowing === true) {

								filterSidebar();
								observeSidebar();

							} else {

								filterSidebar('recommended');
								observeSidebar('recommended');
							}

							// detect scrolling
							listenToScroll();
						}

					break;

					case 'clips':

						indicator = mainNode.querySelector('div[data-a-target^="clips-card-"]');
						if (indicator !== null) {

							const placeholderNode = rootNode.querySelector('.tw-placeholder');
							if (
								(placeholderNode !== null) &&
								(placeholderLoop < MAX_PLACEHOLDER_LOOP)
							) {

								placeholderLoop++;
								return logVerbose(`Found a placeholder in loop ${placeholderLoop}. Assuming the page is not fully loaded yet.`, placeholderNode);
							}

							stopPageChangePolling();
							logTrace('polling stopped in onPageChange(): page loaded');

							addManagementButton();

							// invoke directory filter
							const remainingItems = filterDirectory();

							// attach hide buttons
							attachHideButtons(remainingItems);

							// invoke sidebar filter
							if (hideFollowing === true) {

								filterSidebar();
								observeSidebar();

							} else {

								filterSidebar('recommended');
								observeSidebar('recommended');
							}

							// detect scrolling
							listenToScroll();
						}

					break;

					case 'following':

						indicator = mainNode.querySelector('a[data-a-target="preview-card-image-link"], a[data-a-target="tw-box-art-card-link"]');
						if (indicator !== null) {

							const placeholderNode = rootNode.querySelector('.tw-placeholder');
							if (
								(placeholderNode !== null) &&
								(placeholderLoop < MAX_PLACEHOLDER_LOOP)
							) {

								placeholderLoop++;
								return logVerbose(`Found a placeholder in loop ${placeholderLoop}. Assuming the page is not fully loaded yet.`, placeholderNode);
							}

							stopPageChangePolling();
							logTrace('polling stopped in onPageChange(): page loaded');

							addManagementButton();

							if (hideFollowing === true) {

								// invoke directory filter
								const remainingItems = filterDirectory();

								// attach hide buttons
								attachHideButtons(remainingItems);

								// invoke sidebar filter
								if (hideFollowing === true) {

									filterSidebar();
									observeSidebar();

								} else {

									filterSidebar('recommended');
									observeSidebar('recommended');
								}

							} else {

								logInfo('Filtering is disabled on the current page due to user preference.');

								// invoke directory filter for recommended section
								const remainingItems = filterDirectory('recommended');

								// mark remaining items as being processed
								filterDirectory('unprocessed', false);

								// attach hide buttons
								attachHideButtons(remainingItems);

								// invoke sidebar filter
								filterSidebar('recommended');
								observeSidebar('recommended');
							}

							// detect expanding sections
							listenToScroll();
						}

					break;

					case 'collection':

						indicator = mainNode.querySelector('article[data-a-target^="card-"]');
						if (indicator !== null) {

							stopPageChangePolling();
							logTrace('polling stopped in onPageChange(): page loaded');

							addManagementButton();

							// invoke directory filter
							const remainingItems = filterDirectory();

							// attach hide buttons to the remaining items
							attachHideButtons(remainingItems);

							// invoke sidebar filter
							if (hideFollowing === true) {

								filterSidebar();
								observeSidebar();

							} else {

								filterSidebar('recommended');
								observeSidebar('recommended');
							}

							// detect scrolling
							listenToScroll();
						}

					break;

					default:

						stopPageChangePolling();
						logError('Unable to detect page load progress, because the page type is unhandled:', currentPageType);

					break;
				}
			}

			// prevent waiting infinitely for page load in case the content is unknown
			if (onPageChangeCounter > pageLoadTimeout) {

				stopPageChangePolling();
				logWarn('Stopped polling in onPageChange($), because current page did not load within ' + (pageLoadTimeout / 10) + ' seconds.', page);
			}

		}, pageLoadMonitorInterval);
	}

	/**
	 * Event that is emitted by hide buttons on cards in the directory of the current page.
	 */
	async function onHideItem(item) {
		logTrace('invoking onHideItem($)', item);

		if (item.name.length === 0) {

			logError('Unable to hide item in directory. The name could not be determined:', item);

			return false;
		}

		// update cache
		const nameL = normalizeCase(item.name);
		modifyBlacklistedItems(item.type, nameL);

		// update storage
		await putBlacklistedItems(storedBlacklistedItems);
	}

	/**
	 * Event that is emitted by hide buttons on tags in the directory of the current page.
	 */
	async function onHideTag(item, tag) {
		logTrace('invoking onHideTag($, $)', item, tag);

		if (tag.name.length === 0) {

			logError('Unable to hide tag in directory. The name could not be determined:', tag);

			return false;
		}

		// update cache
		const nameL = normalizeCase(tag.name);
		modifyBlacklistedItems('tags', nameL);

		// update storage
		await putBlacklistedItems(storedBlacklistedItems);
	}

	/**
	 * Event that is emitted whenever unprocessed items appear in the directory of the current page. Returns if filtering was invoked.
	 */
	function onScroll() {
		logTrace('invoking onScroll()');

		if (pageLoads === true) {

			logWarn('Cancelled emitted scroll event, because page load is in progress.');
			return false;
		}

		let remainingItems;

		if (
			(currentPageType !== 'following') ||
			(hideFollowing === true)
		) {

			remainingItems = filterDirectory('unprocessed');

		} else {

			// invoke directory filter for recommended section
			remainingItems = filterDirectory('recommended');

			// mark remaining items as being processed
			filterDirectory('unprocessed', false);
		}

		attachHideButtons(remainingItems);
		return true;
	}

/* END: events */

/* BEGIN: blacklist */

	/**
	 * Initializes the blacklisted items collection by setting up the default item types in the provided object.
	 */
	function initBlacklistedItems(collection) {
		logTrace('invoking initBlacklistedItems($)', collection);

		const itemTypes = [
			'categories',
			'channels',
			'tags',
			'titles'
		];

		// base container
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
	async function getBlacklistedItems() {
		logTrace('invoking getBlacklistedItems()');

		const result = await storageGet(null);

		let blacklistedItems = {};
		if (typeof result.blacklistedItems === 'object') {

			blacklistedItems = result.blacklistedItems;

		} else if (typeof result['blItemsFragment0'] === 'object') {

			blacklistedItems = mergeBlacklistFragments(result);
			logVerbose('Merged fragments to blacklist:', result, blacklistedItems);
		}

		return blacklistedItems;
	}

	/**
	 * Stores the provided items or a single item in the local cache.
	 * Maintains several internal lists to improve matching performance.
	 */
	function modifyBlacklistedItems(items, item) {
		logTrace('invoking modifyBlacklistedItems($, $)', items, item);

		if (item !== undefined) {

			if (storedBlacklistedItems[items] === undefined) {
				storedBlacklistedItems[items] = {};
			}
			storedBlacklistedItems[items][item] = 1;

			if (isExactTerm(item)) {

				if (cacheExactTerms[items] === undefined) {
					cacheExactTerms[items] = [];
				}

				cacheExactTerms[items].push(
					item.substring(1, (item.length -1))
				);
				return;
			}

			if (isLooseTerm(item)) {

				if (cacheLooseTerms[items] === undefined) {
					cacheLooseTerms[items] = [];
				}

				cacheLooseTerms[items].push(
					item.substring(1)
				);
				return;
			}

			if (isRegExpTerm(item)) {

				if (cacheRegExpTerms[items] === undefined) {
					cacheRegExpTerms[items] = [];
				}

				cacheRegExpTerms[items].push( toRegExp(item) );
				return;
			}

		} else {

			storedBlacklistedItems = items;

			// rebuild caches
			cacheExactTerms  = {};
			cacheLooseTerms  = {};
			cacheRegExpTerms = {};

			const itemTypes = [
				'categories',
				'channels',
				'tags',
				'titles'
			];

			for (const itemType of itemTypes) {

				let terms;
				if (Array.isArray(items[itemType])) {

					terms = items[itemType];

				} else {

					terms = Object.keys(items[itemType]);
				}

				for (const term of terms) {

					if (isExactTerm(term)) {

						if (cacheExactTerms[itemType] === undefined) {
							cacheExactTerms[itemType] = [];
						}

						cacheExactTerms[itemType].push(
							term.substring(1, (term.length -1))
						);
						continue;
					}

					if (isLooseTerm(term)) {

						if (cacheLooseTerms[itemType] === undefined) {
							cacheLooseTerms[itemType] = [];
						}

						cacheLooseTerms[itemType].push(
							term.substring(1)
						);
						continue;
					}

					if (isRegExpTerm(term)) {

						if (cacheRegExpTerms[itemType] === undefined) {
							cacheRegExpTerms[itemType] = [];
						}

						cacheRegExpTerms[itemType].push( toRegExp(term) );
						continue;
					}
				}
			}
		}
	}

	/**
	 * Stores all blacklisted items in the storage.
	 */
	async function putBlacklistedItems(items, attemptRecovery) {
		logTrace('invoking putBlacklistedItems($, $)', items, attemptRecovery);

		const mode   = await getStorageMode();
		const isSync = (mode === 'sync');

		if (attemptRecovery === false) {

			logWarn('Restoring backup:', items);
		}

		// prepare backup of current items
		const backupItems = cloneBlacklistItems(items);

		let dataToStore = { 'blacklistedItems': items };

		if (isSync) {

			const requiredSize = measureStoredSize(dataToStore);

			if (requiredSize > storageSyncMaxSize) {

				logWarn('Blacklist to store (' + requiredSize + ') exceeds the maximum storage size per item (' + storageSyncMaxSize + '). Splitting required...');
				dataToStore = splitBlacklistItems(items);
				logVerbose('Splitting of blacklist completed:', dataToStore);
			}
		}

		const keysToRemove = [ 'blacklistedItems' ];
		for (let i = 0; i < (storageMaxFragments - 1); i++) {

			keysToRemove.push('blItemsFragment' + i);
		}
		await storageRemove(keysToRemove);

		const error = await storageSet(dataToStore);

		// inform user about storage quota
		if (
			(error !== null) &&
			(error.message !== undefined) &&
			(typeof error.message === 'string')
		) {

			if (attemptRecovery !== false) {

				const suffix = ('\n\nStorage Service Error:\n' + error.message);

				if (error.message.indexOf('QUOTA_BYTES') >= 0) {

					alert(chrome.i18n.getMessage('alert_StorageQuota') + suffix);

				} else if (error.message.indexOf('MAX_') >= 0) {

					alert(chrome.i18n.getMessage('alert_StorageThrottle') + suffix);

				} else {

					alert(chrome.i18n.getMessage('alert_StorageIssue') + suffix);
				}

				// something went wrong, force local storage and restore the backup
				await chrome.storage.local.set({ 'useLocalStorage': true });
				await putBlacklistedItems(backupBlacklistedItems, false);
				return;
			}

		} else {

			// synchronize new items among tabs
			await syncBlacklistedItems(items);

			// update backup cache
			if (attemptRecovery !== false) {

				backupBlacklistedItems = backupItems;
				logVerbose('Created backup of blacklist:', backupBlacklistedItems);
			}

			logInfo('Added to blacklist:', items);
		}

		return items;
	}

	/**
	 * Informs all tabs (including the one that invokes this function) about the provided items in order to keep them synchronized.
	 */
	async function syncBlacklistedItems(items) {

		try {
			await chrome.runtime.sendMessage({ blacklistedItems: items, storage: false });
		}
		catch {
			logError('Failed to synchronize all tabs.', error);
		}
	}

/* END: blacklist */

/* BEGIN: initialization */

	/**
	 * Fetches blacklist from storage and starts filtering.
	 */
	async function init() {
		logTrace('invoking init()');

		if (initRun === true) {

			return logWarn('Aborting invocation of init(), because the extension is already initialized.');
		}
		initRun = true;

		// prepare blacklist (regardless of the current page support)
		const blacklistedItems = await getBlacklistedItems();
		logTrace('invoked getBlacklistedItems()', blacklistedItems);

		// initialize defaults in blacklisted items collection
		initBlacklistedItems(blacklistedItems);

		// cache blacklisted items from storage
		storedBlacklistedItems = blacklistedItems;
		modifyBlacklistedItems(blacklistedItems);
		logInfo('Blacklist loaded:', blacklistedItems);

		backupBlacklistedItems = cloneBlacklistItems(blacklistedItems);

		/* BEGIN: root */

			const rootNodeSelector = '#root';
			rootNode               = document.querySelector(rootNodeSelector);

			if (rootNode === null) {

				logError('Root not found. Expected:', rootNodeSelector);
				rootNode = document;
			}

		/* END: root */

		// start filtering
		onPageChange(currentPage);
	}

	/**
	 * Retrieves the extension state from storage.
	 */
	async function initExtensionState() {
		logTrace('invoking initExtensionState()');

		const stateKeys = [
			'enabled',
			'renderButtons',
			'hideFollowing',
			'hideReruns'
		];

		const result = await storageGet(stateKeys);

		// enabled
		if (typeof result['enabled'] === 'boolean') {

			enabled = result['enabled'];

			if (result['enabled'] === true) {

				logVerbose('Extension\'s enabled state:', result['enabled']);

			} else {

				logVerbose('Extension\'s enabled state:', result['enabled']);
			}

		} else {

			logVerbose('Extension\'s enabled state unknown, assuming:', true);
		}

		// renderButtons
		if (typeof result['renderButtons'] === 'boolean') {

			renderButtons = result['renderButtons'];

			if (result['renderButtons'] === true) {

				logVerbose('Extension\'s render buttons state:', result['renderButtons']);

			} else {

				logVerbose('Extension\'s render buttons state:', result['renderButtons']);
			}

		} else {

			logVerbose('Extension\'s render buttons state unknown, assuming:', true);
		}

		// hideFollowing
		if (typeof result['hideFollowing'] === 'boolean') {

			hideFollowing = result['hideFollowing'];

			if (result['hideFollowing'] === true) {

				logVerbose('Extension\'s hide following state:', result['hideFollowing']);

			} else {

				logVerbose('Extension\'s hide following state:', result['hideFollowing']);
			}

		} else {

			logVerbose('Extension\'s render hide following state unknown, assuming:', true);
		}

		// hideReruns
		if (typeof result['hideReruns'] === 'boolean') {

			hideReruns = result['hideReruns'];

			if (result['hideReruns'] === true) {

				logVerbose('Extension\'s hide reruns state:', result['hideReruns']);

			} else {

				logVerbose('Extension\'s hide reruns state:', result['hideReruns']);
			}

		} else {

			logVerbose('Extension\'s render hide reruns state unknown, assuming:', false);
		}
	}

	/**
	 * Waits for the DOM to load, then starts initialization.
	 */
	window.addEventListener('DOMContentLoaded', async function callback_windowLoad() {
		logTrace('event invoked: window.DOMContentLoaded()');

		// init extension's state
		await initExtensionState();

		if (enabled === false) {

			return logWarn('Page initialization aborted. Extension is not enabled.');
		}

		logInfo('Started initialization on page:', currentPage);
		await init();
	});

/* END: initialization */
