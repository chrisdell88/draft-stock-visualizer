import Sidebar from "./Sidebar";
import Footer from "./Footer";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background bg-grid-white relative">
      {/* Glow effects */}
      <div className="fixed top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-primary/5 blur-[120px] pointer-events-none" />
      <div className="fixed bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-stock-up/5 blur-[120px] pointer-events-none" />

      <Sidebar />
      <main className="flex-1 overflow-x-hidden relative z-10 pt-14 md:pt-0 flex flex-col">
        <div className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 md:py-12">
          {children}
        </div>
        <Footer />
      </main>
    </div>
  );
}
