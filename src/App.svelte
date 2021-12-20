<script>
    import Dropzone from 'svelte-file-dropzone';
    import Slider from 'svelte-slider';
    import rough from 'roughjs/bundled/rough.cjs.js';
    import { onMount } from 'svelte';

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
            lastSvg = reader.result;
            svgToRough(lastSvg);
        };
        reader.readAsText(acceptedFiles[0]);
    }

    function svgToRough(svgString) {
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

            return {
                roughness,
                bowing,
                simplification,
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

    $: {
        if (lastSvg) {
            svgToRough(lastSvg, { roughness, bowing, simplification });
        }
    }
</script>

<section class="section">
    <div class="container">
        <div class="block">
            <Dropzone multiple={false} accept="image/svg+xml" on:drop={handleFilesSelect} />
        </div>
        <div class="columns block">
            <div class="column">
                <div>roughness: {roughness}</div>
                <Slider
                    on:change={(event) => (roughness = event.detail[1] * 5)}
                    value={[0, roughness / 5]}
                    single
                />
            </div>
            <div class="column">
                <div>bowing: {bowing}</div>
                <Slider
                    on:change={(event) => (bowing = event.detail[1] * 5)}
                    value={[0, bowing / 5]}
                    single
                />
            </div>
            <div class="column">
                <div>simplification: {simplification}</div>
                <Slider
                    on:change={(event) => (simplification = event.detail[1] * 5)}
                    value={[0, simplification / 5]}
                    single
                />
            </div>
        </div>
    </div>
</section>
<section class="section">
    <main style="text-align: center;">
        <div style="margin-top: 20px;">
            <svg bind:this={svgEl} {...svgArgs} />
        </div>

        <!-- {@html lastSvg || ''} -->
    </main>
</section>

<style>
    svg :global(text),
    svg :global(tspan) {
        font-family: 'Patrick Hand', cursive !important;
    }

    section {
        --sliderPrimary: #ff9800;
        --sliderSecondary: rgba(0, 0, 0, 0.05);
        margin: 16px;
    }
</style>
