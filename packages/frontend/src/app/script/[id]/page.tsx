"use client";
import React, { useEffect, useState } from 'react';

interface Props {
  params: { id: string };
}

export default function ScriptDetailPage({ params }: Props) {
  const [script, setScript] = useState<any>(null);
  const [runs, setRuns] = useState<any[]>([]);

  useEffect(() => {
    fetch(`/api/scripts/${params.id}`)
      .then((r) => r.json())
      .then((data) => setScript(data));
    fetch(`/api/scripts/${params.id}/runs`)
      .then((r) => r.json())
      .then((data) => setRuns(data));
  }, [params.id]);

  if (!script) {
    return <div>Loading...</div>;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-4xl font-bold">{script.name}</h1>
      <div className="text-sm text-gray-400">{script.description}</div>
      <section>
        <h2 className="text-2xl font-semibold">Run History</h2>
        <ul className="space-y-1 text-sm">
          {runs.map((r) => (
            <li key={r.id}>
              <a href={`/runs/${r.id}`} className="text-primary underline">
                Run {r.id} - {r.status}
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}