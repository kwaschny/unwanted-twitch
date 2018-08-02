// jshint esversion: 6

function addItems(table, items) {

	let fragment = document.createDocumentFragment();
	let count = 0;

	for (let key in items) {
		if (!items.hasOwnProperty(key)) { continue; }

		let row = document.createElement('tr');

		let cell1 = document.createElement('td');
		cell1.innerText = key;

		let cell2 = document.createElement('td');

		let button = document.createElement('button');
		button.innerText = 'Remove';
		button.setAttribute('data-key', key);
		button.addEventListener('click', onRemoveItem);

		cell2.appendChild(button);

		row.appendChild(cell1);
		row.appendChild(cell2);

		fragment.appendChild(row);
		count++;
	}

	if (count === 0) {

		let row = document.createElement('tr');

		let cell = document.createElement('td');
		cell.setAttribute('colspan', 2);
		cell.innerText = 'Nothing blacklisted yet.';

		row.appendChild(cell);

		fragment.appendChild(row);
	}

	table.appendChild(fragment);
}

function onRemoveItem() {

	this.parentNode.parentNode.remove();
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

	result.games 		= gatherKeys(games);
	result.channels 	= gatherKeys(channels);
	result.communities 	= gatherKeys(communities);
	result.creative 	= gatherKeys(creative);

	chrome.runtime.sendMessage(
		{ "blacklistedItems": result }
	);

	alert('You might have to reload current tabs for the changes to take effect.');
	onCancel();
}

function onCancel() {

	chrome.tabs.getCurrent(function(tab) {

		chrome.tabs.remove(tab.id);
	});
}

const games 		= document.getElementById('table_games');
const channels 		= document.getElementById('table_channels');
const communities 	= document.getElementById('table_communities');
const creative 		= document.getElementById('table_creative');

chrome.storage.sync.get([ 'blacklistedItems' ], function(result) {

	addItems(games, 		result.blacklistedItems.games);
	addItems(channels, 		result.blacklistedItems.channels);
	addItems(communities, 	result.blacklistedItems.communities);
	addItems(creative, 		result.blacklistedItems.creative);
});

document.getElementById('save').addEventListener('click', onSave);
document.getElementById('cancel').addEventListener('click', onCancel);