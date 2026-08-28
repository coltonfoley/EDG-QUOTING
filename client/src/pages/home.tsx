import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Building2, 
  ClipboardList, 
  FileText, 
  Users, 
  TrendingUp, 
  DollarSign,
  Target,
  ChevronRight,
  Activity,
  Award,
  BarChart3,
  Inbox
} from "lucide-react";
import { Link } from "wouter";
import { AppHeader } from "@/components/app-header";
import { PageLoadError } from "@/components/error-alert";
import { useQuery } from "@tanstack/react-query";
import { formatCurrency, cn, calculateQuoteTotals, calculateGrossMargin } from "@/lib/utils";
import { calculateLineItemsValue } from "@/lib/quote-value";
import { format, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";
import type { Account, QuoteWithDetails } from "@shared/schema";
import { DEAL_STAGES, getDealStageById, isWonStage, isLostStage, isFinalStage, isActiveStage } from "@shared/dealStageConstants";


export default function Home() {
  // Fetch quotes
  const { data: quotes, isLoading: quotesLoading, error: quotesError, refetch: refetchQuotes } = useQuery<QuoteWithDetails[]>({
    queryKey: ['/api/quotes'],
  });

  const { data: accountSummary, isLoading: accountsLoading, error: accountsError, refetch: refetchAccounts } = useQuery<{ totalClients: number }>({
    queryKey: ['/api/accounts/summary'],
  });

  const { data: newLeads, isLoading: leadsLoading, error: leadsError, refetch: refetchLeads } = useQuery<Account[]>({
    queryKey: ['/api/leads', 'new'],
    queryFn: async () => {
      const response = await fetch('/api/leads?status=new&limit=200', {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch leads');
      return response.json();
    },
  });

  // Sum line items with markup only; discounts, shipping, and tax adjustments are handled elsewhere
  function calculateQuoteTotal(quote: QuoteWithDetails): number {
    return calculateLineItemsValue(quote.lineItems);
  }

  // Estimated line gross profit after customer discounts; excludes tax and shipping.
  function calculateQuoteProfit(quote: QuoteWithDetails): number {
    const totals = calculateQuoteTotals(
      quote.lineItems,
      quote.taxRate ? parseFloat(quote.taxRate.toString()) : 0,
      quote.discount ? parseFloat(quote.discount.toString()) : 0,
      quote.shipping ? parseFloat(quote.shipping.toString()) : 0,
      quote.isShippingTaxable === true,
      quote.tariffRate ? parseFloat(quote.tariffRate.toString()) : 0
    );
    return totals.grossProfit;
  }

  const currentQuotes = quotes?.filter((quote) => quote.isLatestVersion !== false) || [];

  // Calculate metrics from one current version per quote family.
  const metrics = {
    newLeads: newLeads?.length || 0,
    totalAccounts: accountSummary?.totalClients || 0,
    activeDeals: currentQuotes.filter(q => isActiveStage(q.dealStage || 'new_lead')).length,
    totalDeals: currentQuotes.length,
    wonThisMonth: currentQuotes.filter(q => {
      if (!isWonStage(q.dealStage || '')) return false;
      if (!q.dealStageChangedAt) return false;
      const wonAt = new Date(q.dealStageChangedAt);
      const start = startOfMonth(new Date());
      const end = endOfMonth(new Date());
      return isWithinInterval(wonAt, { start, end });
    }).length,
    pipelineValue: currentQuotes.filter(q => isActiveStage(q.dealStage || 'new_lead')).reduce((sum, quote) => {
      return sum + calculateQuoteTotal(quote);
    }, 0),
    wonValue: currentQuotes.filter(q => isWonStage(q.dealStage || '')).reduce((sum, quote) => {
      return sum + calculateQuoteTotal(quote);
    }, 0),
    avgDealSize: currentQuotes.length > 0
      ? currentQuotes.reduce((sum, q) => sum + calculateQuoteTotal(q), 0) / currentQuotes.length
      : 0,
    winRate: currentQuotes.length > 0
      ? (currentQuotes.filter(q => isWonStage(q.dealStage || '')).length /
         currentQuotes.filter(q => isFinalStage(q.dealStage || '')).length) * 100 || 0
      : 0,
    totalGrossProfit: currentQuotes.filter(q => isWonStage(q.dealStage || '')).reduce((sum, quote) => {
      return sum + calculateQuoteProfit(quote);
    }, 0),
    pipelineProfit: currentQuotes.filter(q => isActiveStage(q.dealStage || 'new_lead')).reduce((sum, quote) => {
      return sum + calculateQuoteProfit(quote);
    }, 0),
    profitThisMonth: currentQuotes.filter(q => {
      if (!isWonStage(q.dealStage || '')) return false;
      if (!q.dealStageChangedAt) return false;
      const wonAt = new Date(q.dealStageChangedAt);
      const start = startOfMonth(new Date());
      const end = endOfMonth(new Date());
      return isWithinInterval(wonAt, { start, end });
    }).reduce((sum, quote) => {
      return sum + calculateQuoteProfit(quote);
    }, 0),
    avgMarginPercent: (() => {
      let profit = 0;
      let revenue = 0;
      currentQuotes.forEach(q => {
        const totals = calculateQuoteTotals(q.lineItems, q.taxRate || 0, q.discount || 0,
          q.shipping || 0, q.isShippingTaxable === true, q.tariffRate || 0);
        profit += totals.grossProfit;
        revenue += totals.netLineRevenue;
      });
      return calculateGrossMargin(profit, revenue);
    })()
  };

  // Group quotes by stage
  const quotesByStage = DEAL_STAGES.map(stage => {
    const stageQuotes = currentQuotes.filter(q => (q.dealStage || 'new_lead') === stage.id);
    const stageValue = stageQuotes.reduce((sum, q) => sum + calculateQuoteTotal(q), 0);
    const stageProfit = stageQuotes.reduce((sum, q) => sum + calculateQuoteProfit(q), 0);
    return {
      ...stage,
      count: stageQuotes.length,
      value: stageValue,
      profit: stageProfit,
      percentage: currentQuotes.length > 0
        ? (stageQuotes.length / currentQuotes.length) * 100
        : 0
    };
  });

  // Get recent activity (last 10 quotes)
  const recentActivity = currentQuotes.slice().sort((a, b) => {
    const dateA = new Date(b.updatedAt || b.createdAt || '');
    const dateB = new Date(a.updatedAt || a.createdAt || '');
    return dateA.getTime() - dateB.getTime();
  }).slice(0, 10);

  const formatDate = (dateString: string | Date) => {
    const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) return "Today";
    if (diffDays === 2) return "Yesterday";
    if (diffDays <= 7) return `${diffDays - 1} days ago`;
    return format(date, 'MMM d, yyyy');
  };


  const isLoading = quotesLoading || accountsLoading || leadsLoading;
  const loadError = quotesError || accountsError || leadsError;

  if (loadError) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <PageLoadError
          title="Dashboard couldn't be loaded"
          description="One or more dashboard sources are unavailable, so Rainmaker will not show partial or misleading totals."
          onRetry={() => {
            void Promise.all([refetchQuotes(), refetchAccounts(), refetchLeads()]);
          }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <main className="container mx-auto px-4 py-8">
        {/* Header Section */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-edg-black mb-2">CRM Dashboard</h1>
          <p className="text-edg-grey">Rainmaker Business Intelligence</p>
        </div>

        {/* Key Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          <Card className="border-l-4 border-l-sky-500">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-edg-grey">
                  New Leads
                </CardTitle>
                <Inbox className="h-4 w-4 text-sky-500" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-edg-black">
                {isLoading ? "-" : metrics.newLeads}
              </div>
              <Link href="/leads">
                <Button variant="link" className="mt-1 h-auto p-0 text-xs text-edg-teal">
                  View website leads
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-edg-teal">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-edg-grey">
                  Total Accounts
                </CardTitle>
                <Users className="h-4 w-4 text-edg-teal" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-edg-black">
                {isLoading ? "-" : metrics.totalAccounts}
              </div>
              <p className="text-xs text-edg-grey mt-1">
                Active customers & prospects
              </p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-blue-500">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-edg-grey">
                  Active Deals
                </CardTitle>
                <Activity className="h-4 w-4 text-blue-500" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-edg-black">
                {isLoading ? "-" : metrics.activeDeals}
              </div>
              <p className="text-xs text-edg-grey mt-1">
                In progress opportunities
              </p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-green-500">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-edg-grey">
                  Won This Month
                </CardTitle>
                <Award className="h-4 w-4 text-green-500" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-edg-black">
                {isLoading ? "-" : metrics.wonThisMonth}
              </div>
              <p className="text-xs text-edg-grey mt-1">
                Closed deals in {format(new Date(), 'MMMM')}
              </p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-purple-500">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-edg-grey">
                  Pipeline Value
                </CardTitle>
                <DollarSign className="h-4 w-4 text-purple-500" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-edg-black">
                {isLoading ? "-" : formatCurrency(metrics.pipelineValue)}
              </div>
              <p className="text-xs text-edg-grey mt-1">
                Total active opportunity value
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Conversion Metrics */}
        <div className="grid md:grid-cols-3 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-edg-teal" />
                Win Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-2">
                <div className="text-3xl font-bold text-edg-black">
                  {isLoading ? "-" : `${metrics.winRate.toFixed(1)}%`}
                </div>
                <div className="text-sm text-edg-grey mb-1">
                  conversion rate
                </div>
              </div>
              <Progress 
                value={metrics.winRate} 
                className="mt-3 h-2"
                aria-label={`Win rate ${metrics.winRate.toFixed(1)} percent`}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Target className="h-4 w-4 text-edg-teal" />
                Average Deal Size
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-edg-black">
                {isLoading ? "-" : formatCurrency(metrics.avgDealSize)}
              </div>
              <div className="text-sm text-edg-grey mt-1">
                across all opportunities
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-edg-teal" />
                Total Won Value
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-edg-black">
                {isLoading ? "-" : formatCurrency(metrics.wonValue)}
              </div>
              <div className="text-sm text-edg-grey mt-1">
                lifetime closed deals
              </div>
            </CardContent>
          </Card>
        </div>

        <p className="mb-3 text-sm text-edg-grey">
          Profit estimates use entered line costs after supplier discounts and tariff, and sales after customer discounts.
          Excludes sales tax, shipping/delivery and costs not entered on quotes.
        </p>
        {/* Estimated line gross profit metrics (not net profit) */}
        <div className="grid md:grid-cols-4 gap-4 mb-8">
          <Card className="border-l-4 border-l-emerald-500">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-edg-grey">
                  Est. Gross Profit — Won
                </CardTitle>
                <DollarSign className="h-4 w-4 text-emerald-500" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-edg-black">
                {isLoading ? "-" : formatCurrency(metrics.totalGrossProfit)}
              </div>
              <p className="text-xs text-edg-grey mt-1">
                after discounts; entered line costs only
              </p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-amber-500">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-edg-grey">
                  Est. Gross Profit — Pipeline
                </CardTitle>
                <TrendingUp className="h-4 w-4 text-amber-500" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-edg-black">
                {isLoading ? "-" : formatCurrency(metrics.pipelineProfit)}
              </div>
              <p className="text-xs text-edg-grey mt-1">
                estimated line profit in active quotes
              </p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-lime-500">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-edg-grey">
                  Est. Gross Profit Won This Month
                </CardTitle>
                <Award className="h-4 w-4 text-lime-500" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-edg-black">
                {isLoading ? "-" : formatCurrency(metrics.profitThisMonth)}
              </div>
              <p className="text-xs text-edg-grey mt-1">
                won in {format(new Date(), 'MMMM')}
              </p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-cyan-500">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-edg-grey">
                  Overall Gross Margin
                </CardTitle>
                <BarChart3 className="h-4 w-4 text-cyan-500" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-edg-black">
                {isLoading ? "-" : metrics.avgMarginPercent === null ? "N/A" : `${metrics.avgMarginPercent.toFixed(1)}%`}
              </div>
              <p className="text-xs text-edg-grey mt-1">
                profit ÷ sales after discounts; all current quotes
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Pipeline Overview and Recent Activity */}
        <div className="grid lg:grid-cols-2 gap-6">

          {/* Pipeline Overview */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <ClipboardList className="h-5 w-5 text-edg-teal" />
                  Pipeline Overview
                </span>
                <Link href="/pipeline">
                  <Button variant="ghost" size="sm">
                    View Full Pipeline <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {quotesByStage.filter(stage => !isLostStage(stage.id)).map((stage) => (
                  <div key={stage.id} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          "px-2 py-1 rounded-md text-xs font-medium border",
                          stage.color
                        )}>
                          {stage.label}
                        </div>
                        <span className="text-sm text-edg-grey">
                          {stage.count} deals
                        </span>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium">
                          {formatCurrency(stage.value)}
                        </div>
                        <div className="text-xs text-emerald-700 dark:text-emerald-400">
                          {formatCurrency(stage.profit)} est. gross profit
                        </div>
                      </div>
                    </div>
                    <Progress 
                      value={stage.percentage} 
                      className="h-2"
                      aria-label={`${stage.label} share ${stage.percentage.toFixed(1)} percent`}
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-edg-teal" />
                  Recent Activity
                </span>
                <Link href="/quotes">
                  <Button variant="ghost" size="sm">
                    View All <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                {isLoading ? (
                  <div className="space-y-3">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-muted rounded animate-pulse"></div>
                        <div className="flex-1 space-y-1">
                          <div className="h-4 bg-muted rounded animate-pulse"></div>
                          <div className="h-3 bg-muted rounded w-2/3 animate-pulse"></div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : recentActivity.length > 0 ? (
                  <div className="space-y-3">
                    {recentActivity.map((quote) => {
                      const stage = getDealStageById(quote.dealStage || 'new_lead');
                      return (
                        <div key={quote.id} className="flex items-center justify-between p-3 hover:bg-muted/50 rounded-lg transition-colors">
                          <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-edg-teal bg-opacity-10 rounded-full flex items-center justify-center">
                              <FileText className="h-5 w-5 text-edg-teal" />
                            </div>
                            <div>
                              <div className="font-medium text-sm flex items-center gap-2">
                                {quote.quoteNumber}
                                <Badge 
                                  className={cn(
                                    "text-xs",
                                    stage.color
                                  )} 
                                  variant="secondary"
                                >
                                  {stage.label}
                                </Badge>
                              </div>
                              <div className="text-xs text-edg-grey">
                                {quote.account?.name || 'Unknown Account'} • {formatDate(quote.updatedAt || quote.createdAt || '')}
                              </div>
                              {quote.projectName && (
                                <div className="text-xs text-edg-grey mt-0.5">
                                  {quote.projectName}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="text-sm font-medium text-edg-black">
                            {formatCurrency(calculateQuoteTotal(quote))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <FileText className="h-12 w-12 text-edg-grey mx-auto mb-3 opacity-50" />
                    <p className="text-edg-grey text-sm">No recent quotes</p>
                    <Link href="/quotes/new">
                      <Button variant="outline" size="sm" className="mt-2">
                        Create Your First Quote
                      </Button>
                    </Link>
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-lg">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Link href="/leads">
                <Button variant="outline" className="w-full justify-start">
                  <Inbox className="h-4 w-4 mr-2 text-edg-teal" />
                  Website Leads
                </Button>
              </Link>
              <Link href="/pipeline">
                <Button variant="outline" className="w-full justify-start">
                  <ClipboardList className="h-4 w-4 mr-2 text-edg-teal" />
                  View Pipeline
                </Button>
              </Link>
              <Link href="/accounts">
                <Button variant="outline" className="w-full justify-start">
                  <Users className="h-4 w-4 mr-2 text-edg-teal" />
                  View Accounts
                </Button>
              </Link>
              <Link href="/quotes/new">
                <Button variant="outline" className="w-full justify-start">
                  <FileText className="h-4 w-4 mr-2 text-edg-teal" />
                  Create Quote
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
