(() => {
  const input = document.getElementById('dashboardSearchInput');
  const clearBtn = document.getElementById('dashboardSearchClear');
  const status = document.getElementById('dashboardSearchStatus');
  if (!input) return;

  const normalize = value => String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim();

  function sectionCards(section) {
    return Array.from(section.querySelectorAll(':scope > .card'));
  }

  function updateSection(section, query) {
    const cards = sectionCards(section);
    let visible = 0;
    for (const card of cards) {
      const haystack = normalize([
        card.querySelector('h2')?.textContent,
        card.querySelector('p')?.textContent,
        card.querySelector('.badge')?.textContent
      ].filter(Boolean).join(' '));
      const match = !query || haystack.includes(query);
      card.hidden = !match;
      if (match) visible += 1;
    }

    const title = section.previousElementSibling;
    const shouldHide = Boolean(query) && visible === 0;
    section.hidden = shouldHide;
    if (title?.classList?.contains('section-title')) title.hidden = shouldHide;
    return visible;
  }

  function applySearch() {
    const query = normalize(input.value);
    let totalVisible = 0;
    const sections = Array.from(document.querySelectorAll('#dashboard section.grid'));

    for (const section of sections) totalVisible += updateSection(section, query);

    if (clearBtn) clearBtn.hidden = !query;
    if (status) {
      status.hidden = !query;
      status.textContent = query
        ? (totalVisible ? 'النتائج الظاهرة: ' + totalVisible : 'لا توجد أداة مطابقة.')
        : '';
    }
  }

  input.addEventListener('input', applySearch);
  clearBtn?.addEventListener('click', () => {
    input.value = '';
    applySearch();
    input.focus();
  });

  document.addEventListener('keydown', event => {
    if (event.key === '/' && !/input|textarea|select/i.test(document.activeElement?.tagName || '')) {
      event.preventDefault();
      input.focus();
    }
    if (event.key === 'Escape' && document.activeElement === input && input.value) {
      input.value = '';
      applySearch();
    }
  });

  applySearch();
})();