"use client";
import React, { useEffect, useState } from 'react';

interface Props {
  params: { id: string };
}

interface RunDetail {
  id: number;
  scriptName: string;
  nodeName: string;
  status: string;
  startedAt: string;
  finishedAt?: string;
  output?: string;
}

export default function RunDetailPage({ params }: Props) {
  const [run, setRun] = useState<RunDetail | null>(null);

  useEffect(() => {
    fetch(`/api/runs/${params.id}`)
      .then((r) => r.json())
      .then((data) => setRun(data))
      .catch(() => setRun(null));
  }, [params.id]);

  if (!run) {
    return <div className="text-xl">Loading run...</div>;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Run #{run.id}</h1>
      <div className="text-sm text-gray-400">Script: {run.scriptName} | Node: {run.nodeName}</div>
      <div>Status: {run.status}</div>
      <div>Started: {run.startedAt}</div>
      {run.finishedAt && <div>Finished: {run.finishedAt}</div>}
      <section className="bg-black text-green-300 p-2 rounded font-mono text-sm whitespace-pre-wrap max-h-96 overflow-auto">
        {run.output || 'No output yet...'}
      </section>
      {run.output && (
        <a
          href={`/api/runs/${run.id}/log`}
          download
          className="text-sm text-primary underline"
        >
          Download Log
        </a>
      )}
    </div>
  );
}