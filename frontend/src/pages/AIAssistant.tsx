import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Bot, Send, Loader2, Brain, AlertCircle,
  BarChart3, TrendingUp, TrendingDown, Activity,
  Play, ChevronRight, FlaskConical,
} from "lucide-react";
import api from "@/lib/api";

interface Message {
  role: "user" | "assistant" | "tool";
  content: string;
  toolCalls?: ToolCall[];
}

interface ToolCall {
  tool: string;
  arguments: Record<string, any>;
  result_preview?: string;
}

const TOOL_LABELS: Record<string, string> = {
  run_options_backtest: "Running backtest",
  get_available_tickers: "Loading tickers",
  get_ticker_data_info: "Checking data",
  get_market_snapshot: "Getting market snapshot",
};

function parseBacktestResult(preview: string): any | null {
  try {
    const data = JSON.parse(preview);
    if (data.metrics && data.ticker) return data;
  } catch {}
  return null;
}

function BacktestCard({ result }: { result: any }) {
  const m = result.metrics;
  const p = result.parameters;
  if (!m) return null;

  return (
    <div className="bg-[#0a0e17] border border-gray-700/60 rounded-lg p-3 my-2 text-xs">
      <div className="flex items-center gap-2 mb-2">
        <FlaskConical className="h-3.5 w-3.5 text-amber-400" />
        <span className="font-semibold text-gray-100">
          {result.ticker} — {result.strategy}
        </span>
        {p && (
          <span className="text-gray-500">
            {p.dte_range} DTE · {p.years} · Δ{p.delta_target}
          </span>
        )}
      </div>
      <div className="grid grid-cols-4 gap-2 mb-2">
        <MetricBox label="Total P&L" value={`$${m.total_pnl?.toLocaleString()}`} color={m.total_pnl >= 0 ? "text-emerald-400" : "text-red-400"} />
        <MetricBox label="Win Rate" value={`${m.win_rate_pct}%`} />
        <MetricBox label="Sharpe" value={m.sharpe_ratio?.toFixed(2)} color={m.sharpe_ratio >= 1 ? "text-emerald-400" : m.sharpe_ratio >= 0 ? "text-amber-400" : "text-red-400"} />
        <MetricBox label="Max DD" value={`${m.max_drawdown_pct}%`} color={Math.abs(m.max_drawdown_pct) < 20 ? "text-emerald-400" : "text-red-400"} />
        <MetricBox label="Profit Factor" value={m.profit_factor?.toFixed(2)} color={m.profit_factor >= 1.5 ? "text-emerald-400" : "text-gray-400"} />
        <MetricBox label="Sortino" value={m.sortino_ratio?.toFixed(2)} />
        <MetricBox label="Avg Win" value={`$${m.avg_win?.toFixed(0)}`} color="text-emerald-400" />
        <MetricBox label="Avg Loss" value={`-$${m.avg_loss?.toFixed(0)}`} color="text-red-400" />
      </div>
      <div className="flex items-center gap-3 text-[10px] text-gray-500">
        <span>{m.total_trades} trades</span>
        <span>·</span>
        <span>Payoff: {m.payoff_ratio?.toFixed(2)}</span>
        <span>·</span>
        <span>Expectancy: ${m.expectancy?.toFixed(2)}</span>
        <span>·</span>
        <span>CAGR: {m.cagr_pct}%</span>
      </div>
    </div>
  );
}

function MetricBox({ label, value, color = "text-gray-300" }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-[#0d1321] rounded p-1.5 text-center">
      <div className="text-[10px] text-gray-600 mb-0.5">{label}</div>
      <div className={`font-mono font-medium text-xs ${color}`}>{value}</div>
    </div>
  );
}

