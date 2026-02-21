import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getPortfolioStats } from '@/lib/database';
import { getMultiplePrices } from '@/lib/price-service';

export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { message, history = [] } = body;

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message required' }, { status: 400 });
    }

    // Fetch portfolio data
    const portfolio = await getPortfolioStats(user.id);

    // Get live prices for active holdings
    const activeHoldings = portfolio.activeHoldings || [];
    let livePrices: Record<string, { price: number; change24h: number }> = {};
    
    if (activeHoldings.length > 0) {
      const pairs = activeHoldings.map(h => h.coin_pair.replace('/', ''));
      try {
        const priceData = await getMultiplePrices(pairs);
        livePrices = priceData as Record<string, { price: number; change24h: number }>;
      } catch (e) {
        console.warn('Failed to fetch live prices:', e);
      }
    }

    // Calculate live P&L for active positions
    const activePositionsWithPnL = activeHoldings.map(h => {
      const norm = h.coin_pair.replace(/\//g, '').toUpperCase();
      const livePrice = livePrices[norm]?.price || livePrices[h.coin_pair]?.price || h.current_price || h.entry_price;
      const qty = h.entry_price > 0 ? h.position_size / h.entry_price : 0;
      const isShort = h.direction === 'short';
      const priceDiff = isShort ? (h.entry_price - livePrice) : (livePrice - h.entry_price);
      const unrealizedPnl = h.entry_price > 0 ? priceDiff * qty : 0;
      const unrealizedPct = h.entry_price > 0 ? (priceDiff / h.entry_price) * 100 : 0;
      
      return {
        coin: h.coin_pair,
        direction: h.direction || 'long',
        positionSize: h.position_size,
        entryPrice: h.entry_price,
        currentPrice: livePrice,
        unrealizedPnl: unrealizedPnl.toFixed(2),
        unrealizedPct: unrealizedPct.toFixed(2)
      };
    });

    // Build portfolio context
    const summary = portfolio.summary || {};
    const byCoin = portfolio.byCoin || [];
    const byDirection = portfolio.byDirection || [];
    
    // Find best and worst performers
    const sortedByCoin = [...byCoin].sort((a, b) => b.total_pnl - a.total_pnl);
    const bestPerformer = sortedByCoin[0];
    const worstPerformer = sortedByCoin[sortedByCoin.length - 1];

    // Win rate by direction
    const longStats = byDirection.find(d => d.direction === 'LONG');
    const shortStats = byDirection.find(d => d.direction === 'SHORT');

    // Build system prompt with all portfolio context
    const systemPrompt = `You are Penny, a friendly AI trading assistant with a warm personality. You have access to the user's complete portfolio data below. Be conversational, use emojis sparingly (1-2 per response max), and reference specific numbers from the data. Keep responses concise but helpful.

IMPORTANT RULES:
- Always reference actual numbers from the portfolio data
- When mentioning money, use formats like +$10.80 or -$5.20
- When mentioning percentages, use formats like +5.2% or -3.1%
- Be encouraging but honest about performance
- If asked about strategy, consider their win rate and current positions
- Don't make up data - only use what's provided below

=== PORTFOLIO SUMMARY ===
Starting Balance: $${summary.starting_balance?.toFixed(2) || '0.00'}
Current Balance: $${summary.live_balance?.toFixed(2) || '0.00'}
Total P&L: $${((summary.live_balance || 0) - (summary.starting_balance || 0)).toFixed(2)} (${summary.starting_balance ? (((summary.live_balance || 0) - summary.starting_balance) / summary.starting_balance * 100).toFixed(1) : '0'}%)
Realized P&L: $${summary.total_realized_pnl?.toFixed(2) || '0.00'}
Unrealized P&L: $${summary.total_unrealized_pnl?.toFixed(2) || '0.00'}
Win Rate: ${summary.win_rate?.toFixed(1) || '0'}%
Total Trades: ${summary.total_trades || 0}
Closed Trades: ${summary.closed_trades || 0}
Active Positions: ${summary.active_positions || 0}
Harvest Cycles (Compound Events): ${summary.harvest_cycles || 0}

=== ACTIVE POSITIONS (LIVE) ===
${activePositionsWithPnL.length > 0 ? activePositionsWithPnL.map(p => 
  `- ${p.coin} (${p.direction.toUpperCase()}): $${p.positionSize.toFixed(2)} position, entry $${p.entryPrice.toFixed(4)}, current $${p.currentPrice.toFixed(4)}, P&L: $${p.unrealizedPnl} (${p.unrealizedPct}%)`
).join('\n') : 'No active positions'}

=== PERFORMANCE BY COIN (CLOSED TRADES) ===
${sortedByCoin.slice(0, 10).map(c => 
  `- ${c.coin_pair}: ${c.total_trades} trades, ${c.wins}W/${c.losses}L (${c.win_rate.toFixed(0)}% WR), P&L: $${c.total_pnl.toFixed(2)}`
).join('\n') || 'No closed trades yet'}

=== BEST/WORST PERFORMERS ===
Best: ${bestPerformer ? `${bestPerformer.coin_pair} with $${bestPerformer.total_pnl.toFixed(2)} profit` : 'N/A'}
Worst: ${worstPerformer && worstPerformer.total_pnl < 0 ? `${worstPerformer.coin_pair} with $${worstPerformer.total_pnl.toFixed(2)} loss` : 'No losing coins yet'}

=== WIN RATE BY DIRECTION ===
Long trades: ${longStats ? `${longStats.total_trades} trades, ${longStats.win_rate.toFixed(0)}% win rate, $${longStats.total_pnl.toFixed(2)} P&L` : 'No long trades'}
Short trades: ${shortStats ? `${shortStats.total_trades} trades, ${shortStats.win_rate.toFixed(0)}% win rate, $${shortStats.total_pnl.toFixed(2)} P&L` : 'No short trades'}

Remember: Be helpful, reference the actual data, and keep it conversational!`;

    // Prepare conversation history
    const conversationHistory = history.slice(-10).map((h: { role: string; content: string }) => ({
      role: h.role as 'user' | 'assistant',
      content: h.content
    }));

    // Call Claude Sonnet 4 via OpenRouter
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ 
        reply: "Hmm, I'm having trouble connecting to my brain right now. The team needs to check my API key! 🐱" 
      });
    }

    const llmResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://clawdesk.ai',
        'X-Title': 'ClawDesk Ask Penny',
      },
      body: JSON.stringify({
        model: 'anthropic/claude-sonnet-4',
        messages: [
          { role: 'system', content: systemPrompt },
          ...conversationHistory,
          { role: 'user', content: message }
        ],
        temperature: 0.7,
        max_tokens: 800,
      }),
    });

    if (!llmResponse.ok) {
      const error = await llmResponse.text();
      console.error('OpenRouter error:', error);
      return NextResponse.json({ 
        reply: "My brain is a bit foggy right now. Try again in a moment? 🐱" 
      });
    }

    const llmData = await llmResponse.json();
    const reply = llmData.choices?.[0]?.message?.content || "I'm not sure how to respond to that!";

    return NextResponse.json({ reply });

  } catch (error) {
    console.error('Ask Penny API error:', error);
    return NextResponse.json({ 
      reply: "Something went wrong on my end. Give me a sec and try again! 🐱" 
    });
  }
}
