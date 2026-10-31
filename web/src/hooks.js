import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';

// GET a path (pass null to skip). Returns { data, error, loading, setData, reload }.
export function useApi(path) {
  const [state, setState] = useState({ data: null, error: null, loading: Boolean(path) });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!path) {
      setState({ data: null, error: null, loading: false });
      return undefined;
    }
    const ac = new AbortController();
    setState((s) => ({ ...s, error: null, loading: true }));
    api(path, { signal: ac.signal })
      .then((data) => setState({ data, error: null, loading: false }))
      .catch((error) => {
        if (error.name !== 'AbortError') setState({ data: null, error, loading: false });
      });
    return () => ac.abort();
  }, [path, tick]);

  const setData = useCallback((updater) => {
    setState((s) => ({ ...s, data: typeof updater === 'function' ? updater(s.data) : updater }));
  }, []);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { ...state, setData, reload };
}

export function useTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} | Volt` : 'Volt';
  }, [title]);
}

// Maps an API failure to a translated message; validation messages from the server are passed through.
export function errText(e, t) {
  if (!e) return '';
  if (e.status === 0) return t('err.network');
  if (e.status === 429) return t('err.rate');
  if (e.status >= 500) return t('err.server');
  return e.message;
}

export function useMedia(query) {
  const [match, setMatch] = useState(() => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false));
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}
