// Name: vkPlaylistExporter
// Desc: Export VK track titles (from playlists or "My Music") into a TXT file

(() => {
  const cfg = {
    scrollDelay: 450,    // delay between scroll steps during auto-loading
    maxScrollIter: 200,  // safety limit to avoid infinite scrolling
    stableThreshold: 3   // how many "no change" cycles before we stop
  };

  const delay = ms => new Promise(r => setTimeout(r, ms));

  const rootScrollEl = () =>
    document.scrollingElement || document.documentElement || document.body;

  // --- scroll helpers ---

  function isScrollable(el) {
    if (!el) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;

    const canScrollY =
      el.scrollHeight - el.clientHeight > 8 ||
      cs.overflowY === 'auto' ||
      cs.overflowY === 'scroll';

    return canScrollY;
  }

  function nearestScrollable(el) {
    for (let n = el; n; n = n.parentElement) {
      if (isScrollable(n)) return n;
      if (n === document.body || n === document.documentElement) break;
    }
    return rootScrollEl();
  }

  function scrollDown(el) {
    if (!el) el = rootScrollEl();
    if (
      el === document.body ||
      el === document.documentElement ||
      el === document.scrollingElement
    ) {
      el.scrollTo({ top: el.scrollHeight });
    } else {
      el.scrollTop = el.scrollHeight;
    }
  }

  // --- 1. Load all tracks (handles new and legacy layouts) ---

  async function loadAllTracks() {
    // Prefer explicit playlist tracks root from new UI
    let container =
      document.querySelector('[data-testid="MusicPlaylistPage_Tracks"]') ||
      document.querySelector('[data-testid="MusicPage_Tracks"]');

    if (container) {
      container = nearestScrollable(container);
    } else {
      // Fallback: find any track row (new UI) and use its scroll container
      const newRow =
        document.querySelector('[data-testid="MusicPlaylistTracks_MusicTrackRow"]') ||
        document.querySelector('[data-testid="MusicPage_MusicTrackRow"]');

      if (newRow) {
        container = nearestScrollable(newRow);
      } else {
        // Fallback: legacy layout with .audio_row
        const legacyRow = document.querySelector('.audio_row');
        if (legacyRow) {
          container = nearestScrollable(legacyRow);
        }
      }
    }

    if (!container) {
      console.warn('vkPlaylistExporter: track list container not found');
      return;
    }

    let prevHeight = -1;
    let sameHeight = 0;

    for (let i = 0; i < cfg.maxScrollIter; i++) {
      const curHeight = container.scrollHeight;

      if (curHeight > prevHeight) {
        prevHeight = curHeight;
        scrollDown(container);
        sameHeight = 0;
        await delay(cfg.scrollDelay);
      } else {
        sameHeight++;
        if (sameHeight >= cfg.stableThreshold) break;
        await delay(cfg.scrollDelay);
      }
    }
  }

  // --- 2. Collect tracks as "Artist - Title" ---

  function collectTracks() {
    const result = [];

    // --- 2A. New VK music layout (data-testid based) ---

    let rows = document.querySelectorAll(
      '[data-testid="MusicPlaylistTracks_MusicTrackRow"],' +
      ' [data-testid="MusicPage_MusicTrackRow"]'
    );

    if (rows.length) {
      console.log(`vkPlaylistExporter: new layout rows: ${rows.length}`);

      rows.forEach(row => {
        const titleEl = row.querySelector('[data-testid="MusicTrackRow_Title"]');
        if (!titleEl) return;

        // Authors container may include multiple links (feat. etc),
        // so we take the whole text block around authors.
        const authorsAnchor = row.querySelector('[data-testid="MusicTrackRow_Authors"]');
        if (!authorsAnchor) return;

        const artistContainer =
          authorsAnchor.closest('.vkitAudioRowInfo__text--Rrhr2') || authorsAnchor;

        const title = titleEl.textContent.trim().replace(/\s+/g, ' ');
        const artist = artistContainer.textContent.trim().replace(/\s+/g, ' ');

        if (!artist || !title) return;

        result.push(`${artist} - ${title}`);
      });

      return result;
    }

    // --- 2B. Legacy layout (.audio_row) fallback ---

    rows = document.querySelectorAll('.audio_row');
    console.log(`vkPlaylistExporter: legacy layout rows: ${rows.length}`);

    rows.forEach(row => {
      const artistEl = row.querySelector('.audio_row__performers');
      if (!artistEl) return;

      let titleEl =
        row.querySelector('a[data-testid="audio_row_title"]') ||
        row.querySelector('._audio_row__title_inner') ||
        row.querySelector('.audio_row__title_inner');

      if (!titleEl) return;

      const artist = artistEl.textContent.trim().replace(/\s+/g, ' ');
      const title  = titleEl.textContent.trim().replace(/\s+/g, ' ');
      if (!artist || !title) return;

      result.push(`${artist} - ${title}`);
    });

    return result;
  }

  // --- 3. Determine playlist / tab title ---

  function getPlaylistTitle() {
    // Legacy playlist title
    const playlistTitleEl = document.querySelector('.AudioPlaylistSnippet__title--main');
    if (playlistTitleEl && playlistTitleEl.textContent.trim()) {
      return playlistTitleEl.textContent.trim();
    }

    // Possible new header title (if VK exposes it via testid)
    const headerTitle =
      document.querySelector('[data-testid="MusicPlaylist_Header_Title"]') ||
      document.querySelector('[data-testid="MusicPage_Header_Title"]');

    if (headerTitle && headerTitle.textContent.trim()) {
      return headerTitle.textContent.trim();
    }

    // Selected tab (e.g. "My music")
    const tabTitleEl = document.querySelector('.ui_tab.ui_tab_sel');
    if (tabTitleEl && tabTitleEl.textContent.trim()) {
      return tabTitleEl.textContent.trim();
    }

    return 'vk_playlist';
  }

  // --- 4. Save to TXT file ---

  function saveToTxtFile(filename, lines) {
    const content = lines.join('\r\n'); // CRLF for max compatibility
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
  }

  // --- main flow ---

  (async () => {
    await loadAllTracks();

    const tracks = collectTracks();
    if (!tracks.length) {
      alert('No tracks found. Make sure the playlist / music page is open and fully loaded.');
      return;
    }

    const title = getPlaylistTitle();
    const filename = `${title} (created by github.com_tangenx).txt`;

    saveToTxtFile(filename, tracks);

    console.log(`vkPlaylistExporter: exported tracks: ${tracks.length}`);
    console.log(`vkPlaylistExporter: saved as: ${filename}`);
  })();
})();
