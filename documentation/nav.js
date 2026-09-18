(() => {
  document.querySelectorAll('.nav').forEach(nav=>{
    if(!nav.querySelector('a[href="shop.html"]')){
      const a=document.createElement('a');
      a.href='shop.html';
      a.textContent='المحل';
      nav.appendChild(a);
    }
  });
  const file=(location.pathname.split('/').pop()||'index.html').toLowerCase();
  document.querySelectorAll('.nav a').forEach(a=>{
    const href=(a.getAttribute('href')||'').split('/').pop().toLowerCase()||'index.html';
    a.classList.toggle('active',href===file);
  });
})();