import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center">
      <h1 className="text-4xl font-semibold text-gray-900 dark:text-gray-100">
        404
      </h1>
      <p className="mt-2 text-gray-500 dark:text-gray-400">Page not found</p>
      <Link
        to="/"
        className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
      >
        Go home
      </Link>
    </div>
  );
}
