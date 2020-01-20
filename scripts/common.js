// jshint esversion: 6
// jshint -W069

// debug
// 0 = TRACE, VERBOSE, INFO, WARN, ERROR
// 1 = VERBOSE, INFO, WARN, ERROR
// 2 = INFO, WARN, ERROR
// 3 = WARN, ERROR
// 4 = ERROR
// 5 = NONE
const debug = 3;

/**
 * Returns a copy of the provided blacklist items.
 */
function cloneBlacklistItems(items) {

	return JSON.parse( JSON.stringify(items) );
}

/**
 * Returns (async) with the selected storage mode, either "sync" or "local".
 */
function getStorageMode(callback) {
	logTrace('invoking getStorageMode()');

	let useSyncStorage = true;

	chrome.storage.local.get('useLocalStorage', function(result) {

		if (chrome.runtime.lastError) {

			logError('An error occured trying to read from local storage:', chrome.runtime.lastError);
		}

		if (typeof result['useLocalStorage'] === 'boolean') {

			useSyncStorage = !result['useLocalStorage'];
		}

		// remember storage mode
		storageMode = ( useSyncStorage ? 'sync' : 'local' );

		logVerbose('Storage mode is: ' + storageMode);

		if (typeof callback === 'function') {

			callback(storageMode);
		}
	});
}

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
 * Wrapper to retrieve data from storage.
 */
function storageGet(data, callback) {
	logTrace('invoking storageGet($)', data);

	const errorHandler = function(result) {

		let error = null;

		if (chrome.runtime.lastError) {

			error = chrome.runtime.lastError;
			logError('An error occured trying to read from storage:', chrome.runtime.lastError);
		}

		if (typeof callback === 'function') {

			callback(result, error);
		}
	};

	getStorageMode(function(mode) {

		chrome.storage[mode].get(data, errorHandler);
	});
}

/**
 * Wrapper to store data in storage.
 */
function storageSet(data, callback) {
	logTrace('invoking storageSet($)', data);

	const errorHandler = function() {

		let error = null;

		if (chrome.runtime.lastError) {

			error = chrome.runtime.lastError;
			logError('An error occured trying to write to storage:', chrome.runtime.lastError);
		}

		if (typeof callback === 'function') {

			callback(error);
		}
	};

	getStorageMode(function(mode) {

		chrome.storage[mode].set(data, errorHandler);
	});
}

/**
 * Wrapper to remove data from storage.
 */
function storageRemove(data, callback) {
	logTrace('invoking storageRemove($)', data);

	const errorHandler = function() {

		let error = null;

		if (chrome.runtime.lastError) {

			error = chrome.runtime.lastError;
			logError('An error occured trying to write to storage:', chrome.runtime.lastError);
		}

		if (typeof callback === 'function') {

			callback(error);
		}
	};

	getStorageMode(function(mode) {

		chrome.storage[mode].remove(data, errorHandler);
	});
}

/**
 * Wrapper to remove all data from storage.
 */
function storageClear(callback) {
	logTrace('invoking storageClear()');

	const errorHandler = function() {

		let error = null;

		if (chrome.runtime.lastError) {

			error = chrome.runtime.lastError;
			logError('An error occured trying to write to storage:', chrome.runtime.lastError);
		}

		if (typeof callback === 'function') {

			callback(error);
		}
	};

	getStorageMode(function(mode) {

		chrome.storage[mode].clear(errorHandler);
	});
}

function logTrace() {

	if (debug > 0) { return null; }

	var args = Array.prototype.slice.call(arguments);
	args.unshift('UTTV TRACE:');

	console.log.apply(console, args);
	return null;
}

function logVerbose() {

	if (debug > 1) { return null; }

	var args = Array.prototype.slice.call(arguments);
	args.unshift('UTTV VERBOSE:');

	console.log.apply(console, args);
	return null;
}

function logInfo() {

	if (debug > 2) { return null; }

	var args = Array.prototype.slice.call(arguments);
	args.unshift('UTTV INFO:');

	console.log.apply(console, args);
	return null;
}

function logWarn() {

	if (debug > 3) { return null; }

	var args = Array.prototype.slice.call(arguments);
	args.unshift('UTTV WARN:');

	// console.warn would show up in the extension overview
	console.warn.apply(console, args);
	return null;
}

function logError() {

	if (debug > 4) { return null; }

	var args = Array.prototype.slice.call(arguments);
	args.unshift('UTTV ERROR:');

	console.error.apply(console, args);
	return null;
}