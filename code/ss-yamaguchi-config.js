/* =====================================================================
   ss-yamaguchi-config.js  —  Location-specific configuration.

   This is the ONLY file that differs between locations.
   Copy it, rename it (e.g. ss-sawtelle-config.js), and update the
   values below. The shared ss-locations.js and ss-locations.css
   handle everything else automatically.

   To add a second YouTube video on a different slide:
       youtubeVideos: [
           { triggerImageIndex: 1, videoId: 'AAAAAAAAAAA' },
           { triggerImageIndex: 4, videoId: 'BBBBBBBBBBB' }
       ]
   ===================================================================== */

window.SSI_CONFIG = {

    // ── Chapter title screen ────────────────────────────────────────────
    // Shown once at the very start of this location's story, before the
    // first comic panel. Displays "Chapter N" + locationName over the
    // shared logo. Omit either key (or leave null) to skip this screen.
    chapterNumber: 2,
    locationName: 'Yamaguchi Store',

    // ── Dialogue ─────────────────────────────────────────────────────────
    // Path to the JSON file with speaker + text per image.
    // Set to null (or remove the key) if this location has no dialogue.
    dialogueFile: 'ss-yamaguchi.json',

    // ── YouTube videos ───────────────────────────────────────────────────
    // triggerImageIndex: when the user taps "next" ON this slide index,
    // the video popup appears (0-based).
    // After closing the video the app advances to the next slide.
    youtubeVideos: [
        { triggerImageIndex: 7, videoId: 'H6TwwqRfZ7E' },
        { triggerImageIndex: 10, videoId: 'vNkgmAXi4K4' }
    ],

    // ── End-of-sequence message ──────────────────────────────────────────
    // finalMessage is now defined in ss-yamaguchi.json for easier editing.

    // ── Token gif slide ───────────────────────────────────────────────────
    // Shown as one extra slide right after the last comic panel, before
    // the final popup. Same nav controls as any other panel.
    tokenGifImage: 'screens/token-gaman.gif?v=4',

    // ── Home button URL ──────────────────────────────────────────────────
    // Adjust path to match your actual directory structure.
    homeUrl: '../index.html'
};
