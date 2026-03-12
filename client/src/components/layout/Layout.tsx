import { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Chatbot } from "../ui/Chatbot";

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="no-print">
        <Sidebar />
      </div>
      <main className="md:pl-64 min-h-screen transition-all duration-200 print:pl-0">
        <div className="container mx-auto p-4 md:p-8 pt-16 md:pt-8 max-w-7xl">
          {children}
        </div>
      </main>
      <div className="no-print">
        <Chatbot />
      </div>
    </div>
  );
}
