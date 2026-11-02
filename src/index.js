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

/**
 * Initializes matching elements. With no argument, scans the document; accepts an element, collection, NodeList, or array.
 *
 * @public
 * @environment client
 */
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

/**
 * Copies values from the supplied source elements to the system clipboard and returns a promise for the result.
 *
 * @public
 * @environment client
 */
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

/**
 * Bubbles after a successful copy; detail contains clipboardItems.
 *
 * @name clipboarded
 * @kind member
 * @public
 * @environment client
 */

/**
 * Bubbles when copying fails; detail contains the error.
 *
 * @name clipboard-error
 * @kind member
 * @public
 * @environment client
 */

/**
 * Copies the element's own value when used as a declarative control; also reflects the current operation state.
 *
 * @name clipboard
 * @kind attribute
 * @valueType string
 * @acceptedValues copying, copied, error
 * @environment client
 */

/**
 * Selects source elements relative to the control using CoCreate queryElements with the clipboard prefix.
 *
 * @name clipboard-query
 * @kind attribute
 * @valueType string
 * @environment client
 */

/**
 * Declarative actions supported or registered by this module.
 *
 * @name declarative-actions
 * @kind member
 * @actions
 * @environment client
 * @example
 * ```json
 * [
 *   {
 *     "name": "clipboard",
 *     "description": "Copies the value of the action element or the elements selected by its clipboard-query attribute.",
 *     "endEvent": "clipboarded",
 *     "failure": "Aborts the action chain with the copy error."
 *   }
 * ]
 * ```
 */

/**
 * Declarative binding behavior for this module.
 *
 * @name declarative-binding
 * @kind member
 * @binding
 * @environment client
 * @example
 * ```json
 * {
 *   "selector": "[clipboard], [clipboard-query]",
 *   "trigger": "click",
 *   "initializesExistingElements": true,
 *   "observesAddedNodes": true,
 *   "actionsIntegration": "When an element has an actions attribute, direct click handling is skipped."
 * }
 * ```
 */

/**
 * Value conversion and handling behavior for this module.
 *
 * @name declarative-valueHandling
 * @kind member
 * @valueHandling
 * @environment client
 * @example
 * ```json
 * {
 *   "string": [
 *     "text/plain",
 *     "text/html"
 *   ],
 *   "blob": "Copied using its MIME type, or application/octet-stream when the type is empty.",
 *   "otherDefinedValues": "JSON-stringified and copied as text/plain.",
 *   "undefined": "Ignored; if no valid ClipboardItems remain, the operation fails."
 * }
 * ```
 */

/**
 * Result shape and state metadata for this API.
 *
 * @name api-result
 * @kind member
 * @result
 * @environment client
 * @example
 * ```json
 * {
 *   "success": "{ clipboardItems }",
 *   "failure": "{ error }",
 *   "stateAttribute": "clipboard",
 *   "stateValues": [
 *     "copying",
 *     "copied",
 *     "error"
 *   ]
 * }
 * ```
 */

/**
 * Usage constraints for this API.
 *
 * @name api-constraints
 * @kind member
 * @constraints
 * @environment client
 * @example
 * ```json
 * [
 *   "Direct click handling skips disabled controls and controls with aria-disabled=\"true\".",
 *   "Copying requires browser support for navigator.clipboard.write and ClipboardItem, plus the browser's applicable clipboard permissions and context requirements."
 * ]
 * ```
 */
