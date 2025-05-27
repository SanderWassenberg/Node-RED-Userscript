// ==UserScript==
// @name        Node RED Usability++
// @namespace   github.com/SanderWassenberg
// @match       http://*/*
// @match       https://*/*
// @grant       none
// @version     1.0
// @author      Sander
// @description Fix some annoyances, add some features.
// ==/UserScript==

if (document.title !== "Node-RED") return;
console.log("%cRunning Sander's custom Node-RED script", "color:cyan");

/*
 * FIXES
 * */

// This fixes:
// I expect Ctrl-scroll to zoom into the node canvas, but instead the browser scales the page.
window.addEventListener("wheel", e => {
  if (e.ctrlKey) {
    e.preventDefault(); // Stops the browser from scaling the page

    // Replace with actually zooming the canvas
    if (e.wheelDeltaY > 0) {
      document.getElementById("red-ui-view-zoom-in")?.click();
    } else if (e.wheelDeltaY < 0) {
      document.getElementById("red-ui-view-zoom-out")?.click();
    }
  }
}, { passive: false }); // passive:false REALLY important, otherwise browser ignores the preventDefault call.

// This fixes:
// Pressing Ctrl-S from muscle memory (cuz I'm editing code) pulls up a dialog to save the page as HTML, which I never want.
window.addEventListener("keydown", e => {
  if (e.key === "s" && e.ctrlKey) e.preventDefault();
});

// This fixes:
// On older versions of node-red the middle-mouse button will go into smooth-scroll mode which messes with how that is supposed to drag the canvas.
window.addEventListener("mousedown", e => {
  if (e.button === 1) {
    e.preventDefault();
  }
});

// This fixes:
// When you are modifying a function node and you click and drag to select some code,
// releasing the cursor in the shaded area over the canvas interprets that as a click there,
// which will close the "Edit function Node" side panel when I only wanted to select some text!
{
  const on_shade_click = e => {
    if (document.activeElement.constructor === HTMLTextAreaElement) {
      e.stopImmediatePropagation(); // Stops propagating to events on the same element.
    }
  };

  // Override addEvenListener for divs to ensure we get to add an event to #red-ui-editor-shade BEFORE anyone else.
  // Reason:
  // I tried adding this listener as soon as the shade elem appears in the DOM by using a MutationObserver, but even at that point the
  // click event that makes it close the side panel is already added, any event listener we add will only fire after that one.
  // We have to "just add the event first" if we want to block other events.
  const add = EventTarget.prototype.addEventListener;
  const divproto = HTMLDivElement.prototype;
  divproto.addEventListener = function() { // Do not change to arrow function since we use 'this'
    if (this.id === "red-ui-editor-shade") {
      add.call(this, "click", on_shade_click);
      delete divproto.addEventListener; // Only deletes the override in divproto, call now passes through to EventTarget again.
    }
    add.apply(this, arguments);
  }
}

/*
 * ADDITIONS
 * */

const tmpl = document.createElement("template");
function make_html(html) {
  tmpl.innerHTML = html;
  return tmpl.content.cloneNode(true).firstElementChild; // assume the html had a single root element.
}

// This adds:
// Names of palettes in the palette manager and Node Help list will have a right-click-menu where you can go to their website.
{
  // Here we copy the page's own style style by using the same classes as the right-click menu inside the canvas.
  const right_click_menu = make_html(`<ul class="red-ui-menu-dropdown red-ui-menu-dropdown-noicons" style="position:absolute;padding:0;">
    <li>
      <a target="_blank" tabindex="-1" href="#" style="text-decoration:none" id="node-red-link">
        <span class="red-ui-menu-label">Node-RED library page</span>
      </a>
    </li>
    <li>
      <a target="_blank" tabindex="-1" href="#" style="text-decoration:none" id="npm-link" >
        <span class="red-ui-menu-label">NPM package page</span>
      </a>
    </li>
  </ul>`);
  const node_red_link = right_click_menu.querySelector("#node-red-link");
  const npm_link      = right_click_menu.querySelector("#npm-link");
  document.body.prepend(right_click_menu);

  window.addEventListener("contextmenu", e => {
    // elem.closest() goes up all parents of the element and returns the first to match the selector.
    const span = (() => {
      let closest;
      closest = e.target.closest("div#red-ui-sidebar-content>div:nth-child(2) ol>li:nth-child(2) ol>li"); // click within this, and we show the rc menu
      if (closest) return closest.querySelector("span.red-ui-treeList-label-text"); // this is the elem that contains the part of the link we need.

      closest = e.target.closest(".red-ui-palette-module-name");
      if (closest) return closest.querySelector("span");
    })();

    if (!span) return;

    const module_name = span.innerText;
    if (module_name === "node-red" || module_name === "Subflows") return;

    e.preventDefault(); // Do not show the regular right-click menu

    node_red_link.href = `https://flows.nodered.org/node/${module_name}`;
    npm_link.href      = `https://www.npmjs.com/package/${module_name}`;

    open(right_click_menu); // make visible first so that offsetWidth/Height work.

    const left = Math.min(window.innerWidth - right_click_menu.offsetWidth, e.clientX);
    const top = Math.min(window.innerHeight - right_click_menu.offsetHeight, e.clientY);

    right_click_menu.style.left = `${left}px`;
    right_click_menu.style.top = `${top}px`;

    // Close the menu when the user clicks anything.
    const contr = new AbortController(); // Ènsures that both event listeners get removed when either one fires.
    const options = { signal: contr.signal };
    const close_menu = e => {
      if (e.constructor === MouseEvent && e.button === 0) return;
      close(right_click_menu);
      contr.abort();
    }
    window.addEventListener("click",     close_menu, options);
    window.addEventListener("mousedown", close_menu, options);
    // We *should* ony need the mousedown event, but links and buttons perform their actions when the
    // mouse goes UP - and if the link is hidden the browser refuses to perform their action -
    // so for left-clicks we wait until the click event fires before hiding the menu. We could use mouseup, but
    // then if you middle click-and-drag to move the canvas the menu sticks around for a long time, and we want it to hide instantly.
  });

  function close(menu) {
    menu.style.display = "none";
  }
  function open(menu) {
    menu.style.display = "block";
  }
}
