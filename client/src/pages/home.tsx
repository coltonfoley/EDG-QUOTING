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
  UserPlus,
  ChevronRight,
  Activity,
  Calendar,
  Award,
  BarChart3
} from "lucide-react";
import { Link } from "wouter";
import { AppHeader } from "@/components/app-header";
import { useQuery } from "@tanstack/react-query";
import { formatCurrency, cn } from "@/lib/utils";
import { format, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";
import type { QuoteWithDetails, Account } from "@shared/schema";
import { DEAL_STAGES, getDealStageById, isWonStage, isLostStage, isFinalStage, isActiveStage } from "@shared/dealStageConstants";


export default function Home() {
  // Fetch quotes
  const { data: quotes, isLoading: quotesLoading } = useQuery<QuoteWithDetails[]>({
    queryKey: ['/api/quotes'],
  });

  // Fetch accounts
  const { data: accounts, isLoading: accountsLoading } = useQuery<Account[]>({
    queryKey: ['/api/accounts'],
  });

  // Calculate quote total
  function calculateQuoteTotal(quote: QuoteWithDetails): number {
    return quote.lineItems.reduce((sum, item) => {
      const qty = parseFloat(item.quantity.toString());
      const price = parseFloat(item.unitPrice.toString());
      const markup = parseFloat(item.markupValue.toString());
      const baseTotal = qty * price;
      const total = item.markupType === 'percentage' 
        ? baseTotal + (baseTotal * (markup / 100))
        : baseTotal + markup;
      return sum + total;
    }, 0);
  }

  // Calculate metrics
  const metrics = {
    totalAccounts: accounts?.length || 0,
    activeDeals: quotes?.filter(q => isActiveStage(q.dealStage || 'new_lead')).length || 0,
    totalDeals: quotes?.length || 0,
    wonThisMonth: quotes?.filter(q => {
      if (!isWonStage(q.dealStage || '')) return false;
      const updatedAt = new Date(q.updatedAt || q.createdAt || '');
      const start = startOfMonth(new Date());
      const end = endOfMonth(new Date());
      return isWithinInterval(updatedAt, { start, end });
    }).length || 0,
    pipelineValue: quotes?.filter(q => isActiveStage(q.dealStage || 'new_lead')).reduce((sum, quote) => {
      return sum + calculateQuoteTotal(quote);
    }, 0) || 0,
    wonValue: quotes?.filter(q => isWonStage(q.dealStage || '')).reduce((sum, quote) => {
      return sum + calculateQuoteTotal(quote);
    }, 0) || 0,
    avgDealSize: quotes && quotes.length > 0 
      ? quotes.reduce((sum, q) => sum + calculateQuoteTotal(q), 0) / quotes.length 
      : 0,
    winRate: quotes && quotes.length > 0
      ? (quotes.filter(q => isWonStage(q.dealStage || '')).length / 
         quotes.filter(q => isFinalStage(q.dealStage || '')).length) * 100 || 0
      : 0
  };

  // Group quotes by stage
  const quotesByStage = DEAL_STAGES.map(stage => {
    const stageQuotes = quotes?.filter(q => (q.dealStage || 'new_lead') === stage.id) || [];
    const stageValue = stageQuotes.reduce((sum, q) => sum + calculateQuoteTotal(q), 0);
    return {
      ...stage,
      count: stageQuotes.length,
      value: stageValue,
      percentage: quotes && quotes.length > 0 
        ? (stageQuotes.length / quotes.length) * 100 
        : 0
    };
  });

  // Get recent activity (last 10 quotes)
  const recentActivity = quotes?.slice().sort((a, b) => {
    const dateA = new Date(b.updatedAt || b.createdAt || '');
    const dateB = new Date(a.updatedAt || a.createdAt || '');
    return dateA.getTime() - dateB.getTime();
  }).slice(0, 10) || [];

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


  const isLoading = quotesLoading || accountsLoading;

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader />

      <main className="container mx-auto px-4 py-8">
        {/* Header Section */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-edg-black mb-2">CRM Dashboard</h2>
          <p className="text-edg-grey">Rainmaker Business Intelligence</p>
        </div>

        {/* Key Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
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
                      <span className="text-sm font-medium">
                        {formatCurrency(stage.value)}
                      </span>
                    </div>
                    <Progress 
                      value={stage.percentage} 
                      className="h-2"
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
                        <div className="w-10 h-10 bg-gray-200 rounded animate-pulse"></div>
                        <div className="flex-1 space-y-1">
                          <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
                          <div className="h-3 bg-gray-200 rounded w-2/3 animate-pulse"></div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : recentActivity.length > 0 ? (
                  <div className="space-y-3">
                    {recentActivity.map((quote) => {
                      const stage = getDealStageById(quote.dealStage || 'new_lead');
                      return (
                        <div key={quote.id} className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg transition-colors">
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
                    <Link href="/quote-builder">
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
              <Link href="/pipeline">
                <Button variant="outline" className="w-full justify-start">
                  <UserPlus className="h-4 w-4 mr-2 text-edg-teal" />
                  New Lead
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
              <Link href="/quote-builder">
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