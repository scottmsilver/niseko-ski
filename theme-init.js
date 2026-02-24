// Apply saved theme/font before render to avoid flash
(function() {
  var theme = localStorage.getItem('ski-theme');
  if (theme && theme !== 'light') document.documentElement.setAttribute('data-theme', theme);
  var scale = localStorage.getItem('ski-font-scale');
  if (scale) document.documentElement.style.setProperty('--font-scale', scale);
})();
