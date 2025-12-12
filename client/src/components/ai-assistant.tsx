import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageCircle, X, Send, Loader2, Sparkles, Bot, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export function AIAssistant() {
  const { isAuthenticated } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const chatMutation = useMutation({
    mutationFn: async (message: string) => {
      const conversationHistory = messages.map(m => ({
        role: m.role,
        content: m.content
      }));
      
      const response = await apiRequest('POST', '/api/ai-assistant/chat', { 
        message, 
        conversationHistory 
      });
      return response.json();
    },
    onSuccess: (data: { message: string }) => {
      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: data.message,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, assistantMessage]);
    },
    onError: (error: any) => {
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: "assistant",
        content: error.message || "Sorry, I encountered an error. Please try again.",
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    }
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  if (!isAuthenticated) {
    return null;
  }

  const handleSend = () => {
    if (!input.trim() || chatMutation.isPending) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: input.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    chatMutation.mutate(input.trim());
    setInput("");
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const suggestions = [
    "What products do we have?",
    "Show me recent quotes",
    "Who are our clients?"
  ];

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-24 right-6 w-96 h-[500px] bg-background border rounded-xl shadow-2xl flex flex-col z-50 overflow-hidden"
            data-testid="ai-assistant-panel"
          >
            <div className="flex items-center justify-between p-4 border-b bg-primary/5">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-primary/10">
                  <Sparkles className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">AI Assistant</h3>
                  <p className="text-xs text-muted-foreground">Ask about products, quotes, or clients</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsOpen(false)}
                className="h-8 w-8"
                data-testid="button-close-assistant"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <ScrollArea className="flex-1 p-4" ref={scrollRef}>
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center p-4">
                  <div className="p-3 rounded-full bg-primary/10 mb-4">
                    <Bot className="h-8 w-8 text-primary" />
                  </div>
                  <h4 className="font-medium mb-2">How can I help you?</h4>
                  <p className="text-sm text-muted-foreground mb-4">
                    I can answer questions about your products, clients, and quotes.
                  </p>
                  <div className="flex flex-col gap-2 w-full">
                    {suggestions.map((suggestion, index) => (
                      <Button
                        key={index}
                        variant="outline"
                        size="sm"
                        className="text-xs justify-start"
                        onClick={() => {
                          setInput(suggestion);
                          inputRef.current?.focus();
                        }}
                        data-testid={`button-suggestion-${index}`}
                      >
                        {suggestion}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={cn(
                        "flex gap-2",
                        message.role === "user" ? "justify-end" : "justify-start"
                      )}
                    >
                      {message.role === "assistant" && (
                        <div className="flex-shrink-0 p-1.5 rounded-full bg-primary/10 h-fit">
                          <Bot className="h-4 w-4 text-primary" />
                        </div>
                      )}
                      <div
                        className={cn(
                          "max-w-[80%] rounded-xl px-3 py-2 text-sm",
                          message.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        )}
                        data-testid={`message-${message.role}-${message.id}`}
                      >
                        <p className="whitespace-pre-wrap">{message.content}</p>
                      </div>
                      {message.role === "user" && (
                        <div className="flex-shrink-0 p-1.5 rounded-full bg-primary h-fit">
                          <User className="h-4 w-4 text-primary-foreground" />
                        </div>
                      )}
                    </div>
                  ))}
                  {chatMutation.isPending && (
                    <div className="flex gap-2 justify-start">
                      <div className="flex-shrink-0 p-1.5 rounded-full bg-primary/10 h-fit">
                        <Bot className="h-4 w-4 text-primary" />
                      </div>
                      <div className="bg-muted rounded-xl px-3 py-2">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </ScrollArea>

            <div className="p-4 border-t bg-background">
              <div className="flex gap-2">
                <Input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder="Ask a question..."
                  disabled={chatMutation.isPending}
                  className="flex-1"
                  data-testid="input-assistant-message"
                />
                <Button
                  onClick={handleSend}
                  disabled={!input.trim() || chatMutation.isPending}
                  size="icon"
                  data-testid="button-send-message"
                >
                  {chatMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        className="fixed bottom-6 right-6 z-50"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <Button
          onClick={() => setIsOpen(!isOpen)}
          size="lg"
          className={cn(
            "h-14 w-14 rounded-full shadow-lg",
            isOpen ? "bg-muted text-muted-foreground hover:bg-muted" : "bg-primary"
          )}
          data-testid="button-open-assistant"
        >
          <AnimatePresence mode="wait">
            {isOpen ? (
              <motion.div
                key="close"
                initial={{ rotate: -90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: 90, opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <X className="h-6 w-6" />
              </motion.div>
            ) : (
              <motion.div
                key="open"
                initial={{ rotate: 90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: -90, opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <MessageCircle className="h-6 w-6" />
              </motion.div>
            )}
          </AnimatePresence>
        </Button>
      </motion.div>
    </>
  );
}
