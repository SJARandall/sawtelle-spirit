/* =====================================================================
   version.js — shared cache-busting version number.

   SS_VERSION is the "?v=" number appended to the shared ss-locations.css
   and ss-locations.js files on every page that loads them. Bump this ONE
   number whenever either shared file changes, and every page that loads
   version.js picks up the new value automatically — no more hunting
   through each HTML file by hand to update "v=N" one at a time.

   Note: this only helps if version.js itself gets re-fetched. If your
   host sets a long cache lifetime on .js files, a bump here may not be
   visible until a hard refresh (or until you configure no-cache headers
   for this file specifically).

   This does NOT cover location-specific files (e.g. ss-yamaguchi-config.js,
   token gif/png images) — those keep their own independent "?v=" numbers
   in each page, since they change on their own schedule per location.
   ===================================================================== */

window.SS_VERSION = 6;
