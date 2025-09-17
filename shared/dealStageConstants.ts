// Centralized dealStage definitions for consistent use across the application
export const DEAL_STAGES = [
  { id: 'new_lead', label: 'New Lead', color: 'bg-blue-100 border-blue-300 text-blue-800' },
  { id: 'qualifying', label: 'Qualifying', color: 'bg-purple-100 border-purple-300 text-purple-800' },
  { id: 'consultation_scheduled', label: 'Consultation Scheduled', color: 'bg-indigo-100 border-indigo-300 text-indigo-800' },
  { id: 'building_estimate', label: 'Building Estimate', color: 'bg-cyan-100 border-cyan-300 text-cyan-800' },
  { id: 'quote_sent', label: 'Quote Sent', color: 'bg-yellow-100 border-yellow-300 text-yellow-800' },
  { id: 'closed_won', label: 'Closed-Won', color: 'bg-green-100 border-green-300 text-green-800' },
  { id: 'closed_lost', label: 'Closed-Lost', color: 'bg-red-100 border-red-300 text-red-800' },
  { id: 'on_hold', label: 'On Hold', color: 'bg-gray-100 border-gray-300 text-gray-800' }
] as const;

export type DealStageId = typeof DEAL_STAGES[number]['id'];

// Helper functions for dealing with stages
export function getDealStageById(id: string) {
  return DEAL_STAGES.find(stage => stage.id === id) || DEAL_STAGES[0];
}

export function getDealStageLabel(id: string): string {
  const stage = getDealStageById(id);
  return stage.label;
}

export function getDealStageColor(id: string): string {
  const stage = getDealStageById(id);
  return stage.color;
}

// Check if a stage is a final stage (won or lost)
export function isFinalStage(stageId: string): boolean {
  return ['closed_won', 'closed_lost'].includes(stageId);
}

// Check if a stage is active (not won, lost, or on hold)
export function isActiveStage(stageId: string): boolean {
  return !['closed_won', 'closed_lost', 'on_hold'].includes(stageId);
}

// Check if a stage is won
export function isWonStage(stageId: string): boolean {
  return stageId === 'closed_won';
}

// Check if a stage is lost
export function isLostStage(stageId: string): boolean {
  return stageId === 'closed_lost';
}

// Default stage for new leads
export const DEFAULT_DEAL_STAGE: DealStageId = 'new_lead';