import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  CheckCircle, 
  Calendar,
  DollarSign,
  Users,
  Target,
  Activity
} from "lucide-react";
import { format, subDays, subMonths } from "date-fns";
import type { Account, Contact, Opportunity } from "@shared/schema";

interface AccountWithDetails extends Account {
  roles: string[];
  contactCount?: number;
  opportunityCount?: number;
  totalValue?: number;
}

interface AccountHealthMetrics {
  overallScore: number;
  healthStatus: 'excellent' | 'good' | 'fair' | 'poor' | 'at-risk';
  metrics: {
    recentActivity: { score: number; label: string; details: string };
    opportunityPipeline: { score: number; label: string; details: string };
    dealVelocity: { score: number; label: string; details: string };
    communicationFrequency: { score: number; label: string; details: string };
    relationship: { score: number; label: string; details: string };
  };
  trends: {
    direction: 'up' | 'down' | 'stable';
    change: number;
    period: string;
  };
  recommendations: string[];
}

interface AccountHealthScoringProps {
  account: AccountWithDetails;
  contacts: Contact[];
  opportunities: Opportunity[];
  allAccounts: AccountWithDetails[];
  className?: string;
}

export function AccountHealthScoring({ 
  account, 
  contacts, 
  opportunities, 
  allAccounts,
  className 
}: AccountHealthScoringProps) {
  
  const healthMetrics: AccountHealthMetrics = useMemo(() => {
    const now = new Date();
    const thirtyDaysAgo = subDays(now, 30);
    const sixtyDaysAgo = subDays(now, 60);
    const threeMonthsAgo = subMonths(now, 3);
    
    // Get account-specific data
    const accountContacts = contacts.filter(c => c.accountId === account.id);
    const accountOpportunities = opportunities.filter(o => o.accountId === account.id);
    const activeOpportunities = accountOpportunities.filter(o => 
      !['project_complete', 'closed_lost'].includes(o.stage)
    );
    
    // 1. Recent Activity Score (0-100)
    const lastUpdate = account.updatedAt ? new Date(account.updatedAt) : new Date();
    const daysSinceUpdate = Math.floor((now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24));
    const recentActivityScore = Math.max(0, 100 - (daysSinceUpdate * 2)); // Lose 2 points per day
    
    // 2. Opportunity Pipeline Score (0-100)
    const totalOpportunityValue = accountOpportunities.reduce((sum, opp) => 
      sum + (opp.amount ? parseFloat(opp.amount.toString()) : 0), 0
    );
    const averageAccountValue = allAccounts.reduce((sum, acc) => sum + (acc.totalValue || 0), 0) / allAccounts.length;
    const pipelineScore = Math.min(100, (totalOpportunityValue / averageAccountValue) * 50);
    
    // 3. Deal Velocity Score (0-100)
    const wonOpportunities = accountOpportunities.filter(o => 
      ['contract_signed', 'project_complete'].includes(o.stage)
    );
    const recentWins = wonOpportunities.filter(o => 
      o.updatedAt && new Date(o.updatedAt) >= thirtyDaysAgo
    );
    const dealVelocityScore = recentWins.length > 0 ? 85 + (recentWins.length * 5) : 
                            wonOpportunities.length > 0 ? 60 : 30;
    
    // 4. Communication Frequency Score (0-100)
    const recentContacts = accountContacts.filter(c => 
      c.updatedAt && new Date(c.updatedAt) >= thirtyDaysAgo
    );
    const communicationScore = Math.min(100, (recentContacts.length * 25) + 
                                      (accountContacts.length * 10));
    
    // 5. Relationship Score (0-100)
    const hasKeyContacts = accountContacts.some(c => 
      c.title && (c.title.toLowerCase().includes('director') || c.title.toLowerCase().includes('manager') || c.title.toLowerCase().includes('ceo') || c.title.toLowerCase().includes('president'))
    );
    const hasMultipleContacts = accountContacts.length > 1;
    const relationshipScore = (hasKeyContacts ? 50 : 20) + (hasMultipleContacts ? 30 : 0) + 
                             Math.min(20, accountContacts.length * 5);
    
    // Calculate overall score (weighted average)
    const overallScore = Math.round(
      (recentActivityScore * 0.25) +
      (pipelineScore * 0.25) +
      (dealVelocityScore * 0.20) +
      (communicationScore * 0.15) +
      (relationshipScore * 0.15)
    );
    
    // Determine health status
    let healthStatus: AccountHealthMetrics['healthStatus'];
    if (overallScore >= 85) healthStatus = 'excellent';
    else if (overallScore >= 70) healthStatus = 'good';
    else if (overallScore >= 50) healthStatus = 'fair';
    else if (overallScore >= 30) healthStatus = 'poor';
    else healthStatus = 'at-risk';
    
    // Calculate trends (compare with previous period)
    const previousPeriodOpps = accountOpportunities.filter(o => {
      if (!o.updatedAt) return false;
      const updated = new Date(o.updatedAt);
      return updated >= sixtyDaysAgo && updated < thirtyDaysAgo;
    });
    const currentPeriodOpps = accountOpportunities.filter(o => 
      o.updatedAt && new Date(o.updatedAt) >= thirtyDaysAgo
    );
    
    const previousValue = previousPeriodOpps.reduce((sum, o) => 
      sum + (o.amount ? parseFloat(o.amount.toString()) : 0), 0
    );
    const currentValue = currentPeriodOpps.reduce((sum, o) => 
      sum + (o.amount ? parseFloat(o.amount.toString()) : 0), 0
    );
    
    const trendChange = previousValue > 0 ? 
      ((currentValue - previousValue) / previousValue) * 100 : 0;
    
    const trendDirection = trendChange > 5 ? 'up' : trendChange < -5 ? 'down' : 'stable';
    
    // Generate recommendations
    const recommendations: string[] = [];
    if (recentActivityScore < 50) {
      recommendations.push("Schedule a follow-up meeting to re-engage");
    }
    if (pipelineScore < 40) {
      recommendations.push("Explore new opportunity potential");
    }
    if (communicationScore < 60) {
      recommendations.push("Increase communication frequency");
    }
    if (relationshipScore < 50) {
      recommendations.push("Build relationships with key decision makers");
    }
    if (activeOpportunities.length === 0) {
      recommendations.push("Identify new project opportunities");
    }
    
    return {
      overallScore,
      healthStatus,
      metrics: {
        recentActivity: {
          score: recentActivityScore,
          label: 'Recent Activity',
          details: `Last updated ${daysSinceUpdate} days ago`
        },
        opportunityPipeline: {
          score: pipelineScore,
          label: 'Pipeline Value',
          details: `$${totalOpportunityValue.toLocaleString()} in opportunities`
        },
        dealVelocity: {
          score: dealVelocityScore,
          label: 'Deal Velocity',
          details: `${recentWins.length} deals closed recently`
        },
        communicationFrequency: {
          score: communicationScore,
          label: 'Communication',
          details: `${accountContacts.length} contacts, ${recentContacts.length} recent updates`
        },
        relationship: {
          score: relationshipScore,
          label: 'Relationship Depth',
          details: `${accountContacts.length} contacts${hasKeyContacts ? ' (includes decision makers)' : ''}`
        }
      },
      trends: {
        direction: trendDirection,
        change: Math.abs(trendChange),
        period: '30 days'
      },
      recommendations
    };
  }, [account, contacts, opportunities, allAccounts]);
  
  const getHealthStatusColor = (status: AccountHealthMetrics['healthStatus']) => {
    switch (status) {
      case 'excellent': return 'bg-green-100 text-green-800 border-green-200';
      case 'good': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'fair': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'poor': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'at-risk': return 'bg-red-100 text-red-800 border-red-200';
    }
  };
  
  const getHealthStatusIcon = (status: AccountHealthMetrics['healthStatus']) => {
    switch (status) {
      case 'excellent': return <CheckCircle className="h-4 w-4" />;
      case 'good': return <TrendingUp className="h-4 w-4" />;
      case 'fair': return <Activity className="h-4 w-4" />;
      case 'poor': return <TrendingDown className="h-4 w-4" />;
      case 'at-risk': return <AlertTriangle className="h-4 w-4" />;
    }
  };
  
  const getTrendIcon = (direction: 'up' | 'down' | 'stable') => {
    switch (direction) {
      case 'up': return <TrendingUp className="h-4 w-4 text-green-600" />;
      case 'down': return <TrendingDown className="h-4 w-4 text-red-600" />;
      case 'stable': return <Activity className="h-4 w-4 text-gray-600" />;
    }
  };
  
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Account Health Score
          </span>
          <div className="flex items-center gap-2">
            <Badge className={`px-3 py-1 ${getHealthStatusColor(healthMetrics.healthStatus)}`}>
              {getHealthStatusIcon(healthMetrics.healthStatus)}
              <span className="ml-1 capitalize">{healthMetrics.healthStatus.replace('-', ' ')}</span>
            </Badge>
            <div className="text-2xl font-bold">{healthMetrics.overallScore}</div>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Overall Health Progress */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">Overall Health</span>
            <span className="text-sm text-gray-500">{healthMetrics.overallScore}/100</span>
          </div>
          <Progress value={healthMetrics.overallScore} className="h-2" />
        </div>
        
        {/* Trend Indicator */}
        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2">
            {getTrendIcon(healthMetrics.trends.direction)}
            <span className="text-sm font-medium">
              {healthMetrics.trends.direction === 'up' ? 'Improving' :
               healthMetrics.trends.direction === 'down' ? 'Declining' : 'Stable'}
            </span>
          </div>
          <div className="text-sm text-gray-600">
            {healthMetrics.trends.change.toFixed(1)}% over {healthMetrics.trends.period}
          </div>
        </div>
        
        {/* Health Metrics Breakdown */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold">Health Metrics</h4>
          {Object.entries(healthMetrics.metrics).map(([key, metric]) => (
            <div key={key} className="space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-sm">{metric.label}</span>
                <span className="text-sm font-medium">{metric.score}</span>
              </div>
              <Progress value={metric.score} className="h-1" />
              <p className="text-xs text-gray-500">{metric.details}</p>
            </div>
          ))}
        </div>
        
        {/* Recommendations */}
        {healthMetrics.recommendations.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-semibold">Recommendations</h4>
            <div className="space-y-2">
              {healthMetrics.recommendations.map((recommendation, index) => (
                <div key={index} className="flex items-start gap-2 p-2 bg-blue-50 rounded-lg">
                  <AlertTriangle className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-blue-800">{recommendation}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Action Buttons */}
        <div className="flex gap-2 pt-2">
          <Button variant="outline" size="sm" className="flex-1">
            <Calendar className="mr-2 h-4 w-4" />
            Schedule Follow-up
          </Button>
          <Button variant="outline" size="sm" className="flex-1">
            <Users className="mr-2 h-4 w-4" />
            View Contacts
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default AccountHealthScoring;