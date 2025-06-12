// ==UserScript==
// @name        Node RED Usability++
// @namespace   github.com/SanderWassenberg
// @match       http://*/*
// @match       https://*/*
// @grant       none
// @version     1.4
// @author      Sander
// @description Fix some annoyances, add some features.
// ==/UserScript==

if (document.title !== "Node-RED") return;
console.log("%cRunning Sander's custom Node-RED script", "color:cyan");

//
// FIXES
//

// This fixes/adds:
// I expect Ctrl-scroll to zoom into the node canvas, but instead the browser scales the page.
window.addEventListener("wheel", e => {
  if (e.ctrlKey) {
    // Stops the browser from scaling the page
    e.preventDefault();

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
  if (e.button === 1) e.preventDefault();
});

const addEvLi = EventTarget.prototype.addEventListener;

// This fixes:
// Dragging the canvas with middle click does not work when you start your click 'n drag on top of a wire
// (Despite the anti-smooth scrolling fix above, it actually smooth-scrolls instead)
// This seems like an actual bug in Node-RED.
{
  SVGPathElement.prototype.addEventListener = function(type, callback, optns) { // Do not change to arrow function since we use 'this'
    if (!this.classList.contains("red-ui-flow-link-path")) {
      // We don't care about this object, stop intercepting
      this.addEventListener = addEvLi;
      addEvLi.apply(this, arguments);
    } else if (type === "mousedown") {
      // This is the callback we're after.
      // The reason this callback makes dragging the canvas with middle-click stop working is that it calls e.stopPropagation (or stopImmediatePropagation).
      // The funcitonality for dragging the canvas happens in an eventlistener higher up the DOM tree, but with this event not bubbling up it cannot get there.
      // To fix, we make a wrapper for the callback that blocks it from running on middle clicks. This is fine since fact that it even captured middle clicks at all seems to be unintentional.
      this.addEventListener = addEvLi;
      addEvLi.call(this, "mousedown", function(e) {
        if (e.button !== 1) callback(e);
      }, optns);
    } else {
      addEvLi.apply(this, arguments);
    }
  }
}

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

  // Override addEventListener for divs to ensure we get to add an event to #red-ui-editor-shade BEFORE anyone else.
  // Reason:
  // I tried adding this listener as soon as the shade elem appears in the DOM by using a MutationObserver, but even at that point the
  // click event that makes it close the side panel is already added, any event listener we add will only fire after that one.
  // We have to "just add the event first" if we want to block other events.
  HTMLDivElement.prototype.addEventListener = function() { // Do not change to arrow function since we use 'this'
    if (this.id === "red-ui-editor-shade") {
      addEvLi.call(this, "click", on_shade_click);
      delete HTMLDivElement.prototype.addEventListener; // Only deletes the override in div.proto, call now passes through to EventTarget again.
    }
    addEvLi.apply(this, arguments);
  }
}

// This fixes:
// With OPC UA node, the adress space is an annoying small window, but it is resizable, so you have to resize it manually every time.
// Now it automatically fills the sidebar. 
{
  const editor_selector = "#node-input-func-editor-addressSpaceScript"
  let prev_height = window.innerHeight;
  let timeout = 0;
  let editor;

  function make_fit() {
    const parent = editor.closest("#dialog-form");
    const parent_rect = parent.getBoundingClientRect();
    const editor_rect = editor.getBoundingClientRect();
    const distFromTop = editor_rect.top - parent_rect.top;
    editor.style.height = `${parent_rect.height - distFromTop + 10}px`;
  }

  window.addEventListener("click", e => {
    if (e.target.closest("a[href='#compact-server-tab-ass']")) {
      editor = document.querySelector(editor_selector);
      make_fit();
    }
  });


  window.addEventListener("resize", e => {
    editor = document.querySelector(editor_selector);
    const editor_is_shown = editor?.offsetParent;
    if (editor_is_shown) {
      const new_height = window.innerHeight;
      if (new_height !== prev_height) {
        prev_height = new_height;

        clearTimeout(timeout);
        timeout = setTimeout(make_fit, 400);
      }
    }
  });
}

//
// ADDITIONS
//

const make_html = (()=>{
  let tmpl;

  return function(html) {
    tmpl ??= document.createElement("template");
    tmpl.innerHTML = html;
    return tmpl.content.firstElementChild.cloneNode(true); // assume the html had a single root element.
  }
})();

