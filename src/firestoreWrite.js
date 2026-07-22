import { doc } from 'firebase/firestore';

/**
 * Firestore settles a write promise only once the server acknowledges it, which
 * never happens while offline. The local cache applies the write immediately and
 * onSnapshot fires right away (hasPendingWrites: true), so awaiting the promise
 * buys nothing but a frozen UI in a supermarket with no signal.
 *
 * queuedWrite lets the caller continue as soon as the write is safely queued.
 * The SDK replays it when the connection returns.
 *
 * The timeout covers "lying online" cases — captive portals and dead wifi where
 * navigator.onLine is true but nothing actually reaches the server.
 */
export function queuedWrite(promise, timeoutMs = 2000) {
  // Queued writes retry on their own; a rejection here isn't actionable and
  // must not surface as an unhandled rejection.
  promise.catch(() => {});
  if (!navigator.onLine) return Promise.resolve();
  return Promise.race([
    promise,
    new Promise(resolve => setTimeout(resolve, timeoutMs)),
  ]);
}

/**
 * addDoc() only exposes the new document's ID after the server responds, so it
 * can't be used offline when the caller needs the ID. doc() generates the ID
 * client-side, letting callers pair it with setDoc + queuedWrite instead.
 */
export function newDocRef(collectionRef) {
  return doc(collectionRef);
}
