import { useState, useCallback, useRef, useEffect } from 'react';
import { toast } from 'sonner';

interface UseOptimisticDataOptions<T> {
  endpoint?: string; // Support both fetchUrl and endpoint
  fetchUrl?: string;
  queryParams?: Record<string, any>;
  idField?: keyof T;
  autoFetch?: boolean; // Auto fetch on mount, default true
}

interface MutationOptions<T> {
  optimisticData?: T;
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
  successMessage?: string;
  errorMessage?: string;
}

/**
 * Custom hook for optimistic data updates
 * Provides instant UI updates without page reloads
 */
export function useOptimisticData<T extends Record<string, any>>(
  options: UseOptimisticDataOptions<T>
) {
  const {
    endpoint,
    fetchUrl: providedFetchUrl,
    queryParams = {},
    idField = 'id' as keyof T,
    autoFetch = true
  } = options;

  // Support both endpoint and fetchUrl
  const baseUrl = endpoint || providedFetchUrl;
  if (!baseUrl) {
    throw new Error('useOptimisticData requires either endpoint or fetchUrl');
  }

  // Build URL with query params
  const buildUrl = useCallback((url: string, params: Record<string, any> = {}) => {
    const filteredParams = Object.entries(params)
      .filter(([_, value]) => value !== undefined && value !== null && value !== '')
      .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});

    const queryString = new URLSearchParams(filteredParams as any).toString();
    return queryString ? `${url}?${queryString}` : url;
  }, []);

  const fetchUrl = buildUrl(baseUrl, queryParams);

  const [data, setData] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Fetch all data
  const fetchData = useCallback(async () => {
    // Cancel previous request if still pending
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch(fetchUrl, {
        signal: abortControllerRef.current.signal,
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const result = await response.json();
      setData(Array.isArray(result) ? result : []);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('Fetch error:', err);
        setError((err as Error).message || 'Fetch failed');
      }
    } finally {
      setIsLoading(false);
    }
  }, [fetchUrl]);

  // Auto fetch on mount and when fetchUrl changes
  useEffect(() => {
    if (autoFetch) {
      fetchData();
    }
  }, [fetchData, autoFetch]);

  // Create with optimistic update
  const create = useCallback(
    async (
      newItem: Partial<T>,
      mutationOptions: MutationOptions<T> = {}
    ): Promise<T | null> => {
      const { successMessage = 'Tạo thành công!', errorMessage = 'Có lỗi xảy ra!' } = mutationOptions;

      // Generate temporary ID for optimistic update
      const tempId = `temp-${Date.now()}`;
      const optimisticItem = {
        ...newItem,
        [idField]: tempId,
        createdAt: new Date().toISOString(),
      } as unknown as T;

      // Optimistic update - add to list immediately
      setData((prev) => [optimisticItem, ...prev]);

      try {
        const response = await fetch(baseUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newItem),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Create failed: ${response.status} - ${errorText}`);
        }

        const createdItem = await response.json();

        // Replace temp item with real item from server
        setData((prev) =>
          prev.map((item) =>
            item[idField] === tempId ? createdItem : item
          )
        );

        toast.success(successMessage);
        mutationOptions.onSuccess?.(createdItem);
        return createdItem;
      } catch (err) {
        console.error('Create error:', err);
        // Rollback - remove optimistic item
        setData((prev) => prev.filter((item) => item[idField] !== tempId));
        toast.error(errorMessage);
        mutationOptions.onError?.(err as Error);
        return null;
      }
    },
    [baseUrl, idField]
  );

  // Update with optimistic update
  const update = useCallback(
    async (
      id: string | number,
      updates: Partial<T>,
      mutationOptions: MutationOptions<T> = {}
    ): Promise<T | null> => {
      const { successMessage = 'Cập nhật thành công!', errorMessage = 'Có lỗi xảy ra!' } = mutationOptions;

      // Store previous state for rollback
      const previousData = data.find((item) => item[idField] === id);
      if (!previousData) return null;

      // Optimistic update - update immediately
      setData((prev) =>
        prev.map((item) =>
          item[idField] === id
            ? { ...item, ...updates, updatedAt: new Date().toISOString() }
            : item
        )
      );

      try {
        const response = await fetch(`${baseUrl}/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        });

        if (!response.ok) throw new Error('Update failed');

        const updatedItem = await response.json();

        // Update with actual server response
        setData((prev) =>
          prev.map((item) =>
            item[idField] === id ? updatedItem : item
          )
        );

        toast.success(successMessage);
        mutationOptions.onSuccess?.(updatedItem);
        return updatedItem;
      } catch (err) {
        // Rollback to previous state
        setData((prev) =>
          prev.map((item) =>
            item[idField] === id ? previousData : item
          )
        );
        toast.error(errorMessage);
        mutationOptions.onError?.(err as Error);
        return null;
      }
    },
    [baseUrl, idField, data]
  );

  // Delete with optimistic update
  const remove = useCallback(
    async (
      id: string | number,
      mutationOptions: MutationOptions<T> = {}
    ): Promise<boolean> => {
      const { successMessage = 'Xóa thành công!', errorMessage = 'Có lỗi xảy ra!' } = mutationOptions;

      // Store for rollback
      const previousItem = data.find((item) => item[idField] === id);
      const previousIndex = data.findIndex((item) => item[idField] === id);

      // Optimistic delete - remove immediately
      setData((prev) => prev.filter((item) => item[idField] !== id));

      try {
        const response = await fetch(`${baseUrl}/${id}`, {
          method: 'DELETE',
        });

        if (!response.ok) throw new Error('Delete failed');

        toast.success(successMessage);
        mutationOptions.onSuccess?.(previousItem as T);
        return true;
      } catch (err) {
        // Rollback - restore item at original position
        if (previousItem) {
          setData((prev) => {
            const newData = [...prev];
            newData.splice(previousIndex, 0, previousItem);
            return newData;
          });
        }
        toast.error(errorMessage);
        mutationOptions.onError?.(err as Error);
        return false;
      }
    },
    [baseUrl, idField, data]
  );

  // Batch update for status changes etc.
  const batchUpdate = useCallback(
    async (
      ids: (string | number)[],
      updates: Partial<T>,
      mutationOptions: MutationOptions<T> = {}
    ): Promise<boolean> => {
      const { successMessage = 'Cập nhật thành công!', errorMessage = 'Có lỗi xảy ra!' } = mutationOptions;

      // Store previous state
      const previousData = [...data];

      // Optimistic batch update
      setData((prev) =>
        prev.map((item) =>
          ids.includes(item[idField] as string | number)
            ? { ...item, ...updates, updatedAt: new Date().toISOString() }
            : item
        )
      );

      try {
        // Execute all updates in parallel
        await Promise.all(
          ids.map((id) =>
            fetch(`${baseUrl}/${id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(updates),
            })
          )
        );

        toast.success(successMessage);
        return true;
      } catch (err) {
        // Rollback
        setData(previousData);
        toast.error(errorMessage);
        return false;
      }
    },
    [baseUrl, idField, data]
  );

  // Local state update without API call (for UI-only changes)
  const updateLocal = useCallback((id: string | number, updates: Partial<T>) => {
    setData((prev) =>
      prev.map((item) =>
        item[idField] === id ? { ...item, ...updates } : item
      )
    );
  }, [idField]);

  // Add item locally (after file upload etc.)
  const addLocal = useCallback((item: T) => {
    setData((prev) => [item, ...prev]);
  }, []);

  // Remove item locally
  const removeLocal = useCallback((id: string | number) => {
    setData((prev) => prev.filter((item) => item[idField] !== id));
  }, [idField]);

  return {
    data,
    setData,
    isLoading,
    error,
    fetchData,
    create,
    update,
    remove,
    batchUpdate,
    updateLocal,
    addLocal,
    removeLocal,
  };
}
