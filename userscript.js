// ==UserScript==
// @name         Google Docs Alt-W Fix (macOS) - qwerty-fr é fix
// @version      1.0
// @description  Allows Alt+W to type the qwerty-fr é in Google Docs on macOS, instead of triggering a GDocs shortcut for Gemini popup
// @author       Guilhem Vellut
// @match        https://docs.google.com/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    // Unique prefix for console logs to make them easy to find and filter.
    // Includes current window's path and whether it's the top window or an iframe.
    const LOG_PREFIX = `[GDocs Alt-W Fix | ${window.location.pathname.substring(0, 20)}... | ${window.self === window.top ? "TOP" : "IFRAME"}]`;

    console.log(LOG_PREFIX, 'Script executing. URL:', window.location.href);

    function keydownHandler(event) {
        console.log(LOG_PREFIX, 'Key Combo: ' + event.altKey + ' ' + event.ctrlKey + ' ' + event.metaKey + ' ' + event.key.toLowerCase() + ' ' + event.code);
        // We are interested in Alt + W (without Ctrl or Cmd/Meta)
        if (event.altKey && !event.ctrlKey && !event.metaKey && event.code === 'KeyW') {
            console.log(LOG_PREFIX, 'Alt+W DETECTED. Key:', event.key, 'Code:', event.code, 'Target:', event.target);
            console.log(LOG_PREFIX, 'Stopping immediate propagation to prevent GDocs from handling this combination.');

            event.stopImmediatePropagation();

            // IMPORTANT: We DO NOT call event.preventDefault().
            // Preventing default would stop the OS from inserting the character (e.g., '∑').
            // We only want to stop Google Docs' custom shortcut.
            console.log(LOG_PREFIX, 'Default action for Alt+W (OS character input) will proceed.');
        }
    }

    // This script runs in every frame that matches the @match directive (top window and iframes).
    // We want the event listener to be active in the frame where text input occurs.
    // For Google Docs, this is almost always an iframe.

    // SCENARIO 1: Script is running inside an iframe (e.g., the editor iframe itself)
    if (window.self !== window.top) {
        console.log(LOG_PREFIX, 'Running inside an iframe. Attaching keydown listener directly to this iframe\'s window (capture phase).');
        // Add listener to this iframe's window, in the capture phase.
        window.addEventListener('keydown', keydownHandler, true);
    }
    // SCENARIO 2: Script is running in the top-level window
    else {
        console.log(LOG_PREFIX, 'Running in TOP window. Will attempt to find and attach listener to editor iframe(s).');

        const attachListenerToIframeContentWindow = (iframe) => {
            try {
                // Ensure contentWindow and its document are accessible (same-origin and loaded)
                if (iframe.contentWindow && iframe.contentWindow.document) {
                    console.log(LOG_PREFIX, 'Attempting to attach listener to iframe:', iframe.id || iframe.className || iframe.src.substring(0, 100));
                    iframe.contentWindow.addEventListener('keydown', keydownHandler, true);
                    console.log(LOG_PREFIX, 'Listener attached to iframe:', iframe.id || iframe.className || iframe.src.substring(0, 100));
                } else {
                    console.log(LOG_PREFIX, 'Iframe contentWindow or document not accessible/ready. Skipping:', iframe.id || iframe.className || iframe.src.substring(0, 100));
                }
            } catch (e) {
                console.warn(LOG_PREFIX, 'Error accessing/attaching to iframe (likely cross-origin or not fully loaded):', iframe.id || iframe.className || iframe.src.substring(0, 100), e.message);
            }
        };

        // Selectors for Google Docs editor iframe(s). These might change over time.
        // Using `aria-label` or `title` can be more stable than class names.
        const editorIframeSelectors = [
            'iframe.docs-texteventtarget-iframe',       // A known class, might be older
            'iframe[title="Editable content"]',         // Common for accessibility
            'iframe[aria-label*="Editable content"]',   // General aria-label match
            'iframe[aria-label*="Editor content"]',
            'iframe[aria-label*="Rich text editor"]',
            'iframe[role="main"] iframe'                // Sometimes nested
        ];

        const findAndProcessEditorIframes = () => {

            const query = editorIframeSelectors.join(', ');
            const editorIframes = document.querySelectorAll(query);

            if (editorIframes.length > 0) {
                console.log(LOG_PREFIX, `Found ${editorIframes.length} potential editor iframe(s) using selectors.`);
                editorIframes.forEach(iframe => {
                    // Basic check to ensure it's likely a GDocs related iframe
                    // Editor iframes might initially have src="about:blank"
                    if (!iframe.src || iframe.src.startsWith('https://docs.google.com/') || iframe.src.startsWith('about:blank')) {
                        attachListenerToIframeContentWindow(iframe);
                    } else {
                        console.log(LOG_PREFIX, "Skipping iframe with non-matching src:", iframe.src.substring(0, 100));
                    }
                });
            } else {
                console.log(LOG_PREFIX, 'No specific editor iframes found with current selectors on initial scan.');
            }
        };

        // The editor iframe might not be present immediately, especially with @run-at document-start.
        // 1. Try on DOMContentLoaded (if not already past that state)
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', findAndProcessEditorIframes);
        } else {
            // DOMContentLoaded has already fired
            findAndProcessEditorIframes();
        }

        // 2. Use MutationObserver to catch iframes added dynamically later.
        // This is crucial as GDocs loads many things asynchronously.
        const observer = new MutationObserver((mutationsList) => {
            for (const mutation of mutationsList) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) { // Check if it's an Element
                            // Check if the added node itself is a matching iframe
                            if (node.tagName === 'IFRAME' && node.matches(editorIframeSelectors.join(', '))) {
                                console.log(LOG_PREFIX, 'New editor iframe directly added, detected by MutationObserver:', node.id || node.className || (node.src && node.src.substring(0, 100)));
                                attachListenerToIframeContentWindow(node);
                            }
                            // Check if the added node *contains* matching iframes
                            else if (node.querySelector) {
                                const newIframesInNode = node.querySelectorAll(editorIframeSelectors.join(', '));
                                if (newIframesInNode.length > 0) {
                                    console.log(LOG_PREFIX, `New editor iframe(s) within added subtree detected by MutationObserver.`);
                                    newIframesInNode.forEach(attachListenerToIframeContentWindow);
                                }
                            }
                        }
                    });
                }
            }
        });

        // Start observing the document.documentElement for additions of child elements and their descendants.
        // document.documentElement is available earlier and more reliably than document.body for @run-at document-start.
        observer.observe(document.documentElement, { childList: true, subtree: true });
        console.log(LOG_PREFIX, 'MutationObserver set up on document.documentElement to watch for new iframes.');
    }

    console.log(LOG_PREFIX, "Script setup complete.");
    if (window.self !== window.top) {
        console.log(LOG_PREFIX, "Listener is active in this IFRAME context. Ready for Alt+W.");
    } else {
        console.log(LOG_PREFIX, "TOP window setup complete. Listener(s) will be attached to editor iframe(s) when found.");
    }
})();