import { useEffect, useState } from 'react';
import { initTelegram } from './telegram.js';

export function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const ctx = initTelegram();
    setTheme(ctx.theme);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <div className="app-shell" data-theme={theme}>
      <div>
        <h1 className="app-title">Stasis</h1>
        <p className="app-subtitle">Тихое пространство, чтобы разобраться в себе.</p>
      </div>
      <div className="app-elements" aria-hidden="true">
        <span className="fire" />
        <span className="water" />
        <span className="air" />
        <span className="earth" />
      </div>
      <button type="button" className="app-start-button">
        Начать
      </button>
    </div>
  );
}
