// Resilient entry point: use the full Three.js scene when its CDN is reachable.
// If the browser/network blocks the module import, start the self-contained canvas scene instead of leaving a blue screen.
import('./ground.js').catch((error) => {
  console.error('Quantum Meteo 3D module failed; starting compatibility renderer.', error);
  const root = document.getElementById('sceneRoot');
  const message = document.getElementById('sceneMessage');
  if (message) {
    message.textContent = 'Режим совместимости: библиотека 3D недоступна. Сцена отображается встроенным рендерером.';
    message.classList.remove('hidden');
    message.style.top = 'auto';
    message.style.bottom = '190px';
    message.style.transform = 'translateX(-50%)';
    message.style.fontSize = '11px';
    message.style.opacity = '.88';
  }
  import('./fallback.js').then(({ startFallbackScene }) => startFallbackScene(root)).catch((fallbackError) => {
    console.error('Fallback renderer failed', fallbackError);
    if (message) message.textContent = `Не удалось запустить визуализацию: ${fallbackError.message}`;
  });
});