export default function AIAssistant() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "I'm your quantitative trading assistant with real backtesting power. Try asking:\n\n• **\"Run a put credit spread backtest on SPY\"**\n• **\"Show me available tickers\"**\n• **\"Backtest iron condors on QQQ with 30 delta\"**\n\nI'll execute the backtest live and analyze the results.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [toolStatus, setToolStatus] = useState<string>("");
  const [aiStatus, setAiStatus] = useState<"checking" | "available" | "unavailable">("checking");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { checkStatus(); }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, toolStatus]);

  const checkStatus = async () => {
    try {
      const data = await api.get<{ available: boolean }>("/api/ai/status");
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
    setToolStatus("");

    try {
      const data = await api.post<{
        response: string;
        tool_calls_made?: ToolCall[];
        rounds?: number;
      }>("/api/ai/chat-with-tools", {
        messages: [{ role: "user", content: userMsg.content }],
        temperature: 0.3,
        max_tokens: 3000,
        max_tool_rounds: 5,
      });

      // Build tool call display if any were made
      const toolCalls = data.tool_calls_made || [];

      setMessages(prev => [...prev, {
        role: "assistant",
        content: data.response,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      }]);
      setToolStatus("");
    } catch (e: any) {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: `⚠️ AI assistant unavailable. ${e?.detail || "Check that llama-server is running."}`,
      }]);
      setToolStatus("");
    }
    setLoading(false);
  };

  const handleSuggestion = (text: string) => {
    setInput(text);
    // Auto-send after a tick
    setTimeout(() => {
      const btn = document.querySelector('[data-send-btn]') as HTMLButtonElement;
      btn?.click();
    }, 50);
  };

  const renderMessageContent = (msg: Message) => {
    // Render markdown-style content
    const lines = msg.content.split("\n");
    return lines.map((line, j) => {
      // Bold markers
      const parts = line.split(/(\*\*[^*]+\*\*)/g);
      return (
        <span key={j}>
          {parts.map((part, k) =>
            part.startsWith("**") && part.endsWith("**") ? (
              <strong key={k} className="text-gray-100">{part.slice(2, -2)}</strong>
            ) : (
              part
            )
          )}
          <br />
        </span>
      );
    });
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-100 flex items-center gap-2">
            <Brain className="h-5 w-5 text-amber-400" />
            AI Trading Assistant
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {aiStatus === "available"
              ? "Can run backtests, scan markets, and analyze results"
              : "Local LLM for backtest analysis and strategy advice"}
          </p>
        </div>
        <Badge className={`text-[10px] ${
          aiStatus === "available" ? "bg-emerald-900/30 text-emerald-400" :
          aiStatus === "unavailable" ? "bg-red-900/30 text-red-400" :
          "bg-gray-800 text-gray-400"
        }`}>
          {aiStatus === "available" ? "🟢 Connected" :
           aiStatus === "unavailable" ? "🔴 Offline" : "⋯ Checking"}
        </Badge>
      </div>

      {/* Chat */}
      <Card className="bg-[#0d1321] border-gray-800/60">
        <CardContent className="p-0">
          <div className="h-[500px] overflow-y-auto p-4 space-y-3">
            {messages.map((msg, i) => (
              <div key={i}>
                <div className={`flex gap-2 ${msg.role === "user" ? "justify-end" : ""}`}>
                  {msg.role === "assistant" && (
                    <div className="h-6 w-6 rounded-full bg-amber-400/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Bot className="h-3.5 w-3.5 text-amber-400" />
                    </div>
                  )}
                  <div className={`max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed ${
                    msg.role === "user"
                      ? "bg-amber-400/10 text-gray-200"
                      : "bg-[#0a0e17] text-gray-300 border border-gray-800/60"
                  }`}>
                    {renderMessageContent(msg)}

                    {/* Tool call badges */}
                    {msg.toolCalls && msg.toolCalls.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-gray-800/60">
                        <div className="text-[10px] text-gray-500 mb-1">Tools used:</div>
                        <div className="flex flex-wrap gap-1">
                          {msg.toolCalls.map((tc: ToolCall, j: number) => (
                            <Badge key={j} variant="outline" className="text-[10px] border-amber-500/30 text-amber-400 bg-amber-400/5">
                              <Play className="h-2.5 w-2.5 mr-1" />
                              {TOOL_LABELS[tc.tool] || tc.tool}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Inline backtest result cards */}
                    {msg.toolCalls?.map((tc: ToolCall, j: number) => {
                      if (tc.tool === "run_options_backtest" && tc.result_preview) {
                        const btResult = parseBacktestResult(tc.result_preview);
                        if (btResult) return <BacktestCard key={j} result={btResult} />;
                      }
                      return null;
                    })}
                  </div>
                  {msg.role === "user" && (
                    <div className="h-6 w-6 rounded-full bg-emerald-400/10 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-[10px] text-emerald-400 font-medium">U</span>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Loading / tool status */}
            {loading && (
              <div className="flex gap-2">
                <div className="h-6 w-6 rounded-full bg-amber-400/10 flex items-center justify-center">
                  <Bot className="h-3.5 w-3.5 text-amber-400" />
                </div>
                <div className="bg-[#0a0e17] rounded-lg px-3 py-2 border border-gray-800/60 text-xs text-gray-400">
                  <Loader2 className="h-3 w-3 text-amber-400 animate-spin inline mr-2" />
                  {toolStatus || "Thinking..."}
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
                placeholder={
                  aiStatus === "available"
                    ? "Try: Run a put credit spread backtest on SPY with 16 delta"
                    : "Ask about strategies, backtest results, or risk analysis..."
                }
                className="bg-[#0a0e17] border-gray-700 text-xs h-9"
                disabled={loading}
              />
              <Button
                size="sm"
                onClick={sendMessage}
                disabled={loading || !input.trim()}
                className="h-9 text-xs"
                data-send-btn
              >
                {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Suggestion chips — contextual */}
      {aiStatus === "available" && (
        <div className="flex flex-wrap gap-2">
          {[
            { text: "Run a put credit spread backtest on SPY", icon: BarChart3 },
            { text: "Show me available tickers", icon: Activity },
            { text: "Backtest iron condors on QQQ", icon: BarChart3 },
            { text: "What's the best strategy for high IV?", icon: Brain },
          ].map((s) => (
            <Button
              key={s.text}
              size="sm"
              variant="outline"
              className="text-[10px] h-7 border-gray-700 text-gray-400 hover:text-amber-400 hover:border-amber-500/40"
              onClick={() => handleSuggestion(s.text)}
            >
              <s.icon className="h-3 w-3 mr-1.5" />
              {s.text}
            </Button>
          ))}
        </div>
      )}

      {/* Setup tips (only when offline) */}
      {aiStatus === "unavailable" && (
        <Card className="bg-[#0d1321] border-gray-800/60">
          <CardContent className="p-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-[10px] text-gray-500">
                <span className="text-gray-400 font-medium">Setup:</span> Point{" "}
                <code className="text-amber-400">LLM_BASE_URL</code> at your llama-server instance
                (default: <code className="text-amber-400">http://localhost:8080</code>).
                The assistant runs 100% locally — no data leaves your server.
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
