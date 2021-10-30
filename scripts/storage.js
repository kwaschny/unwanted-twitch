// jshint esversion: 6

// maximum number of keys that can be stored in the sync storage
// chrome.storage.sync.MAX_ITEMS - 12 (wiggle room)
const storageSyncMaxKeys = 500;

// maximum size of data that can be stored in the sync storage (in Bytes)
// chrome.storage.sync.QUOTA_BYTES_PER_ITEM - 192 (wiggle room)
const storageSyncMaxSize = 8000;

// maximum number of fragments to maintain
const storageMaxFragments = 100;

/**
 * Splits the provided blacklist items into fragments in order to utilize the storage more efficient.
 */
function splitBlacklistItems(items) {
	logTrace('invoking splitBlacklistItems($)', items);

	const maxValuesPerFragment = 200;

	let fragments     = {};
	let fragmentIndex = 0;

	let remainingSpace = maxValuesPerFragment;

	for (let type in items) {
		if (!items.hasOwnProperty(type)) { continue; }

		// max. fragments reached?
		if (fragmentIndex >= storageSyncMaxKeys) {

			logError('Exceeding storage limit: storageSyncMaxKeys (' + storageSyncMaxKeys + '). Splitting aborted.');
			break;
		}

		let key = ('blItemsFragment' + fragmentIndex);
		if (fragments[key] === undefined) { fragments[key] = {}; }

		let values       = ( Array.isArray(items[type]) ? items[type] : Object.keys(items[type]) );
		let valuesLength = values.length;

		let sliceOffset     = 0;
		let remainingValues = valuesLength;

		if (remainingValues === 0) { continue; }

		while (true) {

			// no more space, start new fragment
			if (remainingSpace === 0) {

				fragmentIndex       += 1;
				key                  = ('blItemsFragment' + fragmentIndex);
				fragments[key]       = {};
				fragments[key][type] = [];
				remainingSpace       = maxValuesPerFragment;
			}

			// max. fragments reached?
			if (fragmentIndex >= storageSyncMaxKeys) {

				logError('Exceeding storage limit: storageSyncMaxKeys (' + storageSyncMaxKeys + '). Splitting aborted.');
				break;
			}

			let slice       = values.slice(sliceOffset, (sliceOffset + Math.min(remainingSpace, maxValuesPerFragment)));
			let sliceLength = slice.length;

			sliceOffset     += sliceLength;
			remainingSpace  -= sliceLength;
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

			if (type === 'titles') {

				if (result[type] === undefined) {

					result[type] = [];
				}

				const itemList       = fragment[type];
				const itemListLength = itemList.length;
				for (let n = 0; n < itemListLength; n++) {

					result[type].push(itemList[n]);
				}

			} else {

				if (result[type] === undefined) {

					result[type] = {};
				}

				const itemList       = fragment[type];
				const itemListLength = itemList.length;
				for (let n = 0; n < itemListLength; n++) {

					result[type][itemList[n]] = 1;
				}
			}
		}

	}

	return result;
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
