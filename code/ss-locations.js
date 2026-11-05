/* =====================================================================
   ss-locations.js  —  Generic logic for all SSI location pages.

   Reads configuration from window.SSI_CONFIG (set by each location's
   own *-config.js file loaded before this script).

   Expected SSI_CONFIG shape:
   ──────────────────────────────────────────────────────────────────
   window.SSI_CONFIG = {
       // Optional — omit if using dialogueFile (images derived from JSON)
       images:        ['img1.jpg', 'img2.jpg', 'img3.jpg'],

       // Optional — omit key to skip feature
       dialogueFile:  'ss-yamaguchi.json',   // path to JSON dialogue
       youtubeVideos: [                        // one entry per trigger
           { triggerImageIndex: 2, videoId: 'H6TwwqRfZ7E' }
       ],
       finalMessage:  'Thanks for visiting!', // text in end popup
       homeUrl:       '../index.html',         // reserved for future use

       // Optional — path to an animated gif shown as one extra "slide"
       // right after the last comic panel, before the final popup. Uses
       // the same #fullscreen-image element and nav controls as any
       // other panel (tap / next arrow to continue, prev arrow to back up).
       tokenGifImage: 'screens/token-gaman.gif',

       // Optional — both required together. Shows a "Chapter N" title
       // screen over the logo on top of the FIRST panel, dismissed by
       // tap or Next. Omit either key to skip this screen entirely.
       chapterNumber: 1,
       locationName:  'Yamaguchi Store'
   };
   ──────────────────────────────────────────────────────────────────

   Speaker IDs in the JSON must match a CSS class .bubble-{speaker}:
     "owner"   → top bubble    (store owner / NPC)
     "sachi"   → bottom bubble (Sachi character)
     "player"  → bottom bubble (player / protagonist)

   The JSON is the single source of truth for the image list.
   The same image filename can appear multiple times — each entry
   becomes its own slide with its own dialogue line.
   ===================================================================== */

