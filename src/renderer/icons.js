/* Ferahla — çizgi ikonlar (24×24, stroke = currentColor). Harici kaynak yok. */
(function () {
  'use strict';
  const P = {
    overview: '<path d="M4 15a8 8 0 1 1 16 0"/><path d="M12 15l3.6-3.6"/><circle cx="12" cy="15" r="1.3"/><path d="M5 19.5h14"/>',
    clean: '<path d="M11 3.5l1.7 4.6 4.6 1.7-4.6 1.7L11 16.1l-1.7-4.6-4.6-1.7 4.6-1.7z"/><path d="M18 14.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
    map: '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M11 3.5v17M11 12.5h9.5M16 12.5v8"/>',
    large: '<path d="M13.5 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8.5z"/><path d="M13.5 3.5v5h5"/><path d="M12 11.5v6M9.5 15l2.5 2.5 2.5-2.5"/>',
    dups: '<rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2.2"/><path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5"/>',
    startup: '<path d="M12 3.5v7.5"/><path d="M7.2 6.6a7 7 0 1 0 9.6 0"/>',
    history: '<path d="M3.8 12a8.2 8.2 0 1 0 2.5-5.9"/><path d="M3.8 4.2v4.4h4.4"/><path d="M12 7.8V12l2.9 1.8"/>',
    settings: '<path d="M4 7.5h9M17.5 7.5H20M4 16.5h3M11.5 16.5H20"/><circle cx="15.3" cy="7.5" r="2.2"/><circle cx="9.3" cy="16.5" r="2.2"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5"/><path d="M12 7.9h.01"/>',
    help: '<circle cx="12" cy="12" r="8.5"/><path d="M9.7 9.6a2.4 2.4 0 0 1 4.7.7c0 1.7-2.4 2-2.4 3.6"/><path d="M12 16.9h.01"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.2"/><path d="M8.2 10.5V8a3.8 3.8 0 0 1 7.6 0v2.5"/>',
    shield: '<path d="M12 3.5l7 2.7v5.2c0 4.4-2.9 7.9-7 9.1-4.1-1.2-7-4.7-7-9.1V6.2z"/><path d="M9 12.1l2.1 2.1 3.9-3.9"/>',
    alert: '<path d="M10.3 4.7L3.3 17a2 2 0 0 0 1.7 3h14a2 2 0 0 0 1.7-3l-7-12.3a2 2 0 0 0-3.4 0z"/><path d="M12 9.5v4"/><path d="M12 16.9h.01"/>',
    folder: '<path d="M3.5 7.5a2 2 0 0 1 2-2h3.9l2 2h7.1a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
    file: '<path d="M13.5 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8.5z"/><path d="M13.5 3.5v5h5"/>',
    chevronRight: '<path d="M9.5 6l6 6-6 6"/>',
    chevronDown: '<path d="M6 9.5l6 6 6-6"/>',
    arrowUp: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
    trash: '<path d="M4.5 7h15"/><path d="M9.5 7V5.2c0-.9.7-1.7 1.6-1.7h1.8c.9 0 1.6.8 1.6 1.7V7"/><path d="M6.5 7l.9 11.6a2 2 0 0 0 2 1.9h5.2a2 2 0 0 0 2-1.9L17.5 7"/>',
    reveal: '<path d="M3.5 7.5a2 2 0 0 1 2-2h3.9l2 2h7.1a2 2 0 0 1 2 2v1.5"/><path d="M3.5 7.5v10a2 2 0 0 0 2 2H11"/><circle cx="16.5" cy="16" r="3"/><path d="M18.7 18.2l2 2"/>',
    undo: '<path d="M9 14.5L4.5 10 9 5.5"/><path d="M4.5 10H15a4.8 4.8 0 0 1 0 9.6h-3"/>',
    refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.6 4.2v4.4h-4.4"/>',
    drive: '<rect x="3.5" y="6.5" width="17" height="11" rx="2.5"/><path d="M3.5 13h17"/><path d="M16.5 15.3h.01"/>',
    plus: '<path d="M12 5.5v13M5.5 12h13"/>',
    search: '<circle cx="11" cy="11" r="6.3"/><path d="M15.7 15.7l4 4"/>',
    video: '<rect x="3.5" y="6" width="12" height="12" rx="2.2"/><path d="M15.5 10.4l5-2.9v9l-5-2.9"/>',
    archive: '<rect x="3.5" y="4" width="17" height="5" rx="1.5"/><path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9"/><path d="M10 13h4"/>',
    installer: '<path d="M12 3.5v10M8 9.8l4 4 4-4"/><path d="M4.5 14.5v3.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3.5"/>',
    disk: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2.3"/><path d="M12 3.5a8.5 8.5 0 0 1 8.5 8.5"/>',
    image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.2"/><circle cx="9" cy="9.6" r="1.6"/><path d="M20.5 15.5l-5-5-9 9"/>',
    other: '<path d="M13.5 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8.5z"/><path d="M13.5 3.5v5h5"/><path d="M9 13.5h6M9 16.5h4"/>',
    leaf: '<path d="M5 19c0-8 5-13.5 14.5-14.5C19 14 13.5 19 5.5 19"/><path d="M5 19l7-7"/>',
    breeze: '<path d="M3.5 9h10a3 3 0 1 0-3-3"/><path d="M3.5 13.5h14a3 3 0 1 1-3 3"/><path d="M3.5 17.5h6"/>',
    sun: '<circle cx="12" cy="12" r="3.8"/><path d="M12 3v1.8M12 19.2V21M3 12h1.8M19.2 12H21M5.6 5.6l1.3 1.3M17.1 17.1l1.3 1.3M5.6 18.4l1.3-1.3M17.1 6.9l1.3-1.3"/>',
    moon: '<path d="M19.5 14.5A7.8 7.8 0 0 1 9.5 4.5a7.8 7.8 0 1 0 10 10z"/>',
    monitor: '<rect x="3.5" y="4.5" width="17" height="11.5" rx="2"/><path d="M8.5 20h7M12 16v4"/>',
    globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c2.4 2.4 3.5 5.2 3.5 8.5s-1.1 6.1-3.5 8.5c-2.4-2.4-3.5-5.2-3.5-8.5s1.1-6.1 3.5-8.5z"/>',
    stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2"/>',
  };

  function icon(name, extraClass) {
    const body = P[name] || P.other;
    return '<svg class="ico' + (extraClass ? ' ' + extraClass : '') + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + body + '</svg>';
  }

  window.FerahlaIcons = { icon, names: Object.keys(P) };
})();
