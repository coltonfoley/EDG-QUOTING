import { useQuery } from "@tanstack/react-query";
import { AppHeader } from "@/components/app-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from "@/components/ui/chart";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Building2, 
  Users, 
  Target, 
  DollarSign, 
  TrendingUp, 
  Clock, 
  Plus,
  ArrowRight,
  Activity as ActivityIcon,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  BarChart3,
  PieChart,
  Filter,
  Download
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, PieChart as RechartsPieChart, Cell, LineChart, Line, ResponsiveContainer, Area, AreaChart } from "recharts";
import { Link } from "wouter";
import { format, subDays, subMonths, startOfMonth, endOfMonth, eachMonthOfInterval } from "date-fns";
import { formatCurrency } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useState, useMemo } from "react";
import type { Account, Contact, Opportunity, Activity } from "@shared/schema";

interface DashboardStats {
  totalAccounts: number;
  totalContacts: number;
  totalOpportunities: number;
  totalPipelineValue: number;
  activeOpportunities: number;
  wonOpportunities: number;
  conversionRate: number;
  averageDealSize: number;
  // Advanced analytics
  dealVelocity: number; // average days to close
  winRate: number;
  monthlyRevenue: number;
  quarterlyGrowth: number;
  totalActivities: number;
  avgOpportunitiesPerAccount: number;
}

interface ChartData {
  pipelineChart: Array<{name: string; value: number; amount: number; color: string}>;
  revenueChart: Array<{month: string; revenue: number; deals: number}>;
  conversionChart: Array<{stage: string; conversion: number; count: number}>;
  activityChart: Array<{type: string; count: number}>;
  sourceChart: Array<{source: string; value: number; color: string}>;
}

