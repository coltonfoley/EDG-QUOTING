import type { Express } from "express";
import { isAuthenticated } from "../replitAuth";
import { storage } from "../storage";
import OpenAI from "openai";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY 
});

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface SafeProductSummary {
  name: string;
  manufacturer: string;
  category: string | null;
  retailPrice: string;
  unit: string;
}

interface SafeAccountSummary {
  name: string;
  accountType: string;
  company: string | null;
}

interface SafeQuoteSummary {
  quoteNumber: string | null;
  projectName: string | null;
  clientName: string;
  dealStage: string;
  itemCount: number;
  estimatedTotal: number;
}

async function gatherSafeBusinessContext(): Promise<string> {
  const [products, accounts, quotes] = await Promise.all([
    storage.getAllProducts(),
    storage.getAllAccounts(),
    storage.getAllQuotes({ page: 1, pageSize: 30 })
  ]);

  const safeProducts: SafeProductSummary[] = products.slice(0, 30).map(p => ({
    name: p.name,
    manufacturer: p.manufacturer,
    category: p.category || null,
    retailPrice: p.retailPrice,
    unit: p.unit || 'each'
  }));

  const safeAccounts: SafeAccountSummary[] = accounts.slice(0, 20).map(a => ({
    name: a.name,
    accountType: a.accountType,
    company: a.company || null
  }));

  const safeQuotes: SafeQuoteSummary[] = quotes.slice(0, 20).map(q => {
    const lineItemsTotal = q.lineItems?.reduce((sum, item) => {
      const qty = parseFloat(String(item.quantity || 0));
      const price = parseFloat(String(item.unitPrice || 0));
      return sum + (qty * price);
    }, 0) || 0;
    
    return {
      quoteNumber: q.quoteNumber || null,
      projectName: q.projectName || null,
      clientName: q.account?.name || 'Unknown client',
      dealStage: q.dealStage || 'draft',
      itemCount: q.lineItems?.length || 0,
      estimatedTotal: lineItemsTotal
    };
  });

  const productsSummary = safeProducts.map(p => 
    `- ${p.name} (${p.manufacturer}): $${p.retailPrice} per ${p.unit}${p.category ? `, category: ${p.category}` : ''}`
  ).join('\n');

  const accountsSummary = safeAccounts.map(a => 
    `- ${a.name}${a.company ? ` (${a.company})` : ''}, type: ${a.accountType}`
  ).join('\n');

  const quotesSummary = safeQuotes.map(q => 
    `- Quote #${q.quoteNumber || 'N/A'}: ${q.projectName || 'Unnamed project'} for ${q.clientName}, status: ${q.dealStage}, ${q.itemCount} items, ~$${q.estimatedTotal.toFixed(2)}`
  ).join('\n');

  return `
## Business Data Summary

### Products Catalog (${products.length} total):
${productsSummary || 'No products in catalog.'}

### Client Accounts (${accounts.length} total):
${accountsSummary || 'No client accounts.'}

### Quotes (${quotes.length} total):
${quotesSummary || 'No quotes created.'}
`;
}

const SYSTEM_PROMPT = `You are a helpful AI assistant for a quoting and sales management application. You have access to summarized business data about products, client accounts, and quotes.

Your role is to:
1. Answer questions about products, pricing, and availability
2. Help find information about clients and their quotes
3. Provide insights about sales and quotes
4. Assist with general business questions related to the data

Important guidelines:
- Be concise, helpful, and professional
- When referring to specific items, include relevant details like prices, names, and statuses
- If you don't have enough information to answer a question, say so clearly
- Never fabricate or invent data that isn't in the provided context
- Format currency as dollars (e.g., $100.00)
- You only have access to summary data, not full client contact details for privacy reasons`;

export function registerAIAssistantRoutes(app: Express) {
  app.post('/api/ai-assistant/chat', isAuthenticated, async (req: any, res) => {
    try {
      const { message, conversationHistory = [] } = req.body;

      if (!message || typeof message !== 'string') {
        return res.status(400).json({ message: "Message is required" });
      }

      const businessContext = await gatherSafeBusinessContext();

      const messages: ChatMessage[] = [
        { 
          role: "system", 
          content: `${SYSTEM_PROMPT}\n\n${businessContext}` 
        },
        ...conversationHistory.slice(-10).map((msg: any) => ({
          role: msg.role as "user" | "assistant",
          content: msg.content
        })),
        { role: "user", content: message }
      ];

      const response = await openai.chat.completions.create({
        model: "gpt-5",
        messages: messages,
        max_completion_tokens: 1024,
      });

      const assistantMessage = response.choices[0]?.message?.content || "I'm sorry, I couldn't generate a response.";

      res.json({
        message: assistantMessage,
        usage: response.usage
      });
    } catch (error: any) {
      console.error("AI Assistant error:", error);
      
      if (error.code === 'insufficient_quota') {
        return res.status(429).json({ message: "AI service quota exceeded. Please try again later." });
      }
      
      res.status(500).json({ message: "Failed to process your request. Please try again." });
    }
  });

  app.get('/api/ai-assistant/suggestions', isAuthenticated, async (req: any, res) => {
    try {
      const suggestions = [
        "What products do we have in stock?",
        "Show me recent quotes",
        "Who are our top clients?",
        "What's the average quote value?",
        "Find quotes in proposal stage"
      ];
      res.json({ suggestions });
    } catch (error) {
      console.error("Error fetching suggestions:", error);
      res.status(500).json({ message: "Failed to fetch suggestions" });
    }
  });
}
