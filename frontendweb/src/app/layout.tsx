import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import SplashScreen from "@/components/SplashScreen";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AuthProvider } from "@/context/AuthContext";
import { CreditBalanceProvider } from "@/context/CreditBalanceContext";
import { ProjectsProvider } from "@/context/ProjectsContext";
import LoginModal from "@/components/LoginModal";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "vgAI - Generative Video Workflow",
  description: "AI broken scene-by-scene script structure and generation",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-foreground transition-colors duration-200">
        {/* Runs before paint (inline, non-async scripts execute during HTML parse)
            so the theme class is on <html> before first paint — no flash of the
            wrong theme. Deliberately NOT wrapped in a manual <head>: the App
            Router owns <head> via the Metadata API and de-dupes what goes in it,
            so a hand-written <head> in the root layout is unsupported. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var savedTheme = localStorage.getItem('theme');
                  var systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                  if (savedTheme === 'dark' || (!savedTheme && systemPrefersDark)) {
                    document.documentElement.classList.add('dark');
                  } else {
                    document.documentElement.classList.remove('dark');
                  }
                  
                  var hasVisited = sessionStorage.getItem('vgai_has_visited');
                  if (hasVisited) {
                    document.documentElement.classList.add('hide-splash');
                  }
                } catch (e) {}
              })()
            `,
          }}
        />
        <ThemeProvider>
          <AuthProvider>
            <CreditBalanceProvider>
              <ProjectsProvider>
                <SplashScreen />
                {children}
                <LoginModal />
              </ProjectsProvider>
            </CreditBalanceProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
