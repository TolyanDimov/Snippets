// Name: vkMassPlaylistAdder
// Desc: Mass-add VK tracks from "My Tracks" or other playlists by auto-loading list and auto-checking all .ape_check items bottom-up

(() => {

  const cfg = {
    cycles: 3,         // number of forced load cycles (down → up → down)
    down1: 35,         // scroll steps (first down)
    up: 12,            // scroll steps (up)
    down2: 45,         // scroll steps (second down)
    scrollDelay: 40,   // delay between scroll steps (ms)
    clickDelay: 60     // delay between checkbox clicks (ms)
  };

  // main list inside "Edit Playlist" modal
  const list =
    document.querySelector('.ape_item_list') ||
    document.querySelector('._ape_item_list');

  if (!list) {
    console.warn('vkMassPlaylistAdder: .ape_item_list not found');
    return;
  }

  const wait = ms => new Promise(r => setTimeout(r, ms));

  async function scrollDownFast(times) {
    for (let i = 0; i < times; i++) {
      list.scrollTop = list.scrollHeight;
      await wait(cfg.scrollDelay);
    }
  }

  async function scrollUpFast(times) {
    for (let i = 0; i < times; i++) {
      list.scrollTop = 0;
      await wait(cfg.scrollDelay);
    }
  }

  // load all tracks by aggressively scrolling down/up/down multiple times
  async function forceLoadAll() {
    console.log('vkMassPlaylistAdder: starting preload cycles...');
    for (let c = 1; c <= cfg.cycles; c++) {
      console.log(`vkMassPlaylistAdder: cycle ${c}/${cfg.cycles} → down 1`);
      await scrollDownFast(cfg.down1);

      console.log(`vkMassPlaylistAdder: cycle ${c}/${cfg.cycles} → up`);
      await scrollUpFast(cfg.up);

      console.log(`vkMassPlaylistAdder: cycle ${c}/${cfg.cycles} → down 2`);
      await scrollDownFast(cfg.down2);
    }
  }

  function getChecks() {
    const arr = Array.from(list.querySelectorAll('.ape_check'));
    console.log('vkMassPlaylistAdder: found checkboxes =', arr.length);
    return arr;
  }

  // toggle checkboxes bottom → up
  function toggleBottomUp(nodes) {
    console.log('vkMassPlaylistAdder: toggling bottom-up...');

    let i = nodes.length - 1;

    const timer = setInterval(() => {
      if (i < 0) {
        clearInterval(timer);
        console.log('vkMassPlaylistAdder: completed.');
        return;
      }

      const el = nodes[i];

      const un = el.querySelector('.ape_check--unchecked');
      const ch = el.querySelector('.ape_check--checked');

      const unVisible = un && getComputedStyle(un).display !== 'none';
      const chVisible = ch && getComputedStyle(ch).display !== 'none';

      // click only if actually unchecked
      if (unVisible && !chVisible) {
        el.click();
      }

      i--;
    }, cfg.clickDelay);
  }

  (async () => {
    await forceLoadAll();

    const checks = getChecks();
    if (!checks.length) {
      console.warn('vkMassPlaylistAdder: no checkboxes found');
      return;
    }

    toggleBottomUp(checks);
  })();

})();
