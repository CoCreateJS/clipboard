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

const selector = "[clipboard-query]";

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
	// Add a click event listener to trigger the clipboard action
	element.addEventListener("click", () => {
		let actions = element.getAttribute("actions");
		if (actions && !actions.includes("clipboard")) {
			queryClipboardElement(element);
		}
	});
}

function queryClipboardElement(element) {
	let elements = [];
	if (element.hasAttribute("clipboard-query")) {
		elements = queryElements({ element, prefix: "clipboard" });
	} else {
		elements = [element];
	}

	clipboard(element, elements);
}

async function clipboard(element, elements) {
	if (!elements) return;
	if (
		!(elements instanceof HTMLCollection) &&
		!(elements instanceof NodeList) &&
		!Array.isArray(elements)
	) {
		elements = [elements];
	}

	try {
		const clipboardItems = [];

		for (let element of elements) {
			const valueType = element.getAttribute("clipboard-value-type");
			let value = valueType === "text"
				? (element.value ?? element.textContent ?? "")
				: await element.getValue();
			if (valueType === "innerText") {
				value = value.replace(/<[^>]*>/g, "");
				new ClipboardItem({
					"text/plain": new Blob([value], {
						type: "text/plain"
					})
				});
			} else if (typeof value === "string") {
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
						[value.type]: value
					})
				);
			} else {
				console.warn("Unsupported value type for clipboard:", value);
			}
		}

		if (clipboardItems.length > 0) {
			await navigator.clipboard.write(clipboardItems);
		} else {
			console.warn("No valid content to copy to clipboard.");
		}

		element.dispatchEvent(
			new CustomEvent("clipboarded", {
				detail: { clipboardItems }
			})
		);
	} catch (error) {
		console.error("Failed to copy to clipboard:", error);
	}
}

init();

Actions.init([
	{
		name: "clipboard",
		endEvent: "clipboarded",
		callback: (action) => {
			queryClipboardElement(action.element || action);
		}
	}
]);

Observer.init({
	name: "CoCreateClipboardAddedNodes",
	types: ["addedNodes"],
	selector,
	callback(mutation) {
		initElement(mutation.target);
	}
});

Observer.init({
	name: "CoCreateClipboardObserver",
	types: ["attributes"],
	attributeFilter: ["clipboard-query"],
	selector,
	callback: function (mutation) {
		initElement(mutation.target);
	}
});

export default { init, clipboard };
