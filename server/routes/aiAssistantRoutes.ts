import type { Express } from "express";
import { isAuthenticated } from "../replitAuth";
import { storage } from "../storage";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import { isActiveStage, isWonStage, isFinalStage, getDealStageLabel } from "@shared/dealStageConstants";

type OpenAIClient = InstanceType<typeof import("openai").default>;

let openai: OpenAIClient | null = null;

async function getOpenAI(): Promise<OpenAIClient> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for the AI assistant.");
  }

  const { default: OpenAI } = await import("openai");
  openai ??= new OpenAI({ 
    apiKey: process.env.OPENAI_API_KEY 
  });
  return openai;
}

// Calculate quote total WITH markup (matches dashboard logic)
function calculateQuoteTotal(quote: any): number {
  if (!quote.lineItems || !Array.isArray(quote.lineItems)) return 0;
  
  return quote.lineItems.reduce((sum: number, item: any) => {
    const qty = parseFloat(String(item.quantity || 0));
    const price = parseFloat(String(item.unitPrice || 0));
    const markup = parseFloat(String(item.markupValue || 0));
    const baseTotal = qty * price;
    
    // Include markup based on type (percentage or dollar)
    const total = item.markupType === 'percentage' 
      ? baseTotal + (baseTotal * (markup / 100))
      : baseTotal + markup;
    
    return sum + total;
  }, 0);
}

