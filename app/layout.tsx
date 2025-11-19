// app/layout.tsx
import AuthSessionProvider from "@/components/providers/session-provider";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";

export const metadata = {
  title: "Rakusyo GO - スポーツ大会管理システム",
  description: "あらゆるスポーツ大会の運営から結果公開まで、簡単・楽勝で大会運営ができる総合管理システム",
  robots: "index, follow",
  metadataBase: new URL(process.env.NEXTAUTH_URL || 'http://localhost:3000'),
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#2563eb",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <head>
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="msapplication-config" content="none" />
        <meta name="format-detection" content="telephone=no" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // Edge localStorage fix - runs before any other scripts
              (function() {
                var isEdge = navigator.userAgent.indexOf('Edg') > -1 || navigator.userAgent.indexOf('Edge') > -1;
                var isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
                
                if (isEdge && isLocalhost) {
                  // Disable Next.js dev overlay for Edge on localhost
                  window.__NEXT_DISABLE_OVERLAY = true;
                  window.NEXT_DISABLE_OVERLAY = true;
                }
                
                // Create comprehensive localStorage polyfill
                function createStoragePolyfill() {
                  var data = {};
                  return {
                    getItem: function(key) {
                      return data[key] !== undefined ? data[key] : null;
                    },
                    setItem: function(key, value) {
                      data[key] = String(value);
                    },
                    removeItem: function(key) {
                      delete data[key];
                    },
                    clear: function() {
                      data = {};
                    },
                    get length() {
                      return Object.keys(data).length;
                    },
                    key: function(index) {
                      var keys = Object.keys(data);
                      return keys[index] || null;
                    }
                  };
                }
                
                // Test and replace localStorage if needed
                try {
                  var testKey = '__localStorage_test__';
                  window.localStorage.setItem(testKey, 'test');
                  window.localStorage.removeItem(testKey);
                } catch (e) {
                  console.warn('[Edge Fix] localStorage not available, using polyfill');
                  window.localStorage = createStoragePolyfill();
                }
                
                // Test and replace sessionStorage if needed
                try {
                  var testKey = '__sessionStorage_test__';
                  window.sessionStorage.setItem(testKey, 'test');
                  window.sessionStorage.removeItem(testKey);
                } catch (e) {
                  console.warn('[Edge Fix] sessionStorage not available, using polyfill');
                  window.sessionStorage = createStoragePolyfill();
                }
              })();
            `,
          }}
        />
      </head>
      <body suppressHydrationWarning>
        <AuthSessionProvider>
          {children}
        </AuthSessionProvider>
        <Analytics />
      </body>
    </html>
  );
}