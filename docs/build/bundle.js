
(function(l, r) { if (!l || l.getElementById('livereloadscript')) return; r = l.createElement('script'); r.async = 1; r.src = '//' + (self.location.host || 'localhost').split(':')[0] + ':35729/livereload.js?snipver=1'; r.id = 'livereloadscript'; l.getElementsByTagName('head')[0].appendChild(r) })(self.document);
var app = (function () {
    'use strict';

    function noop() { }
    function assign(tar, src) {
        // @ts-ignore
        for (const k in src)
            tar[k] = src[k];
        return tar;
    }
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }
    function create_slot(definition, ctx, $$scope, fn) {
        if (definition) {
            const slot_ctx = get_slot_context(definition, ctx, $$scope, fn);
            return definition[0](slot_ctx);
        }
    }
    function get_slot_context(definition, ctx, $$scope, fn) {
        return definition[1] && fn
            ? assign($$scope.ctx.slice(), definition[1](fn(ctx)))
            : $$scope.ctx;
    }
    function get_slot_changes(definition, $$scope, dirty, fn) {
        if (definition[2] && fn) {
            const lets = definition[2](fn(dirty));
            if ($$scope.dirty === undefined) {
                return lets;
            }
            if (typeof lets === 'object') {
                const merged = [];
                const len = Math.max($$scope.dirty.length, lets.length);
                for (let i = 0; i < len; i += 1) {
                    merged[i] = $$scope.dirty[i] | lets[i];
                }
                return merged;
            }
            return $$scope.dirty | lets;
        }
        return $$scope.dirty;
    }
    function update_slot_base(slot, slot_definition, ctx, $$scope, slot_changes, get_slot_context_fn) {
        if (slot_changes) {
            const slot_context = get_slot_context(slot_definition, ctx, $$scope, get_slot_context_fn);
            slot.p(slot_context, slot_changes);
        }
    }
    function get_all_dirty_from_scope($$scope) {
        if ($$scope.ctx.length > 32) {
            const dirty = [];
            const length = $$scope.ctx.length / 32;
            for (let i = 0; i < length; i++) {
                dirty[i] = -1;
            }
            return dirty;
        }
        return -1;
    }
    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function element(name) {
        return document.createElement(name);
    }
    function svg_element(name) {
        return document.createElementNS('http://www.w3.org/2000/svg', name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function set_svg_attributes(node, attributes) {
        for (const key in attributes) {
            attr(node, key, attributes[key]);
        }
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_style(node, key, value, important) {
        node.style.setProperty(key, value, important ? 'important' : '');
    }
    function toggle_class(element, name, toggle) {
        element.classList[toggle ? 'add' : 'remove'](name);
    }
    function custom_event(type, detail, bubbles = false) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, bubbles, false, detail);
        return e;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error('Function called outside component initialization');
        return current_component;
    }
    function onMount(fn) {
        get_current_component().$$.on_mount.push(fn);
    }
    function onDestroy(fn) {
        get_current_component().$$.on_destroy.push(fn);
    }
    function createEventDispatcher() {
        const component = get_current_component();
        return (type, detail) => {
            const callbacks = component.$$.callbacks[type];
            if (callbacks) {
                // TODO are there situations where events could be dispatched
                // in a server (non-DOM) environment?
                const event = custom_event(type, detail);
                callbacks.slice().forEach(fn => {
                    fn.call(component, event);
                });
            }
        };
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    // flush() calls callbacks in this order:
    // 1. All beforeUpdate callbacks, in order: parents before children
    // 2. All bind:this callbacks, in reverse order: children before parents.
    // 3. All afterUpdate callbacks, in order: parents before children. EXCEPT
    //    for afterUpdates called during the initial onMount, which are called in
    //    reverse order: children before parents.
    // Since callbacks might update component values, which could trigger another
    // call to flush(), the following steps guard against this:
    // 1. During beforeUpdate, any updated components will be added to the
    //    dirty_components array and will cause a reentrant call to flush(). Because
    //    the flush index is kept outside the function, the reentrant call will pick
    //    up where the earlier call left off and go through all dirty components. The
    //    current_component value is saved and restored so that the reentrant call will
    //    not interfere with the "parent" flush() call.
    // 2. bind:this callbacks cannot trigger new flush() calls.
    // 3. During afterUpdate, any updated components will NOT have their afterUpdate
    //    callback called a second time; the seen_callbacks set, outside the flush()
    //    function, guarantees this behavior.
    const seen_callbacks = new Set();
    let flushidx = 0; // Do *not* move this inside the flush() function
    function flush() {
        const saved_component = current_component;
        do {
            // first, call beforeUpdate functions
            // and update components
            while (flushidx < dirty_components.length) {
                const component = dirty_components[flushidx];
                flushidx++;
                set_current_component(component);
                update(component.$$);
            }
            set_current_component(null);
            dirty_components.length = 0;
            flushidx = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        seen_callbacks.clear();
        set_current_component(saved_component);
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }

    const globals = (typeof window !== 'undefined'
        ? window
        : typeof globalThis !== 'undefined'
            ? globalThis
            : global);

    function get_spread_update(levels, updates) {
        const update = {};
        const to_null_out = {};
        const accounted_for = { $$scope: 1 };
        let i = levels.length;
        while (i--) {
            const o = levels[i];
            const n = updates[i];
            if (n) {
                for (const key in o) {
                    if (!(key in n))
                        to_null_out[key] = 1;
                }
                for (const key in n) {
                    if (!accounted_for[key]) {
                        update[key] = n[key];
                        accounted_for[key] = 1;
                    }
                }
                levels[i] = n;
            }
            else {
                for (const key in o) {
                    accounted_for[key] = 1;
                }
            }
        }
        for (const key in to_null_out) {
            if (!(key in update))
                update[key] = undefined;
        }
        return update;
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor, customElement) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        if (!customElement) {
            // onMount happens before the initial afterUpdate
            add_render_callback(() => {
                const new_on_destroy = on_mount.map(run).filter(is_function);
                if (on_destroy) {
                    on_destroy.push(...new_on_destroy);
                }
                else {
                    // Edge case - component was destroyed immediately,
                    // most likely as a result of a binding initialising
                    run_all(new_on_destroy);
                }
                component.$$.on_mount = [];
            });
        }
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, append_styles, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            on_disconnect: [],
            before_update: [],
            after_update: [],
            context: new Map(options.context || (parent_component ? parent_component.$$.context : [])),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false,
            root: options.target || parent_component.$$.root
        };
        append_styles && append_styles($$.root);
        let ready = false;
        $$.ctx = instance
            ? instance(component, options.props || {}, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor, options.customElement);
            flush();
        }
        set_current_component(parent_component);
    }
    /**
     * Base class for Svelte components. Used when dev=false.
     */
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    }

    function dispatch_dev(type, detail) {
        document.dispatchEvent(custom_event(type, Object.assign({ version: '3.44.3' }, detail), true));
    }
    function append_dev(target, node) {
        dispatch_dev('SvelteDOMInsert', { target, node });
        append(target, node);
    }
    function insert_dev(target, node, anchor) {
        dispatch_dev('SvelteDOMInsert', { target, node, anchor });
        insert(target, node, anchor);
    }
    function detach_dev(node) {
        dispatch_dev('SvelteDOMRemove', { node });
        detach(node);
    }
    function listen_dev(node, event, handler, options, has_prevent_default, has_stop_propagation) {
        const modifiers = options === true ? ['capture'] : options ? Array.from(Object.keys(options)) : [];
        if (has_prevent_default)
            modifiers.push('preventDefault');
        if (has_stop_propagation)
            modifiers.push('stopPropagation');
        dispatch_dev('SvelteDOMAddEventListener', { node, event, handler, modifiers });
        const dispose = listen(node, event, handler, options);
        return () => {
            dispatch_dev('SvelteDOMRemoveEventListener', { node, event, handler, modifiers });
            dispose();
        };
    }
    function attr_dev(node, attribute, value) {
        attr(node, attribute, value);
        if (value == null)
            dispatch_dev('SvelteDOMRemoveAttribute', { node, attribute });
        else
            dispatch_dev('SvelteDOMSetAttribute', { node, attribute, value });
    }
    function prop_dev(node, property, value) {
        node[property] = value;
        dispatch_dev('SvelteDOMSetProperty', { node, property, value });
    }
    function set_data_dev(text, data) {
        data = '' + data;
        if (text.wholeText === data)
            return;
        dispatch_dev('SvelteDOMSetData', { node: text, data });
        text.data = data;
    }
    function validate_slots(name, slot, keys) {
        for (const slot_key of Object.keys(slot)) {
            if (!~keys.indexOf(slot_key)) {
                console.warn(`<${name}> received an unexpected slot "${slot_key}".`);
            }
        }
    }
    /**
     * Base class for Svelte components with some minor dev-enhancements. Used when dev=true.
     */
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error("'target' is a required option");
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn('Component was already destroyed'); // eslint-disable-line no-console
            };
        }
        $capture_state() { }
        $inject_state() { }
    }

    /*! *****************************************************************************
    Copyright (c) Microsoft Corporation.

    Permission to use, copy, modify, and/or distribute this software for any
    purpose with or without fee is hereby granted.

    THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
    REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
    AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
    INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
    LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
    OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
    PERFORMANCE OF THIS SOFTWARE.
    ***************************************************************************** */

    function __awaiter(thisArg, _arguments, P, generator) {
        function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
        return new (P || (P = Promise))(function (resolve, reject) {
            function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
            function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
            function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
            step((generator = generator.apply(thisArg, _arguments || [])).next());
        });
    }

    function __generator(thisArg, body) {
        var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
        return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
        function verb(n) { return function (v) { return step([n, v]); }; }
        function step(op) {
            if (f) throw new TypeError("Generator is already executing.");
            while (_) try {
                if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
                if (y = 0, t) op = [op[0] & 2, t.value];
                switch (op[0]) {
                    case 0: case 1: t = op; break;
                    case 4: _.label++; return { value: op[1], done: false };
                    case 5: _.label++; y = op[1]; op = [0]; continue;
                    case 7: op = _.ops.pop(); _.trys.pop(); continue;
                    default:
                        if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                        if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                        if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                        if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                        if (t[2]) _.ops.pop();
                        _.trys.pop(); continue;
                }
                op = body.call(thisArg, _);
            } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
            if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
        }
    }

    function __read(o, n) {
        var m = typeof Symbol === "function" && o[Symbol.iterator];
        if (!m) return o;
        var i = m.call(o), r, ar = [], e;
        try {
            while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
        }
        catch (error) { e = { error: error }; }
        finally {
            try {
                if (r && !r.done && (m = i["return"])) m.call(i);
            }
            finally { if (e) throw e.error; }
        }
        return ar;
    }

    /** @deprecated */
    function __spread() {
        for (var ar = [], i = 0; i < arguments.length; i++)
            ar = ar.concat(__read(arguments[i]));
        return ar;
    }

    var COMMON_MIME_TYPES = new Map([
        ['avi', 'video/avi'],
        ['gif', 'image/gif'],
        ['ico', 'image/x-icon'],
        ['jpeg', 'image/jpeg'],
        ['jpg', 'image/jpeg'],
        ['mkv', 'video/x-matroska'],
        ['mov', 'video/quicktime'],
        ['mp4', 'video/mp4'],
        ['pdf', 'application/pdf'],
        ['png', 'image/png'],
        ['zip', 'application/zip'],
        ['doc', 'application/msword'],
        ['docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
    ]);
    function toFileWithPath(file, path) {
        var f = withMimeType(file);
        if (typeof f.path !== 'string') { // on electron, path is already set to the absolute path
            var webkitRelativePath = file.webkitRelativePath;
            Object.defineProperty(f, 'path', {
                value: typeof path === 'string'
                    ? path
                    // If <input webkitdirectory> is set,
                    // the File will have a {webkitRelativePath} property
                    // https://developer.mozilla.org/en-US/docs/Web/API/HTMLInputElement/webkitdirectory
                    : typeof webkitRelativePath === 'string' && webkitRelativePath.length > 0
                        ? webkitRelativePath
                        : file.name,
                writable: false,
                configurable: false,
                enumerable: true
            });
        }
        return f;
    }
    function withMimeType(file) {
        var name = file.name;
        var hasExtension = name && name.lastIndexOf('.') !== -1;
        if (hasExtension && !file.type) {
            var ext = name.split('.')
                .pop().toLowerCase();
            var type = COMMON_MIME_TYPES.get(ext);
            if (type) {
                Object.defineProperty(file, 'type', {
                    value: type,
                    writable: false,
                    configurable: false,
                    enumerable: true
                });
            }
        }
        return file;
    }

    var FILES_TO_IGNORE = [
        // Thumbnail cache files for macOS and Windows
        '.DS_Store',
        'Thumbs.db' // Windows
    ];
    /**
     * Convert a DragEvent's DataTrasfer object to a list of File objects
     * NOTE: If some of the items are folders,
     * everything will be flattened and placed in the same list but the paths will be kept as a {path} property.
     * @param evt
     */
    function fromEvent(evt) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, isDragEvt(evt) && evt.dataTransfer
                        ? getDataTransferFiles(evt.dataTransfer, evt.type)
                        : getInputFiles(evt)];
            });
        });
    }
    function isDragEvt(value) {
        return !!value.dataTransfer;
    }
    function getInputFiles(evt) {
        var files = isInput(evt.target)
            ? evt.target.files
                ? fromList(evt.target.files)
                : []
            : [];
        return files.map(function (file) { return toFileWithPath(file); });
    }
    function isInput(value) {
        return value !== null;
    }
    function getDataTransferFiles(dt, type) {
        return __awaiter(this, void 0, void 0, function () {
            var items, files;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!dt.items) return [3 /*break*/, 2];
                        items = fromList(dt.items)
                            .filter(function (item) { return item.kind === 'file'; });
                        // According to https://html.spec.whatwg.org/multipage/dnd.html#dndevents,
                        // only 'dragstart' and 'drop' has access to the data (source node)
                        if (type !== 'drop') {
                            return [2 /*return*/, items];
                        }
                        return [4 /*yield*/, Promise.all(items.map(toFilePromises))];
                    case 1:
                        files = _a.sent();
                        return [2 /*return*/, noIgnoredFiles(flatten(files))];
                    case 2: return [2 /*return*/, noIgnoredFiles(fromList(dt.files)
                            .map(function (file) { return toFileWithPath(file); }))];
                }
            });
        });
    }
    function noIgnoredFiles(files) {
        return files.filter(function (file) { return FILES_TO_IGNORE.indexOf(file.name) === -1; });
    }
    // IE11 does not support Array.from()
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/from#Browser_compatibility
    // https://developer.mozilla.org/en-US/docs/Web/API/FileList
    // https://developer.mozilla.org/en-US/docs/Web/API/DataTransferItemList
    function fromList(items) {
        var files = [];
        // tslint:disable: prefer-for-of
        for (var i = 0; i < items.length; i++) {
            var file = items[i];
            files.push(file);
        }
        return files;
    }
    // https://developer.mozilla.org/en-US/docs/Web/API/DataTransferItem
    function toFilePromises(item) {
        if (typeof item.webkitGetAsEntry !== 'function') {
            return fromDataTransferItem(item);
        }
        var entry = item.webkitGetAsEntry();
        // Safari supports dropping an image node from a different window and can be retrieved using
        // the DataTransferItem.getAsFile() API
        // NOTE: FileSystemEntry.file() throws if trying to get the file
        if (entry && entry.isDirectory) {
            return fromDirEntry(entry);
        }
        return fromDataTransferItem(item);
    }
    function flatten(items) {
        return items.reduce(function (acc, files) { return __spread(acc, (Array.isArray(files) ? flatten(files) : [files])); }, []);
    }
    function fromDataTransferItem(item) {
        var file = item.getAsFile();
        if (!file) {
            return Promise.reject(item + " is not a File");
        }
        var fwp = toFileWithPath(file);
        return Promise.resolve(fwp);
    }
    // https://developer.mozilla.org/en-US/docs/Web/API/FileSystemEntry
    function fromEntry(entry) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, entry.isDirectory ? fromDirEntry(entry) : fromFileEntry(entry)];
            });
        });
    }
    // https://developer.mozilla.org/en-US/docs/Web/API/FileSystemDirectoryEntry
    function fromDirEntry(entry) {
        var reader = entry.createReader();
        return new Promise(function (resolve, reject) {
            var entries = [];
            function readEntries() {
                var _this = this;
                // https://developer.mozilla.org/en-US/docs/Web/API/FileSystemDirectoryEntry/createReader
                // https://developer.mozilla.org/en-US/docs/Web/API/FileSystemDirectoryReader/readEntries
                reader.readEntries(function (batch) { return __awaiter(_this, void 0, void 0, function () {
                    var files, err_1, items;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                if (!!batch.length) return [3 /*break*/, 5];
                                _a.label = 1;
                            case 1:
                                _a.trys.push([1, 3, , 4]);
                                return [4 /*yield*/, Promise.all(entries)];
                            case 2:
                                files = _a.sent();
                                resolve(files);
                                return [3 /*break*/, 4];
                            case 3:
                                err_1 = _a.sent();
                                reject(err_1);
                                return [3 /*break*/, 4];
                            case 4: return [3 /*break*/, 6];
                            case 5:
                                items = Promise.all(batch.map(fromEntry));
                                entries.push(items);
                                // Continue reading
                                readEntries();
                                _a.label = 6;
                            case 6: return [2 /*return*/];
                        }
                    });
                }); }, function (err) {
                    reject(err);
                });
            }
            readEntries();
        });
    }
    // https://developer.mozilla.org/en-US/docs/Web/API/FileSystemFileEntry
    function fromFileEntry(entry) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        entry.file(function (file) {
                            var fwp = toFileWithPath(file, entry.fullPath);
                            resolve(fwp);
                        }, function (err) {
                            reject(err);
                        });
                    })];
            });
        });
    }

    /**
     * Check if the provided file type should be accepted by the input with accept attribute.
     * https://developer.mozilla.org/en-US/docs/Web/HTML/Element/Input#attr-accept
     *
     * Inspired by https://github.com/enyo/dropzone
     *
     * @param file {File} https://developer.mozilla.org/en-US/docs/Web/API/File
     * @param acceptedFiles {string}
     * @returns {boolean}
     */

    function accepts(file, acceptedFiles) {
      if (file && acceptedFiles) {
        const acceptedFilesArray = Array.isArray(acceptedFiles)
          ? acceptedFiles
          : acceptedFiles.split(",");
        const fileName = file.name || "";
        const mimeType = (file.type || "").toLowerCase();
        const baseMimeType = mimeType.replace(/\/.*$/, "");

        return acceptedFilesArray.some((type) => {
          const validType = type.trim().toLowerCase();
          if (validType.charAt(0) === ".") {
            return fileName.toLowerCase().endsWith(validType);
          } else if (validType.endsWith("/*")) {
            // This is something like a image/* mime type
            return baseMimeType === validType.replace(/\/.*$/, "");
          }
          return mimeType === validType;
        });
      }
      return true;
    }

    // Error codes
    const FILE_INVALID_TYPE = "file-invalid-type";
    const FILE_TOO_LARGE = "file-too-large";
    const FILE_TOO_SMALL = "file-too-small";
    const TOO_MANY_FILES = "too-many-files";

    // File Errors
    const getInvalidTypeRejectionErr = (accept) => {
      accept = Array.isArray(accept) && accept.length === 1 ? accept[0] : accept;
      const messageSuffix = Array.isArray(accept)
        ? `one of ${accept.join(", ")}`
        : accept;
      return {
        code: FILE_INVALID_TYPE,
        message: `File type must be ${messageSuffix}`,
      };
    };

    const getTooLargeRejectionErr = (maxSize) => {
      return {
        code: FILE_TOO_LARGE,
        message: `File is larger than ${maxSize} bytes`,
      };
    };

    const getTooSmallRejectionErr = (minSize) => {
      return {
        code: FILE_TOO_SMALL,
        message: `File is smaller than ${minSize} bytes`,
      };
    };

    const TOO_MANY_FILES_REJECTION = {
      code: TOO_MANY_FILES,
      message: "Too many files",
    };

    // Firefox versions prior to 53 return a bogus MIME type for every file drag, so dragovers with
    // that MIME type will always be accepted
    function fileAccepted(file, accept) {
      const isAcceptable =
        file.type === "application/x-moz-file" || accepts(file, accept);
      return [
        isAcceptable,
        isAcceptable ? null : getInvalidTypeRejectionErr(accept),
      ];
    }

    function fileMatchSize(file, minSize, maxSize) {
      if (isDefined(file.size)) {
        if (isDefined(minSize) && isDefined(maxSize)) {
          if (file.size > maxSize) return [false, getTooLargeRejectionErr(maxSize)];
          if (file.size < minSize) return [false, getTooSmallRejectionErr(minSize)];
        } else if (isDefined(minSize) && file.size < minSize)
          return [false, getTooSmallRejectionErr(minSize)];
        else if (isDefined(maxSize) && file.size > maxSize)
          return [false, getTooLargeRejectionErr(maxSize)];
      }
      return [true, null];
    }

    function isDefined(value) {
      return value !== undefined && value !== null;
    }

    function allFilesAccepted({
      files,
      accept,
      minSize,
      maxSize,
      multiple,
    }) {
      if (!multiple && files.length > 1) {
        return false;
      }

      return files.every((file) => {
        const [accepted] = fileAccepted(file, accept);
        const [sizeMatch] = fileMatchSize(file, minSize, maxSize);
        return accepted && sizeMatch;
      });
    }

    // React's synthetic events has event.isPropagationStopped,
    // but to remain compatibility with other libs (Preact) fall back
    // to check event.cancelBubble
    function isPropagationStopped(event) {
      if (typeof event.isPropagationStopped === "function") {
        return event.isPropagationStopped();
      } else if (typeof event.cancelBubble !== "undefined") {
        return event.cancelBubble;
      }
      return false;
    }

    function isEvtWithFiles(event) {
      if (!event.dataTransfer) {
        return !!event.target && !!event.target.files;
      }
      // https://developer.mozilla.org/en-US/docs/Web/API/DataTransfer/types
      // https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API/Recommended_drag_types#file
      return Array.prototype.some.call(
        event.dataTransfer.types,
        (type) => type === "Files" || type === "application/x-moz-file"
      );
    }

    // allow the entire document to be a drag target
    function onDocumentDragOver(event) {
      event.preventDefault();
    }

    function isIe(userAgent) {
      return (
        userAgent.indexOf("MSIE") !== -1 || userAgent.indexOf("Trident/") !== -1
      );
    }

    function isEdge(userAgent) {
      return userAgent.indexOf("Edge/") !== -1;
    }

    function isIeOrEdge(userAgent = window.navigator.userAgent) {
      return isIe(userAgent) || isEdge(userAgent);
    }

    /**
     * This is intended to be used to compose event handlers
     * They are executed in order until one of them calls `event.isPropagationStopped()`.
     * Note that the check is done on the first invoke too,
     * meaning that if propagation was stopped before invoking the fns,
     * no handlers will be executed.
     *
     * @param {Function} fns the event hanlder functions
     * @return {Function} the event handler to add to an element
     */
    function composeEventHandlers(...fns) {
      return (event, ...args) =>
        fns.some((fn) => {
          if (!isPropagationStopped(event) && fn) {
            fn(event, ...args);
          }
          return isPropagationStopped(event);
        });
    }

    /* node_modules/svelte-file-dropzone/src/components/Dropzone.svelte generated by Svelte v3.44.3 */
    const file$4 = "node_modules/svelte-file-dropzone/src/components/Dropzone.svelte";

    // (350:8)       
    function fallback_block(ctx) {
    	let p;

    	const block = {
    		c: function create() {
    			p = element("p");
    			p.textContent = "Drag 'n' drop some files here, or click to select files";
    			add_location(p, file$4, 350, 4, 9206);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, p, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(p);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: fallback_block.name,
    		type: "fallback",
    		source: "(350:8)       ",
    		ctx
    	});

    	return block;
    }

    function create_fragment$4(ctx) {
    	let div;
    	let input;
    	let t;
    	let div_class_value;
    	let current;
    	let mounted;
    	let dispose;
    	const default_slot_template = /*#slots*/ ctx[28].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[27], null);
    	const default_slot_or_fallback = default_slot || fallback_block(ctx);

    	const block = {
    		c: function create() {
    			div = element("div");
    			input = element("input");
    			t = space();
    			if (default_slot_or_fallback) default_slot_or_fallback.c();
    			attr_dev(input, "accept", /*accept*/ ctx[0]);
    			input.multiple = /*multiple*/ ctx[1];
    			attr_dev(input, "type", "file");
    			attr_dev(input, "autocomplete", "off");
    			attr_dev(input, "tabindex", "-1");
    			set_style(input, "display", "none");
    			add_location(input, file$4, 339, 2, 8975);
    			attr_dev(div, "tabindex", "0");
    			attr_dev(div, "class", div_class_value = "" + ((/*disableDefaultStyles*/ ctx[4] ? '' : 'dropzone') + " " + /*containerClasses*/ ctx[2] + " svelte-817dg2"));
    			attr_dev(div, "style", /*containerStyles*/ ctx[3]);
    			add_location(div, file$4, 325, 0, 8444);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, input);
    			/*input_binding*/ ctx[29](input);
    			append_dev(div, t);

    			if (default_slot_or_fallback) {
    				default_slot_or_fallback.m(div, null);
    			}

    			/*div_binding*/ ctx[30](div);
    			current = true;

    			if (!mounted) {
    				dispose = [
    					listen_dev(input, "change", /*onDropCb*/ ctx[14], false, false, false),
    					listen_dev(input, "click", onInputElementClick, false, false, false),
    					listen_dev(div, "keydown", /*composeKeyboardHandler*/ ctx[16](/*onKeyDownCb*/ ctx[7]), false, false, false),
    					listen_dev(div, "focus", /*composeKeyboardHandler*/ ctx[16](/*onFocusCb*/ ctx[8]), false, false, false),
    					listen_dev(div, "blur", /*composeKeyboardHandler*/ ctx[16](/*onBlurCb*/ ctx[9]), false, false, false),
    					listen_dev(div, "click", /*composeHandler*/ ctx[15](/*onClickCb*/ ctx[10]), false, false, false),
    					listen_dev(div, "dragenter", /*composeDragHandler*/ ctx[17](/*onDragEnterCb*/ ctx[11]), false, false, false),
    					listen_dev(div, "dragover", /*composeDragHandler*/ ctx[17](/*onDragOverCb*/ ctx[12]), false, false, false),
    					listen_dev(div, "dragleave", /*composeDragHandler*/ ctx[17](/*onDragLeaveCb*/ ctx[13]), false, false, false),
    					listen_dev(div, "drop", /*composeDragHandler*/ ctx[17](/*onDropCb*/ ctx[14]), false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (!current || dirty[0] & /*accept*/ 1) {
    				attr_dev(input, "accept", /*accept*/ ctx[0]);
    			}

    			if (!current || dirty[0] & /*multiple*/ 2) {
    				prop_dev(input, "multiple", /*multiple*/ ctx[1]);
    			}

    			if (default_slot) {
    				if (default_slot.p && (!current || dirty[0] & /*$$scope*/ 134217728)) {
    					update_slot_base(
    						default_slot,
    						default_slot_template,
    						ctx,
    						/*$$scope*/ ctx[27],
    						!current
    						? get_all_dirty_from_scope(/*$$scope*/ ctx[27])
    						: get_slot_changes(default_slot_template, /*$$scope*/ ctx[27], dirty, null),
    						null
    					);
    				}
    			}

    			if (!current || dirty[0] & /*disableDefaultStyles, containerClasses*/ 20 && div_class_value !== (div_class_value = "" + ((/*disableDefaultStyles*/ ctx[4] ? '' : 'dropzone') + " " + /*containerClasses*/ ctx[2] + " svelte-817dg2"))) {
    				attr_dev(div, "class", div_class_value);
    			}

    			if (!current || dirty[0] & /*containerStyles*/ 8) {
    				attr_dev(div, "style", /*containerStyles*/ ctx[3]);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(default_slot_or_fallback, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(default_slot_or_fallback, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			/*input_binding*/ ctx[29](null);
    			if (default_slot_or_fallback) default_slot_or_fallback.d(detaching);
    			/*div_binding*/ ctx[30](null);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$4.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function onInputElementClick(event) {
    	event.stopPropagation();
    }

    function instance$4($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Dropzone', slots, ['default']);
    	let { accept } = $$props;
    	let { disabled = false } = $$props;
    	let { getFilesFromEvent = fromEvent } = $$props;
    	let { maxSize = Infinity } = $$props;
    	let { minSize = 0 } = $$props;
    	let { multiple = true } = $$props;
    	let { preventDropOnDocument = true } = $$props;
    	let { noClick = false } = $$props;
    	let { noKeyboard = false } = $$props;
    	let { noDrag = false } = $$props;
    	let { noDragEventsBubbling = false } = $$props;
    	let { containerClasses = "" } = $$props;
    	let { containerStyles = "" } = $$props;
    	let { disableDefaultStyles = false } = $$props;
    	const dispatch = createEventDispatcher();

    	//state
    	let state = {
    		isFocused: false,
    		isFileDialogActive: false,
    		isDragActive: false,
    		isDragAccept: false,
    		isDragReject: false,
    		draggedFiles: [],
    		acceptedFiles: [],
    		fileRejections: []
    	};

    	let rootRef;
    	let inputRef;

    	function resetState() {
    		state.isFileDialogActive = false;
    		state.isDragActive = false;
    		state.draggedFiles = [];
    		state.acceptedFiles = [];
    		state.fileRejections = [];
    	}

    	// Fn for opening the file dialog programmatically
    	function openFileDialog() {
    		if (inputRef) {
    			$$invalidate(6, inputRef.value = null, inputRef); // TODO check if null needs to be set
    			state.isFileDialogActive = true;
    			inputRef.click();
    		}
    	}

    	// Cb to open the file dialog when SPACE/ENTER occurs on the dropzone
    	function onKeyDownCb(event) {
    		// Ignore keyboard events bubbling up the DOM tree
    		if (!rootRef || !rootRef.isEqualNode(event.target)) {
    			return;
    		}

    		if (event.keyCode === 32 || event.keyCode === 13) {
    			event.preventDefault();
    			openFileDialog();
    		}
    	}

    	// Update focus state for the dropzone
    	function onFocusCb() {
    		state.isFocused = true;
    	}

    	function onBlurCb() {
    		state.isFocused = false;
    	}

    	// Cb to open the file dialog when click occurs on the dropzone
    	function onClickCb() {
    		if (noClick) {
    			return;
    		}

    		// In IE11/Edge the file-browser dialog is blocking, therefore, use setTimeout()
    		// to ensure React can handle state changes
    		// See: https://github.com/react-dropzone/react-dropzone/issues/450
    		if (isIeOrEdge()) {
    			setTimeout(openFileDialog, 0);
    		} else {
    			openFileDialog();
    		}
    	}

    	function onDragEnterCb(event) {
    		event.preventDefault();
    		stopPropagation(event);
    		dragTargetsRef = [...dragTargetsRef, event.target];

    		if (isEvtWithFiles(event)) {
    			Promise.resolve(getFilesFromEvent(event)).then(draggedFiles => {
    				if (isPropagationStopped(event) && !noDragEventsBubbling) {
    					return;
    				}

    				state.draggedFiles = draggedFiles;
    				state.isDragActive = true;
    				dispatch("dragenter", { dragEvent: event });
    			});
    		}
    	}

    	function onDragOverCb(event) {
    		event.preventDefault();
    		stopPropagation(event);

    		if (event.dataTransfer) {
    			try {
    				event.dataTransfer.dropEffect = "copy";
    			} catch {
    				
    			} /* eslint-disable-line no-empty */
    		}

    		if (isEvtWithFiles(event)) {
    			dispatch("dragover", { dragEvent: event });
    		}

    		return false;
    	}

    	function onDragLeaveCb(event) {
    		event.preventDefault();
    		stopPropagation(event);

    		// Only deactivate once the dropzone and all children have been left
    		const targets = dragTargetsRef.filter(target => rootRef && rootRef.contains(target));

    		// Make sure to remove a target present multiple times only once
    		// (Firefox may fire dragenter/dragleave multiple times on the same element)
    		const targetIdx = targets.indexOf(event.target);

    		if (targetIdx !== -1) {
    			targets.splice(targetIdx, 1);
    		}

    		dragTargetsRef = targets;

    		if (targets.length > 0) {
    			return;
    		}

    		state.isDragActive = false;
    		state.draggedFiles = [];

    		if (isEvtWithFiles(event)) {
    			dispatch("dragleave", { dragEvent: event });
    		}
    	}

    	function onDropCb(event) {
    		event.preventDefault();
    		stopPropagation(event);
    		dragTargetsRef = [];

    		if (isEvtWithFiles(event)) {
    			Promise.resolve(getFilesFromEvent(event)).then(files => {
    				if (isPropagationStopped(event) && !noDragEventsBubbling) {
    					return;
    				}

    				const acceptedFiles = [];
    				const fileRejections = [];

    				files.forEach(file => {
    					const [accepted, acceptError] = fileAccepted(file, accept);
    					const [sizeMatch, sizeError] = fileMatchSize(file, minSize, maxSize);

    					if (accepted && sizeMatch) {
    						acceptedFiles.push(file);
    					} else {
    						const errors = [acceptError, sizeError].filter(e => e);
    						fileRejections.push({ file, errors });
    					}
    				});

    				if (!multiple && acceptedFiles.length > 1) {
    					// Reject everything and empty accepted files
    					acceptedFiles.forEach(file => {
    						fileRejections.push({ file, errors: [TOO_MANY_FILES_REJECTION] });
    					});

    					acceptedFiles.splice(0);
    				}

    				state.acceptedFiles = acceptedFiles;
    				state.fileRejections = fileRejections;
    				dispatch("drop", { acceptedFiles, fileRejections, event });

    				if (fileRejections.length > 0) {
    					dispatch("droprejected", { fileRejections, event });
    				}

    				if (acceptedFiles.length > 0) {
    					dispatch("dropaccepted", { acceptedFiles, event });
    				}
    			});
    		}

    		resetState();
    	}

    	function composeHandler(fn) {
    		return disabled ? null : fn;
    	}

    	function composeKeyboardHandler(fn) {
    		return noKeyboard ? null : composeHandler(fn);
    	}

    	function composeDragHandler(fn) {
    		return noDrag ? null : composeHandler(fn);
    	}

    	function stopPropagation(event) {
    		if (noDragEventsBubbling) {
    			event.stopPropagation();
    		}
    	}

    	let dragTargetsRef = [];

    	function onDocumentDrop(event) {
    		if (rootRef && rootRef.contains(event.target)) {
    			// If we intercepted an event for our instance, let it propagate down to the instance's onDrop handler
    			return;
    		}

    		event.preventDefault();
    		dragTargetsRef = [];
    	}

    	// Update file dialog active state when the window is focused on
    	function onWindowFocus() {
    		// Execute the timeout only if the file dialog is opened in the browser
    		if (state.isFileDialogActive) {
    			setTimeout(
    				() => {
    					if (inputRef) {
    						const { files } = inputRef;

    						if (!files.length) {
    							state.isFileDialogActive = false;
    							dispatch("filedialogcancel");
    						}
    					}
    				},
    				300
    			);
    		}
    	}

    	onMount(() => {
    		window.addEventListener("focus", onWindowFocus, false);

    		if (preventDropOnDocument) {
    			document.addEventListener("dragover", onDocumentDragOver, false);
    			document.addEventListener("drop", onDocumentDrop, false);
    		}
    	});

    	onDestroy(() => {
    		window.removeEventListener("focus", onWindowFocus, false);

    		if (preventDropOnDocument) {
    			document.removeEventListener("dragover", onDocumentDragOver);
    			document.removeEventListener("drop", onDocumentDrop);
    		}
    	});

    	const writable_props = [
    		'accept',
    		'disabled',
    		'getFilesFromEvent',
    		'maxSize',
    		'minSize',
    		'multiple',
    		'preventDropOnDocument',
    		'noClick',
    		'noKeyboard',
    		'noDrag',
    		'noDragEventsBubbling',
    		'containerClasses',
    		'containerStyles',
    		'disableDefaultStyles'
    	];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Dropzone> was created with unknown prop '${key}'`);
    	});

    	function input_binding($$value) {
    		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
    			inputRef = $$value;
    			$$invalidate(6, inputRef);
    		});
    	}

    	function div_binding($$value) {
    		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
    			rootRef = $$value;
    			$$invalidate(5, rootRef);
    		});
    	}

    	$$self.$$set = $$props => {
    		if ('accept' in $$props) $$invalidate(0, accept = $$props.accept);
    		if ('disabled' in $$props) $$invalidate(18, disabled = $$props.disabled);
    		if ('getFilesFromEvent' in $$props) $$invalidate(19, getFilesFromEvent = $$props.getFilesFromEvent);
    		if ('maxSize' in $$props) $$invalidate(20, maxSize = $$props.maxSize);
    		if ('minSize' in $$props) $$invalidate(21, minSize = $$props.minSize);
    		if ('multiple' in $$props) $$invalidate(1, multiple = $$props.multiple);
    		if ('preventDropOnDocument' in $$props) $$invalidate(22, preventDropOnDocument = $$props.preventDropOnDocument);
    		if ('noClick' in $$props) $$invalidate(23, noClick = $$props.noClick);
    		if ('noKeyboard' in $$props) $$invalidate(24, noKeyboard = $$props.noKeyboard);
    		if ('noDrag' in $$props) $$invalidate(25, noDrag = $$props.noDrag);
    		if ('noDragEventsBubbling' in $$props) $$invalidate(26, noDragEventsBubbling = $$props.noDragEventsBubbling);
    		if ('containerClasses' in $$props) $$invalidate(2, containerClasses = $$props.containerClasses);
    		if ('containerStyles' in $$props) $$invalidate(3, containerStyles = $$props.containerStyles);
    		if ('disableDefaultStyles' in $$props) $$invalidate(4, disableDefaultStyles = $$props.disableDefaultStyles);
    		if ('$$scope' in $$props) $$invalidate(27, $$scope = $$props.$$scope);
    	};

    	$$self.$capture_state = () => ({
    		fromEvent,
    		allFilesAccepted,
    		composeEventHandlers,
    		fileAccepted,
    		fileMatchSize,
    		isEvtWithFiles,
    		isIeOrEdge,
    		isPropagationStopped,
    		onDocumentDragOver,
    		TOO_MANY_FILES_REJECTION,
    		onMount,
    		onDestroy,
    		createEventDispatcher,
    		accept,
    		disabled,
    		getFilesFromEvent,
    		maxSize,
    		minSize,
    		multiple,
    		preventDropOnDocument,
    		noClick,
    		noKeyboard,
    		noDrag,
    		noDragEventsBubbling,
    		containerClasses,
    		containerStyles,
    		disableDefaultStyles,
    		dispatch,
    		state,
    		rootRef,
    		inputRef,
    		resetState,
    		openFileDialog,
    		onKeyDownCb,
    		onFocusCb,
    		onBlurCb,
    		onClickCb,
    		onDragEnterCb,
    		onDragOverCb,
    		onDragLeaveCb,
    		onDropCb,
    		composeHandler,
    		composeKeyboardHandler,
    		composeDragHandler,
    		stopPropagation,
    		dragTargetsRef,
    		onDocumentDrop,
    		onWindowFocus,
    		onInputElementClick
    	});

    	$$self.$inject_state = $$props => {
    		if ('accept' in $$props) $$invalidate(0, accept = $$props.accept);
    		if ('disabled' in $$props) $$invalidate(18, disabled = $$props.disabled);
    		if ('getFilesFromEvent' in $$props) $$invalidate(19, getFilesFromEvent = $$props.getFilesFromEvent);
    		if ('maxSize' in $$props) $$invalidate(20, maxSize = $$props.maxSize);
    		if ('minSize' in $$props) $$invalidate(21, minSize = $$props.minSize);
    		if ('multiple' in $$props) $$invalidate(1, multiple = $$props.multiple);
    		if ('preventDropOnDocument' in $$props) $$invalidate(22, preventDropOnDocument = $$props.preventDropOnDocument);
    		if ('noClick' in $$props) $$invalidate(23, noClick = $$props.noClick);
    		if ('noKeyboard' in $$props) $$invalidate(24, noKeyboard = $$props.noKeyboard);
    		if ('noDrag' in $$props) $$invalidate(25, noDrag = $$props.noDrag);
    		if ('noDragEventsBubbling' in $$props) $$invalidate(26, noDragEventsBubbling = $$props.noDragEventsBubbling);
    		if ('containerClasses' in $$props) $$invalidate(2, containerClasses = $$props.containerClasses);
    		if ('containerStyles' in $$props) $$invalidate(3, containerStyles = $$props.containerStyles);
    		if ('disableDefaultStyles' in $$props) $$invalidate(4, disableDefaultStyles = $$props.disableDefaultStyles);
    		if ('state' in $$props) state = $$props.state;
    		if ('rootRef' in $$props) $$invalidate(5, rootRef = $$props.rootRef);
    		if ('inputRef' in $$props) $$invalidate(6, inputRef = $$props.inputRef);
    		if ('dragTargetsRef' in $$props) dragTargetsRef = $$props.dragTargetsRef;
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [
    		accept,
    		multiple,
    		containerClasses,
    		containerStyles,
    		disableDefaultStyles,
    		rootRef,
    		inputRef,
    		onKeyDownCb,
    		onFocusCb,
    		onBlurCb,
    		onClickCb,
    		onDragEnterCb,
    		onDragOverCb,
    		onDragLeaveCb,
    		onDropCb,
    		composeHandler,
    		composeKeyboardHandler,
    		composeDragHandler,
    		disabled,
    		getFilesFromEvent,
    		maxSize,
    		minSize,
    		preventDropOnDocument,
    		noClick,
    		noKeyboard,
    		noDrag,
    		noDragEventsBubbling,
    		$$scope,
    		slots,
    		input_binding,
    		div_binding
    	];
    }

    class Dropzone extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(
    			this,
    			options,
    			instance$4,
    			create_fragment$4,
    			safe_not_equal,
    			{
    				accept: 0,
    				disabled: 18,
    				getFilesFromEvent: 19,
    				maxSize: 20,
    				minSize: 21,
    				multiple: 1,
    				preventDropOnDocument: 22,
    				noClick: 23,
    				noKeyboard: 24,
    				noDrag: 25,
    				noDragEventsBubbling: 26,
    				containerClasses: 2,
    				containerStyles: 3,
    				disableDefaultStyles: 4
    			},
    			null,
    			[-1, -1]
    		);

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Dropzone",
    			options,
    			id: create_fragment$4.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*accept*/ ctx[0] === undefined && !('accept' in props)) {
    			console.warn("<Dropzone> was created without expected prop 'accept'");
    		}
    	}

    	get accept() {
    		throw new Error("<Dropzone>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set accept(value) {
    		throw new Error("<Dropzone>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get disabled() {
    		throw new Error("<Dropzone>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set disabled(value) {
    		throw new Error("<Dropzone>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get getFilesFromEvent() {
    		throw new Error("<Dropzone>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set getFilesFromEvent(value) {
    		throw new Error("<Dropzone>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get maxSize() {
    		throw new Error("<Dropzone>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set maxSize(value) {
    		throw new Error("<Dropzone>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get minSize() {
    		throw new Error("<Dropzone>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set minSize(value) {
    		throw new Error("<Dropzone>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get multiple() {
    		throw new Error("<Dropzone>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set multiple(value) {
    		throw new Error("<Dropzone>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get preventDropOnDocument() {
    		throw new Error("<Dropzone>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set preventDropOnDocument(value) {
    		throw new Error("<Dropzone>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get noClick() {
    		throw new Error("<Dropzone>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set noClick(value) {
    		throw new Error("<Dropzone>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get noKeyboard() {
    		throw new Error("<Dropzone>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set noKeyboard(value) {
    		throw new Error("<Dropzone>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get noDrag() {
    		throw new Error("<Dropzone>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set noDrag(value) {
    		throw new Error("<Dropzone>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get noDragEventsBubbling() {
    		throw new Error("<Dropzone>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set noDragEventsBubbling(value) {
    		throw new Error("<Dropzone>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get containerClasses() {
    		throw new Error("<Dropzone>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set containerClasses(value) {
    		throw new Error("<Dropzone>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get containerStyles() {
    		throw new Error("<Dropzone>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set containerStyles(value) {
    		throw new Error("<Dropzone>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get disableDefaultStyles() {
    		throw new Error("<Dropzone>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set disableDefaultStyles(value) {
    		throw new Error("<Dropzone>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* node_modules/svelte-slider/src/Rail.svelte generated by Svelte v3.44.3 */

    const file$3 = "node_modules/svelte-slider/src/Rail.svelte";

    function create_fragment$3(ctx) {
    	let div1;
    	let div0;
    	let t;
    	let current;
    	const default_slot_template = /*#slots*/ ctx[2].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[1], null);

    	const block = {
    		c: function create() {
    			div1 = element("div");
    			div0 = element("div");
    			t = space();
    			if (default_slot) default_slot.c();
    			attr_dev(div0, "class", "selected svelte-1u5xdj2");
    			set_style(div0, "left", /*value*/ ctx[0][0] * 100 + "%");
    			set_style(div0, "right", (1 - /*value*/ ctx[0][1]) * 100 + "%");
    			add_location(div0, file$3, 5, 2, 61);
    			attr_dev(div1, "class", "rail svelte-1u5xdj2");
    			add_location(div1, file$3, 4, 0, 40);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div1, anchor);
    			append_dev(div1, div0);
    			append_dev(div1, t);

    			if (default_slot) {
    				default_slot.m(div1, null);
    			}

    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (!current || dirty & /*value*/ 1) {
    				set_style(div0, "left", /*value*/ ctx[0][0] * 100 + "%");
    			}

    			if (!current || dirty & /*value*/ 1) {
    				set_style(div0, "right", (1 - /*value*/ ctx[0][1]) * 100 + "%");
    			}

    			if (default_slot) {
    				if (default_slot.p && (!current || dirty & /*$$scope*/ 2)) {
    					update_slot_base(
    						default_slot,
    						default_slot_template,
    						ctx,
    						/*$$scope*/ ctx[1],
    						!current
    						? get_all_dirty_from_scope(/*$$scope*/ ctx[1])
    						: get_slot_changes(default_slot_template, /*$$scope*/ ctx[1], dirty, null),
    						null
    					);
    				}
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div1);
    			if (default_slot) default_slot.d(detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$3.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$3($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Rail', slots, ['default']);
    	let { value } = $$props;
    	const writable_props = ['value'];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Rail> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ('value' in $$props) $$invalidate(0, value = $$props.value);
    		if ('$$scope' in $$props) $$invalidate(1, $$scope = $$props.$$scope);
    	};

    	$$self.$capture_state = () => ({ value });

    	$$self.$inject_state = $$props => {
    		if ('value' in $$props) $$invalidate(0, value = $$props.value);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [value, $$scope, slots];
    }

    class Rail extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$3, create_fragment$3, safe_not_equal, { value: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Rail",
    			options,
    			id: create_fragment$3.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*value*/ ctx[0] === undefined && !('value' in props)) {
    			console.warn("<Rail> was created without expected prop 'value'");
    		}
    	}

    	get value() {
    		throw new Error("<Rail>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set value(value) {
    		throw new Error("<Rail>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* node_modules/svelte-slider/src/Thumb.svelte generated by Svelte v3.44.3 */
    const file$2 = "node_modules/svelte-slider/src/Thumb.svelte";

    function create_fragment$2(ctx) {
    	let div;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			div = element("div");
    			attr_dev(div, "class", "thumb svelte-1p2qw86");
    			set_style(div, "left", /*position*/ ctx[0] * 100 + "%");
    			add_location(div, file$2, 38, 0, 984);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			/*div_binding*/ ctx[5](div);

    			if (!mounted) {
    				dispose = [
    					listen_dev(div, "start", /*handleStart*/ ctx[2], false, false, false),
    					listen_dev(div, "move", /*handleMove*/ ctx[3], false, false, false),
    					listen_dev(div, "end", /*handleEnd*/ ctx[4], false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*position*/ 1) {
    				set_style(div, "left", /*position*/ ctx[0] * 100 + "%");
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			/*div_binding*/ ctx[5](null);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$2.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$2($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Thumb', slots, []);
    	let { position } = $$props;
    	let thumb;
    	let bbox;
    	const dispatch = createEventDispatcher();

    	function handleStart(event) {
    		event.preventDefault();
    		const x = event.clientX;
    		const bbox = event.target.getBoundingClientRect();
    		thumb.setPointerCapture(event.pointerId);
    		thumb.addEventListener('pointermove', handleMove);
    		thumb.addEventListener('pointerup', handleEnd);
    		dispatch('dragstart', { x, bbox });
    	}

    	function handleMove(event) {
    		event.preventDefault();
    		const x = event.clientX;
    		const bbox = event.target.getBoundingClientRect();
    		dispatch('dragging', { x, bbox });
    	}

    	function handleEnd(event) {
    		event.preventDefault();
    		thumb.removeEventListener('pointermove', handleMove);
    		thumb.removeEventListener('pointerup', handleEnd);
    		dispatch('dragend');
    	}

    	onMount(() => {
    		thumb.addEventListener('pointerdown', handleStart);
    	});

    	const writable_props = ['position'];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Thumb> was created with unknown prop '${key}'`);
    	});

    	function div_binding($$value) {
    		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
    			thumb = $$value;
    			$$invalidate(1, thumb);
    		});
    	}

    	$$self.$$set = $$props => {
    		if ('position' in $$props) $$invalidate(0, position = $$props.position);
    	};

    	$$self.$capture_state = () => ({
    		onMount,
    		createEventDispatcher,
    		position,
    		thumb,
    		bbox,
    		dispatch,
    		handleStart,
    		handleMove,
    		handleEnd
    	});

    	$$self.$inject_state = $$props => {
    		if ('position' in $$props) $$invalidate(0, position = $$props.position);
    		if ('thumb' in $$props) $$invalidate(1, thumb = $$props.thumb);
    		if ('bbox' in $$props) bbox = $$props.bbox;
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [position, thumb, handleStart, handleMove, handleEnd, div_binding];
    }

    class Thumb extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$2, create_fragment$2, safe_not_equal, { position: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Thumb",
    			options,
    			id: create_fragment$2.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*position*/ ctx[0] === undefined && !('position' in props)) {
    			console.warn("<Thumb> was created without expected prop 'position'");
    		}
    	}

    	get position() {
    		throw new Error("<Thumb>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set position(value) {
    		throw new Error("<Thumb>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* node_modules/svelte-slider/src/Slider.svelte generated by Svelte v3.44.3 */

    const { console: console_1$1 } = globals;
    const file$1 = "node_modules/svelte-slider/src/Slider.svelte";

    // (61:6) {#if !single}
    function create_if_block(ctx) {
    	let thumb;
    	let current;

    	thumb = new Thumb({
    			props: { position: /*value*/ ctx[0][0] },
    			$$inline: true
    		});

    	thumb.$on("dragstart", /*getStartListener*/ ctx[3](0));
    	thumb.$on("dragging", /*moveListener*/ ctx[4]);
    	thumb.$on("dragend", endListener);

    	const block = {
    		c: function create() {
    			create_component(thumb.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(thumb, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const thumb_changes = {};
    			if (dirty & /*value*/ 1) thumb_changes.position = /*value*/ ctx[0][0];
    			thumb.$set(thumb_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(thumb.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(thumb.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(thumb, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block.name,
    		type: "if",
    		source: "(61:6) {#if !single}",
    		ctx
    	});

    	return block;
    }

    // (60:4) <Rail {value} on:set={onSet}>
    function create_default_slot(ctx) {
    	let t;
    	let thumb;
    	let current;
    	let if_block = !/*single*/ ctx[1] && create_if_block(ctx);

    	thumb = new Thumb({
    			props: { position: /*value*/ ctx[0][1] },
    			$$inline: true
    		});

    	thumb.$on("dragstart", /*getStartListener*/ ctx[3](1));
    	thumb.$on("dragging", /*moveListener*/ ctx[4]);
    	thumb.$on("dragend", endListener);

    	const block = {
    		c: function create() {
    			if (if_block) if_block.c();
    			t = space();
    			create_component(thumb.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert_dev(target, t, anchor);
    			mount_component(thumb, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (!/*single*/ ctx[1]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty & /*single*/ 2) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(t.parentNode, t);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}

    			const thumb_changes = {};
    			if (dirty & /*value*/ 1) thumb_changes.position = /*value*/ ctx[0][1];
    			thumb.$set(thumb_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			transition_in(thumb.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			transition_out(thumb.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach_dev(t);
    			destroy_component(thumb, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot.name,
    		type: "slot",
    		source: "(60:4) <Rail {value} on:set={onSet}>",
    		ctx
    	});

    	return block;
    }

    function create_fragment$1(ctx) {
    	let div1;
    	let div0;
    	let rail;
    	let current;

    	rail = new Rail({
    			props: {
    				value: /*value*/ ctx[0],
    				$$slots: { default: [create_default_slot] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	rail.$on("set", onSet);

    	const block = {
    		c: function create() {
    			div1 = element("div");
    			div0 = element("div");
    			create_component(rail.$$.fragment);
    			add_location(div0, file$1, 58, 2, 1338);
    			attr_dev(div1, "class", "slider svelte-1cw3o64");
    			add_location(div1, file$1, 57, 0, 1315);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div1, anchor);
    			append_dev(div1, div0);
    			mount_component(rail, div0, null);
    			/*div0_binding*/ ctx[5](div0);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			const rail_changes = {};
    			if (dirty & /*value*/ 1) rail_changes.value = /*value*/ ctx[0];

    			if (dirty & /*$$scope, value, single*/ 515) {
    				rail_changes.$$scope = { dirty, ctx };
    			}

    			rail.$set(rail_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(rail.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(rail.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div1);
    			destroy_component(rail);
    			/*div0_binding*/ ctx[5](null);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$1.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function endListener() {
    	document.body.style.cursor = '';
    }

    function onSet(event) {
    	console.log(event.detail);
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Slider', slots, []);
    	let { value = [0, 1] } = $$props;
    	let { single = false } = $$props;
    	let container;
    	let activeIndex;
    	let offset;
    	let dispatch = createEventDispatcher();

    	function getStartListener(index) {
    		return event => {
    			activeIndex = index;
    			const { bbox } = event.detail;
    			offset = bbox.width / 2 - (event.detail.x - bbox.left);
    			document.body.style.cursor = 'pointer';
    		};
    	}

    	function moveListener(event) {
    		const bbox = container.getBoundingClientRect();
    		const { x } = event.detail;
    		let position = (x - bbox.left + offset) / bbox.width;

    		if (position < 0) {
    			position = 0;
    		} else if (position > 1) {
    			position = 1;
    		}

    		if (activeIndex === 0 && value[0] > value[1]) {
    			activeIndex = 1;
    			$$invalidate(0, value[0] = value[1], value);
    			return;
    		} else if (activeIndex === 1 && value[1] < value[0]) {
    			activeIndex = 0;
    			$$invalidate(0, value[1] = value[0], value);
    			return;
    		}

    		if (value[activeIndex] === position) return;
    		$$invalidate(0, value[activeIndex] = position, value);
    		dispatch('change', value);
    	}

    	const writable_props = ['value', 'single'];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console_1$1.warn(`<Slider> was created with unknown prop '${key}'`);
    	});

    	function div0_binding($$value) {
    		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
    			container = $$value;
    			$$invalidate(2, container);
    		});
    	}

    	$$self.$$set = $$props => {
    		if ('value' in $$props) $$invalidate(0, value = $$props.value);
    		if ('single' in $$props) $$invalidate(1, single = $$props.single);
    	};

    	$$self.$capture_state = () => ({
    		createEventDispatcher,
    		Rail,
    		Thumb,
    		value,
    		single,
    		container,
    		activeIndex,
    		offset,
    		dispatch,
    		getStartListener,
    		moveListener,
    		endListener,
    		onSet
    	});

    	$$self.$inject_state = $$props => {
    		if ('value' in $$props) $$invalidate(0, value = $$props.value);
    		if ('single' in $$props) $$invalidate(1, single = $$props.single);
    		if ('container' in $$props) $$invalidate(2, container = $$props.container);
    		if ('activeIndex' in $$props) activeIndex = $$props.activeIndex;
    		if ('offset' in $$props) offset = $$props.offset;
    		if ('dispatch' in $$props) dispatch = $$props.dispatch;
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [value, single, container, getStartListener, moveListener, div0_binding];
    }

    class Slider extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, { value: 0, single: 1 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Slider",
    			options,
    			id: create_fragment$1.name
    		});
    	}

    	get value() {
    		throw new Error("<Slider>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set value(value) {
    		throw new Error("<Slider>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get single() {
    		throw new Error("<Slider>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set single(value) {
    		throw new Error("<Slider>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    var t=function(e,r){return (t=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(t,e){t.__proto__=e;}||function(t,e){for(var r in e)Object.prototype.hasOwnProperty.call(e,r)&&(t[r]=e[r]);})(e,r)};function e(e,r){if("function"!=typeof r&&null!==r)throw new TypeError("Class extends value "+String(r)+" is not a constructor or null");function n(){this.constructor=e;}t(e,r),e.prototype=null===r?Object.create(r):(n.prototype=r.prototype,new n);}var r=function(){return (r=Object.assign||function(t){for(var e,r=1,n=arguments.length;r<n;r++)for(var a in e=arguments[r])Object.prototype.hasOwnProperty.call(e,a)&&(t[a]=e[a]);return t}).apply(this,arguments)};function n(t,e,r){if(r||2===arguments.length)for(var n,a=0,s=e.length;a<s;a++)!n&&a in e||(n||(n=Array.prototype.slice.call(e,0,a)),n[a]=e[a]);return t.concat(n||Array.prototype.slice.call(e))}function a(t,e,r){if(t&&t.length){var n=e[0],a=e[1],s=Math.PI/180*r,o=Math.cos(s),i=Math.sin(s);t.forEach((function(t){var e=t[0],r=t[1];t[0]=(e-n)*o-(r-a)*i+n,t[1]=(e-n)*i+(r-a)*o+a;}));}}function s(t){var e=t[0],r=t[1];return Math.sqrt(Math.pow(e[0]-r[0],2)+Math.pow(e[1]-r[1],2))}function o(t,e){var r=e.hachureAngle+90,s=e.hachureGap;s<0&&(s=4*e.strokeWidth),s=Math.max(s,.1);var o=[0,0];if(r)for(var i=0,h=t;i<h.length;i++){a(h[i],o,r);}var u=function(t,e){for(var r=[],a=0,s=t;a<s.length;a++){(p=n([],s[a],!0))[0].join(",")!==p[p.length-1].join(",")&&p.push([p[0][0],p[0][1]]),p.length>2&&r.push(p);}var o=[];e=Math.max(e,.1);for(var i=[],h=0,u=r;h<u.length;h++)for(var p=u[h],c=0;c<p.length-1;c++){var l=p[c],f=p[c+1];if(l[1]!==f[1]){var d=Math.min(l[1],f[1]);i.push({ymin:d,ymax:Math.max(l[1],f[1]),x:d===l[1]?l[0]:f[0],islope:(f[0]-l[0])/(f[1]-l[1])});}}if(i.sort((function(t,e){return t.ymin<e.ymin?-1:t.ymin>e.ymin?1:t.x<e.x?-1:t.x>e.x?1:t.ymax===e.ymax?0:(t.ymax-e.ymax)/Math.abs(t.ymax-e.ymax)})),!i.length)return o;var v=[],g=i[0].ymin;for(;v.length||i.length;){if(i.length){var y=-1;for(c=0;c<i.length&&!(i[c].ymin>g);c++)y=c;i.splice(0,y+1).forEach((function(t){v.push({s:g,edge:t});}));}if((v=v.filter((function(t){return !(t.edge.ymax<=g)}))).sort((function(t,e){return t.edge.x===e.edge.x?0:(t.edge.x-e.edge.x)/Math.abs(t.edge.x-e.edge.x)})),v.length>1)for(c=0;c<v.length;c+=2){var M=c+1;if(M>=v.length)break;var k=v[c].edge,b=v[M].edge;o.push([[Math.round(k.x),g],[Math.round(b.x),g]]);}g+=e,v.forEach((function(t){t.edge.x=t.edge.x+e*t.edge.islope;}));}return o}(t,s);if(r){for(var p=0,c=t;p<c.length;p++){a(c[p],o,-r);}!function(t,e,r){var n=[];t.forEach((function(t){return n.push.apply(n,t)})),a(n,e,r);}(u,o,-r);}return u}var i=function(){function t(t){this.helper=t;}return t.prototype.fillPolygons=function(t,e){return this._fillPolygons(t,e)},t.prototype._fillPolygons=function(t,e){var r=o(t,e);return {type:"fillSketch",ops:this.renderLines(r,e)}},t.prototype.renderLines=function(t,e){for(var r=[],n=0,a=t;n<a.length;n++){var s=a[n];r.push.apply(r,this.helper.doubleLineOps(s[0][0],s[0][1],s[1][0],s[1][1],e));}return r},t}(),h=function(t){function r(){return null!==t&&t.apply(this,arguments)||this}return e(r,t),r.prototype.fillPolygons=function(t,e){var r=e.hachureGap;r<0&&(r=4*e.strokeWidth),r=Math.max(r,.1);for(var a=o(t,Object.assign({},e,{hachureGap:r})),i=Math.PI/180*e.hachureAngle,h=[],u=.5*r*Math.cos(i),p=.5*r*Math.sin(i),c=0,l=a;c<l.length;c++){var f=l[c],d=f[0],v=f[1];s([d,v])&&h.push([[d[0]-u,d[1]+p],n([],v,!0)],[[d[0]+u,d[1]-p],n([],v,!0)]);}return {type:"fillSketch",ops:this.renderLines(h,e)}},r}(i),u=function(t){function r(){return null!==t&&t.apply(this,arguments)||this}return e(r,t),r.prototype.fillPolygons=function(t,e){var r=this._fillPolygons(t,e),n=Object.assign({},e,{hachureAngle:e.hachureAngle+90}),a=this._fillPolygons(t,n);return r.ops=r.ops.concat(a.ops),r},r}(i),p=function(){function t(t){this.helper=t;}return t.prototype.fillPolygons=function(t,e){var r=o(t,e=Object.assign({},e,{hachureAngle:0}));return this.dotsOnLines(r,e)},t.prototype.dotsOnLines=function(t,e){var r=[],n=e.hachureGap;n<0&&(n=4*e.strokeWidth),n=Math.max(n,.1);var a=e.fillWeight;a<0&&(a=e.strokeWidth/2);for(var o=n/4,i=0,h=t;i<h.length;i++)for(var u=h[i],p=s(u),c=p/n,l=Math.ceil(c)-1,f=p-l*n,d=(u[0][0]+u[1][0])/2-n/4,v=Math.min(u[0][1],u[1][1]),g=0;g<l;g++){var y=v+f+g*n,M=d-o+2*Math.random()*o,k=y-o+2*Math.random()*o,b=this.helper.ellipse(M,k,a,a,e);r.push.apply(r,b.ops);}return {type:"fillSketch",ops:r}},t}(),c=function(){function t(t){this.helper=t;}return t.prototype.fillPolygons=function(t,e){var r=o(t,e);return {type:"fillSketch",ops:this.dashedLine(r,e)}},t.prototype.dashedLine=function(t,e){var r=this,n=e.dashOffset<0?e.hachureGap<0?4*e.strokeWidth:e.hachureGap:e.dashOffset,a=e.dashGap<0?e.hachureGap<0?4*e.strokeWidth:e.hachureGap:e.dashGap,o=[];return t.forEach((function(t){var i=s(t),h=Math.floor(i/(n+a)),u=(i+a-h*(n+a))/2,p=t[0],c=t[1];p[0]>c[0]&&(p=t[1],c=t[0]);for(var l=Math.atan((c[1]-p[1])/(c[0]-p[0])),f=0;f<h;f++){var d=f*(n+a),v=d+n,g=[p[0]+d*Math.cos(l)+u*Math.cos(l),p[1]+d*Math.sin(l)+u*Math.sin(l)],y=[p[0]+v*Math.cos(l)+u*Math.cos(l),p[1]+v*Math.sin(l)+u*Math.sin(l)];o.push.apply(o,r.helper.doubleLineOps(g[0],g[1],y[0],y[1],e));}})),o},t}(),l=function(){function t(t){this.helper=t;}return t.prototype.fillPolygons=function(t,e){var r=e.hachureGap<0?4*e.strokeWidth:e.hachureGap,n=e.zigzagOffset<0?r:e.zigzagOffset,a=o(t,e=Object.assign({},e,{hachureGap:r+n}));return {type:"fillSketch",ops:this.zigzagLines(a,n,e)}},t.prototype.zigzagLines=function(t,e,r){var a=this,o=[];return t.forEach((function(t){var i=s(t),h=Math.round(i/(2*e)),u=t[0],p=t[1];u[0]>p[0]&&(u=t[1],p=t[0]);for(var c=Math.atan((p[1]-u[1])/(p[0]-u[0])),l=0;l<h;l++){var f=2*l*e,d=2*(l+1)*e,v=Math.sqrt(2*Math.pow(e,2)),g=[u[0]+f*Math.cos(c),u[1]+f*Math.sin(c)],y=[u[0]+d*Math.cos(c),u[1]+d*Math.sin(c)],M=[g[0]+v*Math.cos(c+Math.PI/4),g[1]+v*Math.sin(c+Math.PI/4)];o.push.apply(o,n(n([],a.helper.doubleLineOps(g[0],g[1],M[0],M[1],r),!1),a.helper.doubleLineOps(M[0],M[1],y[0],y[1],r),!1));}})),o},t}(),f={};var d=function(){function t(t){this.seed=t;}return t.prototype.next=function(){return this.seed?(Math.pow(2,31)-1&(this.seed=Math.imul(48271,this.seed)))/Math.pow(2,31):Math.random()},t}();const v={A:7,a:7,C:6,c:6,H:1,h:1,L:2,l:2,M:2,m:2,Q:4,q:4,S:4,s:4,T:2,t:2,V:1,v:1,Z:0,z:0};function g(t,e){return t.type===e}function y(t){const e=[],r=function(t){const e=new Array;for(;""!==t;)if(t.match(/^([ \t\r\n,]+)/))t=t.substr(RegExp.$1.length);else if(t.match(/^([aAcChHlLmMqQsStTvVzZ])/))e[e.length]={type:0,text:RegExp.$1},t=t.substr(RegExp.$1.length);else {if(!t.match(/^(([-+]?[0-9]+(\.[0-9]*)?|[-+]?\.[0-9]+)([eE][-+]?[0-9]+)?)/))return [];e[e.length]={type:1,text:`${parseFloat(RegExp.$1)}`},t=t.substr(RegExp.$1.length);}return e[e.length]={type:2,text:""},e}(t);let n="BOD",a=0,s=r[a];for(;!g(s,2);){let o=0;const i=[];if("BOD"===n){if("M"!==s.text&&"m"!==s.text)return y("M0,0"+t);a++,o=v[s.text],n=s.text;}else g(s,1)?o=v[n]:(a++,o=v[s.text],n=s.text);if(!(a+o<r.length))throw new Error("Path data ended short");for(let t=a;t<a+o;t++){const e=r[t];if(!g(e,1))throw new Error("Param not a number: "+n+","+e.text);i[i.length]=+e.text;}if("number"!=typeof v[n])throw new Error("Bad segment: "+n);{const t={key:n,data:i};e.push(t),a+=o,s=r[a],"M"===n&&(n="L"),"m"===n&&(n="l");}}return e}function M(t){let e=0,r=0,n=0,a=0;const s=[];for(const{key:o,data:i}of t)switch(o){case"M":s.push({key:"M",data:[...i]}),[e,r]=i,[n,a]=i;break;case"m":e+=i[0],r+=i[1],s.push({key:"M",data:[e,r]}),n=e,a=r;break;case"L":s.push({key:"L",data:[...i]}),[e,r]=i;break;case"l":e+=i[0],r+=i[1],s.push({key:"L",data:[e,r]});break;case"C":s.push({key:"C",data:[...i]}),e=i[4],r=i[5];break;case"c":{const t=i.map(((t,n)=>n%2?t+r:t+e));s.push({key:"C",data:t}),e=t[4],r=t[5];break}case"Q":s.push({key:"Q",data:[...i]}),e=i[2],r=i[3];break;case"q":{const t=i.map(((t,n)=>n%2?t+r:t+e));s.push({key:"Q",data:t}),e=t[2],r=t[3];break}case"A":s.push({key:"A",data:[...i]}),e=i[5],r=i[6];break;case"a":e+=i[5],r+=i[6],s.push({key:"A",data:[i[0],i[1],i[2],i[3],i[4],e,r]});break;case"H":s.push({key:"H",data:[...i]}),e=i[0];break;case"h":e+=i[0],s.push({key:"H",data:[e]});break;case"V":s.push({key:"V",data:[...i]}),r=i[0];break;case"v":r+=i[0],s.push({key:"V",data:[r]});break;case"S":s.push({key:"S",data:[...i]}),e=i[2],r=i[3];break;case"s":{const t=i.map(((t,n)=>n%2?t+r:t+e));s.push({key:"S",data:t}),e=t[2],r=t[3];break}case"T":s.push({key:"T",data:[...i]}),e=i[0],r=i[1];break;case"t":e+=i[0],r+=i[1],s.push({key:"T",data:[e,r]});break;case"Z":case"z":s.push({key:"Z",data:[]}),e=n,r=a;}return s}function k(t){const e=[];let r="",n=0,a=0,s=0,o=0,i=0,h=0;for(const{key:u,data:p}of t){switch(u){case"M":e.push({key:"M",data:[...p]}),[n,a]=p,[s,o]=p;break;case"C":e.push({key:"C",data:[...p]}),n=p[4],a=p[5],i=p[2],h=p[3];break;case"L":e.push({key:"L",data:[...p]}),[n,a]=p;break;case"H":n=p[0],e.push({key:"L",data:[n,a]});break;case"V":a=p[0],e.push({key:"L",data:[n,a]});break;case"S":{let t=0,s=0;"C"===r||"S"===r?(t=n+(n-i),s=a+(a-h)):(t=n,s=a),e.push({key:"C",data:[t,s,...p]}),i=p[0],h=p[1],n=p[2],a=p[3];break}case"T":{const[t,s]=p;let o=0,u=0;"Q"===r||"T"===r?(o=n+(n-i),u=a+(a-h)):(o=n,u=a);const c=n+2*(o-n)/3,l=a+2*(u-a)/3,f=t+2*(o-t)/3,d=s+2*(u-s)/3;e.push({key:"C",data:[c,l,f,d,t,s]}),i=o,h=u,n=t,a=s;break}case"Q":{const[t,r,s,o]=p,u=n+2*(t-n)/3,c=a+2*(r-a)/3,l=s+2*(t-s)/3,f=o+2*(r-o)/3;e.push({key:"C",data:[u,c,l,f,s,o]}),i=t,h=r,n=s,a=o;break}case"A":{const t=Math.abs(p[0]),r=Math.abs(p[1]),s=p[2],o=p[3],i=p[4],h=p[5],u=p[6];if(0===t||0===r)e.push({key:"C",data:[n,a,h,u,h,u]}),n=h,a=u;else if(n!==h||a!==u){m(n,a,h,u,t,r,s,o,i).forEach((function(t){e.push({key:"C",data:t});})),n=h,a=u;}break}case"Z":e.push({key:"Z",data:[]}),n=s,a=o;}r=u;}return e}function b(t,e,r){return [t*Math.cos(r)-e*Math.sin(r),t*Math.sin(r)+e*Math.cos(r)]}function m(t,e,r,n,a,s,o,i,h,u){const p=(c=o,Math.PI*c/180);var c;let l=[],f=0,d=0,v=0,g=0;if(u)[f,d,v,g]=u;else {[t,e]=b(t,e,-p),[r,n]=b(r,n,-p);const o=(t-r)/2,u=(e-n)/2;let c=o*o/(a*a)+u*u/(s*s);c>1&&(c=Math.sqrt(c),a*=c,s*=c);const l=a*a,y=s*s,M=l*y-l*u*u-y*o*o,k=l*u*u+y*o*o,m=(i===h?-1:1)*Math.sqrt(Math.abs(M/k));v=m*a*u/s+(t+r)/2,g=m*-s*o/a+(e+n)/2,f=Math.asin(parseFloat(((e-g)/s).toFixed(9))),d=Math.asin(parseFloat(((n-g)/s).toFixed(9))),t<v&&(f=Math.PI-f),r<v&&(d=Math.PI-d),f<0&&(f=2*Math.PI+f),d<0&&(d=2*Math.PI+d),h&&f>d&&(f-=2*Math.PI),!h&&d>f&&(d-=2*Math.PI);}let y=d-f;if(Math.abs(y)>120*Math.PI/180){const t=d,e=r,i=n;d=h&&d>f?f+120*Math.PI/180*1:f+120*Math.PI/180*-1,l=m(r=v+a*Math.cos(d),n=g+s*Math.sin(d),e,i,a,s,o,0,h,[d,t,v,g]);}y=d-f;const M=Math.cos(f),k=Math.sin(f),w=Math.cos(d),P=Math.sin(d),x=Math.tan(y/4),O=4/3*a*x,S=4/3*s*x,L=[t,e],T=[t+O*k,e-S*M],_=[r+O*P,n-S*w],D=[r,n];if(T[0]=2*L[0]-T[0],T[1]=2*L[1]-T[1],u)return [T,_,D].concat(l);{l=[T,_,D].concat(l);const t=[];for(let e=0;e<l.length;e+=3){const r=b(l[e][0],l[e][1],p),n=b(l[e+1][0],l[e+1][1],p),a=b(l[e+2][0],l[e+2][1],p);t.push([r[0],r[1],n[0],n[1],a[0],a[1]]);}return t}}var w={randOffset:function(t,e){return z(t,e)},randOffsetWithRange:function(t,e,r){return W(t,e,r)},ellipse:function(t,e,r,n,a){var s=L(r,n,a);return T(t,e,a,s).opset},doubleLineOps:function(t,e,r,n,a){return E(t,e,r,n,a,!0)}};function P(t,e,r,n,a){return {type:"path",ops:E(t,e,r,n,a)}}function x(t,e,r){var n=(t||[]).length;if(n>2){for(var a=[],s=0;s<n-1;s++)a.push.apply(a,E(t[s][0],t[s][1],t[s+1][0],t[s+1][1],r));return e&&a.push.apply(a,E(t[n-1][0],t[n-1][1],t[0][0],t[0][1],r)),{type:"path",ops:a}}return 2===n?P(t[0][0],t[0][1],t[1][0],t[1][1],r):{type:"path",ops:[]}}function O(t,e,r,n,a){return function(t,e){return x(t,!0,e)}([[t,e],[t+r,e],[t+r,e+n],[t,e+n]],a)}function S(t,e){var n=G(t,1*(1+.2*e.roughness),e);if(!e.disableMultiStroke){var a=G(t,1.5*(1+.22*e.roughness),function(t){var e=r({},t);e.randomizer=void 0,t.seed&&(e.seed=t.seed+1);return e}(e));n=n.concat(a);}return {type:"path",ops:n}}function L(t,e,r){var n=Math.sqrt(2*Math.PI*Math.sqrt((Math.pow(t/2,2)+Math.pow(e/2,2))/2)),a=Math.ceil(Math.max(r.curveStepCount,r.curveStepCount/Math.sqrt(200)*n)),s=2*Math.PI/a,o=Math.abs(t/2),i=Math.abs(e/2),h=1-r.curveFitting;return {increment:s,rx:o+=z(o*h,r),ry:i+=z(i*h,r)}}function T(t,e,r,n){var a=q(n.increment,t,e,n.rx,n.ry,1,n.increment*W(.1,W(.4,1,r),r),r),s=a[0],o=a[1],i=R(s,null,r);if(!r.disableMultiStroke&&0!==r.roughness){var h=R(q(n.increment,t,e,n.rx,n.ry,1.5,0,r)[0],null,r);i=i.concat(h);}return {estimatedPoints:o,opset:{type:"path",ops:i}}}function _(t,e,r,a,s,o,i,h,u){var p=t,c=e,l=Math.abs(r/2),f=Math.abs(a/2);l+=z(.01*l,u),f+=z(.01*f,u);for(var d=s,v=o;d<0;)d+=2*Math.PI,v+=2*Math.PI;v-d>2*Math.PI&&(d=0,v=2*Math.PI);var g=2*Math.PI/u.curveStepCount,y=Math.min(g/2,(v-d)/2),M=F(y,p,c,l,f,d,v,1,u);if(!u.disableMultiStroke){var k=F(y,p,c,l,f,d,v,1.5,u);M.push.apply(M,k);}return i&&(h?M.push.apply(M,n(n([],E(p,c,p+l*Math.cos(d),c+f*Math.sin(d),u),!1),E(p,c,p+l*Math.cos(v),c+f*Math.sin(v),u),!1)):M.push({op:"lineTo",data:[p,c]},{op:"lineTo",data:[p+l*Math.cos(d),c+f*Math.sin(d)]})),{type:"path",ops:M}}function D(t,e){for(var r=k(M(y(t))),n=[],a=[0,0],s=[0,0],o=function(t,r){switch(t){case"M":var o=1*(e.maxRandomnessOffset||0),i=e.preserveVertices;n.push({op:"move",data:r.map((function(t){return t+(i?0:z(o,e))}))}),s=[r[0],r[1]],a=[r[0],r[1]];break;case"L":n.push.apply(n,E(s[0],s[1],r[0],r[1],e)),s=[r[0],r[1]];break;case"C":var h=r[0],u=r[1],p=r[2],c=r[3],l=r[4],f=r[5];n.push.apply(n,function(t,e,r,n,a,s,o,i){for(var h=[],u=[i.maxRandomnessOffset||1,(i.maxRandomnessOffset||1)+.3],p=[0,0],c=i.disableMultiStroke?1:2,l=i.preserveVertices,f=0;f<c;f++)0===f?h.push({op:"move",data:[o[0],o[1]]}):h.push({op:"move",data:[o[0]+(l?0:z(u[0],i)),o[1]+(l?0:z(u[0],i))]}),p=l?[a,s]:[a+z(u[f],i),s+z(u[f],i)],h.push({op:"bcurveTo",data:[t+z(u[f],i),e+z(u[f],i),r+z(u[f],i),n+z(u[f],i),p[0],p[1]]});return h}(h,u,p,c,l,f,s,e)),s=[l,f];break;case"Z":n.push.apply(n,E(s[0],s[1],a[0],a[1],e)),s=[a[0],a[1]];}},i=0,h=r;i<h.length;i++){var u=h[i];o(u.key,u.data);}return {type:"path",ops:n}}function A(t,e){for(var r=[],n=0,a=t;n<a.length;n++){var s=a[n];if(s.length){var o=e.maxRandomnessOffset||0,i=s.length;if(i>2){r.push({op:"move",data:[s[0][0]+z(o,e),s[0][1]+z(o,e)]});for(var h=1;h<i;h++)r.push({op:"lineTo",data:[s[h][0]+z(o,e),s[h][1]+z(o,e)]});}}}return {type:"fillPath",ops:r}}function I(t,e){return function(t,e){var r=t.fillStyle||"hachure";if(!f[r])switch(r){case"zigzag":f[r]||(f[r]=new h(e));break;case"cross-hatch":f[r]||(f[r]=new u(e));break;case"dots":f[r]||(f[r]=new p(e));break;case"dashed":f[r]||(f[r]=new c(e));break;case"zigzag-line":f[r]||(f[r]=new l(e));break;case"hachure":default:f[r="hachure"]||(f[r]=new i(e));}return f[r]}(e,w).fillPolygons(t,e)}function C(t){return t.randomizer||(t.randomizer=new d(t.seed||0)),t.randomizer.next()}function W(t,e,r,n){return void 0===n&&(n=1),r.roughness*n*(C(r)*(e-t)+t)}function z(t,e,r){return void 0===r&&(r=1),W(-t,t,e,r)}function E(t,e,r,n,a,s){void 0===s&&(s=!1);var o=s?a.disableMultiStrokeFill:a.disableMultiStroke,i=j(t,e,r,n,a,!0,!1);if(o)return i;var h=j(t,e,r,n,a,!0,!0);return i.concat(h)}function j(t,e,r,n,a,s,o){var i=Math.pow(t-r,2)+Math.pow(e-n,2),h=Math.sqrt(i),u=1;u=h<200?1:h>500?.4:-.0016668*h+1.233334;var p=a.maxRandomnessOffset||0;p*p*100>i&&(p=h/10);var c=p/2,l=.2+.2*C(a),f=a.bowing*a.maxRandomnessOffset*(n-e)/200,d=a.bowing*a.maxRandomnessOffset*(t-r)/200;f=z(f,a,u),d=z(d,a,u);var v=[],g=function(){return z(c,a,u)},y=function(){return z(p,a,u)},M=a.preserveVertices;return s&&(o?v.push({op:"move",data:[t+(M?0:g()),e+(M?0:g())]}):v.push({op:"move",data:[t+(M?0:z(p,a,u)),e+(M?0:z(p,a,u))]})),o?v.push({op:"bcurveTo",data:[f+t+(r-t)*l+g(),d+e+(n-e)*l+g(),f+t+2*(r-t)*l+g(),d+e+2*(n-e)*l+g(),r+(M?0:g()),n+(M?0:g())]}):v.push({op:"bcurveTo",data:[f+t+(r-t)*l+y(),d+e+(n-e)*l+y(),f+t+2*(r-t)*l+y(),d+e+2*(n-e)*l+y(),r+(M?0:y()),n+(M?0:y())]}),v}function G(t,e,r){var n=[];n.push([t[0][0]+z(e,r),t[0][1]+z(e,r)]),n.push([t[0][0]+z(e,r),t[0][1]+z(e,r)]);for(var a=1;a<t.length;a++)n.push([t[a][0]+z(e,r),t[a][1]+z(e,r)]),a===t.length-1&&n.push([t[a][0]+z(e,r),t[a][1]+z(e,r)]);return R(n,null,r)}function R(t,e,r){var n=t.length,a=[];if(n>3){var s=[],o=1-r.curveTightness;a.push({op:"move",data:[t[1][0],t[1][1]]});for(var i=1;i+2<n;i++){var h=t[i];s[0]=[h[0],h[1]],s[1]=[h[0]+(o*t[i+1][0]-o*t[i-1][0])/6,h[1]+(o*t[i+1][1]-o*t[i-1][1])/6],s[2]=[t[i+1][0]+(o*t[i][0]-o*t[i+2][0])/6,t[i+1][1]+(o*t[i][1]-o*t[i+2][1])/6],s[3]=[t[i+1][0],t[i+1][1]],a.push({op:"bcurveTo",data:[s[1][0],s[1][1],s[2][0],s[2][1],s[3][0],s[3][1]]});}if(e&&2===e.length){var u=r.maxRandomnessOffset;a.push({op:"lineTo",data:[e[0]+z(u,r),e[1]+z(u,r)]});}}else 3===n?(a.push({op:"move",data:[t[1][0],t[1][1]]}),a.push({op:"bcurveTo",data:[t[1][0],t[1][1],t[2][0],t[2][1],t[2][0],t[2][1]]})):2===n&&a.push.apply(a,E(t[0][0],t[0][1],t[1][0],t[1][1],r));return a}function q(t,e,r,n,a,s,o,i){var h=[],u=[];if(0===i.roughness){t/=4,u.push([e+n*Math.cos(-t),r+a*Math.sin(-t)]);for(var p=0;p<=2*Math.PI;p+=t){var c=[e+n*Math.cos(p),r+a*Math.sin(p)];h.push(c),u.push(c);}u.push([e+n*Math.cos(0),r+a*Math.sin(0)]),u.push([e+n*Math.cos(t),r+a*Math.sin(t)]);}else {var l=z(.5,i)-Math.PI/2;u.push([z(s,i)+e+.9*n*Math.cos(l-t),z(s,i)+r+.9*a*Math.sin(l-t)]);var f=2*Math.PI+l-.01;for(p=l;p<f;p+=t){c=[z(s,i)+e+n*Math.cos(p),z(s,i)+r+a*Math.sin(p)];h.push(c),u.push(c);}u.push([z(s,i)+e+n*Math.cos(l+2*Math.PI+.5*o),z(s,i)+r+a*Math.sin(l+2*Math.PI+.5*o)]),u.push([z(s,i)+e+.98*n*Math.cos(l+o),z(s,i)+r+.98*a*Math.sin(l+o)]),u.push([z(s,i)+e+.9*n*Math.cos(l+.5*o),z(s,i)+r+.9*a*Math.sin(l+.5*o)]);}return [u,h]}function F(t,e,r,n,a,s,o,i,h){var u=s+z(.1,h),p=[];p.push([z(i,h)+e+.9*n*Math.cos(u-t),z(i,h)+r+.9*a*Math.sin(u-t)]);for(var c=u;c<=o;c+=t)p.push([z(i,h)+e+n*Math.cos(c),z(i,h)+r+a*Math.sin(c)]);return p.push([e+n*Math.cos(o),r+a*Math.sin(o)]),p.push([e+n*Math.cos(o),r+a*Math.sin(o)]),R(p,null,h)}function V(t){return [...t]}function Z(t,e){return Math.pow(t[0]-e[0],2)+Math.pow(t[1]-e[1],2)}function Q(t,e,r){const n=Z(e,r);if(0===n)return Z(t,e);let a=((t[0]-e[0])*(r[0]-e[0])+(t[1]-e[1])*(r[1]-e[1]))/n;return a=Math.max(0,Math.min(1,a)),Z(t,H(e,r,a))}function H(t,e,r){return [t[0]+(e[0]-t[0])*r,t[1]+(e[1]-t[1])*r]}function $(t,e,r,n){const a=n||[];if(function(t,e){const r=t[e+0],n=t[e+1],a=t[e+2],s=t[e+3];let o=3*n[0]-2*r[0]-s[0];o*=o;let i=3*n[1]-2*r[1]-s[1];i*=i;let h=3*a[0]-2*s[0]-r[0];h*=h;let u=3*a[1]-2*s[1]-r[1];return u*=u,o<h&&(o=h),i<u&&(i=u),o+i}(t,e)<r){const r=t[e+0];if(a.length){(s=a[a.length-1],o=r,Math.sqrt(Z(s,o)))>1&&a.push(r);}else a.push(r);a.push(t[e+3]);}else {const n=.5,s=t[e+0],o=t[e+1],i=t[e+2],h=t[e+3],u=H(s,o,n),p=H(o,i,n),c=H(i,h,n),l=H(u,p,n),f=H(p,c,n),d=H(l,f,n);$([s,u,l,d],0,r,a),$([d,f,c,h],0,r,a);}var s,o;return a}function N(t,e){return B(t,0,t.length,e)}function B(t,e,r,n,a){const s=a||[],o=t[e],i=t[r-1];let h=0,u=1;for(let n=e+1;n<r-1;++n){const e=Q(t[n],o,i);e>h&&(h=e,u=n);}return Math.sqrt(h)>n?(B(t,e,u+1,n,s),B(t,u,r,n,s)):(s.length||s.push(o),s.push(i)),s}function J(t,e=.15,r){const n=[],a=(t.length-1)/3;for(let r=0;r<a;r++){$(t,3*r,e,n);}return r&&r>0?B(n,0,n.length,r):n}var K="none",U=function(){function t(t){this.defaultOptions={maxRandomnessOffset:2,roughness:1,bowing:1,stroke:"#000",strokeWidth:1,curveTightness:0,curveFitting:.95,curveStepCount:9,fillStyle:"hachure",fillWeight:-1,hachureAngle:-41,hachureGap:-1,dashOffset:-1,dashGap:-1,zigzagOffset:-1,seed:0,disableMultiStroke:!1,disableMultiStrokeFill:!1,preserveVertices:!1},this.config=t||{},this.config.options&&(this.defaultOptions=this._o(this.config.options));}return t.newSeed=function(){return Math.floor(Math.random()*Math.pow(2,31))},t.prototype._o=function(t){return t?Object.assign({},this.defaultOptions,t):this.defaultOptions},t.prototype._d=function(t,e,r){return {shape:t,sets:e||[],options:r||this.defaultOptions}},t.prototype.line=function(t,e,r,n,a){var s=this._o(a);return this._d("line",[P(t,e,r,n,s)],s)},t.prototype.rectangle=function(t,e,r,n,a){var s=this._o(a),o=[],i=O(t,e,r,n,s);if(s.fill){var h=[[t,e],[t+r,e],[t+r,e+n],[t,e+n]];"solid"===s.fillStyle?o.push(A([h],s)):o.push(I([h],s));}return s.stroke!==K&&o.push(i),this._d("rectangle",o,s)},t.prototype.ellipse=function(t,e,r,n,a){var s=this._o(a),o=[],i=L(r,n,s),h=T(t,e,s,i);if(s.fill)if("solid"===s.fillStyle){var u=T(t,e,s,i).opset;u.type="fillPath",o.push(u);}else o.push(I([h.estimatedPoints],s));return s.stroke!==K&&o.push(h.opset),this._d("ellipse",o,s)},t.prototype.circle=function(t,e,r,n){var a=this.ellipse(t,e,r,r,n);return a.shape="circle",a},t.prototype.linearPath=function(t,e){var r=this._o(e);return this._d("linearPath",[x(t,!1,r)],r)},t.prototype.arc=function(t,e,n,a,s,o,i,h){void 0===i&&(i=!1);var u=this._o(h),p=[],c=_(t,e,n,a,s,o,i,!0,u);if(i&&u.fill)if("solid"===u.fillStyle){var l=r({},u);l.disableMultiStroke=!0;var f=_(t,e,n,a,s,o,!0,!1,l);f.type="fillPath",p.push(f);}else p.push(function(t,e,r,n,a,s,o){var i=t,h=e,u=Math.abs(r/2),p=Math.abs(n/2);u+=z(.01*u,o),p+=z(.01*p,o);for(var c=a,l=s;c<0;)c+=2*Math.PI,l+=2*Math.PI;l-c>2*Math.PI&&(c=0,l=2*Math.PI);for(var f=(l-c)/o.curveStepCount,d=[],v=c;v<=l;v+=f)d.push([i+u*Math.cos(v),h+p*Math.sin(v)]);return d.push([i+u*Math.cos(l),h+p*Math.sin(l)]),d.push([i,h]),I([d],o)}(t,e,n,a,s,o,u));return u.stroke!==K&&p.push(c),this._d("arc",p,u)},t.prototype.curve=function(t,e){var r=this._o(e),n=[],a=S(t,r);if(r.fill&&r.fill!==K&&t.length>=3){var s=J(function(t,e=0){const r=t.length;if(r<3)throw new Error("A curve must have at least three points.");const n=[];if(3===r)n.push(V(t[0]),V(t[1]),V(t[2]),V(t[2]));else {const r=[];r.push(t[0],t[0]);for(let e=1;e<t.length;e++)r.push(t[e]),e===t.length-1&&r.push(t[e]);const a=[],s=1-e;n.push(V(r[0]));for(let t=1;t+2<r.length;t++){const e=r[t];a[0]=[e[0],e[1]],a[1]=[e[0]+(s*r[t+1][0]-s*r[t-1][0])/6,e[1]+(s*r[t+1][1]-s*r[t-1][1])/6],a[2]=[r[t+1][0]+(s*r[t][0]-s*r[t+2][0])/6,r[t+1][1]+(s*r[t][1]-s*r[t+2][1])/6],a[3]=[r[t+1][0],r[t+1][1]],n.push(a[1],a[2],a[3]);}}return n}(t),10,(1+r.roughness)/2);"solid"===r.fillStyle?n.push(A([s],r)):n.push(I([s],r));}return r.stroke!==K&&n.push(a),this._d("curve",n,r)},t.prototype.polygon=function(t,e){var r=this._o(e),n=[],a=x(t,!0,r);return r.fill&&("solid"===r.fillStyle?n.push(A([t],r)):n.push(I([t],r))),r.stroke!==K&&n.push(a),this._d("polygon",n,r)},t.prototype.path=function(t,e){var r=this._o(e),n=[];if(!t)return this._d("path",n,r);t=(t||"").replace(/\n/g," ").replace(/(-\s)/g,"-").replace("/(ss)/g"," ");var a=r.fill&&"transparent"!==r.fill&&r.fill!==K,s=r.stroke!==K,o=!!(r.simplification&&r.simplification<1),i=function(t,e,r){const n=k(M(y(t))),a=[];let s=[],o=[0,0],i=[];const h=()=>{i.length>=4&&s.push(...J(i,e)),i=[];},u=()=>{h(),s.length&&(a.push(s),s=[]);};for(const{key:t,data:e}of n)switch(t){case"M":u(),o=[e[0],e[1]],s.push(o);break;case"L":h(),s.push([e[0],e[1]]);break;case"C":if(!i.length){const t=s.length?s[s.length-1]:o;i.push([t[0],t[1]]);}i.push([e[0],e[1]]),i.push([e[2],e[3]]),i.push([e[4],e[5]]);break;case"Z":h(),s.push([o[0],o[1]]);}if(u(),!r)return a;const p=[];for(const t of a){const e=N(t,r);e.length&&p.push(e);}return p}(t,1,o?4-4*r.simplification:(1+r.roughness)/2);return a&&("solid"===r.fillStyle?n.push(A(i,r)):n.push(I(i,r))),s&&(o?i.forEach((function(t){n.push(x(t,!1,r));})):n.push(D(t,r))),this._d("path",n,r)},t.prototype.opsToPath=function(t,e){for(var r="",n=0,a=t.ops;n<a.length;n++){var s=a[n],o="number"==typeof e&&e>=0?s.data.map((function(t){return +t.toFixed(e)})):s.data;switch(s.op){case"move":r+="M".concat(o[0]," ").concat(o[1]," ");break;case"bcurveTo":r+="C".concat(o[0]," ").concat(o[1],", ").concat(o[2]," ").concat(o[3],", ").concat(o[4]," ").concat(o[5]," ");break;case"lineTo":r+="L".concat(o[0]," ").concat(o[1]," ");}}return r.trim()},t.prototype.toPaths=function(t){for(var e=t.sets||[],r=t.options||this.defaultOptions,n=[],a=0,s=e;a<s.length;a++){var o=s[a],i=null;switch(o.type){case"path":i={d:this.opsToPath(o),stroke:r.stroke,strokeWidth:r.strokeWidth,fill:K};break;case"fillPath":i={d:this.opsToPath(o),stroke:K,strokeWidth:0,fill:r.fill||K};break;case"fillSketch":i=this.fillSketch(o,r);}i&&n.push(i);}return n},t.prototype.fillSketch=function(t,e){var r=e.fillWeight;return r<0&&(r=e.strokeWidth/2),{d:this.opsToPath(t),stroke:e.fill||K,strokeWidth:r,fill:K}},t}(),X=function(){function t(t,e){this.canvas=t,this.ctx=this.canvas.getContext("2d"),this.gen=new U(e);}return t.prototype.draw=function(t){for(var e=t.sets||[],r=t.options||this.getDefaultOptions(),n=this.ctx,a=t.options.fixedDecimalPlaceDigits,s=0,o=e;s<o.length;s++){var i=o[s];switch(i.type){case"path":n.save(),n.strokeStyle="none"===r.stroke?"transparent":r.stroke,n.lineWidth=r.strokeWidth,r.strokeLineDash&&n.setLineDash(r.strokeLineDash),r.strokeLineDashOffset&&(n.lineDashOffset=r.strokeLineDashOffset),this._drawToContext(n,i,a),n.restore();break;case"fillPath":n.save(),n.fillStyle=r.fill||"";var h="curve"===t.shape||"polygon"===t.shape||"path"===t.shape?"evenodd":"nonzero";this._drawToContext(n,i,a,h),n.restore();break;case"fillSketch":this.fillSketch(n,i,r);}}},t.prototype.fillSketch=function(t,e,r){var n=r.fillWeight;n<0&&(n=r.strokeWidth/2),t.save(),r.fillLineDash&&t.setLineDash(r.fillLineDash),r.fillLineDashOffset&&(t.lineDashOffset=r.fillLineDashOffset),t.strokeStyle=r.fill||"",t.lineWidth=n,this._drawToContext(t,e,r.fixedDecimalPlaceDigits),t.restore();},t.prototype._drawToContext=function(t,e,r,n){void 0===n&&(n="nonzero"),t.beginPath();for(var a=0,s=e.ops;a<s.length;a++){var o=s[a],i="number"==typeof r&&r>=0?o.data.map((function(t){return +t.toFixed(r)})):o.data;switch(o.op){case"move":t.moveTo(i[0],i[1]);break;case"bcurveTo":t.bezierCurveTo(i[0],i[1],i[2],i[3],i[4],i[5]);break;case"lineTo":t.lineTo(i[0],i[1]);}}"fillPath"===e.type?t.fill(n):t.stroke();},Object.defineProperty(t.prototype,"generator",{get:function(){return this.gen},enumerable:!1,configurable:!0}),t.prototype.getDefaultOptions=function(){return this.gen.defaultOptions},t.prototype.line=function(t,e,r,n,a){var s=this.gen.line(t,e,r,n,a);return this.draw(s),s},t.prototype.rectangle=function(t,e,r,n,a){var s=this.gen.rectangle(t,e,r,n,a);return this.draw(s),s},t.prototype.ellipse=function(t,e,r,n,a){var s=this.gen.ellipse(t,e,r,n,a);return this.draw(s),s},t.prototype.circle=function(t,e,r,n){var a=this.gen.circle(t,e,r,n);return this.draw(a),a},t.prototype.linearPath=function(t,e){var r=this.gen.linearPath(t,e);return this.draw(r),r},t.prototype.polygon=function(t,e){var r=this.gen.polygon(t,e);return this.draw(r),r},t.prototype.arc=function(t,e,r,n,a,s,o,i){void 0===o&&(o=!1);var h=this.gen.arc(t,e,r,n,a,s,o,i);return this.draw(h),h},t.prototype.curve=function(t,e){var r=this.gen.curve(t,e);return this.draw(r),r},t.prototype.path=function(t,e){var r=this.gen.path(t,e);return this.draw(r),r},t}(),Y="http://www.w3.org/2000/svg",tt=function(){function t(t,e){this.svg=t,this.gen=new U(e);}return t.prototype.draw=function(t){for(var e=t.sets||[],r=t.options||this.getDefaultOptions(),n=this.svg.ownerDocument||window.document,a=n.createElementNS(Y,"g"),s=t.options.fixedDecimalPlaceDigits,o=0,i=e;o<i.length;o++){var h=i[o],u=null;switch(h.type){case"path":(u=n.createElementNS(Y,"path")).setAttribute("d",this.opsToPath(h,s)),u.setAttribute("stroke",r.stroke),u.setAttribute("stroke-width",r.strokeWidth+""),u.setAttribute("fill","none"),r.strokeLineDash&&u.setAttribute("stroke-dasharray",r.strokeLineDash.join(" ").trim()),r.strokeLineDashOffset&&u.setAttribute("stroke-dashoffset","".concat(r.strokeLineDashOffset));break;case"fillPath":(u=n.createElementNS(Y,"path")).setAttribute("d",this.opsToPath(h,s)),u.setAttribute("stroke","none"),u.setAttribute("stroke-width","0"),u.setAttribute("fill",r.fill||""),"curve"!==t.shape&&"polygon"!==t.shape||u.setAttribute("fill-rule","evenodd");break;case"fillSketch":u=this.fillSketch(n,h,r);}u&&a.appendChild(u);}return a},t.prototype.fillSketch=function(t,e,r){var n=r.fillWeight;n<0&&(n=r.strokeWidth/2);var a=t.createElementNS(Y,"path");return a.setAttribute("d",this.opsToPath(e,r.fixedDecimalPlaceDigits)),a.setAttribute("stroke",r.fill||""),a.setAttribute("stroke-width",n+""),a.setAttribute("fill","none"),r.fillLineDash&&a.setAttribute("stroke-dasharray",r.fillLineDash.join(" ").trim()),r.fillLineDashOffset&&a.setAttribute("stroke-dashoffset","".concat(r.fillLineDashOffset)),a},Object.defineProperty(t.prototype,"generator",{get:function(){return this.gen},enumerable:!1,configurable:!0}),t.prototype.getDefaultOptions=function(){return this.gen.defaultOptions},t.prototype.opsToPath=function(t,e){return this.gen.opsToPath(t,e)},t.prototype.line=function(t,e,r,n,a){var s=this.gen.line(t,e,r,n,a);return this.draw(s)},t.prototype.rectangle=function(t,e,r,n,a){var s=this.gen.rectangle(t,e,r,n,a);return this.draw(s)},t.prototype.ellipse=function(t,e,r,n,a){var s=this.gen.ellipse(t,e,r,n,a);return this.draw(s)},t.prototype.circle=function(t,e,r,n){var a=this.gen.circle(t,e,r,n);return this.draw(a)},t.prototype.linearPath=function(t,e){var r=this.gen.linearPath(t,e);return this.draw(r)},t.prototype.polygon=function(t,e){var r=this.gen.polygon(t,e);return this.draw(r)},t.prototype.arc=function(t,e,r,n,a,s,o,i){void 0===o&&(o=!1);var h=this.gen.arc(t,e,r,n,a,s,o,i);return this.draw(h)},t.prototype.curve=function(t,e){var r=this.gen.curve(t,e);return this.draw(r)},t.prototype.path=function(t,e){var r=this.gen.path(t,e);return this.draw(r)},t}(),et={canvas:function(t,e){return new X(t,e)},svg:function(t,e){return new tt(t,e)},generator:function(t){return new U(t)},newSeed:function(){return U.newSeed()}};var rough_cjs=et;

    /* src/App.svelte generated by Svelte v3.44.3 */

    const { console: console_1 } = globals;
    const file = "src/App.svelte";

    function create_fragment(ctx) {
    	let section0;
    	let div8;
    	let div0;
    	let dropzone;
    	let t0;
    	let div7;
    	let div2;
    	let div1;
    	let t1;
    	let t2;
    	let t3;
    	let slider0;
    	let t4;
    	let div4;
    	let div3;
    	let t5;
    	let t6;
    	let t7;
    	let slider1;
    	let t8;
    	let div6;
    	let div5;
    	let t9;
    	let t10;
    	let t11;
    	let slider2;
    	let t12;
    	let section1;
    	let main;
    	let div9;
    	let svg;
    	let current;

    	dropzone = new Dropzone({
    			props: { multiple: false, accept: "image/svg+xml" },
    			$$inline: true
    		});

    	dropzone.$on("drop", /*handleFilesSelect*/ ctx[5]);

    	slider0 = new Slider({
    			props: {
    				value: [0, /*roughness*/ ctx[0] / 5],
    				single: true
    			},
    			$$inline: true
    		});

    	slider0.$on("change", /*change_handler*/ ctx[7]);

    	slider1 = new Slider({
    			props: {
    				value: [0, /*bowing*/ ctx[1] / 5],
    				single: true
    			},
    			$$inline: true
    		});

    	slider1.$on("change", /*change_handler_1*/ ctx[8]);

    	slider2 = new Slider({
    			props: {
    				value: [0, /*simplification*/ ctx[2] / 5],
    				single: true
    			},
    			$$inline: true
    		});

    	slider2.$on("change", /*change_handler_2*/ ctx[9]);
    	let svg_levels = [/*svgArgs*/ ctx[4]];
    	let svg_data = {};

    	for (let i = 0; i < svg_levels.length; i += 1) {
    		svg_data = assign(svg_data, svg_levels[i]);
    	}

    	const block = {
    		c: function create() {
    			section0 = element("section");
    			div8 = element("div");
    			div0 = element("div");
    			create_component(dropzone.$$.fragment);
    			t0 = space();
    			div7 = element("div");
    			div2 = element("div");
    			div1 = element("div");
    			t1 = text("roughness: ");
    			t2 = text(/*roughness*/ ctx[0]);
    			t3 = space();
    			create_component(slider0.$$.fragment);
    			t4 = space();
    			div4 = element("div");
    			div3 = element("div");
    			t5 = text("bowing: ");
    			t6 = text(/*bowing*/ ctx[1]);
    			t7 = space();
    			create_component(slider1.$$.fragment);
    			t8 = space();
    			div6 = element("div");
    			div5 = element("div");
    			t9 = text("simplification: ");
    			t10 = text(/*simplification*/ ctx[2]);
    			t11 = space();
    			create_component(slider2.$$.fragment);
    			t12 = space();
    			section1 = element("section");
    			main = element("main");
    			div9 = element("div");
    			svg = svg_element("svg");
    			attr_dev(div0, "class", "block");
    			add_location(div0, file, 124, 8, 4345);
    			add_location(div1, file, 129, 16, 4558);
    			attr_dev(div2, "class", "column");
    			add_location(div2, file, 128, 12, 4521);
    			add_location(div3, file, 137, 16, 4854);
    			attr_dev(div4, "class", "column");
    			add_location(div4, file, 136, 12, 4817);
    			add_location(div5, file, 145, 16, 5138);
    			attr_dev(div6, "class", "column");
    			add_location(div6, file, 144, 12, 5101);
    			attr_dev(div7, "class", "columns block");
    			add_location(div7, file, 127, 8, 4481);
    			attr_dev(div8, "class", "container");
    			add_location(div8, file, 123, 4, 4313);
    			attr_dev(section0, "class", "section svelte-ea1nut");
    			add_location(section0, file, 122, 0, 4283);
    			set_svg_attributes(svg, svg_data);
    			toggle_class(svg, "svelte-ea1nut", true);
    			add_location(svg, file, 158, 12, 5559);
    			set_style(div9, "margin-top", "20px");
    			add_location(div9, file, 157, 8, 5515);
    			set_style(main, "text-align", "center");
    			add_location(main, file, 156, 4, 5472);
    			attr_dev(section1, "class", "section svelte-ea1nut");
    			add_location(section1, file, 155, 0, 5442);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, section0, anchor);
    			append_dev(section0, div8);
    			append_dev(div8, div0);
    			mount_component(dropzone, div0, null);
    			append_dev(div8, t0);
    			append_dev(div8, div7);
    			append_dev(div7, div2);
    			append_dev(div2, div1);
    			append_dev(div1, t1);
    			append_dev(div1, t2);
    			append_dev(div2, t3);
    			mount_component(slider0, div2, null);
    			append_dev(div7, t4);
    			append_dev(div7, div4);
    			append_dev(div4, div3);
    			append_dev(div3, t5);
    			append_dev(div3, t6);
    			append_dev(div4, t7);
    			mount_component(slider1, div4, null);
    			append_dev(div7, t8);
    			append_dev(div7, div6);
    			append_dev(div6, div5);
    			append_dev(div5, t9);
    			append_dev(div5, t10);
    			append_dev(div6, t11);
    			mount_component(slider2, div6, null);
    			insert_dev(target, t12, anchor);
    			insert_dev(target, section1, anchor);
    			append_dev(section1, main);
    			append_dev(main, div9);
    			append_dev(div9, svg);
    			/*svg_binding*/ ctx[10](svg);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (!current || dirty & /*roughness*/ 1) set_data_dev(t2, /*roughness*/ ctx[0]);
    			const slider0_changes = {};
    			if (dirty & /*roughness*/ 1) slider0_changes.value = [0, /*roughness*/ ctx[0] / 5];
    			slider0.$set(slider0_changes);
    			if (!current || dirty & /*bowing*/ 2) set_data_dev(t6, /*bowing*/ ctx[1]);
    			const slider1_changes = {};
    			if (dirty & /*bowing*/ 2) slider1_changes.value = [0, /*bowing*/ ctx[1] / 5];
    			slider1.$set(slider1_changes);
    			if (!current || dirty & /*simplification*/ 4) set_data_dev(t10, /*simplification*/ ctx[2]);
    			const slider2_changes = {};
    			if (dirty & /*simplification*/ 4) slider2_changes.value = [0, /*simplification*/ ctx[2] / 5];
    			slider2.$set(slider2_changes);
    			set_svg_attributes(svg, svg_data = get_spread_update(svg_levels, [dirty & /*svgArgs*/ 16 && /*svgArgs*/ ctx[4]]));
    			toggle_class(svg, "svelte-ea1nut", true);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(dropzone.$$.fragment, local);
    			transition_in(slider0.$$.fragment, local);
    			transition_in(slider1.$$.fragment, local);
    			transition_in(slider2.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(dropzone.$$.fragment, local);
    			transition_out(slider0.$$.fragment, local);
    			transition_out(slider1.$$.fragment, local);
    			transition_out(slider2.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(section0);
    			destroy_component(dropzone);
    			destroy_component(slider0);
    			destroy_component(slider1);
    			destroy_component(slider2);
    			if (detaching) detach_dev(t12);
    			if (detaching) detach_dev(section1);
    			/*svg_binding*/ ctx[10](null);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('App', slots, []);
    	let svgEl;
    	let svgArgs = { width: 0, height: 0 };
    	let lastSvg;
    	let roughness = 1;
    	let bowing = 1;
    	let simplification = 0;

    	function handleFilesSelect(e) {
    		const { acceptedFiles } = e.detail;
    		const reader = new FileReader();

    		reader.onload = () => {
    			$$invalidate(6, lastSvg = reader.result);
    			svgToRough(lastSvg);
    		};

    		reader.readAsText(acceptedFiles[0]);
    	}

    	function svgToRough(svgString) {
    		const domParser = new DOMParser();
    		$$invalidate(3, svgEl.innerHTML = '', svgEl);
    		const svgDom = domParser.parseFromString(svgString, 'image/svg+xml');
    		const svgSrc = svgDom.documentElement;
    		const svgTarget = svgEl;

    		$$invalidate(4, svgArgs = {
    			width: +svgSrc.attributes.width.nodeValue,
    			height: +svgSrc.attributes.height.nodeValue,
    			xmlns: svgSrc.attributes.xmlns.nodeValue
    		});

    		const roughSvg = rough_cjs.svg(svgEl);
    		walk(svgTarget, svgSrc);

    		function walk(root, element) {
    			if (!element) return;
    			const opts = getStyle(element);

    			if (element.nodeName === 'text') {
    				const txt = element.cloneNode(true);
    				appendChild(root, element, txt);
    				return;
    			}

    			if (element.nodeName === 'rect') {
    				const [x, y, w, h] = attrs(element, 'x', 'y', 'width', 'height');
    				appendChild(root, element, roughSvg.rectangle(x, y, w, h, opts));
    				return;
    			}

    			if (element.nodeName === 'circle') {
    				const [x, y, r] = attrs(element, 'x', 'y', 'r');
    				appendChild(root, element, roughSvg.circle(x, y, r * 2, opts));
    				return;
    			}

    			if (element.nodeName === 'path') {
    				const d = element.getAttribute('d');
    				appendChild(root, element, roughSvg.path(d, opts));
    				return;
    			}

    			if (element.nodeName === 'line') {
    				element.getAttribute('d');
    				const [x1, y1, x2, y2] = attrs(element, 'x1', 'y1', 'x2', 'y2');
    				appendChild(root, element, roughSvg.line(x1, y1, x2, y2, opts));
    				return;
    			}

    			if (element.nodeName === 'g') {
    				const g = element.cloneNode(false);
    				appendChild(root, element, g);
    				root = g;
    			} else {
    				console.log(element.nodeName);
    			}

    			if (element.children.length) {
    				for (const child of element.children) {
    					walk(root, child);
    				}
    			}
    		}

    		function getStyle(el) {
    			let { fill, stroke, strokeWidth, opacity } = el.style || {};
    			const hasFill = fill && fill !== 'none';
    			const hasStroke = stroke && stroke !== 'none';
    			if (opacity === '') opacity = 1;

    			return {
    				roughness,
    				bowing,
    				simplification,
    				fill: fill && fill !== 'none' ? fill : 'none',
    				stroke: hasStroke ? stroke : 'none',
    				...hasFill
    				? {
    						fillWeight: opacity < 0.5 ? 0.5 : opacity < 0.8 ? 1.4 : 2,
    						hachureAngle: [-41, 49][Math.round(Math.random())],
    						fillStyle: opacity < 0.4 ? 'hachure' : 'zigzag'
    					}
    				: {},
    				...hasStroke
    				? {
    						strokeWidth: +strokeWidth.replace('px', '') || 1
    					}
    				: {}
    			};
    		}

    		function appendChild(root, src, newEl) {
    			newEl.setAttribute('transform', src.getAttribute('transform') || '');
    			root.appendChild(newEl);
    		}

    		function attrs(el, ...attrs) {
    			return attrs.map(key => +el.getAttribute(key));
    		}
    	}

    	onMount(() => {
    		
    	});

    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console_1.warn(`<App> was created with unknown prop '${key}'`);
    	});

    	const change_handler = event => $$invalidate(0, roughness = event.detail[1] * 5);
    	const change_handler_1 = event => $$invalidate(1, bowing = event.detail[1] * 5);
    	const change_handler_2 = event => $$invalidate(2, simplification = event.detail[1] * 5);

    	function svg_binding($$value) {
    		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
    			svgEl = $$value;
    			$$invalidate(3, svgEl);
    		});
    	}

    	$$self.$capture_state = () => ({
    		Dropzone,
    		Slider,
    		rough: rough_cjs,
    		onMount,
    		svgEl,
    		svgArgs,
    		lastSvg,
    		roughness,
    		bowing,
    		simplification,
    		handleFilesSelect,
    		svgToRough
    	});

    	$$self.$inject_state = $$props => {
    		if ('svgEl' in $$props) $$invalidate(3, svgEl = $$props.svgEl);
    		if ('svgArgs' in $$props) $$invalidate(4, svgArgs = $$props.svgArgs);
    		if ('lastSvg' in $$props) $$invalidate(6, lastSvg = $$props.lastSvg);
    		if ('roughness' in $$props) $$invalidate(0, roughness = $$props.roughness);
    		if ('bowing' in $$props) $$invalidate(1, bowing = $$props.bowing);
    		if ('simplification' in $$props) $$invalidate(2, simplification = $$props.simplification);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*lastSvg, roughness, bowing, simplification*/ 71) {
    			{
    				if (lastSvg) {
    					svgToRough(lastSvg);
    				}
    			}
    		}
    	};

    	return [
    		roughness,
    		bowing,
    		simplification,
    		svgEl,
    		svgArgs,
    		handleFilesSelect,
    		lastSvg,
    		change_handler,
    		change_handler_1,
    		change_handler_2,
    		svg_binding
    	];
    }

    class App extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance, create_fragment, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "App",
    			options,
    			id: create_fragment.name
    		});
    	}
    }

    const app = new App({
    	target: document.body,
    	props: {
    		name: 'world'
    	}
    });

    return app;

})();
//# sourceMappingURL=bundle.js.map
