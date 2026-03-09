import { useState } from "react";
import { useData } from "@/lib/store";
import {
    LayoutDashboard,
    Building2,
    Package,
    ShoppingCart,
    CheckCircle2,
    FileText,
    ClipboardCheck,
    MessageSquare,
    Users,
    Tags,
    FolderKanban,
    AlertCircle,
    HelpCircle,
    BookOpen,
    ChevronDown,
    ChevronUp,
    Info,
    Lightbulb,
    ArrowRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Sidebar } from "@/components/layout/Sidebar";

type ManualSubItem = {
    label: string;
    description: string;
    steps: string[];
    tips?: string[];
};

type ManualSection = {
    title: string;
    icon: any;
    items: ManualSubItem[];
};

export default function UserManual() {
    const { user } = useData();
    const [openSections, setOpenSections] = useState<Record<string, boolean>>({
        "Getting Started": true
    });

    const toggleSection = (title: string) => {
        setOpenSections((prev) => ({ ...prev, [title]: !prev[title] }));
    };

    const isAdminOrSoftware = user?.role === "admin" || user?.role === "software_team";
    const isPreSales = user?.role === "pre_sales";
    const isContractor = user?.role === "contractor";
    const isAdminOrSoftwareOrPurchaseTeam =
        user?.role === "admin" ||
        user?.role === "software_team" ||
        user?.role === "purchase_team";
    const isSupplier = user?.role === "supplier";
    const isProductManager = user?.role === "product_manager";

    const manualData: ManualSection[] = [
        {
            title: "Getting Started",
            icon: Lightbulb,
            items: [
                {
                    label: "Platform Overview",
                    description: "BuildEstimate is a comprehensive tool for managing construction projects from initial estimation to procurement.",
                    steps: [
                        "Start by creating a Project in the 'Creations' section.",
                        "Use 'Generate BOM' to add products and materials to your project.",
                        "Refine costs and apply margins in 'Finalize BOQ'.",
                        "Generate Purchase Orders once your BOQ version is approved."
                    ],
                    tips: ["Keep an eye on the 'Alerts' section for pending approvals or urgent messages."]
                }
            ]
        },
        {
            title: "Overview & Monitoring",
            icon: LayoutDashboard,
            items: [
                {
                    label: "Dashboard",
                    description: "Your central hub for monitoring ongoing workspace activity.",
                    steps: [
                        "View summary cards for Projects, Products, and Materials.",
                        "Check recent notifications and system updates.",
                        "Admins can see global metrics across the entire platform."
                    ],
                },
                {
                    label: "Project Dashboard",
                    description: "A specialized view for tracking the status of every project and its associated BOM versions.",
                    steps: [
                        "Search for projects by name or client.",
                        "Filter projects based on their current lifecycle stage (Draft, Ongoing, Completed).",
                        "Quick-view recent BOM versions to see if they are approved or pending."
                    ],
                },
            ].filter(() => !isPreSales && !isContractor && !isSupplier && !isProductManager),
        },
        {
            title: "Project Creation",
            icon: Building2,
            items: [
                {
                    label: "Creating a New Project",
                    description: "The first step in any workflow. Projects act as containers for all your estimates.",
                    steps: [
                        "Navigate to 'Create Project' in the sidebar.",
                        "Enter critical details: Project Name, Client, Budget, and Site Location.",
                        "Optionally, select an 'Existing Template' to clone an old project's structure.",
                        "Click 'Create Project' to save and start adding materials."
                    ],
                    tips: ["Defining a realistic budget here will trigger automatic warnings if your BOQ costs exceed it later."]
                },
            ].filter(() => isAdminOrSoftware || isPreSales),
        },
        {
            title: "BOM Generation",
            icon: ShoppingCart,
            items: [
                {
                    label: "Generating a Bill of Materials (BOM)",
                    description: "Transform your architectural requirements into a structured list of items.",
                    steps: [
                        "Select your Project and a Version (starts as Draft).",
                        "Use '+ Add Product' to pick from the pre-configured product library.",
                        "For custom items, use '+ Manual Entry' to add specific materials directly.",
                        "For Products: Enter the 'Target Area' (e.g., Sqft) - the system will automatically scale all quantities.",
                        "Click 'Finalize' on a product to lock its individual contribution to the BOM."
                    ],
                    tips: ["You can drag rows to reorder them exactly how you want them to appear in exports."]
                },
                {
                    label: "Version Control",
                    description: "BOMs support multiple versions to track design or budget changes.",
                    steps: [
                        "Versions are automatically tracked as V1, V2, etc.",
                        "Once satisfied, 'Submit' the version for Admin Approval.",
                        "Approved versions are locked and used for procurement.",
                        "If changes are needed after approval, you must 'Request to Edit'."
                    ]
                }
            ].filter(() => isAdminOrSoftware || isPreSales),
        },
        {
            title: "BOQ Finalization",
            icon: CheckCircle2,
            items: [
                {
                    label: "Finalizing the BOQ",
                    description: "The final review stage where you apply margins, taxes, and prepare client-facing reports.",
                    steps: [
                        "Select an approved or legacy version of your BOM.",
                        "Manage Columns: Add custom columns for Profit Margins, GST, or Site Overheads.",
                        "Global Calculations: Setup formulas (e.g., 'Total Value * 10%') to apply changes across the entire sheet.",
                        "Column Visibility: Hover over header names and click the 'Eye' icon to hide columns not needed for the report.",
                        "Export: Generate professional Excel or PDF versions of the finalized document."
                    ],
                    tips: ["Persistence: Any column you hide or reorder is automatically saved for that project, so it looks the same when you return."]
                }
            ].filter(() => isAdminOrSoftware),
        },
        {
            title: "Supplier Portal",
            icon: Users,
            items: [
                {
                    label: "Shop Management",
                    description: "Suppliers must register their 'Shops' to become visible in the material selection process.",
                    steps: [
                        "Go to 'Add Shop' and provide your business details and location.",
                        "Wait for Admin Approval before your shop becomes active.",
                        "Admins can see your shop's performance and categories."
                    ],
                },
                {
                    label: "Material Price Submission",
                    description: "Keep your material rates updated to ensure you are selected for projects.",
                    steps: [
                        "Use 'Manage Materials' to see materials relevant to your shop categories.",
                        "Submit your Supply and Installation rates.",
                        "Admins will review and approve your submissions based on market standards."
                    ],
                },
            ].filter(() => isSupplier),
        },
        {
            title: "Master Data Management",
            icon: FolderKanban,
            items: [
                {
                    label: "Product Configuration",
                    description: "Define how products behave when added to a project.",
                    steps: [
                        "Link a product to multiple base materials.",
                        "Define the mathematical relationship (formulas) for how quantities scale with area.",
                        "Set standard units (e.g., Sqft, Rft, Pcs) for the product."
                    ],
                },
                {
                    label: "Category & Vendor Management",
                    description: "Organize materials and vendors for efficient filtering.",
                    steps: [
                        "Categories help group materials (e.g., Civil, Electrical, Painting).",
                        "Vendor Categories link specific suppliers to these groups.",
                        "Use 'Bulk Upload' to add hundreds of materials at once via Excel."
                    ],
                },
            ].filter(() => isAdminOrSoftwareOrPurchaseTeam || isProductManager),
        },
    ];

    const visibleSections = manualData.filter((s) => s.items.length > 0);

    return (
        <div className="flex bg-gray-50/50 min-h-screen">
            <Sidebar />
            <main className="flex-1 md:ml-64 p-8 pt-20 md:pt-8 overflow-y-auto">
                <div className="max-w-5xl mx-auto space-y-8">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
                        <div className="flex items-center gap-4">
                            <div className="p-4 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-2xl shadow-lg shadow-purple-100">
                                <BookOpen className="h-8 w-8 text-white" />
                            </div>
                            <div>
                                <h1 className="text-4xl font-extrabold text-slate-900 font-heading tracking-tight">Help Center</h1>
                                <p className="text-slate-500 mt-1 flex items-center gap-2">
                                    Comprehensive guide for <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-md font-bold text-xs uppercase tracking-wider">{user?.role?.replace("_", " ")}</span> role
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 text-xs font-medium text-slate-400 bg-white px-4 py-2 rounded-full border border-slate-100 shadow-sm">
                            <Info className="h-3.5 w-3.5 text-blue-400" />
                            Click on sections below to expand detailed instructions
                        </div>
                    </div>

                    <div className="grid gap-8">
                        {visibleSections.map((section) => (
                            <div key={section.title} className="space-y-4">
                                <button
                                    onClick={() => toggleSection(section.title)}
                                    className={cn(
                                        "w-full flex items-center justify-between p-5 rounded-2xl transition-all duration-300 border-2",
                                        openSections[section.title]
                                            ? "bg-white border-purple-200 shadow-md shadow-purple-50"
                                            : "bg-white/80 border-transparent hover:border-slate-200 hover:bg-white"
                                    )}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={cn(
                                            "p-2.5 rounded-xl transition-colors",
                                            openSections[section.title] ? "bg-purple-100 text-purple-600" : "bg-slate-100 text-slate-400"
                                        )}>
                                            <section.icon className="h-6 w-6" />
                                        </div>
                                        <span className="text-xl font-bold text-slate-800 font-heading">{section.title}</span>
                                    </div>
                                    {openSections[section.title] ? (
                                        <ChevronUp className="h-6 w-6 text-purple-400" />
                                    ) : (
                                        <ChevronDown className="h-6 w-6 text-slate-300" />
                                    )}
                                </button>

                                {openSections[section.title] && (
                                    <div className="grid grid-cols-1 gap-6 pl-4">
                                        {section.items.map((item) => (
                                            <Card key={item.label} className="border-none shadow-none bg-transparent">
                                                <CardContent className="p-0 space-y-4">
                                                    <div className="flex items-start gap-4">
                                                        <div className="mt-1 h-3 w-3 rounded-full bg-purple-500 shrink-0 border-4 border-purple-100" />
                                                        <div className="space-y-2 flex-1">
                                                            <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-2 italic">
                                                                {item.label}
                                                                <ArrowRight className="h-4 w-4 text-slate-200" />
                                                            </h3>
                                                            <p className="text-slate-600 text-sm leading-relaxed max-w-3xl">
                                                                {item.description}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    <div className="ml-7 grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        <div className="bg-white border border-slate-100 rounded-2xl p-6 space-y-4 shadow-sm hover:border-purple-100 transition-colors">
                                                            <h4 className="text-[10px] font-black text-purple-500 uppercase tracking-widest flex items-center gap-2">
                                                                <div className="h-1.5 w-1.5 rounded-full bg-purple-500" />
                                                                Step-by-Step Guide
                                                            </h4>
                                                            <ul className="space-y-3">
                                                                {item.steps.map((step, idx) => (
                                                                    <li key={idx} className="flex items-start gap-3 group">
                                                                        <span className="flex items-center justify-center h-5 w-5 rounded-md bg-slate-50 text-[10px] font-bold text-slate-400 group-hover:bg-purple-50 group-hover:text-purple-500 transition-colors shrink-0 border border-slate-100">
                                                                            {idx + 1}
                                                                        </span>
                                                                        <span className="text-sm text-slate-700 leading-snug">{step}</span>
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        </div>

                                                        {item.tips && (
                                                            <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-6 space-y-4 transition-all hover:bg-blue-50">
                                                                <h4 className="text-[10px] font-black text-blue-500 uppercase tracking-widest flex items-center gap-2">
                                                                    <Lightbulb className="h-3.5 w-3.5" />
                                                                    Pro Tips & Notes
                                                                </h4>
                                                                <ul className="space-y-3">
                                                                    {item.tips.map((tip, idx) => (
                                                                        <li key={idx} className="flex items-start gap-3">
                                                                            <div className="mt-1.5 h-1.5 w-1.5 rounded-full bg-blue-400 shrink-0" />
                                                                            <span className="text-sm text-blue-800 font-medium italic leading-snug">{tip}</span>
                                                                        </li>
                                                                    ))}
                                                                </ul>
                                                            </div>
                                                        )}
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    <div className="relative overflow-hidden bg-gradient-to-r from-slate-900 to-indigo-900 rounded-[2.5rem] p-12 text-white mt-16 shadow-2xl">
                        <div className="absolute top-0 right-0 p-8 opacity-10">
                            <HelpCircle className="h-48 w-48" />
                        </div>
                        <div className="relative z-10 flex flex-col items-center text-center gap-6">
                            <div className="h-16 w-16 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-md">
                                <MessageSquare className="h-8 w-8 text-purple-300" />
                            </div>
                            <div className="space-y-2">
                                <h2 className="text-3xl font-bold font-heading">Still Have Questions?</h2>
                                <p className="max-w-2xl text-slate-300 text-lg leading-relaxed">
                                    Our development team is constantly updating the platform. If you encounter a workflow not covered here, please message support.
                                </p>
                            </div>
                            <Button size="lg" className="bg-white text-slate-900 hover:bg-slate-100 font-bold px-10 rounded-xl h-14 text-lg">
                                Contact Support
                            </Button>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