export default function DashboardPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [timeRange, setTimeRange] = useState("30d");
  const [activeTab, setActiveTab] = useState("overview");

  // Fetch dashboard data
  const { data: accounts = [], isLoading: accountsLoading } = useQuery<Account[]>({
    queryKey: ["/api/accounts"],
    enabled: isAuthenticated,
  });

  const { data: contacts = [], isLoading: contactsLoading } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
    enabled: isAuthenticated,
  });

  const { data: opportunities = [], isLoading: opportunitiesLoading } = useQuery<Opportunity[]>({
    queryKey: ["/api/opportunities"],
    enabled: isAuthenticated,
  });

  const { data: recentActivities = [], isLoading: activitiesLoading } = useQuery<Activity[]>({
    queryKey: ["/api/activities", "recent"],
    queryFn: async () => {
      try {
        const allActivities: Activity[] = [];
        
        // Fetch activities for all accounts
        for (const account of accounts) {
          try {
            const response = await fetch(`/api/activities?entityType=account&entityId=${account.id}`);
            if (response.ok) {
              const activities = await response.json();
              allActivities.push(...activities);
            }
          } catch (error) {
            console.warn(`Failed to fetch activities for account ${account.id}:`, error);
          }
        }
        
        // Fetch activities for all contacts
        for (const contact of contacts) {
          try {
            const response = await fetch(`/api/activities?entityType=contact&entityId=${contact.id}`);
            if (response.ok) {
              const activities = await response.json();
              allActivities.push(...activities);
            }
          } catch (error) {
            console.warn(`Failed to fetch activities for contact ${contact.id}:`, error);
          }
        }
        
        // Fetch activities for all opportunities
        for (const opportunity of opportunities) {
          try {
            const response = await fetch(`/api/activities?entityType=opportunity&entityId=${opportunity.id}`);
            if (response.ok) {
              const activities = await response.json();
              allActivities.push(...activities);
            }
          } catch (error) {
            console.warn(`Failed to fetch activities for opportunity ${opportunity.id}:`, error);
          }
        }
        
        // Sort by date (most recent first) and limit to 10 recent activities
        return allActivities
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 10);
      } catch (error) {
        console.error("Failed to fetch recent activities:", error);
        return [];
      }
    },
    enabled: isAuthenticated && accounts.length > 0 && contacts.length > 0 && opportunities.length > 0,
  });

  // Filter data based on time range
  const filteredOpportunities = useMemo(() => {
    const now = new Date();
    let cutoffDate: Date;
    
    switch (timeRange) {
      case "7d":
        cutoffDate = subDays(now, 7);
        break;
      case "30d":
        cutoffDate = subDays(now, 30);
        break;
      case "90d":
        cutoffDate = subDays(now, 90);
        break;
      case "1y":
        cutoffDate = subDays(now, 365);
        break;
      default:
        return opportunities;
    }
    
    return opportunities.filter(opp => new Date(opp.createdAt) >= cutoffDate);
  }, [opportunities, timeRange]);

  // Calculate advanced dashboard statistics
  const stats: DashboardStats = useMemo(() => {
    const totalPipelineValue = filteredOpportunities.reduce((sum, opp) => {
      return sum + (opp.amount ? parseFloat(opp.amount.toString()) : 0);
    }, 0);
    
    const activeOpportunities = filteredOpportunities.filter(opp => 
      !['project_complete', 'closed_lost'].includes(opp.stage)
    );
    
    const wonOpportunities = filteredOpportunities.filter(opp => 
      ['contract_signed', 'project_complete'].includes(opp.stage)
    );
    
    const closedOpportunities = filteredOpportunities.filter(opp => 
      ['project_complete', 'closed_lost'].includes(opp.stage)
    );
    
    // Deal velocity calculation (average days to close)
    const dealVelocity = closedOpportunities.length > 0 ? 
      closedOpportunities.reduce((sum, opp) => {
        const created = new Date(opp.createdAt);
        const updated = new Date(opp.updatedAt);
        return sum + Math.floor((updated.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
      }, 0) / closedOpportunities.length : 0;
    
    // Monthly revenue (completed deals this month)
    const thisMonth = startOfMonth(new Date());
    const monthlyRevenue = filteredOpportunities
      .filter(opp => 
        opp.stage === 'project_complete' && 
        new Date(opp.updatedAt) >= thisMonth
      )
      .reduce((sum, opp) => sum + (opp.amount ? parseFloat(opp.amount.toString()) : 0), 0);
    
    // Quarterly growth calculation
    const threeMonthsAgo = subMonths(new Date(), 3);
    const lastQuarterRevenue = opportunities
      .filter(opp => 
        opp.stage === 'project_complete' && 
        new Date(opp.updatedAt) >= threeMonthsAgo &&
        new Date(opp.updatedAt) < thisMonth
      )
      .reduce((sum, opp) => sum + (opp.amount ? parseFloat(opp.amount.toString()) : 0), 0);
    
    const quarterlyGrowth = lastQuarterRevenue > 0 ? 
      ((monthlyRevenue - lastQuarterRevenue) / lastQuarterRevenue) * 100 : 0;
    
    return {
      totalAccounts: accounts.length,
      totalContacts: contacts.length,
      totalOpportunities: filteredOpportunities.length,
      totalPipelineValue,
      activeOpportunities: activeOpportunities.length,
      wonOpportunities: wonOpportunities.length,
      conversionRate: filteredOpportunities.length > 0 
        ? (wonOpportunities.length / filteredOpportunities.length) * 100 
        : 0,
      averageDealSize: filteredOpportunities.length > 0 
        ? totalPipelineValue / filteredOpportunities.length 
        : 0,
      dealVelocity: Math.round(dealVelocity),
      winRate: closedOpportunities.length > 0 
        ? (wonOpportunities.length / closedOpportunities.length) * 100 
        : 0,
      monthlyRevenue,
      quarterlyGrowth,
      totalActivities: recentActivities.length,
      avgOpportunitiesPerAccount: accounts.length > 0 
        ? filteredOpportunities.length / accounts.length 
        : 0,
    };
  }, [filteredOpportunities, accounts, contacts, recentActivities]);

  // Stage labels definition
  const stageLabels = {
    inquiry: "Inquiry",
    estimating: "Estimating", 
    proposal_sent: "Proposal Sent",
    contract_signed: "Contract Signed",
    project_complete: "Project Complete",
    closed_lost: "Closed Lost"
  };

  // Pipeline breakdown by stage
  const pipelineByStage = filteredOpportunities.reduce((acc, opp) => {
    acc[opp.stage] = (acc[opp.stage] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Generate chart data
  const chartData: ChartData = useMemo(() => {
    const stageColors = {
      inquiry: "#94a3b8",
      estimating: "#3b82f6", 
      proposal_sent: "#eab308",
      contract_signed: "#22c55e",
      project_complete: "#10b981",
      closed_lost: "#ef4444"
    };
    
    // Pipeline distribution chart
    const pipelineChart = Object.entries(stageLabels).map(([stage, label]) => ({
      name: label,
      value: pipelineByStage[stage] || 0,
      amount: filteredOpportunities
        .filter(opp => opp.stage === stage)
        .reduce((sum, opp) => sum + (opp.amount ? parseFloat(opp.amount.toString()) : 0), 0),
      color: stageColors[stage as keyof typeof stageColors]
    }));
    
    // Revenue trends chart (last 6 months)
    const last6Months = eachMonthOfInterval({
      start: subMonths(new Date(), 5),
      end: new Date()
    });
    
    const revenueChart = last6Months.map(month => {
      const monthStart = startOfMonth(month);
      const monthEnd = endOfMonth(month);
      
      const monthOpps = opportunities.filter(opp => {
        const updatedDate = new Date(opp.updatedAt);
        return opp.stage === 'project_complete' &&
               updatedDate >= monthStart && 
               updatedDate <= monthEnd;
      });
      
      return {
        month: format(month, 'MMM yyyy'),
        revenue: monthOpps.reduce((sum, opp) => sum + (opp.amount ? parseFloat(opp.amount.toString()) : 0), 0),
        deals: monthOpps.length
      };
    });
    
    // Conversion funnel chart
    const stages = ['inquiry', 'estimating', 'proposal_sent', 'contract_signed', 'project_complete'];
    const conversionChart = stages.map((stage, index) => {
      const stageCount = pipelineByStage[stage] || 0;
      const prevStageCount = index > 0 ? (pipelineByStage[stages[index - 1]] || 0) : filteredOpportunities.length;
      
      return {
        stage: stageLabels[stage as keyof typeof stageLabels],
        conversion: prevStageCount > 0 ? (stageCount / prevStageCount) * 100 : 0,
        count: stageCount
      };
    });
    
    // Activity distribution chart
    const activityTypes = recentActivities.reduce((acc, activity) => {
      acc[activity.type] = (acc[activity.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const activityChart = Object.entries(activityTypes).map(([type, count]) => ({
      type: type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
      count
    }));
    
    // Opportunity source distribution
    const sources = filteredOpportunities.reduce((acc, opp) => {
      const source = opp.source || 'Unknown';
      acc[source] = (acc[source] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const sourceColors = ['#3b82f6', '#ef4444', '#22c55e', '#eab308', '#8b5cf6', '#f97316'];
    const sourceChart = Object.entries(sources).map(([source, value], index) => ({
      source: source.charAt(0).toUpperCase() + source.slice(1),
      value,
      color: sourceColors[index % sourceColors.length]
    }));
    
    return {
      pipelineChart,
      revenueChart,
      conversionChart,
      activityChart,
      sourceChart
    };
  }, [filteredOpportunities, opportunities, pipelineByStage, recentActivities]);

  // Recent opportunities (last 10)
  const recentOpportunities = opportunities
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  // Upcoming tasks/opportunities
  const upcomingOpportunities = opportunities
    .filter(opp => opp.expectedCloseDate && new Date(opp.expectedCloseDate) >= new Date())
    .sort((a, b) => new Date(a.expectedCloseDate!).getTime() - new Date(b.expectedCloseDate!).getTime())
    .slice(0, 5);

  // Chart configuration
  const chartConfig = {
    pipeline: {
      label: "Pipeline Value",
    },
    revenue: {
      label: "Revenue",
    },
    activity: {
      label: "Activities",
    },
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-edg-teal"></div>
      </div>
    );
  }

  const isLoading = accountsLoading || contactsLoading || opportunitiesLoading;

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start mb-8 space-y-4 lg:space-y-0">
          <div>
            <h2 className="text-3xl font-bold text-edg-black">Business Analytics Dashboard</h2>
            <p className="text-edg-grey mt-2">Comprehensive insights into your business performance and activities</p>
          </div>
          
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center space-y-3 sm:space-y-0 sm:space-x-4">
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-[120px]" data-testid="select-time-range">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
                <SelectItem value="1y">Last year</SelectItem>
              </SelectContent>
            </Select>
            
            <Button variant="outline" data-testid="button-export-data">
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
            
            <Link href="/opportunities">
              <Button variant="outline" data-testid="button-view-pipeline">
                <Target className="mr-2 h-4 w-4" />
                View Pipeline
              </Button>
            </Link>
            
            <Link href="/opportunities">
              <Button data-testid="button-new-opportunity">
                <Plus className="mr-2 h-4 w-4" />
                New Opportunity
              </Button>
            </Link>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
            <TabsTrigger value="analytics" data-testid="tab-analytics">Analytics</TabsTrigger>
            <TabsTrigger value="performance" data-testid="tab-performance">Performance</TabsTrigger>
            <TabsTrigger value="pipeline" data-testid="tab-pipeline">Pipeline</TabsTrigger>
          </TabsList>
          
          <TabsContent value="overview" className="space-y-6">
            {/* Enhanced Key Metrics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Accounts</CardTitle>
                  <Building2 className="h-4 w-4 text-edg-teal" />
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <Skeleton className="h-8 w-16" />
                  ) : (
                    <div className="text-2xl font-bold" data-testid="metric-total-accounts">
                      {stats.totalAccounts}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {stats.avgOpportunitiesPerAccount.toFixed(1)} opps per account
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Pipeline Value</CardTitle>
                  <DollarSign className="h-4 w-4 text-green-600" />
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <Skeleton className="h-8 w-24" />
                  ) : (
                    <div className="text-2xl font-bold" data-testid="metric-pipeline-value">
                      {formatCurrency(stats.totalPipelineValue)}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {formatCurrency(stats.averageDealSize)} avg deal
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Win Rate</CardTitle>
                  <TrendingUp className="h-4 w-4 text-purple-600" />
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <Skeleton className="h-8 w-16" />
                  ) : (
                    <div className="text-2xl font-bold" data-testid="metric-win-rate">
                      {stats.winRate.toFixed(1)}%
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {stats.wonOpportunities} of {stats.activeOpportunities + stats.wonOpportunities} closed
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Deal Velocity</CardTitle>
                  <Clock className="h-4 w-4 text-orange-600" />
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <Skeleton className="h-8 w-16" />
                  ) : (
                    <div className="text-2xl font-bold" data-testid="metric-deal-velocity">
                      {stats.dealVelocity} days
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Average time to close
                  </p>
                </CardContent>
              </Card>
            </div>
            
            {/* Additional Metrics Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
                  <DollarSign className="h-4 w-4 text-green-600" />
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <Skeleton className="h-8 w-20" />
                  ) : (
                    <div className="text-2xl font-bold" data-testid="metric-monthly-revenue">
                      {formatCurrency(stats.monthlyRevenue)}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    This month closed deals
                  </p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Quarterly Growth</CardTitle>
                  <TrendingUp className="h-4 w-4 text-blue-600" />
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <Skeleton className="h-8 w-16" />
                  ) : (
                    <div className="text-2xl font-bold" data-testid="metric-quarterly-growth">
                      {stats.quarterlyGrowth >= 0 ? '+' : ''}{stats.quarterlyGrowth.toFixed(1)}%
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    vs previous quarter
                  </p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Active Contacts</CardTitle>
                  <Users className="h-4 w-4 text-blue-600" />
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <Skeleton className="h-8 w-16" />
                  ) : (
                    <div className="text-2xl font-bold" data-testid="metric-total-contacts">
                      {stats.totalContacts}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Across {stats.totalAccounts} accounts
                  </p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Activities</CardTitle>
                  <ActivityIcon className="h-4 w-4 text-purple-600" />
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <Skeleton className="h-8 w-16" />
                  ) : (
                    <div className="text-2xl font-bold" data-testid="metric-total-activities">
                      {stats.totalActivities}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Recent activities tracked
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          
          <TabsContent value="analytics" className="space-y-6">
            {/* Revenue Analytics Chart */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Revenue Trends
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <Skeleton className="h-[300px] w-full" />
                  ) : (
                    <ChartContainer config={chartConfig} className="h-[300px]">
                      <AreaChart data={chartData.revenueChart}>
                        <XAxis dataKey="month" />
                        <YAxis />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Area 
                          type="monotone" 
                          dataKey="revenue" 
                          stroke="#3b82f6" 
                          fill="#3b82f6" 
                          fillOpacity={0.2}
                        />
                      </AreaChart>
                    </ChartContainer>
                  )}
                </CardContent>
              </Card>
              
              {/* Pipeline Distribution Chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <PieChart className="h-5 w-5" />
                    Pipeline Distribution
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <Skeleton className="h-[300px] w-full" />
                  ) : (
                    <ChartContainer config={chartConfig} className="h-[300px]">
                      <RechartsPieChart>
                        <ChartTooltip 
                          content={<ChartTooltipContent />} 
                          formatter={(value, name) => [
                            `${value} opportunities`,
                            name
                          ]}
                        />
                        <RechartsPieChart.Pie
                          data={chartData.pipelineChart}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={100}
                          label={({ name, value }) => `${name}: ${value}`}
                        >
                          {chartData.pipelineChart.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </RechartsPieChart.Pie>
                      </RechartsPieChart>
                    </ChartContainer>
                  )}
                </CardContent>
              </Card>
            </div>
            
            {/* Conversion Funnel */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Sales Conversion Funnel
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-[200px] w-full" />
                ) : (
                  <ChartContainer config={chartConfig} className="h-[200px]">
                    <BarChart data={chartData.conversionChart} layout="horizontal">
                      <XAxis type="number" domain={[0, 100]} />
                      <YAxis dataKey="stage" type="category" width={120} />
                      <ChartTooltip 
                        content={<ChartTooltipContent />}
                        formatter={(value) => [`${value.toFixed(1)}%`, 'Conversion Rate']}
                      />
                      <Bar dataKey="conversion" fill="#3b82f6" />
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="performance" className="space-y-6">
            {/* Activity Analytics */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ActivityIcon className="h-5 w-5" />
                    Activity Distribution
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <Skeleton className="h-[250px] w-full" />
                  ) : (
                    <ChartContainer config={chartConfig} className="h-[250px]">
                      <BarChart data={chartData.activityChart}>
                        <XAxis dataKey="type" />
                        <YAxis />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="count" fill="#8b5cf6" />
                      </BarChart>
                    </ChartContainer>
                  )}
                </CardContent>
              </Card>
              
              {/* Opportunity Sources */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Lead Sources
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <Skeleton className="h-[250px] w-full" />
                  ) : (
                    <ChartContainer config={chartConfig} className="h-[250px]">
                      <RechartsPieChart>
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <RechartsPieChart.Pie
                          data={chartData.sourceChart}
                          dataKey="value"
                          nameKey="source"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          label={({ source, value }) => `${source}: ${value}`}
                        >
                          {chartData.sourceChart.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </RechartsPieChart.Pie>
                      </RechartsPieChart>
                    </ChartContainer>
                  )}
                </CardContent>
              </Card>
            </div>
            
            {/* Performance Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-center">Business Health Score</CardTitle>
                </CardHeader>
                <CardContent className="text-center">
                  {isLoading ? (
                    <Skeleton className="h-16 w-16 rounded-full mx-auto" />
                  ) : (
                    <div className="space-y-2">
                      <div className="text-4xl font-bold text-green-600" data-testid="health-score">
                        {Math.round((stats.winRate + stats.conversionRate) / 2)}%
                      </div>
                      <p className="text-sm text-muted-foreground">Overall Performance</p>
                    </div>
                  )}
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle className="text-center">Activity Score</CardTitle>
                </CardHeader>
                <CardContent className="text-center">
                  {isLoading ? (
                    <Skeleton className="h-16 w-16 rounded-full mx-auto" />
                  ) : (
                    <div className="space-y-2">
                      <div className="text-4xl font-bold text-blue-600" data-testid="activity-score">
                        {Math.min(100, Math.round((stats.totalActivities / Math.max(1, stats.totalOpportunities)) * 20))}%
                      </div>
                      <p className="text-sm text-muted-foreground">Engagement Level</p>
                    </div>
                  )}
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle className="text-center">Pipeline Health</CardTitle>
                </CardHeader>
                <CardContent className="text-center">
                  {isLoading ? (
                    <Skeleton className="h-16 w-16 rounded-full mx-auto" />
                  ) : (
                    <div className="space-y-2">
                      <div className="text-4xl font-bold text-purple-600" data-testid="pipeline-health">
                        {Math.round((stats.activeOpportunities / Math.max(1, stats.totalOpportunities)) * 100)}%
                      </div>
                      <p className="text-sm text-muted-foreground">Active Pipeline</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          
          <TabsContent value="pipeline" className="space-y-6">
            {/* Pipeline Overview */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Pipeline Stage Analysis
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-4">
                    {[...Array(6)].map((_, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-4 w-16" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {Object.entries(stageLabels).map(([stage, label]) => {
                      const count = pipelineByStage[stage] || 0;
                      const amount = filteredOpportunities
                        .filter(opp => opp.stage === stage)
                        .reduce((sum, opp) => sum + (opp.amount ? parseFloat(opp.amount.toString()) : 0), 0);
                      const percentage = stats.totalOpportunities > 0 ? (count / stats.totalOpportunities) * 100 : 0;
                      
                      return (
                        <div key={stage} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">{label}</span>
                            <div className="text-right">
                              <span className="text-sm text-muted-foreground">{count} opportunities</span>
                              <div className="text-xs text-muted-foreground">{formatCurrency(amount)}</div>
                            </div>
                          </div>
                          <Progress value={percentage} className="h-2" data-testid={`progress-${stage}`} />
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Legacy Content Below Tabs for Additional Information */}
        <div className="mt-8">
        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Pipeline Overview */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Pipeline Overview</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-4">
                    {[...Array(6)].map((_, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-4 w-16" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {Object.entries(stageLabels).map(([stage, label]) => {
                      const count = pipelineByStage[stage] || 0;
                      const percentage = stats.totalOpportunities > 0 ? (count / stats.totalOpportunities) * 100 : 0;
                      
                      return (
                        <div key={stage} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">{label}</span>
                            <span className="text-sm text-muted-foreground">{count} opportunities</span>
                          </div>
                          <Progress value={percentage} className="h-2" />
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recent Opportunities */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Recent Opportunities</CardTitle>
                <Link href="/opportunities">
                  <Button variant="ghost" size="sm" data-testid="link-view-all-opportunities">
                    View All
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-4">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="flex items-center space-x-4">
                        <Skeleton className="h-10 w-10 rounded-full" />
                        <div className="space-y-2 flex-1">
                          <Skeleton className="h-4 w-48" />
                          <Skeleton className="h-3 w-32" />
                        </div>
                        <Skeleton className="h-6 w-16" />
                      </div>
                    ))}
                  </div>
                ) : recentOpportunities.length > 0 ? (
                  <div className="space-y-4">
                    {recentOpportunities.map((opportunity) => (
                      <div key={opportunity.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center space-x-3">
                          <div className="p-2 bg-blue-100 rounded-full">
                            <Target className="h-4 w-4 text-blue-600" />
                          </div>
                          <div>
                            <p className="font-medium">{opportunity.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {opportunity.amount ? formatCurrency(parseFloat(opportunity.amount.toString())) : 'No amount set'}
                            </p>
                          </div>
                        </div>
                        <Badge variant="secondary">
                          {stageLabels[opportunity.stage as keyof typeof stageLabels]}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Target className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500">No opportunities yet</p>
                    <Link href="/opportunities">
                      <Button size="sm" className="mt-2">Create First Opportunity</Button>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Link href="/accounts" className="block">
                  <Button variant="outline" className="w-full justify-start" data-testid="button-add-account">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Account
                  </Button>
                </Link>
                <Link href="/contacts" className="block">
                  <Button variant="outline" className="w-full justify-start" data-testid="button-add-contact">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Contact
                  </Button>
                </Link>
                <Link href="/opportunities" className="block">
                  <Button variant="outline" className="w-full justify-start" data-testid="button-add-opportunity">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Opportunity
                  </Button>
                </Link>
                <Link href="/quotes/new" className="block">
                  <Button variant="outline" className="w-full justify-start" data-testid="button-create-quote">
                    <Plus className="mr-2 h-4 w-4" />
                    Create Quote
                  </Button>
                </Link>
              </CardContent>
            </Card>

            {/* Upcoming Opportunities */}
            <Card>
              <CardHeader>
                <CardTitle>Upcoming Close Dates</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-3">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="flex items-center space-x-3">
                        <Skeleton className="h-8 w-8 rounded" />
                        <div className="space-y-1 flex-1">
                          <Skeleton className="h-3 w-32" />
                          <Skeleton className="h-3 w-24" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : upcomingOpportunities.length > 0 ? (
                  <div className="space-y-3">
                    {upcomingOpportunities.map((opportunity) => (
                      <div key={opportunity.id} className="flex items-center space-x-3 p-3 border rounded-lg">
                        <Calendar className="h-4 w-4 text-orange-500" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{opportunity.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(opportunity.expectedCloseDate!), "MMM d, yyyy")}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <Calendar className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">No upcoming close dates</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* System Status */}
            <Card>
              <CardHeader>
                <CardTitle>System Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <span className="text-sm">Data Sync</span>
                  </div>
                  <Badge variant="secondary" className="bg-green-100 text-green-800">
                    Active
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <span className="text-sm">API Status</span>
                  </div>
                  <Badge variant="secondary" className="bg-green-100 text-green-800">
                    Online
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <ActivityIcon className="h-4 w-4 text-blue-500" />
                    <span className="text-sm">Last Updated</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(), "h:mm a")}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}