import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useData } from "@/lib/store";
import {
  MessageSquare,
  Send,
  Trash2,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { SupplierLayout } from "@/components/layout/SupplierLayout";
import { DeleteConfirmationDialog } from "@/components/ui/DeleteConfirmationDialog";

interface Message {
  id: string;
  sender_name?: string;
  message: string;
  additional_info?: string;
  submitted_at: string;
}

export function SupplierSupport({
  shopName = "Shop",
  shopLocation = "",
}: {
  shopName?: string;
  shopLocation?: string;
}) {
  const { toast } = useToast();
  const { addSupportMessage, deleteMessage, supportMessages } = useData();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [deleteDialog, setDeleteDialog] = useState<{ isOpen: boolean; id: string; name: string } | null>(null);

  useEffect(() => {
    loadMessages();
  }, []);

  const loadMessages = async () => {
    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch("/api/support-messages", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!response.ok) {
        console.error("Failed to load messages");
        setLoading(false);
        return;
      }

      const data = await response.json();
      setMessages(data.messages || []);
    } catch (error) {
      console.error("Error loading messages:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast({
        title: "Error",
        description: "Please enter your name",
        variant: "destructive",
      });
      return;
    }

    if (!message.trim()) {
      toast({
        title: "Error",
        description: "Please enter your message",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      await addSupportMessage?.(name, message, email);
      toast({
        title: "Success",
        description:
          "Your message has been submitted. Our team will respond shortly.",
      });
      setName("");
      setEmail("");
      setMessage("");
      await loadMessages();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to submit message",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteMessage = async (id: string) => {
    const msg = messages.find(m => m.id === id);
    if (!msg) return;
    setDeleteDialog({
      isOpen: true,
      id: id,
      name: "Support Message"
    });
  };

  const confirmDeleteMessage = async (action: 'archive' | 'trash') => {
    if (!deleteDialog) return;
    const { id } = deleteDialog;
    
    try {
      await deleteMessage?.(id);
      setMessages(messages.filter((m) => m.id !== id));
      toast({
        title: "Success",
        description: action === 'trash' ? "Message moved to trash" : "Message archived",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete message",
        variant: "destructive",
      });
    } finally {
      setDeleteDialog(null);
    }
  };

  return (
    <SupplierLayout shopName={shopName} shopLocation={shopLocation} shopApproved={true}>
      <div className="p-6 lg:p-8 max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <MessageSquare size={24} className="text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-900">
              Messages & Support
            </h1>
          </div>
          <p className="text-gray-600 mt-2">
            Get help from our technical support team. Submit your questions or
            issues below.
          </p>
        </div>

        {/* Submit Form */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Submit a Message</CardTitle>
            <CardDescription>
              Tell us how we can help. Our team typically responds within 24
              hours.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">
                    Name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="Your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email (Optional)</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="your.email@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-2"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="message">
                  Message <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  id="message"
                  placeholder="Describe your issue or question in detail..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  required
                  className="mt-2 min-h-32"
                />
              </div>

              <Button
                type="submit"
                disabled={submitting}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                {submitting ? (
                  <>
                    <Loader2 size={16} className="mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send size={16} className="mr-2" />
                    Send Message
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Messages History */}
        <Card>
          <CardHeader>
            <CardTitle>Your Messages</CardTitle>
            <CardDescription>
              Track your submitted messages and responses
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 text-blue-600 animate-spin mr-2" />
                <span className="text-gray-600">Loading messages...</span>
              </div>
            ) : messages.length === 0 ? (
              <div className="py-8 text-center">
                <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-600">
                  No messages yet. Submit one above to get started!
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className="p-4 bg-gray-50 rounded-lg border border-gray-200"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-semibold text-gray-900">
                          {msg.sender_name || "Anonymous"}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {new Date(msg.submitted_at).toLocaleDateString(
                            "en-US",
                            {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            }
                          )}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDeleteMessage(msg.id)}
                        className="p-2 hover:bg-red-100 rounded-lg text-red-600 transition"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    <p className="text-gray-700 mb-2">{msg.message}</p>

                    {msg.additional_info && (
                      <div className="p-2 bg-blue-50 rounded border border-blue-200 text-xs text-blue-800">
                        <strong>Additional Info:</strong> {msg.additional_info}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Info Card */}
        <Card className="mt-6">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <AlertCircle className="text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-gray-900 mb-1">
                  Response Time
                </p>
                <p className="text-sm text-gray-700">
                  Our technical support team typically responds to all messages
                  within 24 business hours. For urgent issues, please mark them
                  as priority in your message.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {deleteDialog && (
        <DeleteConfirmationDialog
          isOpen={deleteDialog.isOpen}
          onOpenChange={(open) => !open && setDeleteDialog(null)}
          onConfirm={confirmDeleteMessage}
          itemName={deleteDialog.name}
          title="Delete Support Message?"
        />
      )}
    </SupplierLayout>
  );
}
