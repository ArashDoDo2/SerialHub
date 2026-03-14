"use client";

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="w-full max-w-lg rounded-lg bg-panel p-6 text-center">
        <h1 className="text-2xl font-bold">Something went wrong</h1>
        <p className="mt-3 text-sm text-gray-300">
          {error.message || "Unexpected application error."}
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-4 rounded bg-blue-600 px-4 py-2 text-white"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
