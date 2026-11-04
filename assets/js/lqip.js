/**
 * lqip.js · Low-Quality Image Placeholder helpers
 * Plain script, attaches to window. No ES modules.
 */

// ──────────────────────────────────────────────────────────────
// Hero sizes - separate from grid cards
// ──────────────────────────────────────────────────────────────
window.HERO_SIZES = '(min-width: 1600px) 800px, 100vw';

// ──────────────────────────────────────────────────────────────
// Path derivation from game.image
// ──────────────────────────────────────────────────────────────
window.getImageUrls = function(gameImage) {
    if (!gameImage || typeof gameImage !== 'string') return null;
    const normalized = gameImage.replace(/\\/g, '/');
    if (!normalized.startsWith('assets/images/')) return null;
    const base = normalized
        .replace('assets/images/', '')
        .replace(/\.[^.]+$/, '');
    return {
        full:  `/assets/images/${base}.webp`,
        small: `/assets/images/${base}-140.webp`,
        lqip:  `/assets/images/lqip/${base}.webp`,
        sizes: '(min-width: 1600px) 400px, (max-width: 640px) 50vw, 140px'
    };
};

// ──────────────────────────────────────────────────────────────
// HTML string renderer
// ──────────────────────────────────────────────────────────────
window.renderImageCard = function({ lqip, small, full, alt, sizes, hero = false }) {
    const cls = hero ? 'img-wrap hero-cover' : 'img-wrap';
    return `<figure class="${cls}" style="--lqip:url('${lqip}')">
  <img src="${small}" srcset="${small} 140w, ${full} 400w" sizes="${sizes}"
       width="400" height="400" loading="lazy" decoding="async" alt="${alt || ''}">
</figure>`;
};

// ──────────────────────────────────────────────────────────────
// Per-image load/error handling with fallback chain
// ──────────────────────────────────────────────────────────────
window.attachImageListeners = function(img) {
    if (img.dataset.cancelled === '1') return;

    const fig = img.closest('.img-wrap');
    const fallbackStep = img.dataset.fallbackStep || '0';

    const onLoad = () => {
        img.classList.add('loaded');
        if (fig) fig.classList.add('loaded');
    };

    const onError = () => {
        if (fallbackStep === '0') {
            img.dataset.fallbackStep = '1';
            img.srcset = '';
            img.src = img.dataset.full;
            window.attachImageListeners(img);
        } else if (fallbackStep === '1') {
            img.dataset.fallbackStep = '2';
            img.srcset = '';
            img.src = img.dataset.originalSrc;
            window.attachImageListeners(img);
        } else {
            img.classList.add('error');
            if (fig) fig.classList.add('loaded'); // show LQIP as final
        }
    };

    // Mark wrapper as loading (shows LQIP, hides skeleton shimmer)
    if (fig) fig.classList.add('loading');

    img.addEventListener('load', onLoad, { once: true });
    img.addEventListener('error', onError, { once: true });

    if (img.complete) {
        if (img.naturalWidth > 0) {
            img.classList.add('loaded');
            if (fig) fig.classList.add('loaded');
        } else if (img.src) {
            onError();
        }
    }
};