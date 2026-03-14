"use client";

type GlobalErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalErrorPage({ error, reset }: GlobalErrorPageProps) {
  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-bg text-foreground">
        <div className="w-full max-w-lg rounded-lg bg-panel p-6 text-center">
          <h1 className="text-2xl font-bold">Application error</h1>
          <p className="mt-3 text-sm text-gray-300">
            {error.message || "Unexpected application error."}
          </p>
          <button
            type="button"
            onClick={reset}
            className="mt-4 rounded bg-blue-600 px-4 py-2 text-white"
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