document.addEventListener('DOMContentLoaded', async () => {

    // ── Read config ──────────────────────────────────────────────────────
    const cfg           = window.SSI_CONFIG  || {};
    const dialogueFile  = cfg.dialogueFile   || null;
    const youtubeVideos = cfg.youtubeVideos  || [];
    let finalMessage    = cfg.finalMessage   || 'Thanks for visiting!';
    let endButtonText   = cfg.endButtonText  || null;
    const tokenGifImage = cfg.tokenGifImage  || null;
    const chapterNumber = cfg.chapterNumber  || null;
    const locationName  = cfg.locationName   || null;

    // Build fast lookup: slideIndex → videoId
    const youtubeTriggers = {};
    youtubeVideos.forEach(v => { youtubeTriggers[v.triggerImageIndex] = v.videoId; });

    // ── Load dialogue + derive image list from JSON ──────────────────────
    //
    // dialogueByIndex: array indexed by slide position → { speaker, text }
    // The same image filename can appear multiple times in the JSON —
    // each entry becomes its own slide with its own dialogue line.
    //
    let images            = cfg.images || [];  // fallback if no dialogueFile
    const dialogueByIndex = [];                // one entry per slide index

    if (dialogueFile) {
        try {
            const res = await fetch(dialogueFile);
            const raw = await res.json();

            // Support both plain array format and the newer object format:
            //   { "finalMessage": "...", "dialogues": [...] }
            // The object format lets you edit finalMessage directly in the JSON.
            const data = Array.isArray(raw) ? raw : (raw.dialogues || []);
            if (!Array.isArray(raw) && raw.finalMessage) finalMessage = raw.finalMessage;
            if (!Array.isArray(raw) && raw.endButton)    endButtonText = raw.endButton;

            // Derive image order from JSON if config has no images array.
            if (!cfg.images) {
                images = data.map(entry => entry.image).filter(Boolean);
            }

            // Index dialogue by slide position, not filename.
            data.forEach((entry, i) => {
                if (entry.speaker && entry.text) {
                    dialogueByIndex[i] = { speaker: entry.speaker, text: entry.text };
                }
            });

        } catch (e) {
            console.warn('[SSI] Could not load dialogue file:', dialogueFile, e);
        }
    }

    // Append the token gif as one more real slide at the end of the array —
    // it then flows through the exact same displayImage()/nextImage() logic
    // as every other panel (no dialogue entry exists for it, so no bubble
    // shows). This avoids maintaining a separate "am I on the gif" flag.
    if (tokenGifImage) images.push(tokenGifImage);

    // ── DOM references ───────────────────────────────────────────────────
    const imageContainer  = document.getElementById('image-container');
    const imageElement    = document.getElementById('fullscreen-image');
    const prevButton      = document.getElementById('prev-button');
    const nextButton      = document.getElementById('next-button');
    const restartButton   = document.getElementById('restart-button');
    const youtubePopup    = document.getElementById('youtube-popup');
    const closeYoutube    = document.getElementById('close-youtube');
    const videoWrapper    = document.getElementById('video-wrapper');
    const youtubePlayBtn  = document.getElementById('youtube-play-btn');
    const finalPopup      = document.getElementById('final-popup');
    const closeFinal      = document.getElementById('close-final');
    const finalMsgEl      = document.getElementById('final-message');
    const chapterScreen   = document.getElementById('chapter-screen');
    const chapterNumberEl = document.getElementById('chapter-number');
    const chapterLocEl    = document.getElementById('chapter-location');

    // Dialogue zone elements keyed by speaker id
    const zones = {
        owner:  document.getElementById('bubble-owner'),
        sachi:  document.getElementById('bubble-sachi'),
        player: document.getElementById('bubble-player'),
    };

    // ── One-time DOM init ────────────────────────────────────────────────
    if (finalMsgEl) finalMsgEl.textContent = finalMessage;
    const endButtonEl = document.getElementById('end-button');
    if (endButtonEl && endButtonText) endButtonEl.textContent = endButtonText;

    // ── Chapter title screen ────────────────────────────────────────────
    // Shown once, on top of the first panel, until the user taps or hits
    // Next. Only appears when the config supplies both chapterNumber and
    // locationName — pages that omit either never show it.
    const hasChapterScreen = !!(chapterScreen && chapterNumber && locationName);
    function showChapterScreen()    { if (chapterScreen) chapterScreen.classList.remove('hidden'); }
    function hideChapterScreen()    { if (chapterScreen) chapterScreen.classList.add('hidden'); }
    function chapterScreenVisible() { return !!chapterScreen && !chapterScreen.classList.contains('hidden'); }

    if (hasChapterScreen) {
        chapterNumberEl.textContent = 'Chapter ' + chapterNumber;
        chapterLocEl.textContent    = locationName;
    } else {
        hideChapterScreen();
    }

    // ── State ────────────────────────────────────────────────────────────
    let currentIndex   = 0;
    let touchStartX    = null;
    let currentVideoId = null;

    // ── Text auto-fit ────────────────────────────────────────────────────
    // Binary-searches for the largest px font size where ALL text fits
    // inside the safe inner region of the oval bubble.
    //
    // Safari note: we use a double requestAnimationFrame so the browser
    // has completed its layout pass and clientHeight/Width are accurate
    // before we start measuring.
    function fitText(zoneEl, text) {
        const textEl = zoneEl.querySelector('.dialogue-text');
        if (!textEl) return;
        textEl.textContent = text;

        const MAX_PX = 15;
        const MIN_PX = 7;

        // 62% width / 68% height keeps text in the visible oval core
        const safeW = zoneEl.clientWidth  * 0.62;
        const safeH = zoneEl.clientHeight * 0.68;

        if (safeW <= 0 || safeH <= 0) {
            textEl.style.fontSize = MIN_PX + 'px';
            return;
        }

        let lo = MIN_PX, hi = MAX_PX;
        for (let i = 0; i < 12; i++) {
            const mid = (lo + hi) / 2;
            textEl.style.fontSize = mid + 'px';
            if (textEl.scrollHeight <= safeH && textEl.scrollWidth <= safeW) {
                lo = mid;
            } else {
                hi = mid;
            }
        }
        textEl.style.fontSize = lo + 'px';
    }

    // ── Dialogue rendering ───────────────────────────────────────────────
    function clearDialogue() {
        Object.values(zones).forEach(z => {
            if (!z) return;
            z.classList.remove('bubble-active');
            const t = z.querySelector('.dialogue-text');
            if (t) { t.textContent = ''; t.style.fontSize = ''; }
        });
    }

    function renderDialogue(slideIndex) {
        clearDialogue();
        const entry = dialogueByIndex[slideIndex];
        if (!entry || !entry.speaker || !entry.text) return;

        const zone = zones[entry.speaker];
        if (!zone) {
            console.warn('[SSI] Unknown speaker "' + entry.speaker + '" — use: owner, sachi, player');
            return;
        }

        zone.classList.add('bubble-active');

        // Double rAF: ensures both style recalc and layout pass are done
        // before we measure the zone dimensions (fixes Safari misalignment).
        requestAnimationFrame(() =>
            requestAnimationFrame(() => fitText(zone, entry.text))
        );
    }

    // ── Display image ────────────────────────────────────────────────────
    function displayImage(index) {
        if (index < 0 || index >= images.length) return;
        currentIndex = index;

        const imgName = images[index];
        clearDialogue();
        imageElement.src = imgName;

        const doRender = () => renderDialogue(index);
        imageElement.onload = doRender;
        if (imageElement.complete && imageElement.naturalWidth > 0) doRender();

        prevButton.style.visibility = index === 0 ? 'hidden' : 'visible';
    }

    // ── YouTube popup ────────────────────────────────────────────────────
    //
    // Firefox fix: do NOT use a static <iframe> with src reassignment.
    // Firefox intercepts YouTube src changes on pre-existing iframes and
    // navigates the parent page to YouTube instead of loading it in-popup.
    //
    // Fix: create a brand-new <iframe> element inside the play button's
    // click handler — that counts as a user gesture in all browsers, so
    // autoplay is permitted and Firefox does not intercept the navigation.
    // On close, the iframe is removed from the DOM entirely, which also
    // stops audio immediately without needing to clear src.
    //
    function removeIframe() {
        const existing = videoWrapper.querySelector('iframe');
        if (existing) existing.remove();
    }

    function showYoutubePopup(videoId) {
        currentVideoId = videoId;
        removeIframe();                              // clear any leftover
        youtubePopup.classList.add('active');
        youtubePlayBtn.style.display = 'flex';
    }

    function hideYoutubePopup() {
        youtubePopup.classList.remove('active');
        removeIframe();                              // stops audio, frees memory
        youtubePlayBtn.style.display = 'none';
        currentVideoId = null;

        if (currentIndex >= images.length - 1) {
            showFinalPopup();
        } else {
            displayImage(currentIndex + 1);
        }
    }

    function startVideo() {
        if (!currentVideoId) return;

        // Create a fresh iframe here, inside the click handler (user gesture).
        // This is the key to making autoplay work in Firefox without the
        // browser redirecting to YouTube.
        const iframe = document.createElement('iframe');
        iframe.setAttribute('allow', 'autoplay; encrypted-media; fullscreen; picture-in-picture');
        iframe.setAttribute('allowfullscreen', '');
        iframe.setAttribute('playsinline', '');
        iframe.title = 'Location video';
        // Position it to fill the video-wrapper (same as the CSS rule for
        // .video-wrapper iframe in ss-locations.css)
        iframe.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;border:0';
        iframe.src = 'https://www.youtube.com/embed/'
            + currentVideoId
            + '?autoplay=1&playsinline=1&rel=0&controls=1';

        videoWrapper.appendChild(iframe);
        youtubePlayBtn.style.display = 'none';
    }

    // ── Final popup ──────────────────────────────────────────────────────
    function showFinalPopup() { finalPopup.style.display = 'flex'; }
    function hideFinalPopup()  { finalPopup.style.display = 'none'; }

    // ── Navigation ───────────────────────────────────────────────────────
    function nextImage() {
        const videoId = youtubeTriggers[currentIndex];
        if (videoId !== undefined) {
            showYoutubePopup(videoId);
            return;
        }
        if (currentIndex >= images.length - 1) {
            showFinalPopup();
            return;
        }
        displayImage(currentIndex + 1);
    }

    function prevImage() {
        if (currentIndex > 0) displayImage(currentIndex - 1);
    }

    // ── Event listeners ──────────────────────────────────────────────────
    prevButton.addEventListener   ('click', e => { e.stopPropagation(); prevImage(); });
    nextButton.addEventListener   ('click', e => {
        e.stopPropagation();
        if (chapterScreenVisible()) {
            hideChapterScreen();
        } else if (youtubePopup.classList.contains('active')) {
            hideYoutubePopup();
        } else {
            nextImage();
        }
    });
    restartButton.addEventListener('click', e => {
        e.stopPropagation();
        if (hasChapterScreen) showChapterScreen();
        displayImage(0);
    });

    imageContainer.addEventListener('click', e => {
        if (e.target.closest('.dialogue-zone'))  return;
        if (e.target.closest('.youtube-popup'))  return;
        if (e.target.closest('#nav-bar'))        return;
        if (chapterScreenVisible()) {
            if (e.target.closest('.chapter-footer a')) return; // let the link open normally
            hideChapterScreen();
            return;
        }
        nextImage();
    });

    youtubePlayBtn.addEventListener('click', e => { e.stopPropagation(); startVideo(); });
    closeYoutube.addEventListener  ('click', e => { e.stopPropagation(); hideYoutubePopup(); });

    // Tap anywhere on the dimmed backdrop (outside the video itself) to advance.
    // youtubePlayBtn and closeYoutube both stopPropagation() above, so their
    // taps never reach this listener.
    youtubePopup.addEventListener('click', e => {
        if (e.target.closest('.video-wrapper')) return;
        hideYoutubePopup();
    });

    if (closeFinal) closeFinal.addEventListener('click', hideFinalPopup);

    // Touch swipe (left = next, right = prev)
    imageContainer.addEventListener('touchstart', e => {
        if (e.target.closest('.youtube-popup') || e.target.closest('#nav-bar')) return;
        touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    imageContainer.addEventListener('touchend', e => {
        if (touchStartX === null) return;
        if (chapterScreenVisible()) {
            touchStartX = null;
            hideChapterScreen();
            return;
        }
        const diff = touchStartX - e.changedTouches[0].screenX;
        if (Math.abs(diff) > 50) diff > 0 ? nextImage() : prevImage();
        touchStartX = null;
    }, { passive: true });

    // Keyboard navigation
    document.addEventListener('keydown', e => {
        const videoOpen = youtubePopup.classList.contains('active');
        const finalOpen = finalPopup.style.display === 'flex';

        if (e.key === 'Escape') {
            if (videoOpen) hideYoutubePopup();
            if (finalOpen) hideFinalPopup();
            return;
        }
        if (videoOpen || finalOpen) return;

        if (e.key === 'ArrowRight') {
            if (chapterScreenVisible()) hideChapterScreen();
            else nextImage();
        }
        else if (e.key === 'ArrowLeft') prevImage();
    });

    // Re-fit text on orientation change / resize
    window.addEventListener('resize', () => {
        const entry = dialogueByIndex[currentIndex];
        if (entry && entry.speaker && zones[entry.speaker]) {
            requestAnimationFrame(() =>
                requestAnimationFrame(() => fitText(zones[entry.speaker], entry.text))
            );
        }
    });

    // ── Initialise ───────────────────────────────────────────────────────
    displayImage(0);
});