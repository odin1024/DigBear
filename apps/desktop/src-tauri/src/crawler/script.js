/* DigBear generic media extractor.
 *
 * Evaluate this whole expression in the loaded page (top frame) after an
 * initial settle/scroll pass. It is synchronous (no await / no promises) and
 * returns a JSON *string* shaped as:
 *
 *   { title, final_url, resources: [{ url, kind, source, filename_hint,
 *     width, height, duration, poster, alt }], warnings: [] }
 *
 * kind:   image | video | audio | font | other
 * source: img | picture | video | audio | css_background | css_font_face |
 *         link | meta | anchor | performance | inline_style | other
 *
 * Only absolute http(s) URLs are returned. data:/blob:/javascript:/about:
 * are skipped. Duplicate URLs (hash ignored) are merged. Hard cap ~1500.
 * The whole body is exception-guarded: it never throws.
 */
(function () {
  var warnings = [];
  var resources = [];
  var byUrl = Object.create(null);
  var MAX_RESOURCES = 1500;
  var MAX_RULES = 40000;
  var capped = false;
  var rulesSeen = 0;
  var base = (function () {
    try { return document.baseURI || location.href; } catch (e) { return location.href; }
  })();
  try { base = new URL(base, location.href).href; } catch (e2) { base = location.href; }

  var IMG_EXT = /\.(avif|apng|bmp|gif|ico|jfif|jpe?g|png|svg|tiff?|webp)(?:[?#]|$)/i;
  var VIDEO_EXT = /\.(avi|flv|m3u8|m4v|mkv|mov|mp4|mpd|ogv|ts|webm)(?:[?#]|$)/i;
  var AUDIO_EXT = /\.(aac|aiff?|flac|m4a|midi?|mp3|oga|ogg|opus|wav|weba|wma)(?:[?#]|$)/i;
  var FONT_EXT = /\.(eot|otf|ttf|woff2?)(?:[?#]|$)/i;
  var BAD_SCHEME = /^(?:data|blob|javascript|about|mailto|tel|file|filesystem|chrome-extension|moz-extension|edge-extension|webkit-extension):/i;

  function warn(msg) {
    if (warnings.length < 100) {
      try { warnings.push(String(msg).slice(0, 300)); } catch (e) {}
    }
  }

  function str(v) { return typeof v === 'string' ? v : ''; }

  function abs(u, baseUrl) {
    if (typeof u !== 'string') return null;
    u = u.trim();
    if (!u || u.charAt(0) === '#' || u.length > 8192) return null;
    if (BAD_SCHEME.test(u)) return null;
    try {
      var r = new URL(u, baseUrl || base);
      if (r.protocol !== 'http:' && r.protocol !== 'https:') return null;
      r.hash = '';
      return r.href;
    } catch (e) { return null; }
  }

  function kindOfExt(url) {
    if (!url) return null;
    if (FONT_EXT.test(url)) return 'font';
    if (VIDEO_EXT.test(url)) return 'video';
    if (AUDIO_EXT.test(url)) return 'audio';
    if (IMG_EXT.test(url)) return 'image';
    return null;
  }

  function filenameHint(url) {
    try {
      var path = new URL(url).pathname;
      var segs = path.split('/');
      var seg = segs[segs.length - 1] || '';
      try { seg = decodeURIComponent(seg); } catch (e) {}
      seg = seg.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim();
      if (!seg || seg === '.' || seg === '..') return null;
      if (seg.length > 180) seg = seg.slice(0, 180);
      return seg;
    } catch (e) { return null; }
  }

  function pickNumber(v) {
    var n = Number(v);
    return isFinite(n) && n > 0 ? n : null;
  }

  function applyInfo(r, info) {
    if (!info) return;
    if (r.width == null && info.width != null) r.width = info.width;
    if (r.height == null && info.height != null) r.height = info.height;
    if (r.duration == null && info.duration != null) r.duration = info.duration;
    if (r.poster == null && info.poster != null) r.poster = info.poster;
    if (r.alt == null && info.alt != null) r.alt = info.alt;
  }

  function mergeInto(r, kind, source, info) {
    if (r.kind === 'other' && kind && kind !== 'other') {
      r.kind = kind;
      if (source) r.source = source;
    }
    if (info) {
      // alt text only makes sense for image entries; do not let an anchor
      // label leak into a video/audio/font entry that shares the same URL.
      var mergeInfo = info;
      if (r.kind !== 'image' && info.alt != null) {
        mergeInfo = {
          width: info.width, height: info.height,
          duration: info.duration, poster: info.poster, alt: null
        };
      }
      applyInfo(r, mergeInfo);
    }
  }

  function add(url, kind, source, info) {
    if (!url) return;
    var key = url;
    var existing = byUrl[key];
    if (existing) { mergeInto(existing, kind, source, info); return; }
    if (resources.length >= MAX_RESOURCES) { capped = true; return; }
    var resolvedKind = kind || kindOfExt(url) || 'other';
    var r = {
      url: key,
      kind: resolvedKind,
      source: source || 'other',
      filename_hint: filenameHint(url),
      width: null,
      height: null,
      duration: null,
      poster: null,
      alt: null
    };
    applyInfo(r, info);
    resources.push(r);
    byUrl[key] = r;
    if (resources.length >= MAX_RESOURCES) capped = true;
  }

  function section(name, fn) {
    try { fn(); } catch (e) {
      warn('section "' + name + '" failed: ' + ((e && e.message) || e));
    }
  }

  // --- srcset -------------------------------------------------------------
  function addSrcset(srcset, source, info) {
    var text = str(srcset);
    if (!text) return;
    var parts = text.split(',');
    for (var i = 0; i < parts.length; i++) {
      var t = parts[i].trim();
      if (!t) continue;
      var candidate = t.split(/\s+/)[0];
      var u = abs(candidate);
      if (u) add(u, (info && info.kind) || 'image', source, info);
    }
  }

  // --- generic url(...) extraction from CSS text --------------------------
  var CSS_URL_RE = /url\(\s*(?:'([^']*)'|"([^"]*)"|([^)'"\s]+))\s*\)/gi;
  function addCssUrls(text, sheetBase, source, kindHint, limit) {
    if (!text || typeof text !== 'string' || text.indexOf('url(') === -1) return;
    var n = 0;
    var max = limit || 400;
    var m;
    CSS_URL_RE.lastIndex = 0;
    while ((m = CSS_URL_RE.exec(text)) && n < max) {
      n++;
      var raw = m[1] || m[2] || m[3] || '';
      var u = abs(raw, sheetBase);
      if (!u) continue;
      var kind = kindHint || kindOfExt(u) || 'image';
      add(u, kind, source, null);
    }
  }

  function urlsInAttrValue(value) {
    var out = [];
    if (!value) return out;
    var m;
    CSS_URL_RE.lastIndex = 0;
    while ((m = CSS_URL_RE.exec(value))) {
      var raw = m[1] || m[2] || m[3] || '';
      if (raw) out.push(raw);
    }
    if (!out.length) {
      var v = String(value).trim();
      // data-src / data-bg often hold a bare relative or absolute URL.
      if (v && v.length < 4096 && !/[\s,{}]/.test(v)) out.push(v);
    }
    return out;
  }


  // --- 通用子树扫描 ------------------------------------------------------
  // 同源 iframe、Shadow DOM 里的媒体用这一段统一处理。
  function scanMediaIn(root, rootBase, sourceLabel) {
    if (!root || !root.querySelectorAll) return;

    var imgs = root.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i];
      var info = { alt: str(img.getAttribute('alt')) || null };
      var nw = img.naturalWidth, nh = img.naturalHeight;
      if (nw > 0) info.width = nw;
      if (nh > 0) info.height = nh;
      var current = '';
      try { current = img.currentSrc || ''; } catch (e) {}
      add(abs(current, rootBase), 'image', sourceLabel, info);
      add(abs(img.getAttribute('src'), rootBase), 'image', sourceLabel, info);
      addSrcset(img.getAttribute('srcset'), sourceLabel, info);
    }

    var pictures = root.querySelectorAll('picture');
    for (var p = 0; p < pictures.length; p++) {
      var sources = pictures[p].querySelectorAll('source');
      for (var q = 0; q < sources.length; q++) {
        addSrcset(sources[q].getAttribute('srcset'), sourceLabel, { kind: 'image' });
        add(abs(sources[q].getAttribute('src'), rootBase), 'image', sourceLabel, null);
      }
    }

    var media = root.querySelectorAll('video, audio');
    for (var m = 0; m < media.length; m++) {
      var el = media[m];
      var tag = (el.tagName || '').toLowerCase();
      var kind = tag === 'video' ? 'video' : 'audio';
      var info = {};
      var mw = pickNumber(el.videoWidth), mh = pickNumber(el.videoHeight);
      if (mw) info.width = mw;
      if (mh) info.height = mh;
      var mdur = Number(el.duration);
      if (isFinite(mdur) && mdur > 0) info.duration = Math.round(mdur * 1000) / 1000;
      var poster = abs(el.getAttribute('poster'), rootBase);
      if (poster && tag === 'video') { info.poster = poster; add(poster, 'image', sourceLabel, null); }
      var mcur = '';
      try { mcur = el.currentSrc || ''; } catch (e) {}
      add(abs(mcur, rootBase), kind, sourceLabel, info);
      add(abs(el.getAttribute('src'), rootBase), kind, sourceLabel, info);
      var inner = el.querySelectorAll('source');
      for (var s = 0; s < inner.length; s++) {
        add(abs(inner[s].getAttribute('src'), rootBase), kind, sourceLabel, info);
        addSrcset(inner[s].getAttribute('srcset'), sourceLabel, { kind: kind });
      }
      var tracks = el.querySelectorAll('track');
      for (var tr = 0; tr < tracks.length; tr++) {
        add(abs(tracks[tr].getAttribute('src'), rootBase), 'other', sourceLabel, null);
      }
    }

    var anchors = root.querySelectorAll('a[href]');
    for (var a = 0; a < anchors.length; a++) {
      var au = abs(anchors[a].getAttribute('href'), rootBase);
      if (!au) continue;
      var akind = kindOfExt(au);
      if (!akind) continue;
      var atext = '';
      try { atext = (anchors[a].textContent || '').replace(/\s+/g, ' ').trim().slice(0, 200); } catch (e) {}
      add(au, akind, sourceLabel, { alt: atext || null });
    }

    var styled = root.querySelectorAll('[style]');
    for (var st = 0; st < styled.length; st++) {
      var styleText = styled[st].getAttribute('style') || '';
      if (styleText.indexOf('url(') === -1) continue;
      addCssUrls(styleText, rootBase, sourceLabel, null);
    }

    var styleTags = root.querySelectorAll('style');
    for (var sg = 0; sg < styleTags.length; sg++) {
      var text = styleTags[sg].textContent || '';
      if (!text || text.indexOf('url(') === -1) continue;
      addCssUrls(text, rootBase, sourceLabel, null);
    }

    var links = root.querySelectorAll('link[href]');
    for (var l = 0; l < links.length; l++) {
      var rel = str(links[l].getAttribute('rel')).toLowerCase();
      if (!rel) continue;
      var href = abs(links[l].getAttribute('href'), rootBase);
      if (!href) continue;
      var rels = rel.split(/\s+/);
      if (rels.indexOf('icon') !== -1 || rels.indexOf('apple-touch-icon') !== -1) {
        add(href, 'image', sourceLabel, null);
      }
    }
  }

  // --- 1. img -------------------------------------------------------------
  section('img', function () {
    var imgs = document.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i];
      var info = { alt: str(img.getAttribute('alt')) || null };
      var nw = img.naturalWidth, nh = img.naturalHeight;
      if (nw > 0) info.width = nw;
      if (nh > 0) info.height = nh;
      var current = '';
      try { current = img.currentSrc || ''; } catch (e) {}
      add(abs(current), 'image', 'img', info);
      add(abs(img.getAttribute('src')), 'image', 'img', info);
      addSrcset(img.getAttribute('srcset'), 'img', info);
    }
  });

  // --- picture ------------------------------------------------------------
  section('picture', function () {
    var pictures = document.querySelectorAll('picture');
    for (var i = 0; i < pictures.length; i++) {
      var sources = pictures[i].querySelectorAll('source');
      for (var j = 0; j < sources.length; j++) {
        var s = sources[j];
        addSrcset(s.getAttribute('srcset'), 'picture', { kind: 'image' });
        add(abs(s.getAttribute('src')), 'image', 'picture', null);
      }
    }
  });

  // --- lazy attributes ----------------------------------------------------
  section('lazy_attrs', function () {
    var ATTRS = [
      'data-src', 'data-original', 'data-lazy-src', 'data-url', 'data-image',
      'data-bg', 'data-background', 'data-background-image'
    ];
    var selector = ATTRS.map(function (a) { return '[' + a + ']'; }).join(',');
    var els;
    try { els = document.querySelectorAll(selector); } catch (e) { return; }
    var SKIP_TAGS = {
      script: 1, link: 1, style: 1, iframe: 1, noscript: 1, template: 1, meta: 1
    };
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var tag = (el.tagName || '').toLowerCase();
      if (SKIP_TAGS[tag]) continue;
      var kind = tag === 'video' ? 'video' : (tag === 'audio' ? 'audio' : null);
      var source = tag === 'video' ? 'video' : (tag === 'audio' ? 'audio' : 'other');
      var inPicture = false;
      try { inPicture = !!(el.closest && el.closest('picture')); } catch (e) {}
      if (inPicture) source = 'picture';
      for (var a = 0; a < ATTRS.length; a++) {
        var attr = ATTRS[a];
        var raw = el.getAttribute && el.getAttribute(attr);
        if (!raw) continue;
        var isBg = attr === 'data-bg' || attr === 'data-background' || attr === 'data-background-image';
        var found = urlsInAttrValue(raw);
        for (var k = 0; k < found.length; k++) {
          var u = abs(found[k]);
          if (!u) continue;
          var k2 = kind || kindOfExt(u);
          // Only image-bearing elements/background attrs may fall back to image.
          // Anything else (scripts, data-src on arbitrary nodes) must match a
          // known media extension, otherwise it would pollute the result list.
          if (!k2) {
            if (isBg || tag === 'img' || tag === 'source' || inPicture) k2 = 'image';
            else continue;
          }
          var src2 = isBg ? 'css_background' : (tag === 'img' ? 'img' : source);
          add(u, k2, src2, null);
        }
      }
    }
  });

  // --- 2. video / audio / poster -----------------------------------------
  section('media_elements', function () {
    var els = document.querySelectorAll('video, audio');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var tag = (el.tagName || '').toLowerCase();
      var kind = tag === 'video' ? 'video' : 'audio';
      var info = {};
      var w = pickNumber(el.videoWidth);
      var h = pickNumber(el.videoHeight);
      if (w) info.width = w;
      if (h) info.height = h;
      var dur = Number(el.duration);
      if (isFinite(dur) && dur > 0) info.duration = Math.round(dur * 1000) / 1000;
      var poster = abs(el.getAttribute('poster'));
      if (poster && tag === 'video') info.poster = poster;
      var current = '';
      try { current = el.currentSrc || ''; } catch (e) {}
      add(abs(current), kind, tag, info);
      add(abs(el.getAttribute('src')), kind, tag, info);
      var sources = el.querySelectorAll('source');
      for (var j = 0; j < sources.length; j++) {
        add(abs(sources[j].getAttribute('src')), kind, tag, info);
        add(abs(sources[j].getAttribute('srcset')), kind, tag, info);
      }
      if (poster) add(poster, 'image', 'video', null);
    }
  });

  section('video_poster_attrs', function () {
    var els = document.querySelectorAll('video[poster]');
    for (var i = 0; i < els.length; i++) {
      add(abs(els[i].getAttribute('poster')), 'image', 'video', null);
    }
  });

  // --- 3. link rel=preload / icon ----------------------------------------
  section('link', function () {
    var AS_KIND = { image: 'image', font: 'font', video: 'video', audio: 'audio' };
    var links = document.querySelectorAll('link[href]');
    for (var i = 0; i < links.length; i++) {
      var l = links[i];
      var rel = str(l.getAttribute('rel')).toLowerCase();
      if (!rel) continue;
      var rels = rel.split(/\s+/);
      var as = str(l.getAttribute('as')).toLowerCase();
      var href = abs(l.getAttribute('href'));
      if (!href) continue;
      var isIcon = rels.indexOf('icon') !== -1 || rels.indexOf('apple-touch-icon') !== -1 ||
        rels.indexOf('mask-icon') !== -1;
      if (rels.indexOf('preload') !== -1) {
        var kind = AS_KIND[as];
        if (kind) {
          add(href, kind, 'link', null);
          if (as === 'image') addSrcset(l.getAttribute('imagesrcset'), 'link', { kind: 'image' });
        }
      } else if (isIcon) {
        add(href, 'image', 'link', null);
      } else if (rels.indexOf('manifest') !== -1) {
        add(href, 'other', 'link', null);
      }
    }
  });

  // --- 4. meta og / twitter ----------------------------------------------
  section('meta', function () {
    var MAP = {
      'og:image': 'image', 'og:image:url': 'image', 'og:image:secure_url': 'image',
      'og:video': 'video', 'og:video:url': 'video', 'og:video:secure_url': 'video',
      'og:audio': 'audio', 'og:audio:url': 'audio', 'og:audio:secure_url': 'audio',
      'twitter:image': 'image', 'twitter:image:src': 'image',
      'twitter:player:stream': 'video'
    };
    var metas = document.querySelectorAll('meta[content]');
    for (var i = 0; i < metas.length; i++) {
      var m = metas[i];
      var key = str(m.getAttribute('property') || m.getAttribute('name') || m.getAttribute('itemprop')).toLowerCase();
      var kind = MAP[key];
      if (!kind) continue;
      add(abs(m.getAttribute('content')), kind, 'meta', null);
    }
    var micro = document.querySelectorAll('[itemprop="image"], [itemprop="thumbnailUrl"], [itemprop="contentUrl"]');
    for (var j = 0; j < micro.length; j++) {
      var el = micro[j];
      var raw = el.getAttribute('content') || el.getAttribute('src') || el.getAttribute('href');
      add(abs(raw), 'image', 'meta', null);
    }
  });

  // --- 4b. anchors to media files ---------------------------------------
  section('anchor', function () {
    var links = document.querySelectorAll('a[href]');
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      var u = abs(a.getAttribute('href'));
      if (!u) continue;
      var kind = kindOfExt(u);
      if (!kind) continue;
      var text = '';
      try { text = (a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 200); } catch (e) {}
      add(u, kind, 'anchor', { alt: text || null });
    }
  });

  // --- 5a. inline style attributes ---------------------------------------
  section('inline_style', function () {
    var els = document.querySelectorAll('[style]');
    for (var i = 0; i < els.length; i++) {
      var style = els[i].getAttribute('style') || '';
      if (style.indexOf('url(') === -1) continue;
      addCssUrls(style, base, 'inline_style', null);
    }
  });

  // --- 5b. inline <style> text (with @font-face context detection) -------
  section('style_text', function () {
    var styles = document.querySelectorAll('style');
    for (var i = 0; i < styles.length; i++) {
      var text = styles[i].textContent || '';
      if (!text || text.indexOf('url(') === -1) continue;
      var m;
      CSS_URL_RE.lastIndex = 0;
      var guard = 0;
      while ((m = CSS_URL_RE.exec(text)) && guard < 2000) {
        guard++;
        var idx = m.index;
        var prefix = text.slice(0, idx);
        var lastBrace = prefix.lastIndexOf('}');
        var lastFontFace = prefix.lastIndexOf('@font-face');
        var inFontFace = lastFontFace !== -1 && lastFontFace > lastBrace;
        var raw = m[1] || m[2] || m[3] || '';
        var u = abs(raw, base);
        if (!u) continue;
        if (inFontFace) add(u, 'font', 'css_font_face', null);
        else add(u, kindOfExt(u) || 'image', 'inline_style', null);
      }
    }
  });

  // --- 6. CSSOM (recursive, cross-origin guarded) ------------------------
  section('cssom', function () {
    function walkRules(rules, sheetBase, depth) {
      if (!rules || depth > 12) return;
      for (var i = 0; i < rules.length; i++) {
        if (rulesSeen >= MAX_RULES) { warn('cssom: rule cap reached (' + MAX_RULES + ')'); return; }
        rulesSeen++;
        var rule = rules[i];
        try {
          var cssText = rule.cssText || '';
          var type = rule.type;
          var isFontFace = type === 5 || /@font-face/i.test(cssText);
          if (isFontFace) {
            addCssUrls(cssText, sheetBase, 'css_font_face', 'font', 200);
          } else if (rule.style) {
            addCssUrls(cssText, sheetBase, 'css_background', null, 300);
          }
          if (rule.cssRules && rule.cssRules.length) {
            walkRules(rule.cssRules, sheetBase, depth + 1);
          } else if (rule.styleSheet) {
            walkSheet(rule.styleSheet, depth + 1);
          }
        } catch (e) {
          warn('cssom: rule skipped (' + ((e && e.name) || 'Error') + ')');
        }
      }
    }
    function walkSheet(sheet, depth) {
      if (!sheet || depth > 12) return;
      var rules = null;
      try {
        rules = sheet.cssRules;
      } catch (e) {
        warn('cssom: cross-origin/inaccessible stylesheet skipped: ' +
          (sheet.href || '(inline)') + ' [' + ((e && e.name) || 'Error') + ']');
        return;
      }
      if (!rules) return;
      walkRules(rules, sheet.href || base, depth);
    }
    var sheets = document.styleSheets || [];
    for (var i = 0; i < sheets.length; i++) {
      try { walkSheet(sheets[i], 0); } catch (e) {
        warn('cssom: stylesheet skipped (' + ((e && e.name) || 'Error') + ')');
      }
    }
    var adopted = null;
    try { adopted = document.adoptedStyleSheets || null; } catch (e) {}
    if (adopted) {
      for (var j = 0; j < adopted.length; j++) {
        try { walkSheet(adopted[j], 0); } catch (e) {
          warn('cssom: adopted stylesheet skipped (' + ((e && e.name) || 'Error') + ')');
        }
      }
    }
  });

  // --- 7. performance resource timing ------------------------------------
  section('performance', function () {
    var entries = [];
    try { entries = performance.getEntriesByType('resource') || []; } catch (e) {}
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      var name = abs(entry && entry.name);
      if (!name) continue;
      var initiator = str(entry.initiatorType).toLowerCase();
      var kind = null;
      if (initiator === 'img' || initiator === 'image') kind = 'image';
      else if (initiator === 'video') kind = 'video';
      else if (initiator === 'audio') kind = 'audio';
      else kind = kindOfExt(name);
      if (!kind) continue;
      add(name, kind, 'performance', null);
    }
  });

  // --- 8. inline JSON / HTML media URLs ----------------------------------
  // X/Twitter exposes the HLS master playlist and all variants in its page
  // payload; performance entries often only contain the currently selected
  // (lower) variant. Scan the page source for master playlists as well.
  section('inline_media_urls', function () {
    var html = '';
    try { html = (document.documentElement && document.documentElement.outerHTML) || ''; } catch (e) {}
    if (!html) return;
    html = html.replace(/\\\//g, '/').replace(/&amp;/g, '&');
    if (html.length > 5 * 1024 * 1024) html = html.slice(0, 5 * 1024 * 1024);
    var re = /https?:\/\/[^\s"'<>\\]+?\.(?:m3u8|mpd)(?:\?[^\s"'<>\\]*)?/gi;
    var found = 0;
    var match;
    while ((match = re.exec(html)) && found < 60) {
      var u = abs(match[0]);
      if (!u) continue;
      // For X, variants live under /pl/avc1/<w>x<h>/; the master is /pl/<name>.m3u8.
      if (/video\.twimg\.com\/.*\/pl\/avc1\//.test(u)) continue;
      if (/video\.twimg\.com\/.*\/pl\/mp4a\//.test(u)) continue;
      add(u, 'video', 'other', null);
      found++;
    }
  });

  // --- 8. SVG <image> -----------------------------------------------------
  section('svg_image', function () {
    var images = [];
    try { images = document.querySelectorAll('image'); } catch (e) {}
    for (var i = 0; i < images.length; i++) {
      var el = images[i];
      var raw = el.getAttribute('href') || el.getAttribute('xlink:href') || '';
      add(abs(raw), 'image', 'other', null);
    }
  });


  // --- 9. Shadow DOM（开放模式）------------------------------------------
  section('shadow_dom', function () {
    var all = document.querySelectorAll('*');
    var scanned = 0;
    for (var i = 0; i < all.length && scanned < 400; i++) {
      var host = all[i];
      var shadow = null;
      try { shadow = host.shadowRoot; } catch (e) { shadow = null; }
      if (!shadow) continue;
      scanned++;
      scanMediaIn(shadow, base, 'shadow');
    }
  });

  // --- 10. 同源 iframe ----------------------------------------------------
  // 跨域 iframe 读不到内容，只记一条 warning；
  // 同源 iframe 里的图片、视频直接收进来 —— 上游版本抓不到这一层。
  section('iframes', function () {
    var frames = document.querySelectorAll('iframe, frame');
    var opened = 0;
    for (var i = 0; i < frames.length; i++) {
      var frame = frames[i];
      var src = str(frame.getAttribute('src'));
      var frameBase = abs(src) || base;
      var doc = null;
      try { doc = frame.contentDocument; } catch (e) { doc = null; }
      if (!doc) {
        if (src) warn('iframe 无法读取（跨域或尚未加载）: ' + src.slice(0, 160));
        continue;
      }
      opened++;
      var root = doc.body || doc.documentElement;
      if (root) scanMediaIn(root, frameBase, 'iframe');
    }
    if (opened === 0 && frames.length) {
      warn('页面里有 ' + frames.length + ' 个 iframe，但一个都读不到（多为跨域）');
    }
  });

  // --- 11. track / object / embed ---------------------------------------
  section('tracks_and_embeds', function () {
    var tracks = document.querySelectorAll('track[src]');
    for (var i = 0; i < tracks.length; i++) {
      add(abs(tracks[i].getAttribute('src')), 'other', 'other', null);
    }
    var embeds = document.querySelectorAll('object[data], embed[src]');
    for (var j = 0; j < embeds.length; j++) {
      var raw = embeds[j].getAttribute('data') || embeds[j].getAttribute('src');
      var u = abs(raw);
      if (!u) continue;
      var kind = kindOfExt(u);
      if (kind) add(u, kind, 'other', null);
    }
  });

  // For X/Twitter, prefer the master playlist and hide lower variants.
  var twitterMaster = false;
  for (var mi = 0; mi < resources.length; mi++) {
    if (/video\.twimg\.com\/.*\/pl\//.test(resources[mi].url) && !/\/avc1\//.test(resources[mi].url)) {
      twitterMaster = true;
      break;
    }
  }
  if (twitterMaster) {
    resources = resources.filter(function (r) {
      return !/video\.twimg\.com\/.*\/pl\/avc1\//.test(r.url);
    });
  }

  // --- output -------------------------------------------------------------
  if (capped) warn('resource cap reached (' + MAX_RESOURCES + '); results truncated');
  if (!resources.length) warn('no media resources discovered');
  if (rulesSeen >= MAX_RULES) warn('cssom: stopped after ' + rulesSeen + ' rules');

  var out = {
    title: str(document.title),
    final_url: (function () { try { return location.href; } catch (e) { return ''; } })(),
    resources: resources,
    warnings: warnings
  };
  try {
    return JSON.stringify(out);
  } catch (e) {
    return JSON.stringify({ title: '', final_url: '', resources: [], warnings: ['stringify failed: ' + ((e && e.message) || e)] });
  }
})();
