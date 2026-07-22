import { useState, useEffect } from 'react';

// Tracks connectivity. navigator.onLine is a coarse signal (it only reports
// whether a network interface exists, not whether it reaches the internet),
// but it's enough to gate the AI/maps features and drive the offline banner.
export function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const goOnline  = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online',  goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online',  goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return online;
}
