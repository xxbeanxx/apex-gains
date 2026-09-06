import { useEffect, useRef } from 'react';

import { useNavigation } from 'react-router';

/**
 * Runs `close` once a `<Form>` submission settles. A plain `<form>` used to
 * close a disclosure or dialog for free by reloading the whole document;
 * `<Form>` transitions client-side instead, so anything that only reset via
 * that reload - an open `<details>`, a controlled dialog's `useState` - has
 * to be told explicitly.
 */
export function useCloseOnSubmit(close: () => void): void {
  const navigation = useNavigation();
  const closeRef = useRef(close);
  closeRef.current = close;
  const wasSubmitting = useRef(false);

  useEffect(() => {
    const isSubmitting = navigation.state !== 'idle';
    if (wasSubmitting.current && !isSubmitting) closeRef.current();
    wasSubmitting.current = isSubmitting;
  }, [navigation.state]);
}
