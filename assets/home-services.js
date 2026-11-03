(() => {
  const section = document.querySelector('#servicios.pillars');
  if (!section || !Element.prototype.animate) return;
  const cards = [...section.children].filter(card => card.tagName === 'ARTICLE');
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const entryMs = 400;
  const holdMs = 5000;
  const exitMs = 350;
  const restMs = 350;
  const allVisibleAt = cards.length * entryMs;
  const exitAt = allVisibleAt + holdMs;
  const cycleMs = exitAt + exitMs + restMs;
  let animations = [];
  let inView = false;

  function syncPlayback() {
    const shouldPlay = inView && !document.hidden;
    animations.forEach(animation => shouldPlay ? animation.play() : animation.pause());
  }

  function configureAnimation() {
    animations.forEach(animation => animation.cancel());
    animations = [];
    if (motionPreference.matches) return;
    animations = cards.map((card, index) => {
      const startAt = index * entryMs;
      const hidden = { opacity: 0, transform: 'translateX(-28px)' };
      const visible = { opacity: 1, transform: 'translateX(0)' };
      const frames = [{ ...hidden, offset: 0, easing: 'ease-out' }];
      if (startAt > 0) frames.push({ ...hidden, offset: startAt / cycleMs, easing: 'ease-out' });
      frames.push(
        { ...visible, offset: (startAt + entryMs) / cycleMs },
        { ...visible, offset: exitAt / cycleMs, easing: 'ease-in' },
        { opacity: 0, transform: 'translateY(-8px)', offset: (exitAt + exitMs) / cycleMs },
        { ...hidden, offset: 1 }
      );
      const animation = card.animate(frames, { duration: cycleMs, iterations: Infinity, fill: 'both' });
      animation.pause();
      animation.currentTime = 0;
      return animation;
    });
    syncPlayback();
  }

  configureAnimation();
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      inView = entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= 0.15);
      syncPlayback();
    }, { threshold: 0.15 });
    observer.observe(section);
  } else {
    inView = true;
    syncPlayback();
  }
  document.addEventListener('visibilitychange', syncPlayback);
  if (motionPreference.addEventListener) motionPreference.addEventListener('change', configureAnimation);
  else motionPreference.addListener(configureAnimation);
  window.addEventListener('beforeprint', () => {
    animations.forEach(animation => animation.cancel());
    animations = [];
  });
  window.addEventListener('afterprint', configureAnimation);
})();
