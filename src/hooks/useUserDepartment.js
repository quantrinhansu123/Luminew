import { useEffect, useState } from 'react';
import { supabase } from '../supabase/config';

/** `users.department` theo email đăng nhập (null nếu không có). */
export function useUserDepartment() {
  const [department, setDepartment] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const email = localStorage.getItem('userEmail');
    if (!email) {
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('department')
          .eq('email', email)
          .maybeSingle();
        if (!cancelled) {
          if (!error && data) setDepartment(data.department?.trim() || null);
          else setDepartment(null);
        }
      } catch {
        if (!cancelled) setDepartment(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { department, loading };
}
