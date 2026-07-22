import { useState, useEffect } from 'react';

// Minimal pub/sub so any call site can raise a "needs internet" notice without
// threading props through the component tree.
let listener = null;

export function notifyOffline(message) {
  if (listener) listener(message);
}

export function useOfflineToast(durationMs = 3200) {
  const [message, setMessage] = useState(null);

  useEffect(() => {
    listener = setMessage;
    return () => { listener = null; };
  }, []);

  useEffect(() => {
    if (!message) return;
    const id = setTimeout(() => setMessage(null), durationMs);
    return () => clearTimeout(id);
  }, [message, durationMs]);

  return message;
}
