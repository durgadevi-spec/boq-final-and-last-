import { ReactNode, useState } from "react";
import { Sidebar } from "./Sidebar";
import { Chatbot } from "../ui/Chatbot";
import { cn } from "@/lib/utils";

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="no-print">
        <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
      </div>
      <main className={cn(
        "min-h-screen transition-all duration-300 ease-in-out print:pl-0",
        sidebarOpen ? "md:pl-64" : "pl-0"
      )}>
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
