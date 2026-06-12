import "./globals.css";

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="text-center p-8">
        <h1 className="text-4xl font-bold mb-4">PhotoEvent</h1>
        <p className="text-gray-600 mb-8">Capture, share, and print photos at your event</p>
        <div className="flex gap-4 justify-center">
          <a
            href="/capture"
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Take a Photo
          </a>
          <a
            href="/gallery"
            className="px-6 py-3 bg-white text-gray-700 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors font-medium"
          >
            View Gallery
          </a>
        </div>
      </div>
    </main>
  );
}
