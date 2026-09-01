import { useCallback, useEffect, useState } from 'react';

const initialState = {
  status: 'loading',
  data: null,
  error: null,
};

export function useHealthOverview({ gateway, recordId, mapRecordToOverview }) {
  const [state, setState] = useState(initialState);
  const [retryCount, setRetryCount] = useState(0);
  const retry = useCallback(() => setRetryCount((count) => count + 1), []);

  useEffect(() => {
    let cancelled = false;

    setState(initialState);

    Promise.resolve()
      .then(() => gateway.getOverviewRecord(recordId))
      .then((record) => {
        if (cancelled) return;

        if (record === null) {
          setState({ status: 'empty', data: null, error: null });
          return;
        }

        const data = mapRecordToOverview(record);
        if (!cancelled) setState({ status: 'ready', data, error: null });
      })
      .catch((error) => {
        if (!cancelled) setState({ status: 'error', data: null, error });
      });

    return () => {
      cancelled = true;
    };
  }, [gateway, mapRecordToOverview, recordId, retryCount]);

  return { ...state, retry };
}