const make_svg_elem = (()=>{
  let tmpl;

  return function(svg) {
    tmpl ??= document.createElementNS("http://www.w3.org/2000/svg", "svg");
    tmpl.innerHTML = svg;
    return tmpl.firstElementChild.cloneNode(true); // assume the svg had a single root element.
  }
})();

// This adds:
// Names of palettes in the palette manager and Node Help list will have a right-click-menu where you can go to their website.
{
  let right_click_menu, node_red_link, npm_link;
  let node_red_link_disabled = false;

  function close() {
    right_click_menu.style.display = "none";
  }
  function open() {
    right_click_menu.style.display = "block";
  }

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
    if (module_name === "Subflows") return;

    e.preventDefault(); // Do not show the regular right-click menu

    if (!right_click_menu) {
        // Here we copy the page's own style style by using the same classes as the right-click menu inside the canvas.
      right_click_menu = make_html(
`
<ul class="red-ui-menu-dropdown red-ui-menu-dropdown-noicons" style="position:absolute;padding:0;">
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

      node_red_link = right_click_menu.querySelector("#node-red-link");
      npm_link      = right_click_menu.querySelector("#npm-link");
      node_red_link.addEventListener("click", function(e) {
        if (this.parentElement.classList.contains("disabled")) {
          e.preventDefault();
          e.stopPropagation(); // Makes the menu not close when you click the disabled button
        }
      });
      document.body.prepend(right_click_menu);
    }

    npm_link.href = `https://www.npmjs.com/package/${module_name}`;
    node_red_link.href = `https://flows.nodered.org/node/${module_name}`;

    if (module_name === "node-red") { // node-red has no library page on its own website.
      node_red_link.parentElement.classList.add("disabled");
    } else {
      node_red_link.parentElement.classList.remove("disabled");
    }

    open(); // make visible first so that offsetWidth/Height work.

    const left = Math.min(window.innerWidth - right_click_menu.offsetWidth, e.clientX);
    const top = Math.min(window.innerHeight - right_click_menu.offsetHeight, e.clientY);

    right_click_menu.style.left = `${left}px`;
    right_click_menu.style.top = `${top}px`;

    // Close the menu when the user clicks anything.
    const contr = new AbortController(); // Ènsures that both event listeners get removed when either one fires.
    const options = { signal: contr.signal };
    const close_menu = e => {
      if (e.constructor === MouseEvent && e.button === 0) return;
      close();
      contr.abort();
    }
    window.addEventListener("click",     close_menu, options);
    window.addEventListener("mousedown", close_menu, options);
    // We *should* ony need the mousedown event, but links and buttons perform their actions when the
    // mouse goes UP - and if the link is hidden the browser refuses to perform their action -
    // so for left-clicks we wait until the click event fires before hiding the menu. We could use mouse*up*, but
    // then if you middle click-and-drag to move the canvas the menu sticks around for a long time, and we want it to hide instantly.
  });
}

// This adds:
// When you click on an an output of a node with multiple outputs, it will tell you what the number/index of that output is.
{
  let obj, index_elem, num_elem;
  let timeout = 0;
  window.addEventListener("click", e => {
    if (e.target.matches("rect.red-ui-flow-port")) {
      let elem = e.target.parentElement;
      let index = 0;
      while (true) {
        elem = elem.previousElementSibling;
        if (!elem?.matches("g.red-ui-flow-port-output")) break;
        index++;
      }

      // Disable for nodes with 1 output
      if (index === 0 && !e.target.parentElement.nextElementSibling) return;

      if (!obj) {
         obj = make_svg_elem(
`
<foreignObject width="120" height="22" x="15" y="-6.3" style="pointer-events: none;">
  <div xmlns="http://www.w3.org/1999/xhtml" style="background-color:#0004;padding: 0 5px 2px;width: fit-content;border-radius: 3px;color: var(--red-ui-primary-text-color);">
    <b style="font-family: Consolas;">[<span id="index">4</span>]</b> Output <span id="num">5</span>
  </div>
</foreignObject>`);

        index_elem = obj.querySelector("#index");
        num_elem   = obj.querySelector("#num");
      }

      clearTimeout(timeout);
      index_elem.innerText = index;
      num_elem.innerText   = index + 1;
      e.target.parentElement.appendChild(obj);
      timeout = setTimeout(() => obj.remove(), 5000);
    }
  });
}