const AI_TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "searchProducts",
      description: "Search for products in the catalog by name, manufacturer, or category. Returns matching products with their prices and details.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search term to find products (searches name, manufacturer, category)"
          },
          limit: {
            type: "number",
            description: "Maximum number of results to return (default 20, max 50)"
          }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "searchClients",
      description: "Search for client accounts by name or company. Returns matching clients with their account type.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search term to find clients (searches name, company)"
          },
          limit: {
            type: "number",
            description: "Maximum number of results to return (default 20, max 50)"
          }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "getQuotesByClient",
      description: "Get all quotes for a specific client by their name or company name.",
      parameters: {
        type: "object",
        properties: {
          clientName: {
            type: "string",
            description: "Client name or company name to search for"
          }
        },
        required: ["clientName"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "getQuoteDetails",
      description: "Get detailed information about a specific quote by its quote number or ID.",
      parameters: {
        type: "object",
        properties: {
          quoteIdentifier: {
            type: "string",
            description: "Quote number (e.g., 'Q-123') or quote ID"
          }
        },
        required: ["quoteIdentifier"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "getQuoteStats",
      description: "Get summary statistics about quotes - total count, counts by status/stage, and value summaries.",
      parameters: {
        type: "object",
        properties: {
          stage: {
            type: "string",
            description: "Optional: filter stats by deal stage (lead, proposal, negotiation, won, lost)"
          }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "getRecentQuotes",
      description: "Get the most recent quotes, optionally filtered by stage.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Number of quotes to return (default 10, max 50)"
          },
          stage: {
            type: "string",
            description: "Optional: filter by deal stage"
          }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "getProductsByManufacturer",
      description: "Get all products from a specific manufacturer.",
      parameters: {
        type: "object",
        properties: {
          manufacturer: {
            type: "string",
            description: "Manufacturer name to filter by"
          },
          limit: {
            type: "number",
            description: "Maximum number of results (default 30, max 100)"
          }
        },
        required: ["manufacturer"]
      }
    }
  },
  {
    type: "function", 
    function: {
      name: "getBusinessOverview",
      description: "Get a high-level overview of the business - total products, clients, quotes, and recent activity.",
      parameters: {
        type: "object",
        properties: {}
      }
    }
  }
];

async function executeToolCall(name: string, args: any): Promise<string> {
  try {
    switch (name) {
      case "searchProducts": {
        const products = await storage.getAllProducts();
        const query = (args.query || "").toLowerCase();
        const limit = Math.min(args.limit || 20, 50);
        
        const matches = products.filter(p => 
          p.name.toLowerCase().includes(query) ||
          p.manufacturer.toLowerCase().includes(query) ||
          (p.category && p.category.toLowerCase().includes(query))
        ).slice(0, limit);

        if (matches.length === 0) {
          return `No products found matching "${args.query}".`;
        }

        return `Found ${matches.length} product(s):\n` + matches.map(p =>
          `- ${p.name} (${p.manufacturer}): MSRP $${p.retailPrice} per ${p.unit || 'each'}${p.category ? `, category: ${p.category}` : ''}`
        ).join('\n');
      }

      case "searchClients": {
        const query = (args.query || "").toLowerCase();
        const limit = Math.min(args.limit || 20, 50);
        const accounts = await storage.searchAccounts(query);
        const matches = accounts.slice(0, limit);

        if (matches.length === 0) {
          return `No clients found matching "${args.query}".`;
        }

        return `Found ${matches.length} client(s):\n` + matches.map(a => 
          `- ${a.name}${a.company ? ` (${a.company})` : ''}, type: ${a.accountType}`
        ).join('\n');
      }

      case "getQuotesByClient": {
        const clientName = (args.clientName || "").toLowerCase();
        const allQuotes = [];
        let page = 1;
        const pageSize = 100;
        
        while (true) {
          const quotes = await storage.getAllQuotes({ page, pageSize });
          allQuotes.push(...quotes);
          if (quotes.length < pageSize) break;
          page++;
          if (page > 20) break;
        }
        
        const matches = allQuotes.filter(q => {
          const accountName = q.account?.name?.toLowerCase() || '';
          const accountCompany = q.account?.company?.toLowerCase() || '';
          return accountName.includes(clientName) || accountCompany.includes(clientName);
        });

        if (matches.length === 0) {
          return `No quotes found for client "${args.clientName}".`;
        }

        return `Found ${matches.length} quote(s) for "${args.clientName}":\n` + matches.map(q => {
          const total = calculateQuoteTotal(q);
          const stageLabel = getDealStageLabel(q.dealStage || 'new_lead');
          return `- Quote #${q.quoteNumber || q.id}: ${q.projectName || 'Unnamed'}, stage: ${stageLabel}, ${q.lineItems?.length || 0} items, $${total.toFixed(2)}`;
        }).join('\n');
      }

      case "getQuoteDetails": {
        const identifier = args.quoteIdentifier || "";
        let quote = null;
        let page = 1;
        const pageSize = 100;
        
        while (!quote) {
          const quotes = await storage.getAllQuotes({ page, pageSize });
          quote = quotes.find(q => 
            q.quoteNumber === identifier || 
            q.quoteNumber?.includes(identifier) ||
            String(q.id) === identifier
          );
          if (quotes.length < pageSize) break;
          page++;
          if (page > 20) break;
        }

        if (!quote) {
          return `Quote "${identifier}" not found.`;
        }

        const total = calculateQuoteTotal(quote);
        const stageLabel = getDealStageLabel(quote.dealStage || 'new_lead');

        let details = `Quote #${quote.quoteNumber || quote.id}\n`;
        details += `- Project: ${quote.projectName || 'Unnamed'}\n`;
        details += `- Client: ${quote.account?.name || 'Unknown'}${quote.account?.company ? ` (${quote.account.company})` : ''}\n`;
        details += `- Stage: ${stageLabel}\n`;
        details += `- Line Items: ${quote.lineItems?.length || 0}\n`;
        details += `- Total (with markup): $${total.toFixed(2)}\n`;
        
        if (quote.lineItems && quote.lineItems.length > 0) {
          details += `\nLine Items:\n`;
          quote.lineItems.slice(0, 15).forEach((item: any) => {
	          const itemCostTotal = parseFloat(String(item.quantity || 0)) * parseFloat(String(item.unitPrice || 0));
	          details += `  - ${item.description}: ${item.quantity} x EDG cost $${item.unitPrice} = $${itemCostTotal.toFixed(2)} before markup\n`;
          });
          if (quote.lineItems.length > 15) {
            details += `  ... and ${quote.lineItems.length - 15} more items\n`;
          }
        }

        return details;
      }

      case "getQuoteStats": {
        const allQuotes = [];
        let page = 1;
        const pageSize = 100;
        
        while (true) {
          const quotes = await storage.getAllQuotes({ page, pageSize });
          allQuotes.push(...quotes);
          if (quotes.length < pageSize) break;
          page++;
          if (page > 50) break;
        }
        
        const stageFilter = args.stage?.toLowerCase();

        const filtered = stageFilter 
          ? allQuotes.filter(q => q.dealStage?.toLowerCase() === stageFilter)
          : allQuotes;

        const stageCounts: Record<string, number> = {};
        let totalValue = 0;
        let pipelineValue = 0;
        let wonValue = 0;

        filtered.forEach(q => {
          const stage = q.dealStage || 'new_lead';
          stageCounts[stage] = (stageCounts[stage] || 0) + 1;
          
          const quoteTotal = calculateQuoteTotal(q);
          totalValue += quoteTotal;
          
          // Track pipeline (active stages only) vs won
          if (isActiveStage(stage)) {
            pipelineValue += quoteTotal;
          }
          if (isWonStage(stage)) {
            wonValue += quoteTotal;
          }
        });

        let stats = `Quote Statistics${stageFilter ? ` (filtered by ${stageFilter})` : ''}:\n`;
        stats += `- Total Quotes: ${filtered.length}\n`;
        stats += `- Total Value (all quotes): $${totalValue.toFixed(2)}\n`;
        stats += `- Pipeline Value (active deals only): $${pipelineValue.toFixed(2)}\n`;
        stats += `- Won Value (closed-won only): $${wonValue.toFixed(2)}\n`;
        stats += `- Average Quote Value: $${filtered.length > 0 ? (totalValue / filtered.length).toFixed(2) : '0.00'}\n`;
        stats += `\nBy Stage:\n`;
        Object.entries(stageCounts).sort((a, b) => b[1] - a[1]).forEach(([stage, count]) => {
          const label = getDealStageLabel(stage);
          stats += `  - ${label}: ${count} quote(s)\n`;
        });

        return stats;
      }

      case "getRecentQuotes": {
        const limit = Math.min(args.limit || 10, 50);
        const stageFilter = args.stage?.toLowerCase();
        const quotes = await storage.getAllQuotes({ page: 1, pageSize: limit * 2 });
        
        const filtered = stageFilter 
          ? quotes.filter(q => q.dealStage?.toLowerCase() === stageFilter)
          : quotes;

        const recent = filtered.slice(0, limit);

        if (recent.length === 0) {
          return stageFilter ? `No quotes found with stage "${args.stage}".` : 'No quotes found.';
        }

        return `Recent ${recent.length} quote(s)${stageFilter ? ` (${stageFilter})` : ''}:\n` + recent.map(q => {
          const total = calculateQuoteTotal(q);
          const stageLabel = getDealStageLabel(q.dealStage || 'new_lead');
          return `- Quote #${q.quoteNumber || q.id}: ${q.projectName || 'Unnamed'} for ${q.account?.name || 'Unknown'}, ${stageLabel}, $${total.toFixed(2)}`;
        }).join('\n');
      }

      case "getProductsByManufacturer": {
        const manufacturer = (args.manufacturer || "").toLowerCase();
        const limit = Math.min(args.limit || 30, 100);
        const products = await storage.getAllProducts();
        
        const matches = products.filter(p => 
          p.manufacturer.toLowerCase().includes(manufacturer)
        ).slice(0, limit);

        if (matches.length === 0) {
          return `No products found from manufacturer "${args.manufacturer}".`;
        }

        return `Found ${matches.length} product(s) from "${args.manufacturer}":\n` + matches.map(p =>
          `- ${p.name}: MSRP $${p.retailPrice} per ${p.unit || 'each'}${p.category ? `, category: ${p.category}` : ''}`
        ).join('\n');
      }

      case "getBusinessOverview": {
        const allQuotes = [];
        let page = 1;
        const pageSize = 100;
        
        while (true) {
          const pageQuotes = await storage.getAllQuotes({ page, pageSize });
          allQuotes.push(...pageQuotes);
          if (pageQuotes.length < pageSize) break;
          page++;
          if (page > 50) break;
        }
        
        const [products, accounts] = await Promise.all([
          storage.getAllProducts(),
          storage.getAllAccounts()
        ]);
        
        const quotes = allQuotes;

        const manufacturers = new Set(products.map(p => p.manufacturer));
        const stageCounts: Record<string, number> = {};
        let totalQuoteValue = 0;
        let pipelineValue = 0;
        let wonValue = 0;

        quotes.forEach(q => {
          const stage = q.dealStage || 'new_lead';
          stageCounts[stage] = (stageCounts[stage] || 0) + 1;
          
          const quoteTotal = calculateQuoteTotal(q);
          totalQuoteValue += quoteTotal;
          
          // Track pipeline (active stages only) vs won
          if (isActiveStage(stage)) {
            pipelineValue += quoteTotal;
          }
          if (isWonStage(stage)) {
            wonValue += quoteTotal;
          }
        });

        let overview = `Business Overview:\n`;
        overview += `\nProducts:\n`;
        overview += `  - Total Products: ${products.length}\n`;
        overview += `  - Manufacturers: ${manufacturers.size}\n`;
        overview += `\nClients:\n`;
        overview += `  - Total Accounts: ${accounts.length}\n`;
        overview += `\nQuotes:\n`;
        overview += `  - Total Quotes: ${quotes.length}\n`;
        overview += `  - Pipeline Value (active deals): $${pipelineValue.toFixed(2)}\n`;
        overview += `  - Won Value (closed-won): $${wonValue.toFixed(2)}\n`;
        overview += `  - Total All Quotes: $${totalQuoteValue.toFixed(2)}\n`;
        overview += `  - By Stage:\n`;
        Object.entries(stageCounts).sort((a, b) => b[1] - a[1]).forEach(([stage, count]) => {
          const label = getDealStageLabel(stage);
          overview += `    - ${label}: ${count}\n`;
        });

        return overview;
      }

      default:
        return `Unknown tool: ${name}`;
    }
  } catch (error: any) {
    console.error(`Tool execution error (${name}):`, error);
    return `Error executing ${name}: ${error.message}`;
  }
}

const SYSTEM_PROMPT = `You are a helpful AI assistant for Rainmaker, a construction quoting and sales management application. You have access to tools that let you search and retrieve real data from the system.

Your capabilities:
- Search and find products in the catalog
- Look up client/account information  
- Find and analyze quotes
- Get business statistics and overviews

Guidelines:
- Use the available tools to fetch real data before answering questions
- Be concise and professional
- Format currency as dollars (e.g., $100.00)
- If you can't find what the user is looking for, suggest alternative searches
- Never make up data - only use information from tool results`;

export function registerAIAssistantRoutes(app: Express) {
  app.post('/api/ai-assistant/chat', isAuthenticated, async (req: any, res) => {
    try {
      const { message, conversationHistory = [] } = req.body;

      if (!message || typeof message !== 'string') {
        return res.status(400).json({ message: "Message is required" });
      }

      console.log("🤖 AI Assistant: Processing request with tool calling...");
      const openai = await getOpenAI();

      const messages: ChatCompletionMessageParam[] = [
        { role: "system", content: SYSTEM_PROMPT },
        ...conversationHistory.slice(-10).map((msg: any) => ({
          role: msg.role as "user" | "assistant",
          content: msg.content
        })),
        { role: "user", content: message }
      ];

      let response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: messages,
        tools: AI_TOOLS,
        tool_choice: "auto",
        max_tokens: 2048,
      });

      let assistantMessage = response.choices[0]?.message;
      let iterations = 0;
      const maxIterations = 5;

      while (assistantMessage?.tool_calls && iterations < maxIterations) {
        iterations++;
        console.log(`🔧 AI Assistant: Executing ${assistantMessage.tool_calls.length} tool call(s) (iteration ${iterations})`);

        messages.push(assistantMessage);

        for (const toolCall of assistantMessage.tool_calls) {
          const args = JSON.parse(toolCall.function.arguments || "{}");
          console.log(`   - Tool: ${toolCall.function.name}`, args);
          
          const result = await executeToolCall(toolCall.function.name, args);
          
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: result
          });
        }

        response = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: messages,
          tools: AI_TOOLS,
          tool_choice: "auto",
          max_tokens: 2048,
        });

        assistantMessage = response.choices[0]?.message;
      }

      const finalContent = assistantMessage?.content || "I apologize, but I couldn't generate a response. Please try rephrasing your question.";

      console.log("✅ AI Assistant: Response generated successfully");

      res.json({
        message: finalContent,
        usage: response.usage,
        toolCalls: iterations
      });
    } catch (error: any) {
      console.error("AI Assistant error:", error.message || error);
      
      if (error.code === 'insufficient_quota' || error.status === 429) {
        return res.status(429).json({ message: "AI service is busy. Please try again in a moment." });
      }
      
      res.status(500).json({ message: "Failed to process your request. Please try again." });
    }
  });

  app.get('/api/ai-assistant/suggestions', isAuthenticated, async (req: any, res) => {
    try {
      const suggestions = [
        "Give me a business overview",
        "What products do we have from Sundance?",
        "Show me recent quotes in proposal stage",
        "Find quotes for Smith Construction",
        "What's our total pipeline value?"
      ];
      res.json({ suggestions });
    } catch (error) {
      console.error("Error fetching suggestions:", error);
      res.status(500).json({ message: "Failed to fetch suggestions" });
    }
  });
}
