import { useQuery } from "@tanstack/react-query";
import { AppHeader } from "@/components/app-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
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
  AlertTriangle
} from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
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
}

export default function DashboardPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();

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

  // Calculate dashboard statistics
  const stats: DashboardStats = {
    totalAccounts: accounts.length,
    totalContacts: contacts.length,
    totalOpportunities: opportunities.length,
    totalPipelineValue: opportunities.reduce((sum, opp) => {
      return sum + (opp.amount ? parseFloat(opp.amount.toString()) : 0);
    }, 0),
    activeOpportunities: opportunities.filter(opp => 
      !['project_complete', 'closed_lost'].includes(opp.stage)
    ).length,
    wonOpportunities: opportunities.filter(opp => 
      ['contract_signed', 'project_complete'].includes(opp.stage)
    ).length,
    conversionRate: opportunities.length > 0 
      ? (opportunities.filter(opp => opp.stage === 'project_complete').length / opportunities.length) * 100 
      : 0,
    averageDealSize: opportunities.length > 0 
      ? opportunities.reduce((sum, opp) => sum + (opp.amount ? parseFloat(opp.amount.toString()) : 0), 0) / opportunities.length
      : 0,
  };

  // Pipeline breakdown by stage
  const pipelineByStage = opportunities.reduce((acc, opp) => {
    acc[opp.stage] = (acc[opp.stage] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const stageLabels = {
    inquiry: "Inquiry",
    estimating: "Estimating", 
    proposal_sent: "Proposal Sent",
    contract_signed: "Contract Signed",
    project_complete: "Project Complete",
    closed_lost: "Closed Lost"
  };

  // Recent opportunities (last 10)
  const recentOpportunities = opportunities
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  // Upcoming tasks/opportunities
  const upcomingOpportunities = opportunities
    .filter(opp => opp.expectedCloseDate && new Date(opp.expectedCloseDate) >= new Date())
    .sort((a, b) => new Date(a.expectedCloseDate!).getTime() - new Date(b.expectedCloseDate!).getTime())
    .slice(0, 5);

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
            <h2 className="text-3xl font-bold text-edg-black">Dashboard</h2>
            <p className="text-edg-grey mt-2">Overview of your business metrics and activities</p>
          </div>
          
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center space-y-3 sm:space-y-0 sm:space-x-4">
            <Link href="/opportunities">
              <Button variant="outline" data-testid="button-view-pipeline">
                <Target className="mr-2 h-4 w-4" />
                View Pipeline
              </Button>
            </Link>
            <Link href="/accounts">
              <Button className="bg-edg-black hover:bg-edg-grey text-edg-white" data-testid="button-manage-accounts">
                <Building2 className="mr-2 h-4 w-4" />
                Manage Accounts
              </Button>
            </Link>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
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
                +{contacts.length} contacts
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Opportunities</CardTitle>
              <Target className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-bold" data-testid="metric-active-opportunities">
                  {stats.activeOpportunities}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                of {stats.totalOpportunities} total
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
              <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
              <TrendingUp className="h-4 w-4 text-purple-600" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-bold" data-testid="metric-conversion-rate">
                  {stats.conversionRate.toFixed(1)}%
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {stats.wonOpportunities} won deals
              </p>
            </CardContent>
          </Card>
        </div>

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
  );
}