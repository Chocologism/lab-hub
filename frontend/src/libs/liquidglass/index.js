// src/defaults.ts
var DEFAULTS = {
  blurAmount: 0.25,
  refraction: 0.3,
  chromAberration: 0.04,
  edgeHighlight: 0.08,
  specular: 0.1,
  fresnel: 0.28,
  distortion: 0,
  cornerRadius: 20,
  zRadius: 20,
  opacity: 0.72,
  saturation: 0,
  tintStrength: 0,
  brightness: 0.0,
  shadowOpacity: 0.0,
  shadowSpread: 0,
  shadowOffsetY: 0,
  floating: false,
  button: true,
  bevelMode: 0
};
var BLUR_ITERATIONS = 6;
var SHADOW_PAD = 20;

// node_modules/html-to-image/es/util.js
function resolveUrl(url, baseUrl) {
  if (url.match(/^[a-z]+:\/\//i)) {
    return url;
  }
  if (url.match(/^\/\//)) {
    return window.location.protocol + url;
  }
  if (url.match(/^[a-z]+:/i)) {
    return url;
  }
  const doc = document.implementation.createHTMLDocument();
  const base = doc.createElement("base");
  const a = doc.createElement("a");
  doc.head.appendChild(base);
  doc.body.appendChild(a);
  if (baseUrl) {
    base.href = baseUrl;
  }
  a.href = url;
  return a.href;
}
var uuid = /* @__PURE__ */ (() => {
  let counter = 0;
  const random = () => (
    // eslint-disable-next-line no-bitwise
    `0000${(Math.random() * 36 ** 4 << 0).toString(36)}`.slice(-4)
  );
  return () => {
    counter += 1;
    return `u${random()}${counter}`;
  };
})();
function toArray(arrayLike) {
  const arr = [];
  for (let i = 0, l = arrayLike.length; i < l; i++) {
    arr.push(arrayLike[i]);
  }
  return arr;
}
var styleProps = null;
function getStyleProperties(options = {}) {
  if (styleProps) {
    return styleProps;
  }
  if (options.includeStyleProperties) {
    styleProps = options.includeStyleProperties;
    return styleProps;
  }
  styleProps = toArray(window.getComputedStyle(document.documentElement));
  return styleProps;
}
function px(node, styleProperty) {
  const win = node.ownerDocument.defaultView || window;
  const val = win.getComputedStyle(node).getPropertyValue(styleProperty);
  return val ? parseFloat(val.replace("px", "")) : 0;
}
function getNodeWidth(node) {
  const leftBorder = px(node, "border-left-width");
  const rightBorder = px(node, "border-right-width");
  return node.clientWidth + leftBorder + rightBorder;
}
function getNodeHeight(node) {
  const topBorder = px(node, "border-top-width");
  const bottomBorder = px(node, "border-bottom-width");
  return node.clientHeight + topBorder + bottomBorder;
}
function getImageSize(targetNode, options = {}) {
  const width = options.width || getNodeWidth(targetNode);
  const height = options.height || getNodeHeight(targetNode);
  return { width, height };
}
function getPixelRatio() {
  let ratio;
  let FINAL_PROCESS;
  try {
    FINAL_PROCESS = process;
  } catch (e) {
  }
  const val = FINAL_PROCESS && FINAL_PROCESS.env ? FINAL_PROCESS.env.devicePixelRatio : null;
  if (val) {
    ratio = parseInt(val, 10);
    if (Number.isNaN(ratio)) {
      ratio = 1;
    }
  }
  return ratio || window.devicePixelRatio || 1;
}
var canvasDimensionLimit = 16384;
function checkCanvasDimensions(canvas) {
  if (canvas.width > canvasDimensionLimit || canvas.height > canvasDimensionLimit) {
    if (canvas.width > canvasDimensionLimit && canvas.height > canvasDimensionLimit) {
      if (canvas.width > canvas.height) {
        canvas.height *= canvasDimensionLimit / canvas.width;
        canvas.width = canvasDimensionLimit;
      } else {
        canvas.width *= canvasDimensionLimit / canvas.height;
        canvas.height = canvasDimensionLimit;
      }
    } else if (canvas.width > canvasDimensionLimit) {
      canvas.height *= canvasDimensionLimit / canvas.width;
      canvas.width = canvasDimensionLimit;
    } else {
      canvas.width *= canvasDimensionLimit / canvas.height;
      canvas.height = canvasDimensionLimit;
    }
  }
}
function createImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      img.decode().then(() => {
        requestAnimationFrame(() => resolve(img));
      });
    };
    img.onerror = reject;
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.src = url;
  });
}
async function svgToDataURL(svg) {
  return Promise.resolve().then(() => new XMLSerializer().serializeToString(svg)).then(encodeURIComponent).then((html) => `data:image/svg+xml;charset=utf-8,${html}`);
}
async function nodeToDataURL(node, width, height) {
  const xmlns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(xmlns, "svg");
  const foreignObject = document.createElementNS(xmlns, "foreignObject");
  svg.setAttribute("width", `${width}`);
  svg.setAttribute("height", `${height}`);
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  foreignObject.setAttribute("width", "100%");
  foreignObject.setAttribute("height", "100%");
  foreignObject.setAttribute("x", "0");
  foreignObject.setAttribute("y", "0");
  foreignObject.setAttribute("externalResourcesRequired", "true");
  svg.appendChild(foreignObject);
  foreignObject.appendChild(node);
  return svgToDataURL(svg);
}
var isInstanceOfElement = (node, instance) => {
  if (node instanceof instance)
    return true;
  const nodePrototype = Object.getPrototypeOf(node);
  if (nodePrototype === null)
    return false;
  return nodePrototype.constructor.name === instance.name || isInstanceOfElement(nodePrototype, instance);
};

// node_modules/html-to-image/es/clone-pseudos.js
function formatCSSText(style) {
  const content = style.getPropertyValue("content");
  return `${style.cssText} content: '${content.replace(/'|"/g, "")}';`;
}
function formatCSSProperties(style, options) {
  return getStyleProperties(options).map((name) => {
    const value = style.getPropertyValue(name);
    const priority = style.getPropertyPriority(name);
    return `${name}: ${value}${priority ? " !important" : ""};`;
  }).join(" ");
}
function getPseudoElementStyle(className, pseudo, style, options) {
  const selector = `.${className}:${pseudo}`;
  const cssText = style.cssText ? formatCSSText(style) : formatCSSProperties(style, options);
  return document.createTextNode(`${selector}{${cssText}}`);
}
function clonePseudoElement(nativeNode, clonedNode, pseudo, options) {
  const style = window.getComputedStyle(nativeNode, pseudo);
  const content = style.getPropertyValue("content");
  if (content === "" || content === "none") {
    return;
  }
  const className = uuid();
  try {
    clonedNode.className = `${clonedNode.className} ${className}`;
  } catch (err) {
    return;
  }
  const styleElement = document.createElement("style");
  styleElement.appendChild(getPseudoElementStyle(className, pseudo, style, options));
  clonedNode.appendChild(styleElement);
}
function clonePseudoElements(nativeNode, clonedNode, options) {
  clonePseudoElement(nativeNode, clonedNode, ":before", options);
  clonePseudoElement(nativeNode, clonedNode, ":after", options);
}

// node_modules/html-to-image/es/mimes.js
var WOFF = "application/font-woff";
var JPEG = "image/jpeg";
var mimes = {
  woff: WOFF,
  woff2: WOFF,
  ttf: "application/font-truetype",
  eot: "application/vnd.ms-fontobject",
  png: "image/png",
  jpg: JPEG,
  jpeg: JPEG,
  gif: "image/gif",
  tiff: "image/tiff",
  svg: "image/svg+xml",
  webp: "image/webp"
};
function getExtension(url) {
  const match = /\.([^./]*?)$/g.exec(url);
  return match ? match[1] : "";
}
function getMimeType(url) {
  const extension = getExtension(url).toLowerCase();
  return mimes[extension] || "";
}

// node_modules/html-to-image/es/dataurl.js
function getContentFromDataUrl(dataURL) {
  return dataURL.split(/,/)[1];
}
function isDataUrl(url) {
  return url.search(/^(data:)/) !== -1;
}
function makeDataUrl(content, mimeType) {
  return `data:${mimeType};base64,${content}`;
}
async function fetchAsDataURL(url, init, process2) {
  const res = await fetch(url, init);
  if (res.status === 404) {
    throw new Error(`Resource "${res.url}" not found`);
  }
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onloadend = () => {
      try {
        resolve(process2({ res, result: reader.result }));
      } catch (error) {
        reject(error);
      }
    };
    reader.readAsDataURL(blob);
  });
}
var cache = {};
function getCacheKey(url, contentType, includeQueryParams) {
  let key = url.replace(/\?.*/, "");
  if (includeQueryParams) {
    key = url;
  }
  if (/ttf|otf|eot|woff2?/i.test(key)) {
    key = key.replace(/.*\//, "");
  }
  return contentType ? `[${contentType}]${key}` : key;
}
async function resourceToDataURL(resourceUrl, contentType, options) {
  const cacheKey = getCacheKey(resourceUrl, contentType, options.includeQueryParams);
  if (cache[cacheKey] != null) {
    return cache[cacheKey];
  }
  if (options.cacheBust) {
    resourceUrl += (/\?/.test(resourceUrl) ? "&" : "?") + (/* @__PURE__ */ new Date()).getTime();
  }
  let dataURL;
  try {
    const content = await fetchAsDataURL(resourceUrl, options.fetchRequestInit, ({ res, result }) => {
      if (!contentType) {
        contentType = res.headers.get("Content-Type") || "";
      }
      return getContentFromDataUrl(result);
    });
    dataURL = makeDataUrl(content, contentType);
  } catch (error) {
    dataURL = options.imagePlaceholder || "";
    let msg = `Failed to fetch resource: ${resourceUrl}`;
    if (error) {
      msg = typeof error === "string" ? error : error.message;
    }
    if (msg) {
      console.warn(msg);
    }
  }
  cache[cacheKey] = dataURL;
  return dataURL;
}

// node_modules/html-to-image/es/clone-node.js
async function cloneCanvasElement(canvas) {
  const dataURL = canvas.toDataURL();
  if (dataURL === "data:,") {
    return canvas.cloneNode(false);
  }
  return createImage(dataURL);
}
async function cloneVideoElement(video, options) {
  if (video.currentSrc) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = video.clientWidth;
    canvas.height = video.clientHeight;
    ctx === null || ctx === void 0 ? void 0 : ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataURL2 = canvas.toDataURL();
    return createImage(dataURL2);
  }
  const poster = video.poster;
  const contentType = getMimeType(poster);
  const dataURL = await resourceToDataURL(poster, contentType, options);
  return createImage(dataURL);
}
async function cloneIFrameElement(iframe, options) {
  var _a;
  try {
    if ((_a = iframe === null || iframe === void 0 ? void 0 : iframe.contentDocument) === null || _a === void 0 ? void 0 : _a.body) {
      return await cloneNode(iframe.contentDocument.body, options, true);
    }
  } catch (_b) {
  }
  return iframe.cloneNode(false);
}
async function cloneSingleNode(node, options) {
  if (isInstanceOfElement(node, HTMLCanvasElement)) {
    return cloneCanvasElement(node);
  }
  if (isInstanceOfElement(node, HTMLVideoElement)) {
    return cloneVideoElement(node, options);
  }
  if (isInstanceOfElement(node, HTMLIFrameElement)) {
    return cloneIFrameElement(node, options);
  }
  return node.cloneNode(isSVGElement(node));
}
var isSlotElement = (node) => node.tagName != null && node.tagName.toUpperCase() === "SLOT";
var isSVGElement = (node) => node.tagName != null && node.tagName.toUpperCase() === "SVG";
async function cloneChildren(nativeNode, clonedNode, options) {
  var _a, _b;
  if (isSVGElement(clonedNode)) {
    return clonedNode;
  }
  let children = [];
  if (isSlotElement(nativeNode) && nativeNode.assignedNodes) {
    children = toArray(nativeNode.assignedNodes());
  } else if (isInstanceOfElement(nativeNode, HTMLIFrameElement) && ((_a = nativeNode.contentDocument) === null || _a === void 0 ? void 0 : _a.body)) {
    children = toArray(nativeNode.contentDocument.body.childNodes);
  } else {
    children = toArray(((_b = nativeNode.shadowRoot) !== null && _b !== void 0 ? _b : nativeNode).childNodes);
  }
  if (children.length === 0 || isInstanceOfElement(nativeNode, HTMLVideoElement)) {
    return clonedNode;
  }
  await children.reduce((deferred, child) => deferred.then(() => cloneNode(child, options)).then((clonedChild) => {
    if (clonedChild) {
      clonedNode.appendChild(clonedChild);
    }
  }), Promise.resolve());
  return clonedNode;
}
function cloneCSSStyle(nativeNode, clonedNode, options) {
  const targetStyle = clonedNode.style;
  if (!targetStyle) {
    return;
  }
  const sourceStyle = window.getComputedStyle(nativeNode);
  if (sourceStyle.cssText) {
    targetStyle.cssText = sourceStyle.cssText;
    targetStyle.transformOrigin = sourceStyle.transformOrigin;
  } else {
    getStyleProperties(options).forEach((name) => {
      let value = sourceStyle.getPropertyValue(name);
      if (isInstanceOfElement(nativeNode, HTMLIFrameElement) && name === "display" && value === "inline") {
        value = "block";
      }
      if (name === "d" && clonedNode.getAttribute("d")) {
        value = `path(${clonedNode.getAttribute("d")})`;
      }
      targetStyle.setProperty(name, value, sourceStyle.getPropertyPriority(name));
    });
  }
}
function cloneInputValue(nativeNode, clonedNode) {
  if (isInstanceOfElement(nativeNode, HTMLTextAreaElement)) {
    clonedNode.innerHTML = nativeNode.value;
  }
  if (isInstanceOfElement(nativeNode, HTMLInputElement)) {
    clonedNode.setAttribute("value", nativeNode.value);
  }
}
function cloneSelectValue(nativeNode, clonedNode) {
  if (isInstanceOfElement(nativeNode, HTMLSelectElement)) {
    const clonedSelect = clonedNode;
    const selectedOption = Array.from(clonedSelect.children).find((child) => nativeNode.value === child.getAttribute("value"));
    if (selectedOption) {
      selectedOption.setAttribute("selected", "");
    }
  }
}
function decorate(nativeNode, clonedNode, options) {
  if (isInstanceOfElement(clonedNode, Element)) {
    cloneCSSStyle(nativeNode, clonedNode, options);
    clonePseudoElements(nativeNode, clonedNode, options);
    cloneInputValue(nativeNode, clonedNode);
    cloneSelectValue(nativeNode, clonedNode);
  }
  return clonedNode;
}
async function ensureSVGSymbols(clone, options) {
  const uses = clone.querySelectorAll ? clone.querySelectorAll("use") : [];
  if (uses.length === 0) {
    return clone;
  }
  const processedDefs = {};
  for (let i = 0; i < uses.length; i++) {
    const use = uses[i];
    const id = use.getAttribute("xlink:href");
    if (id) {
      const exist = clone.querySelector(id);
      const definition = document.querySelector(id);
      if (!exist && definition && !processedDefs[id]) {
        processedDefs[id] = await cloneNode(definition, options, true);
      }
    }
  }
  const nodes = Object.values(processedDefs);
  if (nodes.length) {
    const ns = "http://www.w3.org/1999/xhtml";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("xmlns", ns);
    svg.style.position = "absolute";
    svg.style.width = "0";
    svg.style.height = "0";
    svg.style.overflow = "hidden";
    svg.style.display = "none";
    const defs = document.createElementNS(ns, "defs");
    svg.appendChild(defs);
    for (let i = 0; i < nodes.length; i++) {
      defs.appendChild(nodes[i]);
    }
    clone.appendChild(svg);
  }
  return clone;
}
async function cloneNode(node, options, isRoot) {
  if (!isRoot && options.filter && !options.filter(node)) {
    return null;
  }
  return Promise.resolve(node).then((clonedNode) => cloneSingleNode(clonedNode, options)).then((clonedNode) => cloneChildren(node, clonedNode, options)).then((clonedNode) => decorate(node, clonedNode, options)).then((clonedNode) => ensureSVGSymbols(clonedNode, options));
}

