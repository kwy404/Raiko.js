// Raiko site icons: drawn for this site, 24 grid, 1.6 stroke, currentColor.
window.RK_ICON = (() => {
  const s = (d, extra = '') => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`
  return {
    bolt: s('<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/>'),
    folder: s('<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2h8.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/><path d="M8 12h8M8 15h5"/>'),
    server: s('<rect x="3" y="4" width="18" height="7" rx="1.5"/><rect x="3" y="13" width="18" height="7" rx="1.5"/><path d="M7 7.5h.01M7 16.5h.01M11 7.5h6M11 16.5h6"/>'),
    braces: s('<path d="M8 4H7a2 2 0 0 0-2 2v3.5a2 2 0 0 1-2 2 2 2 0 0 1 2 2V17a2 2 0 0 0 2 2h1M16 4h1a2 2 0 0 1 2 2v3.5a2 2 0 0 0 2 2 2 2 0 0 0-2 2V17a2 2 0 0 1-2 2h-1"/>'),
    lock: s('<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14.5v2.5"/>'),
    shield: s('<path d="M12 3 4.5 6v5.5c0 4.4 3.1 8.2 7.5 9.5 4.4-1.3 7.5-5.1 7.5-9.5V6z"/><path d="m8.8 12.2 2.2 2.2 4.2-4.4"/>'),
    mail: s('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>'),
    grid: s('<rect x="3.5" y="3.5" width="7" height="7" rx="1"/><rect x="13.5" y="3.5" width="7" height="7" rx="1"/><rect x="3.5" y="13.5" width="7" height="7" rx="1"/><rect x="13.5" y="13.5" width="7" height="7" rx="1"/>'),
    alert: s('<path d="M12 3 2.5 20h19z"/><path d="M12 10v4.5M12 17.5h.01"/>'),
    terminal: s('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M12.5 15H17"/>'),
    globe: s('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>'),
    gauge: s('<path d="M4.5 18a9 9 0 1 1 15 0"/><path d="m12 13 4.5-5"/><circle cx="12" cy="13" r="1.2"/>'),
    wave: s('<path d="M3 12h3l2-5 3 10 3-14 2 9h5"/>'),
    copy: s('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>'),
    check: s('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
    arrow: s('<path d="M5 12h14M13 6l6 6-6 6"/>'),
    menu: s('<path d="M4 7h16M4 12h16M4 17h16"/>'),
    close: s('<path d="M6 6l12 12M18 6 6 18"/>'),
    sun: s('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>'),
    code: s('<path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/>'),
    star: s('<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>'),
    branch: s('<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="8" r="2"/><path d="M6 7v10M18 10c0 4-6 3-12 7"/>'),
  }
})()
