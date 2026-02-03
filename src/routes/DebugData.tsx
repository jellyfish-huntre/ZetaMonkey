import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useUserStore } from '../store/userStore';

export default function DebugData() {
  const { user } = useUserStore();
  const [data, setData] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      if (!user) return;
      const { data } = await supabase
        .from('question_responses')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      setData(data || []);
    };
    load();
  }, [user]);

  if (!user) return <div>Please login</div>;

  return (
    <div style={{ padding: 20, color: 'white' }}>
      <h1>Debug Data</h1>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}
