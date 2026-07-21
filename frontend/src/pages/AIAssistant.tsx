import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Bot, Send, Loader2, Brain, AlertCircle } from "lucide-react";
import api from "@/lib/api";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function AIAssistant() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "I'm your quantitative trading assistant. Ask me about backtest results, option strategies, portfolio design, or risk management." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState<"checking" | "available" | "unavailable">("checking");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    checkStatus();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const checkStatus = async () => {
    try {
      const data = await api.get("/api/ai/status");
      setAiStatus(data.available ? "available" : "unavailable");
    } catch {
      setAiStatus("unavailable");
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMsg: Message = { role: "user", content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const data = await api.post("/api/ai/chat", {
        messages: [{ role: "user", content: userMsg.content }],
        temperature: 0.3,
        max_tokens: 2000,
      });
      setMessages(prev => [...prev, { role: "assistant", content: data.response }]);
    } catch (e: any) {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: `⚠️ AI assistant unavailable. ${e?.detail || "Check that Ollama is running on your server."}`,
      }]);
    }
    setLoading(false);
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-100 flex items-center gap-2">
            <Brain className="h-5 w-5 text-amber-400" />
            AI Trading Assistant
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Local LLM for backtest analysis and strategy advice</p>
        </div>
        <Badge className={`text-[10px] ${
          aiStatus === "available" ? "bg-emerald-900/30 text-emerald-400" :
          aiStatus === "unavailable" ? "bg-red-900/30 text-red-400" :
          "bg-gray-800 text-gray-400"
        }`}>
          {aiStatus === "available" ? "🟢 Ollama Connected" :
           aiStatus === "unavailable" ? "🔴 Offline" : "⋯ Checking"}
        </Badge>
      </div>

      {/* Chat */}
      <Card className="bg-[#0d1321] border-gray-800/60">
        <CardContent className="p-0">
          {/* Messages */}
          <div className="h-[500px] overflow-y-auto p-4 space-y-3">
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : ""}`}>
                {msg.role === "assistant" && (
                  <div className="h-6 w-6 rounded-full bg-amber-400/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="h-3.5 w-3.5 text-amber-400" />
                  </div>
                )}
                <div className={`max-w-[80%] rounded-lg px-3 py-2 text-xs leading-relaxed ${
                  msg.role === "user"
                    ? "bg-amber-400/10 text-gray-200"
                    : "bg-[#0a0e17] text-gray-300 border border-gray-800/60"
                }`}>
                  {msg.content.split("\n").map((line, j) => (
                    <span key={j}>{line}<br /></span>
                  ))}
                </div>
                {msg.role === "user" && (
                  <div className="h-6 w-6 rounded-full bg-emerald-400/10 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-[10px] text-emerald-400 font-medium">U</span>
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="flex gap-2">
                <div className="h-6 w-6 rounded-full bg-amber-400/10 flex items-center justify-center">
                  <Bot className="h-3.5 w-3.5 text-amber-400" />
                </div>
                <div className="bg-[#0a0e17] rounded-lg px-3 py-2 border border-gray-800/60">
                  <Loader2 className="h-3.5 w-3.5 text-amber-400 animate-spin" />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="border-t border-gray-800/60 p-3">
            <div className="flex gap-2">
              <Input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && sendMessage()}
                placeholder="Ask about strategies, backtest results, or risk analysis..."
                className="bg-[#0a0e17] border-gray-700 text-xs h-9"
                disabled={loading}
              />
              <Button size="sm" onClick={sendMessage} disabled={loading || !input.trim()} className="h-9 text-xs">
                {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Suggestion chips */}
      <div className="flex flex-wrap gap-2">
        {[
          "What does a Sharpe ratio of 1.5 mean?",
          "How do I improve my win rate?",
          "Explain put credit spreads",
          "What's a good max drawdown?",
        ].map((suggestion) => (
          <Button
            key={suggestion}
            size="sm"
            variant="outline"
            className="text-[10px] h-6 border-gray-700 text-gray-400 hover:text-gray-200"
            onClick={() => {
              setInput(suggestion);
            }}
          >
            {suggestion}
          </Button>
        ))}
      </div>

      {/* Tips */}
      <Card className="bg-[#0d1321] border-gray-800/60">
        <CardContent className="p-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-[10px] text-gray-500">
              <span className="text-gray-400 font-medium">Setup:</span> Point <code className="text-amber-400">LLM_BASE_URL</code> at your llama-server instance (default: <code className="text-amber-400">http://localhost:8080</code>). The assistant runs 100% locally — no data leaves your server.
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
