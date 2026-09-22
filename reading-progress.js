(() => {
  const content = document.querySelector('.blog-content');
  if (!content) return;

  const headings = Array.from(content.children).filter(element => element.tagName === 'H2');
  const links = [];
  if (headings.length > 1) {
    const navigation = document.createElement('nav');
    navigation.className = 'post-sections';
    navigation.setAttribute('aria-label', 'Article sections');
    const label = document.createElement('span');
    label.className = 'post-sections-label';
    label.textContent = 'On this page';
    navigation.append(label);
    headings.forEach((heading, index) => {
      if (!heading.id) heading.id = `section-${index + 1}`;
      const link = document.createElement('a');
      link.href = `#${heading.id}`;
      link.textContent = heading.textContent.trim();
      navigation.append(link);
      links.push(link);
    });
    headings[0].before(navigation);
  }

  const progress = document.createElement('div');
  progress.className = 'reading-progress';
  progress.setAttribute('aria-hidden', 'true');
  document.body.append(progress);

  let scheduled = false;

  function update() {
    scheduled = false;
    const bounds = content.getBoundingClientRect();
    const distance = bounds.height - window.innerHeight;
    progress.hidden = distance <= 0;
    const fraction = distance > 0
      ? Math.min(1, Math.max(0, -bounds.top / distance))
      : 0;
    progress.style.setProperty('--reading-progress', fraction);
    let activeIndex = -1;
    headings.forEach((heading, index) => {
      if (heading.getBoundingClientRect().top <= 120) activeIndex = index;
    });
    links.forEach((link, index) => {
      if (index === activeIndex) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }

  function scheduleUpdate() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(update);
  }

  window.addEventListener('scroll', scheduleUpdate, { passive: true });
  window.addEventListener('resize', scheduleUpdate);
  window.addEventListener('pageshow', scheduleUpdate);
  if ('ResizeObserver' in window) {
    new ResizeObserver(scheduleUpdate).observe(content);
  }
  update();
})();
