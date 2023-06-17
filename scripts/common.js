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
 * Returns if the provided term is supposed to be an exact match (case-sensitive).
 */
function isExactTerm(term) {

	const firstChar = term.slice(0, 1);
	const lastChar  = term.slice(-1);

	return (
		(firstChar === "'") &&
		(lastChar  === "'")
	);
}

/**
 * Returns if the provided term may be loosely matched (contained, case-insensitive).
 */
function isLooseTerm(term) {

	const firstChar = term.slice(0, 1);

	return (firstChar === '~');
}

/**
 * Returns if the provided term is a regular expression pattern.
 */
function isRegExpTerm(term) {

	const firstChar = term.slice(0, 1);

	return (
		(firstChar === '/') &&
		/^\/(.*)\/[a-zA-Z]*$/.test(term)
	);
}

/**
 * Builds a regular expression object from the provided term.
 * Returns `null` if the pattern is invalid.
 */
function toRegExp(term) {

	let regexp;
	const isCI = /^\/[^/]*\/[^i]*i[^i]*$/.test(term);

	// strip
	term = term.substring(1, term.indexOf('/', 1));
	if (term.length === 0) { return null; }

	try {

		// case-insensitive
		if (isCI) {

			regexp = new RegExp(term, 'i');

		// case-sensitive
		} else {

			regexp = new RegExp(term);
		}

	} catch {

		return null;
	}

	return regexp;
}

/**
 * Returns a normalized lowercase string without diacritics.
 */
function normalizeCase(term) {

	return String(term)
		.trim()
		.normalize('NFKD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
	;
}

/**
 * Returns (async) with the selected storage mode, either "sync" or "local".
 */
async function getStorageMode() {
	logTrace('invoking getStorageMode()');

	// default mode: local
	let useSyncStorage = false;

	const result = await chrome.storage.local.get('useLocalStorage');
	const error  = chrome.runtime.lastError;

	if (error) {

		logError('An error occured trying to read from local storage:', error);
	}

	if (typeof result['useLocalStorage'] === 'boolean') {

		useSyncStorage = !result['useLocalStorage'];
	}

	// remember storage mode
	const storageMode = ( useSyncStorage ? 'sync' : 'local' );
	logVerbose('Storage mode is: ' + storageMode);

	return storageMode;
}

/**
 * Wrapper to retrieve data from storage.
 */
async function storageGet(data) {
	logTrace('invoking storageGet($)', data);

	const mode   = await getStorageMode();
	const result = await chrome.storage[mode].get(data);
	const error  = chrome.runtime.lastError;

	if (error) {

		logError('An error occured trying to read from storage:', error);
	}

	return result;
}

/**
 * Wrapper to store data in storage.
 */
async function storageSet(data) {
	logTrace('invoking storageSet($)', data);

	const mode = await getStorageMode();
	await chrome.storage[mode].set(data);
	const error = chrome.runtime.lastError;

	if (error) {

		logError('An error occured trying to write to storage:', error);
	}

	return (error ?? null);
}

/**
 * Wrapper to remove data from storage.
 */
async function storageRemove(data) {
	logTrace('invoking storageRemove($)', data);

	const mode = await getStorageMode();
	await chrome.storage[mode].remove(data);
	const error = chrome.runtime.lastError;

	if (error) {

		logError('An error occured trying to remove from storage:', error);
	}

	return error;
}

/**
 * Wrapper to remove all data from storage.
 */
async function storageClear() {
	logTrace('invoking storageClear()');

	const mode = await getStorageMode();
	await chrome.storage[mode].clear(data);
	const error = chrome.runtime.lastError;

	if (error) {

		logError('An error occured trying to clear storage:', error);
	}

	return error;
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
