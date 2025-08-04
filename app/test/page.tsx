// app/test/page.tsx
export default function TestPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Test Page</h1>
      <p>If you can see this page, the Next.js server is working correctly.</p>
      <div className="mt-4">
        <p>Time: {new Date().toISOString()}</p>
      </div>
    </div>
  );
}