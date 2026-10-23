/********************************************************************************
 * Copyright (C) 2020 CoCreate LLC and others.
 *
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import "@cocreate/element-prototype";
import { queryElements } from "@cocreate/utils";
import Actions from "@cocreate/actions";
import Observer from "@cocreate/observer";

const selector = "[clipboard], [clipboard-query]";
const initialized = new WeakSet();
const pending = new WeakMap();

function init(element) {
	if (!element) {
		element = document.querySelectorAll(selector);
	} else if (
		!(element instanceof HTMLCollection) &&
		!(element instanceof NodeList) &&
		!Array.isArray(element)
	) {
		element = [element];
	}
	for (let i = 0; i < element.length; i++) {
		if (element[i].matches(selector)) {
			initElement(element[i]);
		}
	}
}

function initElement(element) {
	if (initialized.has(element)) return;
	initialized.add(element);
	element.addEventListener("click", () => {
		if (
			element.matches(selector) && !element.hasAttribute("actions") &&
			!element.disabled && element.getAttribute("aria-disabled") !== "true"
		) queryClipboardElement(element);
	});
}

function queryClipboardElement(element) {
	let elements = [];
	if (element.hasAttribute("clipboard-query")) {
		elements = queryElements({ element, prefix: "clipboard" });
	} else {
		elements = [element];
	}

	return clipboard(element, elements);
}

function clipboard(element, elements = [element]) {
	if (pending.has(element)) return pending.get(element);
	const operation = copy(element, elements).finally(() => pending.delete(element));
	pending.set(element, operation);
	return operation;
}

async function copy(element, elements) {
	if (
		!(elements instanceof HTMLCollection) &&
		!(elements instanceof NodeList) &&
		!Array.isArray(elements)
	) {
		elements = [elements];
	}

	try {
		element.setAttribute("clipboard", "copying");
		const clipboardItems = [];

		for (const target of elements) {
			const value = await target.getValue();
			if (typeof value === "string") {
				// Handle string content as plain text
				clipboardItems.push(
					new ClipboardItem({
						"text/plain": new Blob([value], { type: "text/plain" }),
						"text/html": new Blob([value], {
							type: "text/html"
						}) // Render as code block in rich editors
					})
				);
			} else if (value instanceof Blob) {
				// Handle Blob content directly
				clipboardItems.push(
					new ClipboardItem({
						[value.type || "application/octet-stream"]: value
					})
				);
			} else if (value !== undefined) {
				const content = JSON.stringify(value, null, 2);
				clipboardItems.push(
					new ClipboardItem({
						"text/plain": new Blob([content], {
							type: "text/plain"
						})
					})
				);
			} else {
				console.warn("Unsupported value type for clipboard:", value);
			}
		}

		if (clipboardItems.length > 0) {
			await navigator.clipboard.write(clipboardItems);
		} else {
			throw new Error("No valid content to copy to clipboard.");
		}

		element.setAttribute("clipboard", "copied");
		element.dispatchEvent(
			new CustomEvent("clipboarded", {
				bubbles: true,
				detail: { clipboardItems }
			})
		);
		return { clipboardItems };
	} catch (error) {
		element.setAttribute("clipboard", "error");
		element.dispatchEvent(new CustomEvent("clipboard-error", {
			bubbles: true, detail: { error }
		}));
		return { error };
	}
}

init();

Actions.init([
	{
		name: "clipboard",
		endEvent: "clipboarded",
		callback: async (action) => {
			const result = await queryClipboardElement(action.element || action);
			if (result.error) action.abort(result.error);
		}
	}
]);

Observer.init({
	name: "CoCreateClipboardAddedNodes",
	types: ["addedNodes"],
	selector,
	callback(mutation) {
		init(mutation.target);
	}
});

Observer.init({
	name: "CoCreateClipboardObserver",
	types: ["attributes"],
	attributeFilter: ["clipboard", "clipboard-query"],
	selector,
	callback: function (mutation) {
		init(mutation.target);
	}
});

export default { init, clipboard };
