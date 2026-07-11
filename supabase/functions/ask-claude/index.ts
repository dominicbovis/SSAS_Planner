import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface RequestBody {
  messages: Message[];
  schemeContext: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid request body" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const { messages, schemeContext } = body;

  const systemPrompt = `You are a knowledgeable SSAS (Small Self-Administered Scheme) pension adviser embedded in a SSAS planning tool. You help trustees and scheme administrators understand their scheme, explore planning scenarios, ensure HMRC compliance, and make well-informed decisions.

You have access to the scheme's current financial position:

${schemeContext}

Key HMRC rules for SSAS schemes you should reference when relevant:
- Loanback limit: Maximum 50% of net asset value (NAV) can be lent back to sponsoring employers
- Borrowing limit: Maximum 50% of NAV can be borrowed by the scheme
- Employer-related investments: Maximum 20% of NAV in employer-related assets
- Loanbacks must be secured by first charge, at commercial interest rates, repayable within 5 years
- Properties must be commercial — residential property is prohibited
- Member contributions attract tax relief; employer contributions are typically deductible
- Benefits can only be taken from age 55 (rising to 57 in 2028)

Answer questions clearly and practically. When discussing limits or compliance issues, reference the specific HMRC rules and the scheme's current numbers. If something requires professional advice beyond planning support, say so clearly. Be concise but thorough — trustees need accurate, actionable information.`;

  const anthropicMessages = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const anthropicReq = {
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 2048,
    system: systemPrompt,
    messages: anthropicMessages,
    stream: true,
  };

  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(anthropicReq),
  });

  if (!upstream.ok) {
    const err = await upstream.text();
    return new Response(
      JSON.stringify({ error: `Anthropic API error: ${upstream.status}`, detail: err }),
      { status: upstream.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Stream the SSE response back, but extract only text deltas
  // and re-emit as a simple text/event-stream of delta chunks
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      const reader = upstream.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") {
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              break;
            }
            try {
              const evt = JSON.parse(data);
              // Emit text deltas only — skip thinking blocks
              if (
                evt.type === "content_block_delta" &&
                evt.delta?.type === "text_delta" &&
                typeof evt.delta.text === "string"
              ) {
                const chunk = JSON.stringify({ text: evt.delta.text });
                controller.enqueue(encoder.encode(`data: ${chunk}\n\n`));
              }
              // Signal completion
              if (evt.type === "message_stop") {
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              }
            } catch {
              // Malformed JSON from upstream — skip
            }
          }
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
});
