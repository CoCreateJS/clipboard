const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup() {
	const observers = [], actions = [], writes = [];
	class Element extends EventTarget {
		constructor(attributes = {}, value = 'Hello') {
			super(); this.attributes = new Map(Object.entries(attributes)); this.value = value;
		}
		hasAttribute(name) { return this.attributes.has(name); }
		getAttribute(name) { return this.attributes.get(name) ?? null; }
		setAttribute(name, value) { this.attributes.set(name, value); }
		matches() { return this.hasAttribute('clipboard') || this.hasAttribute('clipboard-query'); }
		getValue() { return this.value; }
	}
	const context = vm.createContext({
		Event, EventTarget, Blob, console,
		CustomEvent: class extends Event { constructor(name, options) { super(name, options); this.detail = options.detail; } },
		ClipboardItem: class { constructor(data) { this.data = data; } },
		HTMLCollection: class {}, NodeList: class {},
		document: { querySelectorAll: () => [] },
		queryElements: ({ element }) => element.targets || [],
		navigator: { clipboard: { write: async items => { writes.push(items); } } },
		Actions: { init: items => actions.push(...items) },
		Observer: { init: config => observers.push(config) }
	});
	const source = fs.readFileSync('src/index.js', 'utf8')
		.replace(/^import .*;\r?\n/gm, '')
		.replace('export default { init, clipboard };', 'globalThis.api = { init, clipboard };');
	vm.runInContext(source, context);
	return { ...context, Element, observers, actions, writes };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('bare attribute copies itself and reflects state before its success event', async () => {
	const s = setup(), element = new s.Element({ clipboard: '' });
	s.api.init(element);
	let state, bubbles;
	element.addEventListener('clipboarded', event => { state = element.getAttribute('clipboard'); bubbles = event.bubbles; });
	element.dispatchEvent(new Event('click'));
	assert.equal(element.getAttribute('clipboard'), 'copying');
	await flush();
	assert.equal(state, 'copied');
	assert.equal(bubbles, true);
	assert.equal(await s.writes[0][0].data['text/plain'].text(), 'Hello');
	element.dispatchEvent(new Event('click'));
	await flush();
	assert.equal(s.writes.length, 2);
});

test('query-only dynamic controls bind once across state and query mutations', async () => {
	const s = setup(), element = new s.Element({ 'clipboard-query': '#source' });
	element.targets = [new s.Element({}, 'Target')];
	s.observers[0].callback({ target: element });
	for (let i = 0; i < 3; i++) s.observers[1].callback({ target: element });
	element.dispatchEvent(new Event('click'));
	await flush();
	assert.equal(s.writes.length, 1);
	assert.equal(await s.writes[0][0].data['text/plain'].text(), 'Target');
	assert.equal(element.getAttribute('clipboard'), 'copied');
});

test('actions own the click and disabled controls do not copy', async () => {
	const s = setup();
	for (const attrs of [{ clipboard: '', actions: 'clipboard' }, { clipboard: '', 'aria-disabled': 'true' }]) {
		const element = new s.Element(attrs);
		s.api.init(element);
		element.dispatchEvent(new Event('click'));
	}
	await flush();
	assert.equal(s.writes.length, 0);
	const element = new s.Element({ clipboard: '', actions: 'clipboard' });
	await s.actions[0].callback({ element });
	assert.equal(s.writes.length, 1);
});

test('failed writes expose error state and event, abort actions and allow retry', async () => {
	const s = setup(), element = new s.Element({ clipboard: '' });
	const error = new Error('Permission denied');
	s.navigator.clipboard.write = async () => { throw error; };
	let detail, aborted;
	element.addEventListener('clipboard-error', event => { detail = event.detail; });
	await s.actions[0].callback({ element, abort: value => { aborted = value; } });
	assert.equal(element.getAttribute('clipboard'), 'error');
	assert.equal(detail.error, error);
	assert.equal(aborted, error);
	s.navigator.clipboard.write = async () => {};
	await s.api.clipboard(element);
	assert.equal(element.getAttribute('clipboard'), 'copied');
});

test('empty targets fail and overlapping copies share a single write', async () => {
	const s = setup(), element = new s.Element({ clipboard: '' });
	const result = await s.api.clipboard(element, []);
	assert.ok(result.error);
	assert.equal(element.getAttribute('clipboard'), 'error');
	const first = s.api.clipboard(element);
	const second = s.api.clipboard(element);
	assert.equal(first, second);
	await first;
	assert.equal(s.writes.length, 1);
});
