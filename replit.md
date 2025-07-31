# EDG Patio & Shade Estimator - Construction Quote Management System

## Overview

EDG Patio & Shade Estimator is a full-stack web application designed for EDG Patio & Shade to create, manage, and track project quotes. The system features a React frontend with shadcn/ui components and an Express.js backend with PostgreSQL database storage via Drizzle ORM.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter for client-side routing
- **State Management**: TanStack Query (React Query) for server state management
- **UI Framework**: shadcn/ui components built on Radix UI primitives
- **Styling**: Tailwind CSS with custom construction-themed color palette
- **Build Tool**: Vite for development and production builds

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript with ES modules
- **Database**: PostgreSQL with Drizzle ORM for type-safe database operations
- **API Design**: RESTful API with JSON responses
- **Database Connection**: Neon Database serverless PostgreSQL

### Database Schema
The system uses four main entities:
1. **Customers**: Store client contact information
2. **Quotes**: Project estimates with metadata (status, dates, totals)
3. **Products**: Reusable catalog of materials, services, and labor with default pricing
4. **Line Items**: Individual cost items within quotes with markup calculations

## Key Components

### Data Models
- **Customer Management**: Name, email, phone storage
- **Quote Management**: Project details, status tracking (draft/sent/approved/rejected), tax and discount handling
- **Product Catalog**: Reusable products with categories, default pricing, units, and markup settings
- **Line Item System**: Flexible markup system supporting both percentage and fixed dollar markups

### User Interface Components
- **Quote Builder**: Form-based quote creation with customer and project details
- **Line Items Table**: Dynamic table for adding/editing quote line items with product catalog integration
- **Product Catalog**: Full CRUD interface for managing reusable products and services
- **Quote Summary**: Financial calculations and status management
- **Dashboard**: Overview of all quotes with filtering and status indicators
- **Navigation**: Professional header with active page indicators

### Business Logic
- **Quote Number Generation**: Automatic unique quote numbering
- **Financial Calculations**: Subtotal, tax, discount, and markup calculations
- **Status Workflow**: Quote lifecycle management from draft to completion

## Data Flow

1. **Quote Creation**: User inputs customer and project information
2. **Line Item Management**: Add materials/labor with quantities and pricing
3. **Markup Application**: Apply percentage or fixed markups to base costs
4. **Financial Calculation**: System calculates totals with tax and discounts
5. **Status Tracking**: Quotes progress through workflow states
6. **Data Persistence**: All changes saved to PostgreSQL database via Drizzle ORM

## External Dependencies

### Frontend Dependencies
- **React Query**: Server state management and caching
- **React Hook Form**: Form handling with Zod validation
- **Wouter**: Lightweight React router
- **shadcn/ui**: Pre-built accessible UI components
- **Tailwind CSS**: Utility-first CSS framework

### Backend Dependencies
- **Drizzle ORM**: Type-safe database toolkit
- **Neon Database**: Serverless PostgreSQL provider
- **Express.js**: Web application framework
- **Zod**: Runtime type validation


### Development Tools
- **TypeScript**: Type safety across the stack
- **Vite**: Fast development server and build tool
- **ESBuild**: JavaScript bundler for production

## Deployment Strategy

The application is configured for deployment on Replit with:
- **Development**: `npm run dev` starts both frontend and backend
- **Production Build**: Vite builds frontend, ESBuild bundles backend
- **Database**: Connects to external PostgreSQL via DATABASE_URL environment variable
- **Port Configuration**: Backend serves on port 5000, frontend proxied in development

The system uses a monorepo structure with shared TypeScript types between frontend and backend, ensuring type safety across the full stack.

## User Preferences

Preferred communication style: Simple, everyday language.

## Recent Changes

- July 31, 2025: Redesigned Products page UI for better scalability with hundreds of products - added search bar, category filters, table/grid view toggle, and compact table layout
- July 31, 2025: Completed mass product adjustment feature with ProductBulkEditor component for bulk category, markup, and unit updates
- July 31, 2025: Enhanced Price List Uploader with robust error handling - fixed JSON parsing issues, increased token limits, and improved AI extraction reliability
- July 31, 2025: Fixed quote status update synchronization - status dropdown changes now sync with form state to prevent reversion on save
- July 30, 2025: Fixed PDF generation blank page issue by converting logo to base64 format for cross-window compatibility
- July 30, 2025: Successfully integrated EDG company logo across all application interfaces (landing page, app header, PDF templates)
- July 30, 2025: Fixed homepage duplication issue by correcting router configuration - removed conflicting catch-all route
- July 30, 2025: Completely removed DocuSign integration functionality per user request
- June 27, 2025: Added company field to customer schema for business client tracking
- June 27, 2025: Updated quote forms, tables, and PDFs to display company information
- June 27, 2025: Enhanced search to include company names in quote filtering
- June 25, 2025: Added search functionality to quotes page for finding quotes by number, customer, or project
- June 25, 2025: Fixed button contrast issues - all action buttons now clearly visible with EDG branding
- June 25, 2025: Updated branding to EDG Patio & Shade with official color scheme (Black/White/Teal)
- June 25, 2025: Applied brand colors throughout application interface and PDF templates
- June 25, 2025: Removed markup information from customer-facing PDF quotes for business privacy
- June 24, 2025: Implemented editable PDF quote template with company branding and terms
- June 24, 2025: Added client-side PDF generation with html2canvas and jsPDF
- June 24, 2025: Created professional quote layout with company info and customizable terms
- June 24, 2025: Added Product Catalog feature with reusable products and services
- June 24, 2025: Integrated product selection into line items with "From Catalog" option
- June 24, 2025: Added navigation menu with Quotes and Products sections
- June 24, 2025: Fixed line item column widths for better number visibility
- June 24, 2025: Added PostgreSQL database integration with Drizzle ORM
- June 24, 2025: Implemented DatabaseStorage class replacing in-memory storage
- June 24, 2025: Fixed quote number auto-generation system
- June 24, 2025: Initial construction quoting application setup

## Changelog

- June 24, 2025: Database migration completed - all data now persists to PostgreSQL
- June 24, 2025: Initial setup