// node_modules/html-to-image/es/embed-resources.js
var URL_REGEX = /url\((['"]?)([^'"]+?)\1\)/g;
var URL_WITH_FORMAT_REGEX = /url\([^)]+\)\s*format\((["']?)([^"']+)\1\)/g;
var FONT_SRC_REGEX = /src:\s*(?:url\([^)]+\)\s*format\([^)]+\)[,;]\s*)+/g;
function toRegex(url) {
  const escaped = url.replace(/([.*+?^${}()|\[\]\/\\])/g, "\\$1");
  return new RegExp(`(url\\(['"]?)(${escaped})(['"]?\\))`, "g");
}
function parseURLs(cssText) {
  const urls = [];
  cssText.replace(URL_REGEX, (raw, quotation, url) => {
    urls.push(url);
    return raw;
  });
  return urls.filter((url) => !isDataUrl(url));
}
async function embed(cssText, resourceURL, baseURL, options, getContentFromUrl) {
  try {
    const resolvedURL = baseURL ? resolveUrl(resourceURL, baseURL) : resourceURL;
    const contentType = getMimeType(resourceURL);
    let dataURL;
    if (getContentFromUrl) {
      const content = await getContentFromUrl(resolvedURL);
      dataURL = makeDataUrl(content, contentType);
    } else {
      dataURL = await resourceToDataURL(resolvedURL, contentType, options);
    }
    return cssText.replace(toRegex(resourceURL), `$1${dataURL}$3`);
  } catch (error) {
  }
  return cssText;
}
function filterPreferredFontFormat(str, { preferredFontFormat }) {
  return !preferredFontFormat ? str : str.replace(FONT_SRC_REGEX, (match) => {
    while (true) {
      const [src, , format] = URL_WITH_FORMAT_REGEX.exec(match) || [];
      if (!format) {
        return "";
      }
      if (format === preferredFontFormat) {
        return `src: ${src};`;
      }
    }
  });
}
function shouldEmbed(url) {
  return url.search(URL_REGEX) !== -1;
}
async function embedResources(cssText, baseUrl, options) {
  if (!shouldEmbed(cssText)) {
    return cssText;
  }
  const filteredCSSText = filterPreferredFontFormat(cssText, options);
  const urls = parseURLs(filteredCSSText);
  return urls.reduce((deferred, url) => deferred.then((css) => embed(css, url, baseUrl, options)), Promise.resolve(filteredCSSText));
}

// node_modules/html-to-image/es/embed-images.js
async function embedProp(propName, node, options) {
  var _a;
  const propValue = (_a = node.style) === null || _a === void 0 ? void 0 : _a.getPropertyValue(propName);
  if (propValue) {
    const cssString = await embedResources(propValue, null, options);
    node.style.setProperty(propName, cssString, node.style.getPropertyPriority(propName));
    return true;
  }
  return false;
}
async function embedBackground(clonedNode, options) {
  ;
  await embedProp("background", clonedNode, options) || await embedProp("background-image", clonedNode, options);
  await embedProp("mask", clonedNode, options) || await embedProp("-webkit-mask", clonedNode, options) || await embedProp("mask-image", clonedNode, options) || await embedProp("-webkit-mask-image", clonedNode, options);
}
async function embedImageNode(clonedNode, options) {
  const isImageElement = isInstanceOfElement(clonedNode, HTMLImageElement);
  if (!(isImageElement && !isDataUrl(clonedNode.src)) && !(isInstanceOfElement(clonedNode, SVGImageElement) && !isDataUrl(clonedNode.href.baseVal))) {
    return;
  }
  const url = isImageElement ? clonedNode.src : clonedNode.href.baseVal;
  const dataURL = await resourceToDataURL(url, getMimeType(url), options);
  await new Promise((resolve, reject) => {
    clonedNode.onload = resolve;
    clonedNode.onerror = options.onImageErrorHandler ? (...attributes) => {
      try {
        resolve(options.onImageErrorHandler(...attributes));
      } catch (error) {
        reject(error);
      }
    } : reject;
    const image = clonedNode;
    if (image.decode) {
      image.decode = resolve;
    }
    if (image.loading === "lazy") {
      image.loading = "eager";
    }
    if (isImageElement) {
      clonedNode.srcset = "";
      clonedNode.src = dataURL;
    } else {
      clonedNode.href.baseVal = dataURL;
    }
  });
}
async function embedChildren(clonedNode, options) {
  const children = toArray(clonedNode.childNodes);
  const deferreds = children.map((child) => embedImages(child, options));
  await Promise.all(deferreds).then(() => clonedNode);
}
async function embedImages(clonedNode, options) {
  if (isInstanceOfElement(clonedNode, Element)) {
    await embedBackground(clonedNode, options);
    await embedImageNode(clonedNode, options);
    await embedChildren(clonedNode, options);
  }
}

// node_modules/html-to-image/es/apply-style.js
function applyStyle(node, options) {
  const { style } = node;
  if (options.backgroundColor) {
    style.backgroundColor = options.backgroundColor;
  }
  if (options.width) {
    style.width = `${options.width}px`;
  }
  if (options.height) {
    style.height = `${options.height}px`;
  }
  const manual = options.style;
  if (manual != null) {
    Object.keys(manual).forEach((key) => {
      style[key] = manual[key];
    });
  }
  return node;
}

// node_modules/html-to-image/es/embed-webfonts.js
var cssFetchCache = {};
async function fetchCSS(url) {
  let cache2 = cssFetchCache[url];
  if (cache2 != null) {
    return cache2;
  }
  const res = await fetch(url);
  const cssText = await res.text();
  cache2 = { url, cssText };
  cssFetchCache[url] = cache2;
  return cache2;
}
async function embedFonts(data, options) {
  let cssText = data.cssText;
  const regexUrl = /url\(["']?([^"')]+)["']?\)/g;
  const fontLocs = cssText.match(/url\([^)]+\)/g) || [];
  const loadFonts = fontLocs.map(async (loc) => {
    let url = loc.replace(regexUrl, "$1");
    if (!url.startsWith("https://")) {
      url = new URL(url, data.url).href;
    }
    return fetchAsDataURL(url, options.fetchRequestInit, ({ result }) => {
      cssText = cssText.replace(loc, `url(${result})`);
      return [loc, result];
    });
  });
  return Promise.all(loadFonts).then(() => cssText);
}
function parseCSS(source) {
  if (source == null) {
    return [];
  }
  const result = [];
  const commentsRegex = /(\/\*[\s\S]*?\*\/)/gi;
  let cssText = source.replace(commentsRegex, "");
  const keyframesRegex = new RegExp("((@.*?keyframes [\\s\\S]*?){([\\s\\S]*?}\\s*?)})", "gi");
  while (true) {
    const matches = keyframesRegex.exec(cssText);
    if (matches === null) {
      break;
    }
    result.push(matches[0]);
  }
  cssText = cssText.replace(keyframesRegex, "");
  const importRegex = /@import[\s\S]*?url\([^)]*\)[\s\S]*?;/gi;
  const combinedCSSRegex = "((\\s*?(?:\\/\\*[\\s\\S]*?\\*\\/)?\\s*?@media[\\s\\S]*?){([\\s\\S]*?)}\\s*?})|(([\\s\\S]*?){([\\s\\S]*?)})";
  const unifiedRegex = new RegExp(combinedCSSRegex, "gi");
  while (true) {
    let matches = importRegex.exec(cssText);
    if (matches === null) {
      matches = unifiedRegex.exec(cssText);
      if (matches === null) {
        break;
      } else {
        importRegex.lastIndex = unifiedRegex.lastIndex;
      }
    } else {
      unifiedRegex.lastIndex = importRegex.lastIndex;
    }
    result.push(matches[0]);
  }
  return result;
}
async function getCSSRules(styleSheets, options) {
  const ret = [];
  const deferreds = [];
  styleSheets.forEach((sheet) => {
    if ("cssRules" in sheet) {
      try {
        toArray(sheet.cssRules || []).forEach((item, index) => {
          if (item.type === CSSRule.IMPORT_RULE) {
            let importIndex = index + 1;
            const url = item.href;
            const deferred = fetchCSS(url).then((metadata) => embedFonts(metadata, options)).then((cssText) => parseCSS(cssText).forEach((rule) => {
              try {
                sheet.insertRule(rule, rule.startsWith("@import") ? importIndex += 1 : sheet.cssRules.length);
              } catch (error) {
                console.error("Error inserting rule from remote css", {
                  rule,
                  error
                });
              }
            })).catch((e) => {
              console.error("Error loading remote css", e.toString());
            });
            deferreds.push(deferred);
          }
        });
      } catch (e) {
        const inline = styleSheets.find((a) => a.href == null) || document.styleSheets[0];
        if (sheet.href != null) {
          deferreds.push(fetchCSS(sheet.href).then((metadata) => embedFonts(metadata, options)).then((cssText) => parseCSS(cssText).forEach((rule) => {
            inline.insertRule(rule, inline.cssRules.length);
          })).catch((err) => {
            console.error("Error loading remote stylesheet", err);
          }));
        }
        console.error("Error inlining remote css file", e);
      }
    }
  });
  return Promise.all(deferreds).then(() => {
    styleSheets.forEach((sheet) => {
      if ("cssRules" in sheet) {
        try {
          toArray(sheet.cssRules || []).forEach((item) => {
            ret.push(item);
          });
        } catch (e) {
          console.error(`Error while reading CSS rules from ${sheet.href}`, e);
        }
      }
    });
    return ret;
  });
}
function getWebFontRules(cssRules) {
  return cssRules.filter((rule) => rule.type === CSSRule.FONT_FACE_RULE).filter((rule) => shouldEmbed(rule.style.getPropertyValue("src")));
}
async function parseWebFontRules(node, options) {
  if (node.ownerDocument == null) {
    throw new Error("Provided element is not within a Document");
  }
  const styleSheets = toArray(node.ownerDocument.styleSheets);
  const cssRules = await getCSSRules(styleSheets, options);
  return getWebFontRules(cssRules);
}
function normalizeFontFamily(font) {
  return font.trim().replace(/["']/g, "");
}
function getUsedFonts(node) {
  const fonts = /* @__PURE__ */ new Set();
  function traverse(node2) {
    const fontFamily = node2.style.fontFamily || getComputedStyle(node2).fontFamily;
    fontFamily.split(",").forEach((font) => {
      fonts.add(normalizeFontFamily(font));
    });
    Array.from(node2.children).forEach((child) => {
      if (child instanceof HTMLElement) {
        traverse(child);
      }
    });
  }
  traverse(node);
  return fonts;
}
async function getWebFontCSS(node, options) {
  const rules = await parseWebFontRules(node, options);
  const usedFonts = getUsedFonts(node);
  const cssTexts = await Promise.all(rules.filter((rule) => usedFonts.has(normalizeFontFamily(rule.style.fontFamily))).map((rule) => {
    const baseUrl = rule.parentStyleSheet ? rule.parentStyleSheet.href : null;
    return embedResources(rule.cssText, baseUrl, options);
  }));
  return cssTexts.join("\n");
}
async function embedWebFonts(clonedNode, options) {
  const cssText = options.fontEmbedCSS != null ? options.fontEmbedCSS : options.skipFonts ? null : await getWebFontCSS(clonedNode, options);
  if (cssText) {
    const styleNode = document.createElement("style");
    const sytleContent = document.createTextNode(cssText);
    styleNode.appendChild(sytleContent);
    if (clonedNode.firstChild) {
      clonedNode.insertBefore(styleNode, clonedNode.firstChild);
    } else {
      clonedNode.appendChild(styleNode);
    }
  }
}

// node_modules/html-to-image/es/index.js
async function toSvg(node, options = {}) {
  const { width, height } = getImageSize(node, options);
  const clonedNode = await cloneNode(node, options, true);
  await embedWebFonts(clonedNode, options);
  await embedImages(clonedNode, options);
  applyStyle(clonedNode, options);
  const datauri = await nodeToDataURL(clonedNode, width, height);
  return datauri;
}
async function toCanvas(node, options = {}) {
  const { width, height } = getImageSize(node, options);
  const svg = await toSvg(node, options);
  const img = await createImage(svg);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const ratio = options.pixelRatio || getPixelRatio();
  const canvasWidth = options.canvasWidth || width;
  const canvasHeight = options.canvasHeight || height;
  canvas.width = canvasWidth * ratio;
  canvas.height = canvasHeight * ratio;
  if (!options.skipAutoScale) {
    checkCanvasDimensions(canvas);
  }
  canvas.style.width = `${canvasWidth}`;
  canvas.style.height = `${canvasHeight}`;
  if (options.backgroundColor) {
    context.fillStyle = options.backgroundColor;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

// src/HtmlCapture.ts
var _sharedFontBlocks = null;
function invalidateFontEmbedCache() {
  _sharedFontBlocks = null;
}
function parseFontFamily(block) {
  const m = block.match(/font-family\s*:\s*(['"]?)([^;'"]+)\1/i);
  return m ? m[2].trim() : "";
}
function parseFontWeight(block) {
  const m = block.match(/font-weight\s*:\s*([^;]+)/i);
  return m ? m[1].trim() : "400";
}
function parseFontStyle(block) {
  const m = block.match(/font-style\s*:\s*([^;]+)/i);
  return m ? m[1].trim() : "normal";
}
function parseUnicodeRange(block) {
  const m = block.match(/unicode-range\s*:\s*([^;]+)/i);
  if (!m) return null;
  const ranges = [];
  for (const part of m[1].split(",")) {
    const trimmed = part.trim();
    const rangeMatch = trimmed.match(/U\+([0-9A-Fa-f]+)(?:-([0-9A-Fa-f]+))?/);
    if (!rangeMatch) continue;
    const start = parseInt(rangeMatch[1], 16);
    const end = rangeMatch[2] ? parseInt(rangeMatch[2], 16) : start;
    ranges.push([start, end]);
  }
  return ranges.length > 0 ? ranges : null;
}
function weightMatches(descriptor, target) {
  const parts = descriptor.split(/\s+/).map(Number);
  const t = Number(target) || 400;
  if (parts.length >= 2) {
    return t >= parts[0] && t <= parts[1];
  }
  return parts[0] === t;
}
function textMatchesUnicodeRange(text, ranges) {
  for (let i = 0; i < text.length; i++) {
    const cp = text.codePointAt(i);
    for (const [lo, hi] of ranges) {
      if (cp >= lo && cp <= hi) return true;
    }
    if (cp > 65535) i++;
  }
  return false;
}
function collectFontUsage(element) {
  const indexMap = /* @__PURE__ */ new Map();
  const fonts = [];
  function walk(node) {
    if (node.nodeType === 3) {
      const content = node.textContent || "";
      if (content.trim() === "") return;
      const parent = node.parentElement;
      if (!parent) return;
      const style = getComputedStyle(parent);
      const weight = style.fontWeight;
      const fontStyle = style.fontStyle;
      for (const raw of style.fontFamily.split(",")) {
        const family = raw.replace(/['"]/g, "").trim().toLowerCase();
        const key = `${family}|${weight}|${fontStyle}`;
        const idx = indexMap.get(key);
        if (idx !== void 0) {
          fonts[idx].text += content;
        } else {
          indexMap.set(key, fonts.length);
          fonts.push({ family, weight, style: fontStyle, text: content });
        }
      }
    } else if (node.nodeType === 1) {
      const el = node;
      for (let i = 0; i < el.childNodes.length; i++) {
        walk(el.childNodes[i]);
      }
    }
  }
  walk(element);
  return fonts;
}
function filterFontBlocksForElement(blocks, element) {
  const usages = collectFontUsage(element);
  if (usages.length === 0) return [];
  return blocks.filter((block) => {
    const matchingUsages = usages.filter((u) => {
      if (u.family !== block.family) return false;
      const styleOk = block.style === u.style || block.style === "normal" && u.style === "normal";
      return styleOk && weightMatches(block.weight, u.weight);
    });
    if (matchingUsages.length === 0) return false;
    if (block.unicodeRanges) {
      const hasMatch = matchingUsages.some(
        (u) => u.text.length > 0 && textMatchesUnicodeRange(u.text, block.unicodeRanges)
      );
      if (!hasMatch) return false;
    }
    return true;
  });
}
async function fetchAsDataUrl(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
async function buildFontBlocks() {
  const fontFaceRules = [];
  const links = Array.from(
    document.querySelectorAll('link[rel="stylesheet"]')
  );
  for (const link of links) {
    if (!link.href) continue;
    try {
      const res = await fetch(link.href, { cache: "force-cache" });
      if (!res.ok) continue;
      const cssText = await res.text();
      const sheet = new CSSStyleSheet();
      await sheet.replace(cssText);
      for (const rule of sheet.cssRules) {
        if (rule.type === CSSRule.FONT_FACE_RULE) {
          fontFaceRules.push(rule.cssText);
        }
      }
    } catch {
    }
  }
  for (const sheet of Array.from(document.styleSheets)) {
    if (sheet.href) continue;
    try {
      for (const rule of Array.from(sheet.cssRules || [])) {
        if (rule.type === CSSRule.FONT_FACE_RULE) {
          fontFaceRules.push(rule.cssText);
        }
      }
    } catch {
    }
  }
  const loadedFamilies = /* @__PURE__ */ new Set();
  if (document.fonts) {
    for (const ff of document.fonts) {
      if (ff.status === "loaded") {
        loadedFamilies.add(
          ff.family.replace(/['"]/g, "").trim().toLowerCase()
        );
      }
    }
  }
  const candidates = loadedFamilies.size > 0 ? fontFaceRules.filter((r) => loadedFamilies.has(parseFontFamily(r).toLowerCase())) : fontFaceRules;
  const embedded = await Promise.all(
    candidates.map(async (ruleText) => {
      const urlRegex = /url\(\s*['"]?([^'")\s]+)['"]?\s*\)/g;
      const urlMatches = Array.from(ruleText.matchAll(urlRegex));
      let css = ruleText;
      for (const m of urlMatches) {
        const url = m[1];
        if (url.startsWith("data:")) continue;
        const dataUrl = await fetchAsDataUrl(url);
        if (dataUrl) {
          css = css.replace(m[0], `url(${dataUrl})`);
        }
      }
      return {
        css,
        family: parseFontFamily(ruleText).toLowerCase(),
        weight: parseFontWeight(ruleText),
        style: parseFontStyle(ruleText),
        unicodeRanges: parseUnicodeRange(ruleText)
      };
    })
  );
  return embedded;
}
var HtmlCapture = class {
  constructor(root) {
    /** Elements with an in-flight html-to-image re-capture (dedupe). */
    this._capturing = /* @__PURE__ */ new Set();
    /**
     * Optional callback fired when an async re-capture finishes and
     * the cache changes. Receives the element whose cache entry was
     * just (re)written so the consumer can scope its dirty marking
     * to glasses that actually intersect that element.
     */
    this.onCacheUpdate = null;
    /**
     * Prefetched + embedded @font-face blocks. Computed once at init
     * via prefetchFontEmbedCSS. At capture time, filtered per-element
     * to include only the blocks whose family/weight/style/unicode-range
     * match the element's actual text content and computed styles.
     */
    this._fontBlocks = [];
    this.root = root;
    this.cache = /* @__PURE__ */ new Map();
    this.dpr = 1;
  }
  // ────────────────────────────────────────────
  // Public API
  // ────────────────────────────────────────────
  /**
   * Resolve the page's @font-face rules into a single CSS string with
   * every `url(...)` source already inlined as a base64 data URL. The
   * result is reused on every subsequent toCanvas call so the captured
   * raster renders text with the page's actual webfonts (e.g. Inter)
   * instead of system fallbacks. Matching glyph metrics is what makes
   * the refracted text line up with the live DOM under the glass.
   *
   * The build is shared at module scope across every LiquidGlass
   * instance — the first init() pays the fetch + base64 cost, every
   * subsequent init() awaits the same Promise.
   *
   * Implemented manually rather than via html-to-image's getFontEmbedCSS
   * because that path walks document.styleSheets via CSSOM, which throws
   * SecurityError on every cross-origin stylesheet and has a brittle
   * recovery flow. We just fetch each <link rel="stylesheet"> directly
   * (CORS-friendly for the typical Google Fonts / CDN cases), regex out
   * the @font-face blocks, and inline each url(...) ourselves.
   */
  async prefetchFontEmbedCSS() {
    if (!_sharedFontBlocks) {
      _sharedFontBlocks = buildFontBlocks();
    }
    this._fontBlocks = await _sharedFontBlocks;
  }
  /**
   * Return the @font-face CSS string for a specific element,
   * filtered to only the blocks whose family + weight + style
   * match computed styles on the element's text nodes, AND whose
   * unicode-range covers at least one codepoint in the element's
   * text content.
   */
  fontEmbedCSSForElement(element) {
    if (this._fontBlocks.length === 0) return "";
    const relevant = filterFontBlocksForElement(this._fontBlocks, element);
    return relevant.map((b) => b.css).join("\n");
  }
  /**
   * Update the device pixel ratio used for future captures.
   */
  resize(dpr = 1) {
    this.dpr = dpr;
    this.cache.clear();
  }
  /**
   * Ensure an element's cached canvas is fresh enough for the current DPR.
   *
   * Cache semantics:
   *   - Fresh hit (size matches within 0.5 px) → return immediately.
   *   - Stale hit (size differs) → keep the stale entry so callers can
   *     stretch-blit it, and kick off an async re-capture.
   *   - Cache miss → kick off an async capture.
   *
   * Concurrent re-captures for the same element are deduplicated
   * via the `_capturing` set, so calling this every frame is cheap.
   */
  async captureElement(element, force = false) {
    const rect = element.getBoundingClientRect();
    const cssW = rect.width;
    const cssH = rect.height;
    const w = Math.round(cssW * this.dpr);
    const h = Math.round(cssH * this.dpr);
    if (w <= 0 || h <= 0) {
      this.cache.delete(element);
      return;
    }
    const cached = this.cache.get(element);
    const cacheIsFresh = !!cached && cached.canvas.width > 0 && cached.canvas.height > 0 && Math.abs(cached.w - w) < 0.5 && Math.abs(cached.h - h) < 0.5;
    if (!force && cacheIsFresh) return;
    if (this._capturing.has(element)) return;
    if (element.tagName === "CANVAS") {
      return;
    }
    this._capturing.add(element);
    try {
      await this._captureWithHtmlToImage(element, w, h, cssW, cssH);
    } finally {
      this._capturing.delete(element);
    }
  }
  /**
   * Draw the current cached capture for an element into an arbitrary
   * 2D canvas. Returns true when a cached snapshot was available.
   */
  drawCachedElement(element, targetCtx, x, y, w, h) {
    const cached = this.cache.get(element);
    if (!cached) return false;
    if (cached.canvas.width <= 0 || cached.canvas.height <= 0) {
      this.cache.delete(element);
      return false;
    }
    targetCtx.drawImage(cached.canvas, x, y, w, h);
    return true;
  }
  /**
   * Capture an element's DOM content as a standalone canvas, optionally
   * excluding specified child nodes from the capture.
   *
   * The hideNodes are pruned from the cloned tree via html-to-image's
   * filter callback, so the live DOM is never mutated and there is no
   * visible flicker on the page even when this runs inside the render
   * loop (e.g. on a re-capture triggered by a content change).
   */
  async captureToCanvas(element, cssW, cssH, hideNodes = null) {
    if (cssW <= 0 || cssH <= 0) return null;
    const hideSet = hideNodes && hideNodes.length ? new Set(hideNodes) : null;
    try {
      const rendered = await toCanvas(element, {
        width: cssW,
        height: cssH,
        pixelRatio: this.dpr,
        backgroundColor: void 0,
        // Reuse the prefetched font embed CSS so the per-glass
        // content image (used for compositing labels on top of
        // the shader output) uses the same Inter face the live
        // page does. Skips html-to-image's noisy CSSOM walk.
        fontEmbedCSS: this.fontEmbedCSSForElement(element),
        filter: hideSet ? (node) => !hideSet.has(node) : void 0,
        style: {
          position: "static",
          top: "auto",
          left: "auto",
          right: "auto",
          bottom: "auto",
          transform: "none",
          margin: "0"
        }
      });
      return rendered;
    } catch (err) {
      console.warn("LiquidGlass: captureToCanvas failed for element:", element, err);
      return null;
    }
  }
  /**
   * Remove an element's entry from the capture cache.
   */
  invalidateCache(element) {
    this.cache.delete(element);
  }
  /** Destroy the capture system and free resources. */
  destroy() {
    this.cache.clear();
  }
  // ────────────────────────────────────────────
  // html-to-image back-end
  // ────────────────────────────────────────────
  async _captureWithHtmlToImage(element, w, h, cssW, cssH) {
    if (cssW <= 0 || cssH <= 0 || w <= 0 || h <= 0) return;
    try {
      const rendered = await toCanvas(element, {
        width: cssW,
        height: cssH,
        pixelRatio: this.dpr,
        // Per-element font embed CSS so the captured raster
        // uses the page's actual webfont at the correct weight
        // and unicode subset for this element's text content.
        fontEmbedCSS: this.fontEmbedCSSForElement(element)
      });
      this.cache.set(element, { canvas: rendered, w, h });
      this.onCacheUpdate?.(element);
    } catch (err) {
      console.warn("LiquidGlass: html-to-image capture failed for element:", element, err);
    }
  }
};

// src/shaders.ts
var VS_QUAD = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
	v_uv = a_pos * 0.5 + 0.5;
	gl_Position = vec4(a_pos, 0.0, 1.0);
}`;
var FS_BLIT = `
precision mediump float;
uniform sampler2D u_tex;
uniform vec2 u_scale;
uniform vec2 u_offset;
varying vec2 v_uv;
void main() {
	gl_FragColor = texture2D(u_tex, v_uv * u_scale + u_offset);
}`;
var FS_BLUR = `
precision mediump float;
uniform sampler2D u_tex;
uniform vec2 u_dir;
varying vec2 v_uv;
void main() {
	vec4 s  = texture2D(u_tex, v_uv) * 0.227027;
	s += texture2D(u_tex, v_uv + u_dir * 1.0) * 0.194594;
	s += texture2D(u_tex, v_uv - u_dir * 1.0) * 0.194594;
	s += texture2D(u_tex, v_uv + u_dir * 2.0) * 0.121622;
	s += texture2D(u_tex, v_uv - u_dir * 2.0) * 0.121622;
	s += texture2D(u_tex, v_uv + u_dir * 3.0) * 0.054054;
	s += texture2D(u_tex, v_uv - u_dir * 3.0) * 0.054054;
	s += texture2D(u_tex, v_uv + u_dir * 4.0) * 0.016216;
	s += texture2D(u_tex, v_uv - u_dir * 4.0) * 0.016216;
	gl_FragColor = s;
}`;
var VS_GLASS = `
attribute vec2 a_pos;
uniform vec2 u_center;   // panel centre in root-pixel coords (top-left origin)
uniform vec2 u_size;     // panel size in px
uniform vec2 u_res;      // root element size in px
uniform float u_pad;     // shadow padding in px
varying vec2 v_localPx;
varying vec2 v_screenUV;

void main() {
	vec2 total = u_size + vec2(u_pad * 2.0);
	v_localPx = a_pos * total;                       // px from panel centre
	vec2 px = u_center + a_pos * total;              // screen px (DOM)
	v_screenUV = vec2(px.x / u_res.x, 1.0 - px.y / u_res.y);
	vec2 ndc = (px / u_res) * 2.0 - 1.0;
	ndc.y = -ndc.y;
	gl_Position = vec4(ndc, 0.0, 1.0);
}`;
var FS_GLASS = `
precision highp float;

uniform sampler2D u_bgTex;
uniform sampler2D u_blurTex;
uniform vec2 u_size;           // panel px
uniform float u_radius;        // corner radius px
uniform vec2 u_res;

uniform float u_refract;
uniform float u_chroma;
uniform float u_edgeHL;
uniform float u_spec;
uniform float u_fresnel;
uniform float u_distort;
uniform float u_alpha;
uniform float u_sat;
uniform float u_tint;
uniform float u_zRadius;
uniform float u_brightness;
uniform float u_shadowAlpha;
uniform float u_shadowSpread;
uniform float u_shadowOffY;
uniform float u_bevelMode;

varying vec2 v_localPx;
varying vec2 v_screenUV;

// Rounded-rect signed distance
float rrSDF(vec2 p, vec2 b, float r) {
	vec2 q = abs(p) - b + vec2(r);
	return min(max(q.x, q.y), 0.0) + length(max(q, vec2(0.0))) - r;
}

// Bevel height field.
// Both modes use the same half-circle profile (smooth peak at centre,
// steep at edges).  The difference is in the refraction model:
//   mode 0 = biconvex pill \u2014 light refracts at both surfaces (entry + exit).
//   mode 1 = dome (plano-convex) \u2014 flat bottom, so only exit refraction.
// d = distance inside from edge (-sdf), zR = z-radius of the bevel.
float bevelHeight(float d, float zR) {
	if (d <= 0.0) return 0.0;
	if (d >= zR) return zR;
	return sqrt(d * (2.0 * zR - d));
}

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
	vec2 half_ = u_size * 0.5;
	float r = min(u_radius, min(half_.x, half_.y));
	float sdf = rrSDF(v_localPx, half_, r);

	// \u2500\u2500 Shadow (outside panel, offset by shadowOffY) \u2500\u2500
	if (sdf > 0.0) {
		float sdfShadow = rrSDF(v_localPx - vec2(0.0, u_shadowOffY), half_, r);
		float d = max(sdfShadow - 1.0, 0.0);
		float spread = max(u_shadowSpread, 1.0);
		float falloff = 1.0 / (spread * spread);
		float outerShadow = exp(-d * d * falloff) * 0.65;
		float contactShadow = exp(-d * 0.08 / max(spread * 0.04, 0.01)) * 0.35;
		float shadow = (outerShadow + contactShadow) * u_shadowAlpha;
		gl_FragColor = vec4(0.0, 0.0, 0.0, shadow);
		return;
	}

	// \u2500\u2500 Anti-aliased mask \u2500\u2500
	float mask = 1.0 - smoothstep(-1.5, 0.5, sdf);

	float maxD = min(half_.x, half_.y);
	float inside = -sdf;
	float edge = smoothstep(maxD * 0.35, 0.0, inside);

	// \u2500\u2500 Surface normal (top surface) via bevel height field \u2500\u2500
	float zR = u_zRadius;
	float e = 2.0;
	float dC = inside;
	float dR = -rrSDF(v_localPx + vec2(e, 0.0), half_, r);
	float dL = -rrSDF(v_localPx - vec2(e, 0.0), half_, r);
	float dU = -rrSDF(v_localPx + vec2(0.0, e), half_, r);
	float dD = -rrSDF(v_localPx - vec2(0.0, e), half_, r);
	float hC = bevelHeight(dC, zR);
	float hR = bevelHeight(dR, zR);
	float hL = bevelHeight(dL, zR);
	float hU = bevelHeight(dU, zR);
	float hD = bevelHeight(dD, zR);
	vec2 hGrad = vec2(hR - hL, hU - hD) / (2.0 * e);
	vec3 N = normalize(vec3(-hGrad, 1.0));

	float depth = smoothstep(0.0, zR, inside);

	// \u2500\u2500 Refraction \u2500\u2500
	vec2 pxToUV = vec2(1.0, -1.0) / u_res;
	float ior = 1.5;
	float refrPow = 1.0 - 1.0 / ior;
	float thickness = hC * 2.0;
	float thickNorm = thickness / max(zR * 2.0, 1.0);
	vec2 refrPx;
	if (u_bevelMode < 0.5) {
		// Biconvex: physically-based dual-surface refraction
		vec2 exitRefr = hGrad * refrPow;
		vec2 entryRefr = hGrad * refrPow;
		vec2 throughRefr = entryRefr * thickNorm * 0.5;
		refrPx = (exitRefr + entryRefr + throughRefr) * u_refract * 30.0;
		vec2 centerDir = -v_localPx / max(half_, vec2(1.0));
		refrPx += centerDir * u_refract * 4.0 * depth;
	} else {
		// Dome (plano-convex): uniform magnification by contracting UV toward center.
		// Each pixel samples from closer to center \u2192 content appears larger.
		refrPx = -v_localPx * u_refract * depth * 0.35;
	}
	vec2 refr = refrPx * pxToUV;

	// \u2500\u2500 Micro-distortion noise \u2500\u2500
	vec2 ns = v_localPx * 0.08;
	vec2 absPxToUV = vec2(1.0) / u_res;
	vec2 micro = (vec2(hash(ns), hash(ns + vec2(37.0))) - 0.5) * u_distort * 4.0 * absPxToUV;

	// \u2500\u2500 Chromatic aberration \u2500\u2500
	float caS = u_chroma * 18.0 * (edge * 0.7 + 0.3) * 2.0;
	vec2 caD = N.xy * caS * pxToUV;
	vec2 base = v_screenUV + refr + micro;

	vec3 sharp = vec3(
		texture2D(u_bgTex,  base + caD).r,
		texture2D(u_bgTex,  base).g,
		texture2D(u_bgTex,  base - caD).b
	);
	vec3 blur = vec3(
		texture2D(u_blurTex, base + caD).r,
		texture2D(u_blurTex, base).g,
		texture2D(u_blurTex, base - caD).b
	);
	// \u2500\u2500 Edge-weighted blur mix \u2500\u2500
	// Centre of the panel uses the blurred sample; the rim blends
	// toward the sharp sample so refraction edges stay crisp.
	float edgeMix = (1.0 - edge * 0.15);
	vec3 col = mix(sharp, blur, edgeMix);

	// \u2500\u2500 Brightness \u2500\u2500
	col *= 1.0 + u_brightness;

	// \u2500\u2500 Saturation \u2500\u2500
	float lum = dot(col, vec3(0.299, 0.587, 0.114));
	col = mix(vec3(lum), col, 1.0 + u_sat);

	// \u2500\u2500 Cool glass tint \u2500\u2500
	col = mix(col, col * vec3(0.92, 0.95, 1.05), u_tint);
	col *= 1.0 + 0.06 * depth;

	// \u2500\u2500 Fresnel \u2500\u2500
	float fres = pow(1.0 - abs(N.z), 4.0) * u_fresnel;

	// \u2500\u2500 Specular highlights (multi-light Blinn-Phong) \u2500\u2500
	// In DOM coords, -y is UP (top/sky), +y is DOWN (bottom).
	vec3 V = vec3(0.0, 0.0, 1.0);
	vec3 L1 = normalize(vec3(0.4, -0.7, 1.0));
	vec3 H1 = normalize(L1 + V);
	float sp1 = pow(max(dot(N, H1), 0.0), 90.0);
	vec3 L2 = normalize(vec3(-0.3, -0.5, 1.0));
	vec3 H2 = normalize(L2 + V);
	float sp2 = pow(max(dot(N, H2), 0.0), 50.0) * 0.3;
	vec3 L3 = normalize(vec3(0.1, -0.3, 1.0));
	float spB = pow(max(dot(N, L3), 0.0), 6.0) * 0.1;
	vec3 L4 = normalize(vec3(0.0, -0.9, 0.4));
	vec3 H4 = normalize(L4 + V);
	float sp4 = pow(max(dot(N, H4), 0.0), 120.0) * 0.6;
	float totalSpec = (sp1 + sp2 + spB + sp4) * u_spec;

	// \u2500\u2500 Inner border / stroke highlight \u2500\u2500
	float borderWidth = 1.5;
	float innerStroke = smoothstep(-borderWidth - 1.0, -borderWidth, sdf)
	                  * (1.0 - smoothstep(-1.0, 0.0, sdf));
	float topBias = 0.5 + 0.5 * (-v_localPx.y / half_.y);
	innerStroke *= (0.4 + 0.6 * topBias);

	// \u2500\u2500 Edge highlight & inner glow \u2500\u2500
	float rim = edge * u_edgeHL * 0.22;
	float innerGlow = smoothstep(5.0, 0.0, -sdf) * u_edgeHL * 0.15;

	// \u2500\u2500 Environment-like reflection (fake) \u2500\u2500
	float envRefl = (-N.y * 0.5 + 0.5) * fres * 0.08;

	// \u2500\u2500 Composite \u2500\u2500
	vec3 fin = col;
	fin += vec3(totalSpec);
	fin += vec3(rim + innerGlow);
	fin += vec3(innerStroke * u_edgeHL * 0.55);
	fin += vec3(envRefl);
	fin = mix(fin, vec3(1.0), fres * 0.2);

	gl_FragColor = vec4(fin, mask * u_alpha);
}`;

// src/GlassRenderer.ts
var GlassRenderer = class {
  constructor() {
    this.fboCache = /* @__PURE__ */ new Map();
    this.activeFBOs = null;
    this.bgTex = null;
    this.width = 0;
    this.height = 0;
    this.contextLost = false;
    this.canvas = document.createElement("canvas");
    this.canvas.style.display = "none";
    document.body.appendChild(this.canvas);
    this.cropCanvas = document.createElement("canvas");
    this.cropCtx = this.cropCanvas.getContext("2d");
    const gl = this.canvas.getContext("webgl", {
      alpha: true,
      premultipliedAlpha: false,
      antialias: false,
      preserveDrawingBuffer: true
    });
    if (!gl) {
      throw new Error("LiquidGlass: WebGL is not supported in this browser.");
    }
    this.gl = gl;
    this._initPrograms();
    this._initBuffers();
    this._onContextLost = (e) => {
      e.preventDefault();
      this.contextLost = true;
      console.warn("LiquidGlass: WebGL context lost.");
    };
    this._onContextRestored = () => {
      console.info("LiquidGlass: WebGL context restored \u2014 reinitialising.");
      this.contextLost = false;
      this._initPrograms();
      this._initBuffers();
      for (const fboSet of this.fboCache.values()) {
        this._freeFBOSet(fboSet);
      }
      this.fboCache.clear();
      this.activeFBOs = null;
      this.bgTex = null;
    };
    this.canvas.addEventListener("webglcontextlost", this._onContextLost);
    this.canvas.addEventListener("webglcontextrestored", this._onContextRestored);
  }
  // ────────────────────────────────────────────
  // Initialisation
  // ────────────────────────────────────────────
  _initPrograms() {
    this.blitP = this._link(VS_QUAD, FS_BLIT);
    this.blitU = this._uloc(this.blitP, ["u_tex", "u_scale", "u_offset"]);
    this.blurP = this._link(VS_QUAD, FS_BLUR);
    this.blurU = this._uloc(this.blurP, ["u_tex", "u_dir"]);
    this.glassP = this._link(VS_GLASS, FS_GLASS);
    this.glassU = this._uloc(this.glassP, [
      "u_bgTex",
      "u_blurTex",
      "u_center",
      "u_size",
      "u_radius",
      "u_res",
      "u_pad",
      "u_refract",
      "u_chroma",
      "u_edgeHL",
      "u_spec",
      "u_fresnel",
      "u_distort",
      "u_alpha",
      "u_sat",
      "u_tint",
      "u_zRadius",
      "u_brightness",
      "u_shadowAlpha",
      "u_shadowSpread",
      "u_shadowOffY",
      "u_bevelMode"
    ]);
  }
  _initBuffers() {
    const gl = this.gl;
    this.quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.panelBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.panelBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5]), gl.STATIC_DRAW);
  }
  // ────────────────────────────────────────────
  // Resize
  // ────────────────────────────────────────────
  resize(width, height) {
    this.width = width;
    this.height = height;
    for (const fboSet of this.fboCache.values()) {
      this._freeFBOSet(fboSet);
    }
    this.fboCache.clear();
    this.activeFBOs = null;
    this.canvas.width = 0;
    this.canvas.height = 0;
  }
  // ────────────────────────────────────────────
  // Background upload
  // ────────────────────────────────────────────
  uploadAndBlur(sourceCanvas, sourceX, sourceY, width, height, blurAmount) {
    if (this.contextLost) return;
    const gl = this.gl;
    if (!this._setActiveSize(width, height)) return;
    const W = this.width;
    const H = this.height;
    const fboSet = this.activeFBOs;
    this.cropCanvas.width = W;
    this.cropCanvas.height = H;
    this.cropCtx.clearRect(0, 0, W, H);
    this.cropCtx.drawImage(sourceCanvas, -sourceX, -sourceY);
    if (!this.bgTex) {
      this.bgTex = gl.createTexture();
    }
    gl.bindTexture(gl.TEXTURE_2D, this.bgTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.cropCanvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fboSet.bg.fbo);
    gl.viewport(0, 0, W, H);
    gl.useProgram(this.blitP);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.bgTex);
    gl.uniform1i(this.blitU.u_tex, 0);
    gl.uniform2f(this.blitU.u_scale, 1, 1);
    gl.uniform2f(this.blitU.u_offset, 0, 0);
    this._drawQuad(this.blitP, this.quadBuf);
    const bw = fboSet.blurA.w;
    const bh = fboSet.blurA.h;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fboSet.blurA.fbo);
    gl.viewport(0, 0, bw, bh);
    gl.bindTexture(gl.TEXTURE_2D, fboSet.bg.tex);
    this._drawQuad(this.blitP, this.quadBuf);
    if (blurAmount > 0) {
      const spread = blurAmount * 2.5;
      gl.useProgram(this.blurP);
      gl.uniform1i(this.blurU.u_tex, 0);
      for (let i = 0; i < BLUR_ITERATIONS; i++) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, fboSet.blurB.fbo);
        gl.viewport(0, 0, bw, bh);
        gl.bindTexture(gl.TEXTURE_2D, fboSet.blurA.tex);
        gl.uniform2f(this.blurU.u_dir, spread / bw, 0);
        this._drawQuad(this.blurP, this.quadBuf);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fboSet.blurA.fbo);
        gl.bindTexture(gl.TEXTURE_2D, fboSet.blurB.tex);
        gl.uniform2f(this.blurU.u_dir, 0, spread / bh);
        this._drawQuad(this.blurP, this.quadBuf);
      }
    }
  }
  // ────────────────────────────────────────────
  // Glass panel rendering
  // ────────────────────────────────────────────
  renderGlassPanel(config, width, height, dpr) {
    if (this.contextLost) return;
    const gl = this.gl;
    const W = this.width;
    const H = this.height;
    const fboSet = this.activeFBOs;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.glassP);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fboSet.bg.tex);
    gl.uniform1i(this.glassU.u_bgTex, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, fboSet.blurA.tex);
    gl.uniform1i(this.glassU.u_blurTex, 1);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, this.canvas.height - H, W, H);
    gl.uniform2f(this.glassU.u_res, W, H);
    gl.uniform2f(this.glassU.u_center, W * 0.5, H * 0.5);
    gl.uniform2f(this.glassU.u_size, width * dpr, height * dpr);
    gl.uniform1f(this.glassU.u_radius, config.cornerRadius * dpr);
    gl.uniform1f(this.glassU.u_pad, SHADOW_PAD * dpr);
    gl.uniform1f(this.glassU.u_refract, config.refraction);
    gl.uniform1f(this.glassU.u_chroma, config.chromAberration);
    gl.uniform1f(this.glassU.u_edgeHL, config.edgeHighlight);
    gl.uniform1f(this.glassU.u_spec, config.specular);
    gl.uniform1f(this.glassU.u_fresnel, config.fresnel);
    gl.uniform1f(this.glassU.u_distort, config.distortion);
    gl.uniform1f(this.glassU.u_alpha, config.opacity);
    gl.uniform1f(this.glassU.u_sat, config.saturation);
    gl.uniform1f(this.glassU.u_tint, config.tintStrength);
    gl.uniform1f(this.glassU.u_zRadius, config.zRadius * dpr);
    gl.uniform1f(this.glassU.u_brightness, config.brightness);
    gl.uniform1f(this.glassU.u_shadowAlpha, config.shadowOpacity);
    gl.uniform1f(this.glassU.u_shadowSpread, config.shadowSpread * dpr);
    gl.uniform1f(this.glassU.u_shadowOffY, config.shadowOffsetY * dpr);
    gl.uniform1f(this.glassU.u_bevelMode, config.bevelMode);
    this._drawQuad(this.glassP, this.panelBuf);
    gl.disable(gl.BLEND);
  }
  clear() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, this.canvas.height - this.height, this.width, this.height);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(0, this.canvas.height - this.height, this.width, this.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.SCISSOR_TEST);
  }
  destroy() {
    this.canvas.removeEventListener("webglcontextlost", this._onContextLost);
    this.canvas.removeEventListener("webglcontextrestored", this._onContextRestored);
    if (!this.contextLost) {
      const gl = this.gl;
      for (const fboSet of this.fboCache.values()) {
        this._freeFBOSet(fboSet);
      }
      this.fboCache.clear();
      if (this.bgTex) gl.deleteTexture(this.bgTex);
      gl.deleteBuffer(this.quadBuf);
      gl.deleteBuffer(this.panelBuf);
      gl.deleteProgram(this.blitP);
      gl.deleteProgram(this.blurP);
      gl.deleteProgram(this.glassP);
    }
    this.canvas.remove();
  }
  // ────────────────────────────────────────────
  // FBO management
  // ────────────────────────────────────────────
  _setActiveSize(w, h) {
    if (w <= 0 || h <= 0) return false;
    this.width = w;
    this.height = h;
    if (this.canvas.width < w || this.canvas.height < h) {
      this.canvas.width = Math.max(this.canvas.width, w);
      this.canvas.height = Math.max(this.canvas.height, h);
    }
    const key = `${w}x${h}`;
    let fboSet = this.fboCache.get(key);
    if (!fboSet) {
      fboSet = {
        bg: this._makeFBO(w, h),
        blurA: this._makeFBO(w, h),
        blurB: this._makeFBO(w, h)
      };
      this.fboCache.set(key, fboSet);
    }
    this.activeFBOs = fboSet;
    return true;
  }
  _makeFBO(w, h) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fbo, tex, w, h };
  }
  _freeFBO(fboObj) {
    if (!fboObj) return;
    const gl = this.gl;
    gl.deleteFramebuffer(fboObj.fbo);
    gl.deleteTexture(fboObj.tex);
  }
  _freeFBOSet(fboSet) {
    this._freeFBO(fboSet.bg);
    this._freeFBO(fboSet.blurA);
    this._freeFBO(fboSet.blurB);
  }
  // ────────────────────────────────────────────
  // Shader helpers
  // ────────────────────────────────────────────
  _compile(src, type) {
    const gl = this.gl;
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error("LiquidGlass shader compile error:", gl.getShaderInfoLog(s), src);
      return null;
    }
    return s;
  }
  _link(vsSrc, fsSrc) {
    const gl = this.gl;
    const p = gl.createProgram();
    gl.attachShader(p, this._compile(vsSrc, gl.VERTEX_SHADER));
    gl.attachShader(p, this._compile(fsSrc, gl.FRAGMENT_SHADER));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.error("LiquidGlass program link error:", gl.getProgramInfoLog(p));
    }
    return p;
  }
  _uloc(prog, names) {
    const gl = this.gl;
    const u = {};
    for (const n of names) {
      u[n] = gl.getUniformLocation(prog, n);
    }
    return u;
  }
  _drawQuad(prog, buf) {
    const gl = this.gl;
    const loc = gl.getAttribLocation(prog, "a_pos");
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
};

// src/LiquidGlass.ts
var BUTTON_CLASS = "liquid-glass-button";
var STYLE_ID = "liquid-glass-button-styles";
var BUTTON_CSS = `
.${BUTTON_CLASS} {
	cursor: pointer;
}
`;
var LiquidGlass = class _LiquidGlass {
  // ────────────────────────────────────────────
  // Constructor (prefer LiquidGlass.init)
  // ────────────────────────────────────────────
  constructor({ root, glassElements, defaults = {} }) {
    /** Current frames-per-second (updated every frame). */
    this.fps = 0;
    this._running = false;
    this._rafId = 0;
    this._hasDynamic = false;
    /**
     * Genuinely-global dirty flag — set by events that legitimately
     * affect every glass at once (resize, WebGL context restored,
     * structural mutation of root, end of _start). On the next frame
     * the entry guard promotes it into per-element dirty marks for
     * every glass in glassSet, then clears itself.
     */
    this._globalDirty = true;
    /**
     * Per-element shader-render dirty set. Each entry is a glass
     * element that needs its WebGL pipeline to re-run on the next
     * frame. Drained at the end of _renderFrame.
     *
     * Mirrors _glassContentDirty (which tracks html-to-image content
     * captures) but for the WebGL shader pass instead of the DOM
     * raster pass — they have different triggers.
     */
    this._glassDirty = /* @__PURE__ */ new Set();
    /**
     * Elements (typically wrappers, glasses themselves, or descendants
     * of root) explicitly marked changed via the public markChanged()
     * API. The next frame fans each one out into _glassDirty by
     * intersecting against every glass's sample rect, then clears
     * the set.
     */
    this._userMarkedChanged = /* @__PURE__ */ new Set();
    this._capturingGlassContent = false;
    /**
     * Glass elements whose content image is stale and needs to be
     * re-captured. Per-element rather than a single global flag so a
     * mutation inside one glass subtree only re-captures that one
     * element instead of every glass on the page.
     */
    this._glassContentDirty = /* @__PURE__ */ new Set();
    this._fpsFrames = 0;
    this._fpsTime = 0;
    this._observer = null;
    this._glassSubtreeObserver = null;
    this._sortedChildren = [];
    this._glassCache = /* @__PURE__ */ new Map();
    this._glassContentImages = /* @__PURE__ */ new Map();
    this._glassLastSize = /* @__PURE__ */ new Map();
    this._buttonStates = /* @__PURE__ */ new Map();
    this._buttonListeners = /* @__PURE__ */ new Map();
    this._drag = {
      active: false,
      element: null,
      startX: 0,
      startY: 0,
      origTx: 0,
      origTy: 0
    };
    if (!root) throw new Error("LiquidGlass: `root` element is required.");
    this.root = root;
    this.defaults = { ...DEFAULTS, ...defaults };
    this.glassSet = new Set(Array.from(glassElements || []));
    this.glassCanvases = /* @__PURE__ */ new Map();
    this.capture = new HtmlCapture(root);
    this.capture.onCacheUpdate = (element) => {
      this._markGlassesIntersecting(element);
    };
    this.renderer = new GlassRenderer();
    this._sceneCanvas = document.createElement("canvas");
    this._sceneCtx = this._sceneCanvas.getContext("2d");
    this.renderer.canvas.addEventListener("webglcontextrestored", () => {
      this._glassCache.clear();
      this._globalDirty = true;
    });
    this._glassVpPos = /* @__PURE__ */ new Map();
    this._onScroll = () => {
      this._globalDirty = true;
    };
    this._onResize = this._handleResize.bind(this);
    this._onPointerDown = this._handlePointerDown.bind(this);
    this._onPointerMove = this._handlePointerMove.bind(this);
    this._onPointerUp = this._handlePointerUp.bind(this);
  }
  // ────────────────────────────────────────────
  // Static entry point
  // ────────────────────────────────────────────
  static async init(options) {
    const instance = new _LiquidGlass(options);
    await instance._start();
    return instance;
  }
  // ────────────────────────────────────────────
  // Lifecycle
  // ────────────────────────────────────────────
  async _start() {
    this._setupGlassElements();
    this._hasDynamic = this._detectDynamic();
    this._sortedChildren = this._getSortedChildren();
    this._handleResize();
    window.addEventListener("resize", this._onResize);
    window.addEventListener("scroll", this._onScroll, { passive: true, capture: true });
    document.addEventListener("scroll", this._onScroll, { passive: true, capture: true });
    window.addEventListener("wheel", this._onScroll, { passive: true });
    window.addEventListener("touchmove", this._onScroll, { passive: true });
    this.root.addEventListener("pointerdown", this._onPointerDown);
    window.addEventListener("pointermove", this._onPointerMove);
    window.addEventListener("pointerup", this._onPointerUp);
    this._observer = new MutationObserver(() => {
      this._sortedChildren = this._getSortedChildren();
      this._globalDirty = true;
    });
    this._observer.observe(this.root, { childList: true });
    this._glassSubtreeObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        const owner = this._closestGlassAncestor(mutation.target);
        if (mutation.type === "attributes" && mutation.attributeName === "data-config") {
          if (owner) this._markGlassAndDependents(owner);
          continue;
        }
        if (owner) {
          this._markGlassAndDependents(owner);
        }
      }
    });
    for (const el of this.glassSet) {
      this._glassSubtreeObserver.observe(el, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["data-config"]
      });
    }
    this._glassContentDirty.clear();
    this._running = true;
    this._globalDirty = true;
    this._rafId = requestAnimationFrame(() => this._renderLoop());
  }
  destroy() {
    this._running = false;
    cancelAnimationFrame(this._rafId);
    this.root.style.removeProperty("user-select");
    this.root.style.removeProperty("-webkit-user-select");
    window.removeEventListener("resize", this._onResize);
    window.removeEventListener("scroll", this._onScroll, { capture: true });
    document.removeEventListener("scroll", this._onScroll, { capture: true });
    window.removeEventListener("wheel", this._onScroll);
    window.removeEventListener("touchmove", this._onScroll);
    this._glassVpPos.clear();
    this.root.removeEventListener("pointerdown", this._onPointerDown);
    window.removeEventListener("pointermove", this._onPointerMove);
    window.removeEventListener("pointerup", this._onPointerUp);
    this._observer?.disconnect();
    this._observer = null;
    this._glassSubtreeObserver?.disconnect();
    this._glassSubtreeObserver = null;
    for (const [el, canvas] of this.glassCanvases) {
      canvas.remove();
      el.style.removeProperty("position");
      el.style.removeProperty("overflow");
      el.style.removeProperty("touch-action");
      el.classList.remove(BUTTON_CLASS);
    }
    this.glassCanvases.clear();
    this._glassCache.clear();
    this._glassContentImages.clear();
    this._glassLastSize.clear();
    for (const removers of this._buttonListeners.values()) {
      for (const r of removers) r();
    }
    this._buttonListeners.clear();
    this._buttonStates.clear();
    document.getElementById(STYLE_ID)?.remove();
    this.capture.destroy();
    this.renderer.destroy();
  }
  // ────────────────────────────────────────────
  // Glass element setup
  // ────────────────────────────────────────────
  _setupGlassElements() {
    let needsButtonStyles = false;
    for (const el of this.glassSet) {
      if (!this.root.contains(el)) {
        console.warn("LiquidGlass: glass element must be inside root, skipping.", el);
        this.glassSet.delete(el);
        continue;
      }
      const currentPosition = window.getComputedStyle(el).position;
      if (currentPosition === "static") {
        el.style.position = "relative";
      }
      el.style.overflow = "visible";
      const config = this._getConfig(el);
      if (config.floating) {
        el.style.touchAction = "none";
      }
      if (config.button) {
        el.classList.add(BUTTON_CLASS);
        needsButtonStyles = true;
        this._setupButtonListeners(el);
      }
      const canvas = document.createElement("canvas");
      canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:-1;";
      el.insertBefore(canvas, el.firstChild);
      this.glassCanvases.set(el, canvas);
    }
    if (needsButtonStyles && !document.getElementById(STYLE_ID)) {
      const style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = BUTTON_CSS;
      document.head.appendChild(style);
    }
  }
  /**
   * Walk up from a mutation target until we hit a glass element
   * registered on this instance. Returns null if the node isn't
   * inside any glass subtree (shouldn't normally happen since the
   * observers are scoped to glass elements, but the mutation target
   * may be a Text node or detached during a removal).
   */
  _closestGlassAncestor(node) {
    let cur = node;
    while (cur) {
      if (cur.nodeType === 1 && this.glassSet.has(cur)) {
        return cur;
      }
      cur = cur.parentNode;
    }
    return null;
  }
  /**
   * Mark a glass element (and any glass that visually depends on it
   * via z-order overlap) as needing a shader re-render on the next
   * frame.
   *
   * `rectOverride` lets callers pass a rect that differs from the
   * element's current bounding box — useful for drag, where we
   * want to invalidate both the *old* and *new* footprints in the
   * same call so glasses behind the dragged panel can clear its
   * trail and glasses ahead can pick up its new shadow.
   */
  _markGlassAndDependents(element, rectOverride) {
    if (this.glassSet.has(element)) {
      this._glassDirty.add(element);
    }
    const rootRect = this.root.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const elementDOMRect = rectOverride ?? element.getBoundingClientRect();
    const elementBox = this._getPixelRect(
      elementDOMRect,
      rootRect,
      dpr,
      this.glassSet.has(element) ? SHADOW_PAD : 0
    );
    let seenElement = false;
    for (const child of this._sortedChildren) {
      if (child === element) {
        seenElement = true;
        continue;
      }
      if (!seenElement) continue;
      if (!this.glassSet.has(child)) continue;
      const sampleRect = this._getPixelRect(
        child.getBoundingClientRect(),
        rootRect,
        dpr,
        SHADOW_PAD
      );
      if (_LiquidGlass._rectsIntersect(elementBox, sampleRect)) {
        this._glassDirty.add(child);
      }
    }
  }
  /**
   * Mark every glass element whose sample rect intersects the given
   * element's bounding rect, regardless of stacking order. Used by
   * the async cache-update callback (a wrapper's pixels just got
   * fresh, so any glass that samples them needs to re-render) and
   * by the public markChanged() API for elements outside the glass
   * set.
   */
  _markGlassesIntersecting(element) {
    const rootRect = this.root.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const elementBox = this._getPixelRect(
      element.getBoundingClientRect(),
      rootRect,
      dpr,
      this.glassSet.has(element) ? SHADOW_PAD : 0
    );
    for (const glass of this.glassSet) {
      const sampleRect = this._getPixelRect(
        glass.getBoundingClientRect(),
        rootRect,
        dpr,
        SHADOW_PAD
      );
      if (_LiquidGlass._rectsIntersect(elementBox, sampleRect)) {
        this._glassDirty.add(glass);
      }
    }
  }
  /**
   * Public API: mark an element (or all glass elements when called
   * with no arguments) as needing a shader re-render on the next
   * frame. Useful for content the library can't observe on its own —
   * a `<canvas>` whose pixels you just updated, an `<img>` you just
   * swapped via JS, a wrapper whose CSS background-image you just
   * changed, etc.
   *
   * For elements registered via `data-dynamic`, the library already
   * treats them as always-dirty and re-renders affected glasses
   * every frame; calling markChanged() on them is a no-op but is
   * harmless.
   *
   * @param element The element that changed visually. Pass nothing
   * (or `undefined`) to mark every glass on this instance dirty.
   */
  markChanged(element) {
    if (!element) {
      this._globalDirty = true;
      return;
    }
    this._userMarkedChanged.add(element);
  }
  _setupButtonListeners(el) {
    const state = { hover: false, pressed: false };
    this._buttonStates.set(el, state);
    const mark = () => this._markGlassAndDependents(el);
    const onOver = () => {
      state.hover = true;
      mark();
    };
    const onOut = () => {
      state.hover = false;
      state.pressed = false;
      mark();
    };
    const onDown = () => {
      state.pressed = true;
      mark();
    };
    const onUp = () => {
      state.pressed = false;
      mark();
    };
    el.addEventListener("pointerover", onOver);
    el.addEventListener("pointerout", onOut);
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    this._buttonListeners.set(el, [
      () => el.removeEventListener("pointerover", onOver),
      () => el.removeEventListener("pointerout", onOut),
      () => el.removeEventListener("pointerdown", onDown),
      () => el.removeEventListener("pointerup", onUp),
      () => el.removeEventListener("pointercancel", onUp)
    ]);
  }
  // ────────────────────────────────────────────
  // Glass content pre-capture
  // ────────────────────────────────────────────
  /**
   * Re-capture the DOM content (text, icons, etc.) of glass elements
   * whose subtrees have been mutated since the last capture, hiding
   * the injected shader canvas so it isn't included.
   *
   * Pass `targets = null` to capture every glass element (used at
   * init and on resize); pass a Set to capture only specific ones.
   *
   * Guarded against concurrent execution: if a capture is already
   * running, the affected elements stay in `_glassContentDirty` and
   * the next render-loop tick picks them up.
   */
  async _captureGlassContent(targets = null) {
    if (this._capturingGlassContent) return;
    this._capturingGlassContent = true;
    try {
      for (const [el, glassCanvas] of this.glassCanvases) {
        if (targets && !targets.has(el)) continue;
        const rect = el.getBoundingClientRect();
        const img = await this.capture.captureToCanvas(
          el,
          rect.width,
          rect.height,
          [glassCanvas]
        );
        if (img) {
          this._glassContentImages.set(el, img);
        }
      }
    } finally {
      this._capturingGlassContent = false;
    }
  }
  /**
   * Synchronously walk every non-glass direct child of root and
   * await its html-to-image capture so the cache is fully populated
   * by the time the render loop starts. Without this, the first
   * frame's glass shader sees an empty (white) local scene for
   * ~one or two frames while the async captures resolve.
   */
  async _prewarmStaticCaptures() {
    for (const child of this._sortedChildren) {
      if (this.glassSet.has(child)) continue;
      const tag = child.tagName;
      if (tag === "CANVAS" || tag === "IMG" || tag === "VIDEO") continue;
      if (child.hasAttribute("data-dynamic")) continue;
      try {
        await this.capture.captureElement(child, false);
      } catch (err) {
        console.warn("LiquidGlass: prewarm capture failed:", child, err);
      }
    }
  }
  // ────────────────────────────────────────────
  // Child ordering & stacking context
  // ────────────────────────────────────────────
  _getSortedChildren() {
    return Array.from(this.glassSet);
  }
  /**
   * Returns true when the element forms a CSS stacking context — i.e.
   * when its z-index participates in painting order. Mirrors the spec:
   * https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_positioned_layout/Stacking_context
   *
   * Used by `_getSortedChildren` to decide painting order for the
   * local scene assembly. The set of triggers needs to match the
   * browser's actual stacking model — otherwise overlays end up
   * painted before the background image and get erased.
   */
  static _formsStackingContext(style, isFlexOrGridParent) {
    if (style.position !== "static") return true;
    if (isFlexOrGridParent && style.zIndex !== "auto") return true;
    if (parseFloat(style.opacity) < 1) return true;
    if (style.transform !== "none" && style.transform !== "") return true;
    if (style.filter !== "none" && style.filter !== "") return true;
    if (style.perspective !== "none" && style.perspective !== "") return true;
    if (style.clipPath !== "none" && style.clipPath !== "") return true;
    if (style.mixBlendMode !== "normal" && style.mixBlendMode !== "") return true;
    if (style.isolation === "isolate") return true;
    const bf = style.backdropFilter || style.webkitBackdropFilter;
    if (bf && bf !== "none") return true;
    const mask = style.maskImage || style.webkitMaskImage;
    if (mask && mask !== "none") return true;
    const contain = style.contain;
    if (contain && /\b(layout|paint|strict|content)\b/.test(contain)) return true;
    if (style.willChange) {
      const triggers = /* @__PURE__ */ new Set([
        "transform",
        "opacity",
        "filter",
        "backdrop-filter",
        "perspective",
        "clip-path",
        "mask",
        "mask-image",
        "isolation",
        "mix-blend-mode"
      ]);
      const tokens = style.willChange.split(",").map((t) => t.trim());
      for (const t of tokens) {
        if (triggers.has(t)) return true;
      }
    }
    return false;
  }
  _detectDynamic() {
    if (typeof document !== 'undefined') {
      const bgVideo = document.querySelector('video.custom-bg-media');
      if (bgVideo && !bgVideo.paused && !bgVideo.ended) {
        return true;
      }
    }
    const dynEls = this.root.querySelectorAll("[data-dynamic]");
    for (const el of dynEls) {
      if (!this.glassSet.has(el)) {
        return true;
      }
    }
    const videos = this.root.querySelectorAll("video");
    for (const vid of videos) {
      if (!this.glassSet.has(vid)) {
        return true;
      }
    }
    return false;
  }
  // ────────────────────────────────────────────
  // Configuration
  // ────────────────────────────────────────────
  _getConfig(el) {
    const cachedEl = el;
    const configKey = el.dataset.config ?? "";
    if (cachedEl.configCacheKey !== configKey) {
      let perElement = {};
      if (configKey) {
        try {
          const parsed = JSON.parse(configKey);
          if (parsed && typeof parsed === "object") {
            perElement = parsed;
          } else {
            console.warn("LiquidGlass: data-config must decode to an object for element:", el);
          }
        } catch (_e) {
          console.warn("LiquidGlass: invalid JSON in data-config for element:", el);
        }
      }
      cachedEl.configCache = perElement;
      cachedEl.configCacheKey = configKey;
    }
    const config = { ...this.defaults, ...cachedEl.configCache || {} };
    if (config.button) {
      const state = this._buttonStates.get(el);
      if (state) {
        if (state.pressed) {
          config.zRadius = config.zRadius * 0.8;
          config.shadowSpread = config.shadowSpread * 1.2;
        } else if (state.hover) {
          config.brightness = config.brightness + 0.2;
        }
      }
    }
    return config;
  }
  // ────────────────────────────────────────────
  // Resize
  // ────────────────────────────────────────────
  _handleResize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.root.getBoundingClientRect();
    this.capture.resize(dpr);
    this.renderer.resize(Math.round(rect.width * dpr), Math.round(rect.height * dpr));
    for (const el of this.glassSet) {
      this._updateGlassCanvasSize(el);
    }
    this._glassCache.clear();
    for (const el of this.glassSet) this._glassContentDirty.add(el);
    this._globalDirty = true;
  }
  _updateGlassCanvasSize(el) {
    const canvas = this.glassCanvases.get(el);
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const elW = Math.round(el.offsetWidth);
    const elH = Math.round(el.offsetHeight);
    const padW = SHADOW_PAD * 2;
    const padH = SHADOW_PAD * 2;
    canvas.width = Math.round((elW + padW) * dpr);
    canvas.height = Math.round((elH + padH) * dpr);
    canvas.style.cssText = [
      "position:absolute",
      `left:${-SHADOW_PAD}px`,
      `top:${-SHADOW_PAD}px`,
      `width:${elW + padW}px`,
      `height:${elH + padH}px`,
      "pointer-events:none",
      "z-index:-1"
    ].join(";") + ";";
    this._glassLastSize.set(el, { w: elW, h: elH });
  }
  _checkGlassSizeChanges() {
    let changed = false;
    for (const el of this.glassSet) {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const last = this._glassLastSize.get(el);
      if (!last || Math.abs(last.w - w) > 0.5 || Math.abs(last.h - h) > 0.5) {
        this._updateGlassCanvasSize(el);
        this._glassCache.delete(el);
        this.capture.invalidateCache(el);
        this._glassDirty.add(el);
        changed = true;
      }
    }
    return changed;
  }
  // ────────────────────────────────────────────
  // Floating (drag) behaviour — Pointer Events
  // ────────────────────────────────────────────
  /** Parse the current translate(x, y) values from an element's transform. */
  static _getTranslateXY(el) {
    const style = getComputedStyle(el);
    const matrix = style.transform;
    if (!matrix || matrix === "none") return [0, 0];
    const m = matrix.match(/matrix\(([^)]+)\)/);
    if (m) {
      const parts = m[1].split(",").map(Number);
      return [parts[4] || 0, parts[5] || 0];
    }
    return [0, 0];
  }
  _handlePointerDown(e) {
    for (let i = this._sortedChildren.length - 1; i >= 0; i--) {
      const el = this._sortedChildren[i];
      if (!this.glassSet.has(el)) continue;
      const config = this._getConfig(el);
      if (!config.floating) continue;
      const rect = el.getBoundingClientRect();
      const elW = el.offsetWidth;
      const elH = el.offsetHeight;
      const visualLeft = rect.left + (rect.width - elW) / 2;
      const visualTop = rect.top + (rect.height - elH) / 2;
      if (e.clientX >= visualLeft && e.clientX <= visualLeft + elW && e.clientY >= visualTop && e.clientY <= visualTop + elH) {
        const [tx, ty] = _LiquidGlass._getTranslateXY(el);
        this._drag.active = true;
        this._drag.element = el;
        this._drag.startX = e.clientX;
        this._drag.startY = e.clientY;
        this._drag.origTx = tx;
        this._drag.origTy = ty;
        el.style.cursor = "grabbing";
        el.setPointerCapture(e.pointerId);
        e.preventDefault();
        break;
      }
    }
  }
  _handlePointerMove(e) {
    if (!this._drag.active) {
      for (const el2 of this.glassSet) {
        const config = this._getConfig(el2);
        if (!config.floating) continue;
        const rect = el2.getBoundingClientRect();
        const elW2 = el2.offsetWidth;
        const elH2 = el2.offsetHeight;
        const visualLeft = rect.left + (rect.width - elW2) / 2;
        const visualTop = rect.top + (rect.height - elH2) / 2;
        if (e.clientX >= visualLeft && e.clientX <= visualLeft + elW2 && e.clientY >= visualTop && e.clientY <= visualTop + elH2) {
          el2.style.cursor = "grab";
        } else {
          el2.style.cursor = "";
        }
      }
      return;
    }
    const el = this._drag.element;
    const dx = e.clientX - this._drag.startX;
    const dy = e.clientY - this._drag.startY;
    let newTx = this._drag.origTx + dx;
    let newTy = this._drag.origTy + dy;
    const rootRect = this.root.getBoundingClientRect();
    const elW = el.offsetWidth;
    const elH = el.offsetHeight;
    const elRect = el.getBoundingClientRect();
    const [curTx, curTy] = _LiquidGlass._getTranslateXY(el);
    const baseLeft = elRect.left + (elRect.width - elW) / 2 - rootRect.left - curTx;
    const baseTop = elRect.top + (elRect.height - elH) / 2 - rootRect.top - curTy;
    const margin = 10;
    const posLeft = baseLeft + newTx;
    const posTop = baseTop + newTy;
    const maxLeft = rootRect.width - elW - margin;
    const maxTop = rootRect.height - elH - margin;
    if (posLeft < margin) newTx += margin - posLeft;
    if (posTop < margin) newTy += margin - posTop;
    if (posLeft > maxLeft) newTx -= posLeft - maxLeft;
    if (posTop > maxTop) newTy -= posTop - maxTop;
    const oldRect = el.getBoundingClientRect();
    this._markGlassAndDependents(el, oldRect);
    el.style.transform = `translate(${newTx}px, ${newTy}px)`;
    this._markGlassAndDependents(el);
  }
  _handlePointerUp(_e) {
    if (!this._drag.active) return;
    const dragged = this._drag.element;
    dragged.style.cursor = "";
    this._drag.active = false;
    this._drag.element = null;
    this._markGlassAndDependents(dragged);
  }
  _isBackgroundDynamic() {
    if (typeof document === 'undefined') return false;
    const bgType = document.documentElement.getAttribute('data-bg-type') || document.documentElement.getAttribute('data-bg-style');
    if (bgType === 'galaxy' || bgType === 'vanta-fog') {
      return true;
    }
    if (bgType === 'custom-local') {
      const vid = document.querySelector('video.custom-bg-media');
      if (vid && !vid.paused && !vid.ended && vid.readyState >= 2) {
        return true;
      }
    }
    return false;
  }
  // ────────────────────────────────────────────
  // Render loop
  // ────────────────────────────────────────────
  _renderLoop() {
    if (!this._running) return;
    const now = performance.now();
    this._fpsFrames++;
    if (now - this._fpsTime >= 1e3) {
      this.fps = this._fpsFrames;
      this._fpsFrames = 0;
      this._fpsTime = now;
    }
    if (this._checkGlassSizeChanges()) {
    }
    if (this._isBackgroundDynamic()) {
      if (!this._lastBgSampleTime || now - this._lastBgSampleTime >= 80) {
        this._lastBgSampleTime = now;
        this._globalDirty = true;
      }
    }
    try {
      this._renderFrame();
    } catch (err) {
      console.error("LiquidGlass: render error:", err);
    }
    this._rafId = requestAnimationFrame(() => this._renderLoop());
  }
  _renderFrame() {
    const dpr = window.devicePixelRatio || 1;
    const rootRect = this.root.getBoundingClientRect();
    const isDragging = this._drag.active;
    if (this._userMarkedChanged.size > 0) {
      for (const el of this._userMarkedChanged) {
        this._markGlassesIntersecting(el);
      }
      this._userMarkedChanged.clear();
    }
    if (this._globalDirty) {
      for (const el of this.glassSet) this._glassDirty.add(el);
      this._globalDirty = false;
    }
    for (const child of this.glassSet) {
      const elRect = child.getBoundingClientRect();
      const last = this._glassVpPos.get(child);
      if (!last || Math.abs(last.left - elRect.left) > 0.25 || Math.abs(last.top - elRect.top) > 0.25) {
        this._glassDirty.add(child);
        this._glassVpPos.set(child, { left: elRect.left, top: elRect.top });
      }
    }
    const needsRender = this._glassDirty.size > 0 || this._hasDynamic || isDragging;
    if (!needsRender) return;
    const dirtyTargets = new Set(this._glassDirty);
    this._glassDirty.clear();
    const renderedThisFrame = [];
    for (const child of this._sortedChildren) {
      if (!this.glassSet.has(child)) continue;
      this._renderGlassElement(
        child,
        rootRect,
        dpr,
        isDragging,
        dirtyTargets,
        renderedThisFrame
      );
    }
  }
  /**
   * Render a single glass element by composing just the scene region
   * that can affect it, then running the shader over that local input.
   *
   * Whether the shader actually re-runs depends on:
   *   - explicit dirty mark for this element (in `dirtyTargets`),
   *   - any earlier glass in z-order that re-rendered this frame
   *     and whose rect intersects this glass's sample rect,
   *   - this glass having moved since last frame (position cache),
   *   - this glass having dynamic contributors in its sample (video,
   *     data-dynamic),
   *   - or active drag involving this element.
   *
   * On render, an entry is pushed to `renderedThisFrame` so later
   * glasses can check whether they need to refresh too.
   */
  _renderGlassElement(child, rootRect, dpr, isDragging, dirtyTargets, renderedThisFrame) {
    const config = this._getConfig(child);
    const elRect = child.getBoundingClientRect();
    const elW = child.offsetWidth;
    const elH = child.offsetHeight;
    const centerX = elRect.left - rootRect.left + elRect.width / 2;
    const centerY = elRect.top - rootRect.top + elRect.height / 2;
    const glassCanvas = this.glassCanvases.get(child);
    const isBeingDragged = isDragging && this._drag.element === child;
    const sampleRect = this._getPixelRect(elRect, rootRect, dpr, SHADOW_PAD);
    const cached = this._glassCache.get(child);
    const posChanged = !cached || Math.abs(cached.vpLeft - elRect.left) > 0.25 || Math.abs(cached.vpTop - elRect.top) > 0.25 || Math.abs(cached.centerX - centerX) > 0.5 || Math.abs(cached.centerY - centerY) > 0.5;
    const hasDynamicContributors = this._hasDynamic && this._glassHasDynamicContributors(child, sampleRect, rootRect, dpr);
    let priorGlassChanged = false;
    for (const r of renderedThisFrame) {
      if (_LiquidGlass._rectsIntersect(r.rect, sampleRect)) {
        priorGlassChanged = true;
        break;
      }
    }
    const isExplicitlyDirty = dirtyTargets.has(child);
    const needsShaderRender = isDragging ? isBeingDragged || isExplicitlyDirty || priorGlassChanged || hasDynamicContributors : !cached || posChanged || isExplicitlyDirty || priorGlassChanged || hasDynamicContributors;
    if (needsShaderRender && glassCanvas) {
      const renderW = glassCanvas.width;
      const renderH = glassCanvas.height;
      this._composeSceneForGlass(child, sampleRect, rootRect, dpr);
      this.renderer.uploadAndBlur(
        this._sceneCanvas,
        0,
        0,
        renderW,
        renderH,
        config.blurAmount
      );
      this.renderer.clear();
      this.renderer.renderGlassPanel(
        config,
        elW,
        elH,
        dpr
      );
      const ctx = glassCanvas.getContext("2d");
      ctx.clearRect(0, 0, glassCanvas.width, glassCanvas.height);
      ctx.drawImage(
        this.renderer.canvas,
        0,
        0,
        glassCanvas.width,
        glassCanvas.height,
        0,
        0,
        glassCanvas.width,
        glassCanvas.height
      );
      this._glassCache.set(child, { vpLeft: elRect.left, vpTop: elRect.top, centerX, centerY });
      renderedThisFrame.push({ rect: sampleRect });
    }
  }
  /**
   * Build the local input scene for a glass panel by walking only the
   * contributors that paint before it in the stacking order.
   */
  _composeSceneForGlass(currentGlass, sampleRect, rootRect, dpr) {
    this._prepareSceneCanvas(sampleRect.w, sampleRect.h);
    this._drawRealBackground(currentGlass, sampleRect, dpr);
    for (const child of this._sortedChildren) {
      if (child === currentGlass) break;
      if (this.glassSet.has(child)) {
        this._drawPriorGlassToScene(child, sampleRect, rootRect, dpr);
      } else {
        this._drawNonGlassChildToScene(child, sampleRect, rootRect, dpr);
      }
    }
  }
  _prepareSceneCanvas(width, height) {
    if (this._sceneCanvas.width !== width || this._sceneCanvas.height !== height) {
      this._sceneCanvas.width = width;
      this._sceneCanvas.height = height;
    } else {
      this._sceneCtx.clearRect(0, 0, width, height);
    }
  }
  _drawRealBackground(currentGlass, sampleRect, dpr) {
    const ctx = this._sceneCtx;
    const elRect = currentGlass.getBoundingClientRect();
    const cardVpX = elRect.left - SHADOW_PAD;
    const cardVpY = elRect.top - SHADOW_PAD;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const colorScheme = typeof document !== 'undefined' ? document.documentElement.getAttribute('data-color-scheme') : '';
    const themeStyle = typeof document !== 'undefined' ? document.documentElement.getAttribute('data-theme-style') : '';
    const isCyan = colorScheme === 'classic-cyan' || themeStyle === 'vanta-fog';
    const isCustom = colorScheme === 'custom';

    let fallbackColor = "#020108";
    let tintR = 6, tintG = 4, tintB = 16;

    if (isCyan) {
      fallbackColor = "#05161c";
      tintR = 3; tintG = 23; tintB = 32;
    } else if (isCustom && typeof window !== 'undefined') {
      const computedBg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
      if (computedBg) fallbackColor = computedBg;
      const computedPanel = getComputedStyle(document.documentElement).getPropertyValue('--panel-solid').trim() || fallbackColor;
      const m = computedPanel.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
      if (m) {
        tintR = parseInt(m[1], 16);
        tintG = parseInt(m[2], 16);
        tintB = parseInt(m[3], 16);
      }
    }

    ctx.fillStyle = fallbackColor;
    ctx.fillRect(0, 0, sampleRect.w, sampleRect.h);

    const dx = (0 - cardVpX) * dpr;
    const dy = (0 - cardVpY) * dpr;
    const dw = vw * dpr;
    const dh = vh * dpr;

    let backgroundDrawn = false;

    // 1. 优先采样用户本地自定义图片或视频背景（纯前端本地持久化，绝不上云）
    const customMedia = typeof document !== 'undefined' && document.querySelector('.custom-bg-media');
    if (customMedia) {
      try {
        if (customMedia.tagName === 'VIDEO') {
          if (customMedia.readyState >= 2 && customMedia.videoWidth > 0 && customMedia.videoHeight > 0) {
            this._drawMediaFitted(
              ctx,
              customMedia,
              customMedia.videoWidth,
              customMedia.videoHeight,
              customMedia,
              { width: vw, height: vh },
              dx,
              dy,
              dw,
              dh
            );
            backgroundDrawn = true;
          }
        } else if (customMedia.tagName === 'IMG') {
          if (customMedia.complete && customMedia.naturalWidth > 0 && customMedia.naturalHeight > 0) {
            this._drawMediaFitted(
              ctx,
              customMedia,
              customMedia.naturalWidth,
              customMedia.naturalHeight,
              customMedia,
              { width: vw, height: vh },
              dx,
              dy,
              dw,
              dh
            );
            backgroundDrawn = true;
          }
        }
      } catch (e) {
        console.warn('LiquidGlass failed to sample custom media:', e);
      }
    }

    // 2. 采样动态 Canvas 背景 (Galaxy / Vanta Fog)
    if (!backgroundDrawn && typeof document !== 'undefined') {
      const vantaCanvas = document.querySelector('.galaxy-atmosphere-canvas canvas, .vanta-atmosphere-canvas canvas, .atmosphere-canvas canvas');
      if (vantaCanvas && vantaCanvas.width > 0 && vantaCanvas.height > 0) {
        try {
          ctx.drawImage(vantaCanvas, dx, dy, dw, dh);
          backgroundDrawn = true;
        } catch (e) {
          ctx.fillStyle = fallbackColor;
          ctx.fillRect(0, 0, sampleRect.w, sampleRect.h);
        }
      }
    }

    // 3. 采样静态云山日光背景
    if (!backgroundDrawn && typeof document !== 'undefined') {
      const bgType = document.documentElement.getAttribute('data-bg-type') || document.documentElement.getAttribute('data-bg-style');
      if (bgType === 'clouds-static') {
        if (!this._cachedCloudsImg && typeof Image !== 'undefined') {
          this._cachedCloudsImg = new Image();
          this._cachedCloudsImg.onload = () => {
            this.markChanged();
          };
          this._cachedCloudsImg.src = '/assets/forecast/forecast-clouds-drift-seamless.jpg';
        }
        if (this._cachedCloudsImg && this._cachedCloudsImg.complete && this._cachedCloudsImg.naturalWidth > 0) {
          try {
            this._drawMediaFitted(
              ctx,
              this._cachedCloudsImg,
              this._cachedCloudsImg.naturalWidth,
              this._cachedCloudsImg.naturalHeight,
              this._cachedCloudsImg,
              { width: vw, height: vh },
              dx,
              dy,
              dw,
              dh
            );
            backgroundDrawn = true;
          } catch (e) {}
        }
      }
    }

    if (!backgroundDrawn) {
      const g1 = ctx.createLinearGradient(
        (0 - cardVpX) * dpr, 0,
        (vw - cardVpX) * dpr, 0
      );
      g1.addColorStop(0, `rgba(${tintR}, ${tintG}, ${tintB}, 0.15)`);
      g1.addColorStop(0.65, `rgba(${tintR}, ${tintG}, ${tintB}, 0.04)`);
      g1.addColorStop(1, `rgba(${tintR}, ${tintG}, ${tintB}, 0.08)`);
      ctx.fillStyle = g1;
      ctx.fillRect(0, 0, sampleRect.w, sampleRect.h);

      const g2 = ctx.createLinearGradient(
        0, (vh - cardVpY) * dpr,
        0, (0 - cardVpY) * dpr
      );
      g2.addColorStop(0, `rgba(${tintR}, ${tintG}, ${tintB}, 0.25)`);
      g2.addColorStop(0.55, `rgba(${tintR}, ${tintG}, ${tintB}, 0.0)`);
      g2.addColorStop(1.0, `rgba(${tintR}, ${tintG}, ${tintB}, 0.0)`);
      ctx.fillStyle = g2;
      ctx.fillRect(0, 0, sampleRect.w, sampleRect.h);
    }
  }
  _glassHasDynamicContributors(currentGlass, sampleRect, rootRect, dpr) {
    if (this._childHasDynamicContent(currentGlass)) return true;
    for (const child of this._sortedChildren) {
      if (child === currentGlass) break;
      if (this.glassSet.has(child)) continue;
      if (!this._childHasDynamicContent(child)) continue;
      if (this._childTouchesSample(child, sampleRect, rootRect, dpr)) {
        return true;
      }
    }
    return false;
  }
  _childHasDynamicContent(child) {
    if (child.hasAttribute("data-dynamic")) return true;
    if (child.tagName === "VIDEO") return true;
    return child.querySelector("[data-dynamic], video") !== null;
  }
  _drawNonGlassChildToScene(child, sampleRect, rootRect, dpr) {
    const tag = child.tagName;
    if (tag === "CANVAS" || tag === "IMG" || tag === "VIDEO") {
      this._drawMediaElement(child, this._sceneCtx, sampleRect, rootRect, dpr);
      return;
    }
    if (!this._elementTouchesSample(child, sampleRect, rootRect, dpr)) {
      return;
    }
    this._captureMediaDescendants(child, this._sceneCtx, sampleRect, rootRect, dpr);
    const isDynamic = child.hasAttribute("data-dynamic");
    this.capture.captureElement(child, isDynamic);
    const rect = this._getPixelRect(child.getBoundingClientRect(), rootRect, dpr);
    this.capture.drawCachedElement(
      child,
      this._sceneCtx,
      rect.x - sampleRect.x,
      rect.y - sampleRect.y,
      rect.w,
      rect.h
    );
  }
  /**
   * Recursively find and draw all img/video/canvas elements inside
   * a wrapper, skipping any glass elements and their injected canvases.
   */
  _captureMediaDescendants(parent, targetCtx, sampleRect, rootRect, dpr) {
    const mediaEls = parent.querySelectorAll("img, video, canvas");
    for (const el of mediaEls) {
      const htmlEl = el;
      let isGlassCanvas = false;
      for (const [, gc] of this.glassCanvases) {
        if (gc === el) {
          isGlassCanvas = true;
          break;
        }
      }
      if (isGlassCanvas) continue;
      this._drawMediaElement(htmlEl, targetCtx, sampleRect, rootRect, dpr);
    }
  }
  /** Draw a single img/video/canvas into a local scene canvas. */
  _drawMediaElement(el, targetCtx, sampleRect, rootRect, dpr) {
    const tag = el.tagName;
    const r = el.getBoundingClientRect();
    if (!this._elementTouchesSample(el, sampleRect, rootRect, dpr)) return false;
    const rect = this._getPixelRect(r, rootRect, dpr);
    const dx = rect.x - sampleRect.x;
    const dy = rect.y - sampleRect.y;
    const dw = rect.w;
    const dh = rect.h;
    if (dw <= 0 || dh <= 0) return false;
    if (tag === "CANVAS") {
      const liveCanvas = el;
      if (liveCanvas.width <= 0 || liveCanvas.height <= 0) return false;
      targetCtx.drawImage(liveCanvas, dx, dy, dw, dh);
      return true;
    } else if (tag === "IMG") {
      const img = el;
      if (!img.complete || img.naturalWidth === 0) return false;
      this._drawMediaFitted(
        targetCtx,
        img,
        img.naturalWidth,
        img.naturalHeight,
        el,
        r,
        dx,
        dy,
        dw,
        dh
      );
      return true;
    } else if (tag === "VIDEO") {
      const vid = el;
      if (vid.readyState < 1) return false;
      try {
        this._drawMediaFitted(
          targetCtx,
          vid,
          vid.videoWidth,
          vid.videoHeight,
          el,
          r,
          dx,
          dy,
          dw,
          dh
        );
      } catch {
        return false;
      }
      return true;
    }
    return false;
  }
  /** Draw an img or video onto a local scene canvas, respecting object-fit. */
  _drawMediaFitted(targetCtx, mediaEl, natW, natH, child, r, dx, dy, dw, dh) {
    if (natW && natH) {
      const computed = child && child.isConnected ? getComputedStyle(child) : { objectFit: "cover", objectPosition: "50% 50%" };
      const fit = computed.objectFit || "cover";
      const pos = computed.objectPosition || "50% 50%";
      const src = _LiquidGlass._objectFitRect(natW, natH, r.width, r.height, fit, pos);
      targetCtx.drawImage(mediaEl, src.sx, src.sy, src.sw, src.sh, dx, dy, dw, dh);
    } else {
      targetCtx.drawImage(mediaEl, dx, dy, dw, dh);
    }
  }
  _drawPriorGlassToScene(child, sampleRect, rootRect, dpr) {
    const glassCanvas = this.glassCanvases.get(child);
    const elRect = child.getBoundingClientRect();
    if (glassCanvas) {
      const shaderRect = this._getPixelRect(elRect, rootRect, dpr, SHADOW_PAD);
      if (_LiquidGlass._rectsIntersect(shaderRect, sampleRect)) {
        this._sceneCtx.drawImage(
          glassCanvas,
          0,
          0,
          glassCanvas.width,
          glassCanvas.height,
          shaderRect.x - sampleRect.x,
          shaderRect.y - sampleRect.y,
          shaderRect.w,
          shaderRect.h
        );
      }
    }
    const contentImg = this._glassContentImages.get(child);
    if (!contentImg) return;
    const contentRect = this._getPixelRect(elRect, rootRect, dpr);
    if (!_LiquidGlass._rectsIntersect(contentRect, sampleRect)) return;
    this._sceneCtx.drawImage(
      contentImg,
      contentRect.x - sampleRect.x,
      contentRect.y - sampleRect.y,
      contentRect.w,
      contentRect.h
    );
  }
  _getPixelRect(rect, rootRect, dpr, pad = 0) {
    return {
      x: Math.round((rect.left - rootRect.left - pad) * dpr),
      y: Math.round((rect.top - rootRect.top - pad) * dpr),
      w: Math.round((rect.width + pad * 2) * dpr),
      h: Math.round((rect.height + pad * 2) * dpr)
    };
  }
  _childTouchesSample(child, sampleRect, rootRect, dpr) {
    if (this._elementTouchesSample(child, sampleRect, rootRect, dpr)) return true;
    for (const el of child.querySelectorAll("[data-dynamic], video")) {
      if (this._elementTouchesSample(el, sampleRect, rootRect, dpr)) {
        return true;
      }
    }
    return false;
  }
  _elementTouchesSample(element, sampleRect, rootRect, dpr) {
    const pad = this._getPaintOverflowPad(element);
    const bounds = this._getPixelRect(element.getBoundingClientRect(), rootRect, dpr, pad);
    return _LiquidGlass._rectsIntersect(bounds, sampleRect);
  }
  _getPaintOverflowPad(element) {
    if (this.glassSet.has(element)) return SHADOW_PAD;
    const style = getComputedStyle(element);
    const backdropFilter = style.backdropFilter || style.webkitBackdropFilter;
    const maskImage = style.maskImage || style.webkitMaskImage;
    const paintsOutsideBounds = style.boxShadow && style.boxShadow !== "none" || style.textShadow && style.textShadow !== "none" || style.filter && style.filter !== "none" || backdropFilter && backdropFilter !== "none" || maskImage && maskImage !== "none" || style.mixBlendMode && style.mixBlendMode !== "normal";
    return paintsOutsideBounds ? SHADOW_PAD : 0;
  }
  static _rectsIntersect(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }
  /** Compute the source rectangle for drawImage that replicates CSS object-fit / object-position. */
  static _objectFitRect(natW, natH, boxW, boxH, fit, pos) {
    let sx = 0, sy = 0, sw = natW, sh = natH;
    if (fit === "fill" || fit === "scale-down" && natW <= boxW && natH <= boxH) {
      return { sx, sy, sw, sh };
    }
    const parts = pos.split(/\s+/);
    const parseFrac = (v, total) => {
      if (v.endsWith("%")) return parseFloat(v) / 100;
      return parseFloat(v) / total;
    };
    const fx = parseFrac(parts[0] || "50%", boxW);
    const fy = parseFrac(parts[1] || "50%", boxH);
    if (fit === "cover") {
      const scale = Math.max(boxW / natW, boxH / natH);
      sw = boxW / scale;
      sh = boxH / scale;
      sx = (natW - sw) * fx;
      sy = (natH - sh) * fy;
    } else if (fit === "contain" || fit === "scale-down") {
      return { sx: 0, sy: 0, sw: natW, sh: natH };
    } else if (fit === "none") {
      sw = boxW;
      sh = boxH;
      sx = (natW - sw) * fx;
      sy = (natH - sh) * fy;
    }
    sx = Math.max(0, Math.min(sx, natW - 1));
    sy = Math.max(0, Math.min(sy, natH - 1));
    sw = Math.min(sw, natW - sx);
    sh = Math.min(sh, natH - sy);
    return { sx, sy, sw, sh };
  }
};
export {
  DEFAULTS,
  LiquidGlass,
  invalidateFontEmbedCache
};
//# sourceMappingURL=index.js.map
