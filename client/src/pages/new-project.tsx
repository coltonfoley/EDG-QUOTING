import { Link } from "wouter";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Plus } from "lucide-react";

export default function NewProjectPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <Link href="/projects" className="inline-flex items-center text-edg-blue hover:text-edg-blue-dark">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Projects
          </Link>
        </div>
        
        <div className="text-center">
          <div className="mx-auto w-12 h-12 bg-edg-black rounded-lg flex items-center justify-center mb-4">
            <Plus className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-edg-black mb-2">Create New Project</h1>
          <p className="text-edg-grey mb-8">Project creation form coming soon!</p>
          <p className="text-sm text-edg-grey mb-8">
            This page will include a comprehensive project creation form with fields for:
            <br />• Project details (name, description, address)
            <br />• Timeline and milestones
            <br />• Budget and cost estimates
            <br />• Team assignments
          </p>
          <Link href="/projects">
            <Button>Back to Projects</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}