(() => {
  const file=(location.pathname.split('/').pop()||'index.html').toLowerCase();
  document.querySelectorAll('.nav a').forEach(a=>{
    const href=(a.getAttribute('href')||'').split('/').pop().toLowerCase()||'index.html';
    a.classList.toggle('active',href===file);
  });
})();