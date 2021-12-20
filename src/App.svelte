<script>
    import Dropzone from 'svelte-file-dropzone';
    import rough from 'roughjs/bundled/rough.cjs.js';
    import { onMount } from 'svelte';

    let svgEl;
    let svgArgs = { width: 0, height: 0 };
    let origSvg;

    function handleFilesSelect(e) {
        const { acceptedFiles } = e.detail;
        const reader = new FileReader();
        reader.onload = () => {
            svgToRough(reader.result);
        };
        reader.readAsText(acceptedFiles[0]);
    }

    function svgToRough(svgString) {
        origSvg = svgString;
        const domParser = new DOMParser();
        svgEl.innerHTML = '';
        const svgDom = domParser.parseFromString(svgString, 'image/svg+xml');

        const svgSrc = svgDom.documentElement;
        const svgTarget = svgEl;
        svgArgs = {
            width: +svgSrc.attributes.width.nodeValue,
            height: +svgSrc.attributes.height.nodeValue,
            xmlns: svgSrc.attributes.xmlns.nodeValue,
        };
        const roughSvg = rough.svg(svgEl);

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
            if (element.nodeName === 'path') {
                const d = element.getAttribute('d');
                appendChild(root, element, roughSvg.path(d, opts));
                return;
            }
            if (element.nodeName === 'line') {
                const d = element.getAttribute('d');
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
            if (hasFill) console.log({ opacity });

            return {
                fill: fill && fill !== 'none' ? fill : 'none',
                stroke: hasStroke ? stroke : 'none',
                ...(hasFill
                    ? {
                          fillWeight: opacity < 0.5 ? 0.5 : opacity < 0.8 ? 1.4 : 2,
                          hachureAngle: [-41, 49][Math.round(Math.random())],
                          fillStyle: opacity < 0.4 ? 'hachure' : 'zigzag',
                      }
                    : {}),
                ...(hasStroke ? { strokeWidth: +strokeWidth.replace('px', '') || 1 } : {}),
            };
        }
        function appendChild(root, src, newEl) {
            newEl.setAttribute('transform', src.getAttribute('transform') || '');
            root.appendChild(newEl);
        }
        function attrs(el, ...attrs) {
            return attrs.map((key) => +el.getAttribute(key));
        }
    }

    onMount(() => {});
</script>

<Dropzone multiple={false} accept="image/svg+xml" on:drop={handleFilesSelect} />
<main style="text-align: center;">
    <div style="margin-top: 20px;">
        <svg bind:this={svgEl} {...svgArgs} />
    </div>

    <!-- {@html origSvg || ''} -->
</main>

<style>
    svg {
    }
    svg :global(text),
    svg :global(tspan) {
        font-family: 'Patrick Hand', cursive !important;
    }
</style>
